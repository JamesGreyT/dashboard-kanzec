from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..scope import ScopedUser
from . import service

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/overview")
async def overview(
    scope: ScopedUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    return await service.overview(session, scope=scope)
