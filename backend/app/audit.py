"""Audit-log writer. One call per mutating action — login, user CRUD,
backfill-enqueue, etc. Best-effort: never fails a request if the insert fails."""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from .auth.models import AuditLog

log = logging.getLogger(__name__)


async def write(
    session: AsyncSession,
    *,
    user_id: int | None,
    action: str,
    target: str | None = None,
    details: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> None:
    try:
        session.add(
            AuditLog(
                user_id=user_id,
                action=action,
                target=target,
                details=details,
                ip_address=ip_address,
            )
        )
        await session.flush()
    except Exception as e:  # noqa: BLE001
        log.warning("audit write failed for action=%s target=%s: %s", action, target, e)
