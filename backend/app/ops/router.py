from __future__ import annotations

import asyncio
import json
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from .. import audit
from ..auth.deps import CurrentUser, require_role
from ..db import get_session
from . import service, systemd

router = APIRouter(prefix="/api/ops", tags=["ops"])


@router.get("/reports")
async def list_reports(
    _: Annotated[object, Depends(require_role("admin", "operator"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    return {"reports": await service.list_reports(session)}


@router.get("/reports/{key}/progress")
async def report_progress(
    key: str,
    _: Annotated[object, Depends(require_role("admin", "operator"))],
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: int = 50,
) -> dict:
    return {"rows": await service.progress(session, key, limit=limit)}


@router.get("/reports/{key}/queue")
async def report_queue(
    key: str,
    _: Annotated[object, Depends(require_role("admin", "operator"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    return {"queue": await service.queue(session, key)}


class BackfillBody(BaseModel):
    from_: date = Field(alias="from")
    to: date
    chunk: str = Field(default="year", pattern="^(year|month|week)$")


@router.post("/reports/{key}/backfill")
async def enqueue_backfill(
    key: str,
    body: BackfillBody,
    user: CurrentUser,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    _: Annotated[object, Depends(require_role("admin", "operator"))],
) -> dict:
    added = await service.enqueue_backfill(session, key, body.from_, body.to, body.chunk)
    await audit.write(
        session,
        user_id=user.id,
        action="backfill_enqueue",
        target=f"report:{key}",
        details={
            "from": body.from_.isoformat(),
            "to": body.to.isoformat(),
            "chunk": body.chunk,
            "added": added,
        },
        ip_address=request.client.host if request.client else None,
    )
    await session.commit()
    return {"queued": added}


@router.get("/reports/{key}/logs")
async def stream_logs(
    key: str,
    _: Annotated[object, Depends(require_role("admin", "operator"))],
    lines: int = 500,
) -> StreamingResponse:
    if key not in service.KNOWN_KEYS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"unknown report {key!r}")

    async def gen():
        try:
            async for line in systemd.stream_journal(key, lines=lines):
                # SSE format
                yield f"data: {json.dumps({'line': line})}\n\n".encode("utf-8")
                # A tiny yield back to the loop so the client sees bytes immediately.
                await asyncio.sleep(0)
        except asyncio.CancelledError:
            return

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
