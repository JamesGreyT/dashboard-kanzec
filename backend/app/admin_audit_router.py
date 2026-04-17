"""GET /api/admin/audit — read-only audit log for admins."""
from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .auth.deps import require_role
from .auth.models import AuditLog, User
from .db import get_session

router = APIRouter(prefix="/api/admin/audit", tags=["admin:audit"])


@router.get("")
async def list_audit(
    _: Annotated[object, Depends(require_role("admin"))],
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    action: str | None = None,
    user_id: int | None = None,
    since: datetime | None = None,
) -> dict:
    base = select(AuditLog, User.username).outerjoin(
        User, User.id == AuditLog.user_id
    )
    if action:
        base = base.where(AuditLog.action == action)
    if user_id is not None:
        base = base.where(AuditLog.user_id == user_id)
    if since is not None:
        base = base.where(AuditLog.created_at >= since)

    count_rows = (
        await session.execute(
            select(AuditLog.id).select_from(AuditLog)
            .where(
                *([AuditLog.action == action] if action else []),
                *([AuditLog.user_id == user_id] if user_id is not None else []),
                *([AuditLog.created_at >= since] if since is not None else []),
            )
        )
    ).all()
    total = len(count_rows)

    rows = (
        await session.execute(
            base.order_by(AuditLog.created_at.desc())
                .limit(limit).offset(offset)
        )
    ).all()

    return {
        "rows": [
            {
                "id": al.id,
                "user_id": al.user_id,
                "username": username,
                "action": al.action,
                "target": al.target,
                "details": al.details,
                "ip_address": str(al.ip_address) if al.ip_address else None,
                "created_at": al.created_at.isoformat(),
            }
            for al, username in rows
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }
