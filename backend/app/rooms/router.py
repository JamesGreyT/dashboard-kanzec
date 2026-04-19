"""Rooms HTTP surface.

GET  /api/rooms               — active rooms for filter dropdowns (any auth'd user)
GET  /api/admin/rooms         — all rooms with counts (admin only)
POST /api/admin/rooms/refresh — force an upsert from the ETL (admin only)
PATCH /api/admin/rooms/{id}   — toggle active flag (admin only)
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from .. import audit
from ..auth.deps import CurrentUser, require_role
from ..db import get_session
from . import service

router = APIRouter(tags=["rooms"])


@router.get("/api/rooms")
async def list_rooms(
    _: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    return {"rooms": await service.list_rooms_active(session)}


@router.get("/api/admin/rooms")
async def admin_list_rooms(
    _: Annotated[object, Depends(require_role("admin"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    return {"rooms": await service.list_rooms_with_counts(session)}


@router.post("/api/admin/rooms/refresh")
async def admin_refresh_rooms(
    actor: CurrentUser,
    request: Request,
    _: Annotated[object, Depends(require_role("admin"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    count = await service.refresh_rooms(session)
    await audit.write(
        session,
        user_id=actor.id,
        action="admin.rooms.refresh",
        target=None,
        details={"count": count},
        ip_address=request.client.host if request.client else None,
    )
    await session.commit()
    return {"count": count}


class PatchBody(BaseModel):
    active: bool


@router.patch("/api/admin/rooms/{room_id}")
async def admin_update_room(
    room_id: str,
    body: PatchBody,
    actor: CurrentUser,
    request: Request,
    _: Annotated[object, Depends(require_role("admin"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    ok = await service.set_active(session, room_id, body.active)
    if not ok:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "room not found")
    await audit.write(
        session,
        user_id=actor.id,
        action="admin.rooms.set_active",
        target=room_id,
        details={"active": body.active},
        ip_address=request.client.host if request.client else None,
    )
    await session.commit()
    return {"ok": True}
