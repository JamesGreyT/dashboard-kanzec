from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .. import audit
from ..auth.deps import CurrentUser, require_role
from ..db import get_session
from ..scope import ScopedUser, clause_for_table
from . import catalog, service

router = APIRouter(prefix="/api/data", tags=["data"])


# Every value that appears in the Excel Clients.Yoʻnalish column. Writes from
# the dashboard must pick from this set — new categories must be added here
# (and usually to the frontend dropdown) deliberately.
ALLOWED_DIRECTIONS: frozenset[str] = frozenset({
    "B2B", "Yangi", "MATERIAL", "Export", "Цех",
    "Marketplace", "Online", "Doʻkon", "BAZA",
    "Sergeli 6/4/1 D", "Farxod bozori D", "Sergeli 3/3/13 D",
})


@router.get("/tables")
async def list_tables(_: CurrentUser) -> dict:
    return {"tables": catalog.list_tables()}


def _extract_filters(request: Request) -> list[tuple[str, str, str]]:
    """Pull repeatable `f=<col>:<op>:<value>` query params into triples.

    Multiple `f=` values with the same column are ANDed — that's how we
    express ranges (e.g. `f=delivery_date:>=:…` + `f=delivery_date:<=:…`).
    """
    out: list[tuple[str, str, str]] = []
    for raw in request.query_params.getlist("f"):
        parts = raw.split(":", 2)
        if len(parts) != 3 or not parts[0] or not parts[1]:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"bad filter {raw!r}: expected col:op:value",
            )
        out.append((parts[0], parts[1], parts[2]))
    return out


@router.get("/{key}/rows")
async def list_rows(
    key: str,
    request: Request,
    scope: ScopedUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    sort: str | None = None,
    search: str | None = None,
) -> dict:
    filters = _extract_filters(request)
    return await service.list_rows(
        session, key,
        filters=filters, search=search, sort=sort, limit=limit, offset=offset,
        scope=scope,
    )


@router.get("/{key}/distinct/{column}")
async def distinct_values(
    key: str,
    column: str,
    scope: ScopedUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    q: str | None = None,
    limit: int = Query(200, ge=1, le=500),
) -> dict:
    return await service.distinct_values(session, key, column, search=q, limit=limit, scope=scope)


@router.get("/{key}/row/{pk}")
async def get_row(
    key: str,
    pk: str,
    scope: ScopedUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    # pk is "~"-joined — e.g. "2026-04-17~44923~240568035~941232" for a 4-part PK
    parts = pk.split("~")
    return await service.get_row(session, key, parts, scope=scope)


class DirectionBody(BaseModel):
    direction: str = Field(..., min_length=1, max_length=64)


class InstalmentDaysBody(BaseModel):
    instalment_days: int = Field(..., ge=0, le=365)


class GroupBody(BaseModel):
    client_group: str = Field(..., min_length=1, max_length=1)


ALLOWED_GROUPS: frozenset[str] = frozenset({"A", "B", "C", "D"})


@router.get("/legal-persons/directions")
async def list_directions(_: CurrentUser) -> dict:
    """Allowed Yoʻnalish values for the inline editor."""
    return {"directions": sorted(ALLOWED_DIRECTIONS)}


@router.get("/legal-persons/groups")
async def list_groups(_: CurrentUser) -> dict:
    """Allowed Group values for the inline editor."""
    return {"groups": sorted(ALLOWED_GROUPS)}


@router.patch("/legal-persons/{person_id}/direction")
async def set_legal_person_direction(
    person_id: int,
    body: DirectionBody,
    scope: ScopedUser,
    request: Request,
    _: Annotated[object, Depends(require_role("admin", "operator"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    """Set the Yoʻnalish (direction) on a legal_person row.

    Writes direction_source='manual' so the Excel loader will refuse to
    overwrite it. Scope-enforced: non-admin users can only edit clients
    inside their assigned rooms.
    """
    if body.direction not in ALLOWED_DIRECTIONS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"direction must be one of {sorted(ALLOWED_DIRECTIONS)}",
        )
    scope_frag, scope_params = clause_for_table(scope, "smartup_rep.legal_person")
    scope_where = f" AND {scope_frag}" if scope_frag else ""
    row = (
        await session.execute(
            text(
                f"""
                UPDATE smartup_rep.legal_person
                   SET direction = :d,
                       direction_source = 'manual',
                       direction_updated_at = now()
                 WHERE person_id = :pid
                   {scope_where}
                RETURNING person_id, name, direction, direction_source, direction_updated_at
                """
            ),
            {"d": body.direction, "pid": person_id, **scope_params},
        )
    ).mappings().first()
    if row is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "legal person not found or outside scope"
        )
    await audit.write(
        session,
        user_id=scope.user_id,
        action="legal_person.direction.update",
        target=f"person:{person_id}",
        details={"direction": body.direction},
        ip_address=request.client.host if request.client else None,
    )
    await session.commit()
    return {
        "person_id": row["person_id"],
        "name": row["name"],
        "direction": row["direction"],
        "direction_source": row["direction_source"],
        "direction_updated_at": row["direction_updated_at"].isoformat()
            if row["direction_updated_at"] else None,
    }


@router.patch("/legal-persons/{person_id}/instalment-days")
async def set_legal_person_instalment_days(
    person_id: int,
    body: InstalmentDaysBody,
    scope: ScopedUser,
    request: Request,
    _: Annotated[object, Depends(require_role("admin", "operator"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    """Set the per-client instalment_days. Scope-enforced: non-admin users
    can only edit clients inside their assigned rooms."""
    scope_frag, scope_params = clause_for_table(scope, "smartup_rep.legal_person")
    scope_where = f" AND {scope_frag}" if scope_frag else ""
    row = (
        await session.execute(
            text(
                f"""
                UPDATE smartup_rep.legal_person
                   SET instalment_days = :v,
                       instalment_days_source = 'manual',
                       instalment_days_updated_at = now()
                 WHERE person_id = :pid
                   {scope_where}
                RETURNING person_id, name, instalment_days, instalment_days_source, instalment_days_updated_at
                """
            ),
            {"v": body.instalment_days, "pid": person_id, **scope_params},
        )
    ).mappings().first()
    if row is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "legal person not found or outside scope"
        )
    await audit.write(
        session,
        user_id=scope.user_id,
        action="legal_person.instalment_days.update",
        target=f"person:{person_id}",
        details={"instalment_days": body.instalment_days},
        ip_address=request.client.host if request.client else None,
    )
    await session.commit()
    return {
        "person_id": row["person_id"],
        "name": row["name"],
        "instalment_days": row["instalment_days"],
        "instalment_days_source": row["instalment_days_source"],
        "instalment_days_updated_at": row["instalment_days_updated_at"].isoformat()
            if row["instalment_days_updated_at"] else None,
    }


@router.patch("/legal-persons/{person_id}/group")
async def set_legal_person_group(
    person_id: int,
    body: GroupBody,
    scope: ScopedUser,
    request: Request,
    _: Annotated[object, Depends(require_role("admin", "operator"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    """Set the per-client client_group (A/B/C/D). Scope-enforced."""
    if body.client_group not in ALLOWED_GROUPS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"client_group must be one of {sorted(ALLOWED_GROUPS)}",
        )
    scope_frag, scope_params = clause_for_table(scope, "smartup_rep.legal_person")
    scope_where = f" AND {scope_frag}" if scope_frag else ""
    row = (
        await session.execute(
            text(
                f"""
                UPDATE smartup_rep.legal_person
                   SET client_group = :v,
                       client_group_updated_at = now()
                 WHERE person_id = :pid
                   {scope_where}
                RETURNING person_id, name, client_group, client_group_updated_at
                """
            ),
            {"v": body.client_group, "pid": person_id, **scope_params},
        )
    ).mappings().first()
    if row is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "legal person not found or outside scope"
        )
    await audit.write(
        session,
        user_id=scope.user_id,
        action="legal_person.group.update",
        target=f"person:{person_id}",
        details={"client_group": body.client_group},
        ip_address=request.client.host if request.client else None,
    )
    await session.commit()
    return {
        "person_id": row["person_id"],
        "name": row["name"],
        "client_group": row["client_group"],
        "client_group_updated_at": row["client_group_updated_at"].isoformat()
            if row["client_group_updated_at"] else None,
    }


@router.get("/{key}/export")
async def export_table(
    key: str,
    request: Request,
    scope: ScopedUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    sort: str | None = None,
    search: str | None = None,
    format: str = Query("xlsx", pattern="^(xlsx|csv)$"),
) -> Response:
    """Export the current view — filters, search, and sort from the query
    string are applied exactly as they are for /rows, so what the user sees
    in the table is what they get in the file."""
    filters = _extract_filters(request)

    if format == "xlsx":
        data = await service.build_xlsx(
            session, key, filters=filters, search=search, sort=sort, scope=scope,
        )
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="{key}.xlsx"',
            },
        )

    async def gen():
        async for chunk in service.stream_csv(
            session, key, filters=filters, search=search, sort=sort, scope=scope,
        ):
            yield chunk

    return StreamingResponse(
        gen(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{key}.csv"'},
    )
