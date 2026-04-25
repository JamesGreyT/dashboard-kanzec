"""Returns analytics HTTP surface."""
from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..scope import ScopedUser
from .._analytics.export import ExportColumn, stream_xlsx
from .._analytics.filters import Filters
from .._analytics.windows import resolve_window
from . import service

router = APIRouter(prefix="/api/returns", tags=["returns"])


def _parse(
    from_: date | None, to: date | None,
    direction: str, region: str, manager: str,
    scope: ScopedUser | None = None,
):
    window = resolve_window(from_=from_, to=to)
    filters = Filters.parse(
        direction=direction, region=region, manager=manager,
        scope_rooms=scope.room_ids if scope else None,
    )
    return window, filters


@router.get("/overview")
async def overview(
    scope: ScopedUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    direction: str = Query(default=""),
    region: str = Query(default=""),
    manager: str = Query(default=""),
) -> dict:
    window, filters = _parse(from_, to, direction, region, manager, scope=scope)
    return await service.overview(session, window, filters)


@router.get("/timeline")
async def timeline(
    scope: ScopedUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    direction: str = Query(default=""),
    region: str = Query(default=""),
    manager: str = Query(default=""),
) -> dict:
    window, filters = _parse(from_, to, direction, region, manager, scope=scope)
    return {"series": await service.timeline(session, window, filters)}


@router.get("/brand-heatmap")
async def brand_heatmap(
    scope: ScopedUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    months: int = Query(default=12, ge=3, le=24),
    direction: str = Query(default=""),
    region: str = Query(default=""),
    manager: str = Query(default=""),
) -> dict:
    filters = Filters.parse(
        direction=direction, region=region, manager=manager,
        scope_rooms=scope.room_ids,
    )
    return await service.brand_heatmap(session, months=months, f=filters)


@router.get("/clients")
async def clients(
    scope: ScopedUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    sort: str = Query(default="returns:desc"),
    page: int = Query(default=0, ge=0),
    size: int = Query(default=50, ge=1, le=500),
    search: str = Query(default=""),
    direction: str = Query(default=""),
    region: str = Query(default=""),
    manager: str = Query(default=""),
) -> dict:
    window, filters = _parse(from_, to, direction, region, manager, scope=scope)
    return await service.clients_ranked(session, window, filters, sort, page, size, search)


@router.get("/regions")
async def regions(
    scope: ScopedUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    sort: str = Query(default="returns:desc"),
    page: int = Query(default=0, ge=0),
    size: int = Query(default=50, ge=1, le=500),
    search: str = Query(default=""),
    direction: str = Query(default=""),
    manager: str = Query(default=""),
) -> dict:
    window, filters = _parse(from_, to, direction, "", manager, scope=scope)
    return await service.regions_ranked(session, window, filters, sort, page, size, search)


@router.get("/export/clients.xlsx")
async def export_clients(
    scope: ScopedUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    sort: str = Query(default="returns:desc"),
    search: str = Query(default=""),
    direction: str = Query(default=""),
    region: str = Query(default=""),
    manager: str = Query(default=""),
):
    window, filters = _parse(from_, to, direction, region, manager, scope=scope)
    data = await service.clients_ranked(session, window, filters, sort, page=0, size=500, search=search)
    cols = [
        ExportColumn("name", "Client", kind="text", width=30),
        ExportColumn("manager", "Manager", kind="text", width=22),
        ExportColumn("direction", "Direction"),
        ExportColumn("region", "Region"),
        ExportColumn("returns", "Returns $", kind="money"),
        ExportColumn("rate", "Rate", kind="pct"),
        ExportColumn("lines", "Lines", kind="int"),
        ExportColumn("forward", "Forward $", kind="money"),
        ExportColumn("last_return", "Last return", kind="date"),
    ]
    return stream_xlsx(
        filename="returns-clients", sheet_title="Returns by client",
        columns=cols, rows=data["rows"], totals=data.get("totals"),
    )


@router.get("/export/regions.xlsx")
async def export_regions(
    scope: ScopedUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    sort: str = Query(default="returns:desc"),
    search: str = Query(default=""),
    direction: str = Query(default=""),
    manager: str = Query(default=""),
):
    window, filters = _parse(from_, to, direction, "", manager, scope=scope)
    data = await service.regions_ranked(session, window, filters, sort, page=0, size=500, search=search)
    cols = [
        ExportColumn("label", "Region", kind="text", width=28),
        ExportColumn("returns", "Returns $", kind="money"),
        ExportColumn("rate", "Rate", kind="pct"),
        ExportColumn("lines", "Lines", kind="int"),
        ExportColumn("forward", "Forward $", kind="money"),
        ExportColumn("yoy_pct", "YoY", kind="pct"),
    ]
    return stream_xlsx(
        filename="returns-regions", sheet_title="Returns by region",
        columns=cols, rows=data["rows"],
    )
