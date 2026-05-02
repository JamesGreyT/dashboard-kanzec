from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..scope import ScopedUser
from . import service

router = APIRouter(prefix="/api/clients", tags=["clients"])


@router.get("")
async def list_clients(
    scope: ScopedUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    search: str = Query(default=""),
    room_id: str = Query(default=""),
    direction: str = Query(default=""),
    region: str = Query(default=""),
    view: Literal["all", "problem", "normal", "closed"] = Query(default="all"),
    attention: str = Query(default=""),
    deal_status: str = Query(default=""),
    client_group: str = Query(default=""),
    rfm_segment: str = Query(default=""),
    last_purchase_bucket: int | None = Query(default=None),
    sort: str = Query(default=""),
) -> dict:
    filters = service.ClientListFilters(
        search=search,
        room_id=room_id,
        direction=direction,
        region=region,
        view=view,
        attention=attention,
        deal_status=deal_status,
        client_group=client_group,
        rfm_segment=rfm_segment,
        last_purchase_bucket=last_purchase_bucket,
        sort=sort,
    )
    return await service.list_clients(session, scope=scope, filters=filters, limit=limit, offset=offset)


@router.get("/{person_id}/intelligence")
async def client_intelligence(
    person_id: int,
    scope: ScopedUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    payload = await service.get_client_intelligence(session, scope=scope, person_id=person_id)
    if not payload:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "client not found or outside scope")
    return payload
