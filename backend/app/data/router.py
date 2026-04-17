from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import CurrentUser
from ..db import get_session
from . import catalog, service

router = APIRouter(prefix="/api/data", tags=["data"])


@router.get("/tables")
async def list_tables(_: CurrentUser) -> dict:
    return {"tables": catalog.list_tables()}


def _extract_filters(request: Request) -> dict[str, str]:
    """Pull `filter[<col>]=<op>:<value>` query params into a plain dict."""
    out: dict[str, str] = {}
    for key in request.query_params.keys():
        if key.startswith("filter[") and key.endswith("]"):
            out[key[7:-1]] = request.query_params[key]
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
