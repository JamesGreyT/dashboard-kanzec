"""Debt / Qarzlar HTTP surface.

Worklist + prepayments are scope-aware reads. Contact-log CRUD is
scope-enforced on write (403 if the client is outside the user's rooms)
and author-gated on edit/delete (author or admin only).
"""
from __future__ import annotations

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from .. import audit
from ..auth.deps import CurrentUser, require_role
from ..db import get_session
from ..scope import ScopedUser
from . import dashboard_service, service

router = APIRouter(prefix="/api/debt", tags=["debt"])


# ---- Debt dashboard endpoints -----------------------------------------------
# New aggregates that back the analytical Debt page. Read-only.

@router.get("/dashboard")
async def dashboard_kpis(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    return await dashboard_service.kpi_strip(session)


@router.get("/aging-pyramid")
async def aging_pyramid(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    return {"buckets": await dashboard_service.aging_pyramid(session)}


@router.get("/aging-trend")
async def aging_trend(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    weeks: int = Query(default=26, ge=4, le=104),
) -> dict:
    return {"series": await dashboard_service.aging_trend(session, weeks=weeks)}


@router.get("/region-aging")
async def region_aging(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    return await dashboard_service.region_aging_heatmap(session)


@router.get("/debt-movement")
async def debt_movement(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    weeks: int = Query(default=26, ge=4, le=104),
) -> dict:
    return {"series": await dashboard_service.debt_movement(session, weeks=weeks)}


@router.get("/debtors")
async def debtors(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    sort: str = Query(default="debt:desc"),
    page: int = Query(default=0, ge=0),
    size: int = Query(default=50, ge=1, le=500),
    search: str = Query(default=""),
    direction: str = Query(default=""),
) -> dict:
    return await dashboard_service.debtors_ranked(
        session, sort=sort, page=page, size=size,
        search=search, direction_csv=direction,
    )


@router.get("/stale-debtors")
async def stale_debtors(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    sort: str = Query(default="days_since_order:desc"),
    page: int = Query(default=0, ge=0),
    size: int = Query(default=50, ge=1, le=500),
    search: str = Query(default=""),
    direction: str = Query(default=""),
    days: int = Query(default=90, ge=30, le=720),
) -> dict:
    return await dashboard_service.debtors_ranked(
        session, sort=sort, page=page, size=size,
        search=search, direction_csv=direction,
        stale_only=True, stale_days=days,
    )


@router.get("/manager-portfolios")
async def manager_portfolios(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    return {"rows": await dashboard_service.manager_portfolios(session)}


@router.get("/risk-scores")
async def risk_scores(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    page: int = Query(default=0, ge=0),
    size: int = Query(default=50, ge=1, le=500),
    search: str = Query(default=""),
) -> dict:
    return await dashboard_service.risk_scores(session, page=page, size=size, search=search)


@router.get("/promise-stats")
async def promise_stats(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    return await dashboard_service.promise_stats(session)


@router.get("/broken-promise-debtors")
async def broken_promise_debtors(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    return {"rows": await dashboard_service.broken_promise_debtors(session)}


# ---- Worklist (existing; scope-aware action view) ---------------------------


OutcomeLiteral = Literal[
    "called", "no_answer", "promised", "rescheduled", "refused", "paid", "note",
]


class ContactBody(BaseModel):
    outcome: OutcomeLiteral
    promised_amount: float | None = Field(default=None, ge=0)
    promised_by_date: date | None = None
    follow_up_date: date | None = None
    note: str | None = Field(default=None, max_length=4000)


@router.get("/worklist")
async def worklist(
    scope: ScopedUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    sales_manager_room_id: str | None = None,
    region: str | None = None,
    category: str | None = None,
    direction: str | None = None,
    aging_bucket: str | None = None,
    outcome: str | None = None,
    overdue_promises_only: bool = False,
    search: str | None = None,
) -> dict:
    filters = service.WorklistFilters(
        sales_manager_room_id=sales_manager_room_id,
        region=region,
        category=category,
        direction=direction,
        aging_bucket=aging_bucket,
        outcome=outcome,
        overdue_promises_only=overdue_promises_only,
        search=search,
    )
    return await service.compute_worklist(
        session, scope=scope, filters=filters, limit=limit, offset=offset
    )


@router.get("/ledger")
async def ledger(
    scope: ScopedUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: int = Query(200, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    sales_manager_room_id: str | None = None,
    region: str | None = None,
    category: str | None = None,
    direction: str | None = None,
    overdue_only: bool = False,
    search: str | None = None,
    term_days: int = Query(30, ge=0, le=365),
) -> dict:
    """Per-client debt ledger matching the 'Data' sheet in
    KanzecAR_CONTINUOUS_FIXED.xlsx. Positive `qarz` = customer owes us.
    Aging buckets measured from (delivery_date + term_days).
    """
    filters = service.LedgerFilters(
        sales_manager_room_id=sales_manager_room_id,
        region=region,
        category=category,
        direction=direction,
        overdue_only=overdue_only,
        search=search,
    )
    return await service.compute_ledger(
        session, scope=scope, filters=filters,
        limit=limit, offset=offset, term_days=term_days,
    )


@router.get("/prepayments")
async def prepayments(
    scope: ScopedUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    search: str | None = None,
) -> dict:
    return await service.compute_prepayments(
        session, scope=scope, search=search, limit=limit, offset=offset
    )


@router.get("/client/{person_id}")
async def client_detail(
    person_id: int,
    scope: ScopedUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    orders_offset: int = Query(0, ge=0),
    orders_limit: int = Query(50, ge=1, le=500),
    payments_offset: int = Query(0, ge=0),
    payments_limit: int = Query(50, ge=1, le=500),
) -> dict:
    result = await service.get_client_detail(
        session,
        scope=scope,
        person_id=person_id,
        orders_offset=orders_offset,
        orders_limit=orders_limit,
        payments_offset=payments_offset,
        payments_limit=payments_limit,
    )
    if not result:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "client not found or outside scope")
    return result


@router.post("/client/{person_id}/contact", status_code=status.HTTP_201_CREATED)
async def log_contact(
    person_id: int,
    body: ContactBody,
    scope: ScopedUser,
    request: Request,
    _: Annotated[object, Depends(require_role("admin", "operator"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    try:
        entry = await service.log_contact(
            session,
            scope=scope,
            user_id=scope.user_id,
            person_id=person_id,
            payload=service.ContactPayload(
                outcome=body.outcome,
                promised_amount=body.promised_amount,
                promised_by_date=body.promised_by_date,
                follow_up_date=body.follow_up_date,
                note=body.note,
            ),
        )
    except PermissionError:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "client outside scope") from None
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from None
    await audit.write(
        session,
        user_id=scope.user_id,
        action="debt.log.create",
        target=f"person:{person_id}",
        details={"entry_id": entry.get("id"), "outcome": body.outcome},
        ip_address=request.client.host if request.client else None,
    )
    await session.commit()
    return entry


@router.patch("/contact/{entry_id}")
async def edit_contact(
    entry_id: int,
    body: ContactBody,
    scope: ScopedUser,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    try:
        entry = await service.update_contact_log_entry(
            session,
            entry_id=entry_id,
            user_id=scope.user_id,
            is_admin=(scope.role == "admin"),
            payload=service.ContactPayload(
                outcome=body.outcome,
                promised_amount=body.promised_amount,
                promised_by_date=body.promised_by_date,
                follow_up_date=body.follow_up_date,
                note=body.note,
            ),
        )
    except KeyError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "entry not found") from None
    except PermissionError:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not author") from None
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from None
    await audit.write(
        session,
        user_id=scope.user_id,
        action="debt.log.update",
        target=f"log:{entry_id}",
        details={"outcome": body.outcome},
        ip_address=request.client.host if request.client else None,
    )
    await session.commit()
    return entry


@router.delete("/contact/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_contact(
    entry_id: int,
    scope: ScopedUser,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    try:
        await service.delete_contact_log_entry(
            session,
            entry_id=entry_id,
            user_id=scope.user_id,
            is_admin=(scope.role == "admin"),
        )
    except KeyError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "entry not found") from None
    except PermissionError:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not author") from None
    await audit.write(
        session,
        user_id=scope.user_id,
        action="debt.log.delete",
        target=f"log:{entry_id}",
        details={},
        ip_address=request.client.host if request.client else None,
    )
    await session.commit()
