from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import CurrentUser
from ..db import get_session
from . import catalog, service

router = APIRouter(prefix="/api/data", tags=["data"])


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
    _: CurrentUser,
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
    )


@router.get("/{key}/row/{pk}")
async def get_row(
    key: str,
    pk: str,
    _: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    # pk is "~"-joined — e.g. "2026-04-17~44923~240568035~941232" for a 4-part PK
    parts = pk.split("~")
    return await service.get_row(session, key, parts)


@router.get("/{key}/export")
async def export_csv(
    key: str,
    request: Request,
    _: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    sort: str | None = None,
    search: str | None = None,
) -> StreamingResponse:
    filters = _extract_filters(request)

    async def gen():
        async for chunk in service.stream_csv(
            session, key, filters=filters, search=search, sort=sort
        ):
            yield chunk

    return StreamingResponse(
        gen(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{key}.csv"'},
    )
