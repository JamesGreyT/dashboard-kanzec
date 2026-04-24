"""Sales analytics HTTP surface."""
from __future__ import annotations

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import CurrentUser
from ..db import get_session
from .._analytics.export import ExportColumn, stream_xlsx
from .._analytics.filters import Filters
from .._analytics.windows import Granularity, resolve_window
from . import service

router = APIRouter(prefix="/api/sales", tags=["sales"])


def _parse(
    from_: date | None, to: date | None, direction: str, region: str,
    manager: str, client: str,
):
    window = resolve_window(from_=from_, to=to)
    filters = Filters.parse(
        direction=direction, region=region, manager=manager, client=client,
    )
    return window, filters


@router.get("/overview")
async def overview(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    direction: str = Query(default=""),
    region: str = Query(default=""),
    manager: str = Query(default=""),
    client: str = Query(default=""),
) -> dict:
    window, filters = _parse(from_, to, direction, region, manager, client)
    return await service.overview(session, window, filters)


@router.get("/timeseries")
async def timeseries(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    granularity: Literal["day", "week", "month", "quarter"] = Query(default="day"),
    direction: str = Query(default=""),
    region: str = Query(default=""),
    manager: str = Query(default=""),
) -> dict:
    window, filters = _parse(from_, to, direction, region, manager, "")
    g: Granularity = granularity  # type: ignore[assignment]
    return {"series": await service.timeseries(session, window, g, filters)}


@router.get("/clients")
async def clients(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    sort: str = Query(default="revenue:desc"),
    page: int = Query(default=0, ge=0),
    size: int = Query(default=50, ge=1, le=500),
    search: str = Query(default=""),
    direction: str = Query(default=""),
    region: str = Query(default=""),
    manager: str = Query(default=""),
) -> dict:
    window, filters = _parse(from_, to, direction, region, manager, "")
    return await service.clients_ranked(session, window, filters, sort, page, size, search)


@router.get("/managers")
async def managers(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    sort: str = Query(default="revenue:desc"),
    page: int = Query(default=0, ge=0),
    size: int = Query(default=50, ge=1, le=500),
    search: str = Query(default=""),
    direction: str = Query(default=""),
    region: str = Query(default=""),
) -> dict:
    window, filters = _parse(from_, to, direction, region, "", "")
    return await service.managers_ranked(session, window, filters, sort, page, size, search)


@router.get("/brands")
async def brands(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    sort: str = Query(default="revenue:desc"),
    page: int = Query(default=0, ge=0),
    size: int = Query(default=50, ge=1, le=500),
    search: str = Query(default=""),
    direction: str = Query(default=""),
    region: str = Query(default=""),
    manager: str = Query(default=""),
) -> dict:
    window, filters = _parse(from_, to, direction, region, manager, "")
    return await service.brands_ranked(session, window, filters, sort, page, size, search)


@router.get("/regions")
async def regions(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    sort: str = Query(default="revenue:desc"),
    page: int = Query(default=0, ge=0),
    size: int = Query(default=50, ge=1, le=500),
    search: str = Query(default=""),
    direction: str = Query(default=""),
    manager: str = Query(default=""),
) -> dict:
    window, filters = _parse(from_, to, direction, "", manager, "")
    return await service.regions_ranked(session, window, filters, sort, page, size, search)


@router.get("/export/clients.xlsx")
async def export_clients(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    sort: str = Query(default="revenue:desc"),
    search: str = Query(default=""),
    direction: str = Query(default=""),
    region: str = Query(default=""),
    manager: str = Query(default=""),
):
    window, filters = _parse(from_, to, direction, region, manager, "")
    data = await service.clients_ranked(session, window, filters, sort, page=0, size=500, search=search)
    cols = [
        ExportColumn("name", "Client", kind="text", width=30),
        ExportColumn("direction", "Direction"),
        ExportColumn("region", "Region"),
        ExportColumn("revenue", "Revenue", kind="money"),
        ExportColumn("deals", "Deals", kind="int"),
        ExportColumn("qty", "Qty", kind="qty"),
        ExportColumn("avg_deal", "Avg deal", kind="money"),
        ExportColumn("yoy_pct", "YoY", kind="pct"),
        ExportColumn("last_order", "Last order", kind="date"),
        ExportColumn("first_order", "First order", kind="date"),
    ]
    return stream_xlsx(
        filename="sales-clients",
        sheet_title="Clients",
        columns=cols,
        rows=data["rows"],
        totals=data.get("totals"),
    )


@router.get("/export/managers.xlsx")
async def export_managers(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    sort: str = Query(default="revenue:desc"),
    search: str = Query(default=""),
    direction: str = Query(default=""),
    region: str = Query(default=""),
):
    window, filters = _parse(from_, to, direction, region, "", "")
    data = await service.managers_ranked(session, window, filters, sort, page=0, size=500, search=search)
    cols = [
        ExportColumn("label", "Manager", kind="text", width=28),
        ExportColumn("revenue", "Revenue", kind="money"),
        ExportColumn("deals", "Deals", kind="int"),
        ExportColumn("unique_clients", "Clients", kind="int"),
        ExportColumn("qty", "Qty", kind="qty"),
        ExportColumn("yoy_pct", "YoY", kind="pct"),
        ExportColumn("last_active", "Last active", kind="date"),
    ]
    return stream_xlsx(filename="sales-managers", sheet_title="Managers",
                      columns=cols, rows=data["rows"], totals=data.get("totals"))


@router.get("/export/brands.xlsx")
async def export_brands(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    sort: str = Query(default="revenue:desc"),
    search: str = Query(default=""),
    direction: str = Query(default=""),
    region: str = Query(default=""),
    manager: str = Query(default=""),
):
    window, filters = _parse(from_, to, direction, region, manager, "")
    data = await service.brands_ranked(session, window, filters, sort, page=0, size=500, search=search)
    cols = [
        ExportColumn("label", "Brand", kind="text", width=28),
        ExportColumn("skus", "SKUs", kind="int"),
        ExportColumn("revenue", "Revenue", kind="money"),
        ExportColumn("qty", "Qty", kind="qty"),
        ExportColumn("yoy_pct", "YoY", kind="pct"),
        ExportColumn("last_active", "Last sold", kind="date"),
    ]
    return stream_xlsx(filename="sales-brands", sheet_title="Brands",
                      columns=cols, rows=data["rows"], totals=data.get("totals"))


@router.get("/export/regions.xlsx")
async def export_regions(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    sort: str = Query(default="revenue:desc"),
    search: str = Query(default=""),
    direction: str = Query(default=""),
    manager: str = Query(default=""),
):
    window, filters = _parse(from_, to, direction, "", manager, "")
    data = await service.regions_ranked(session, window, filters, sort, page=0, size=500, search=search)
    cols = [
        ExportColumn("label", "Region", kind="text", width=28),
        ExportColumn("revenue", "Revenue", kind="money"),
        ExportColumn("deals", "Deals", kind="int"),
        ExportColumn("unique_clients", "Clients", kind="int"),
        ExportColumn("qty", "Qty", kind="qty"),
        ExportColumn("yoy_pct", "YoY", kind="pct"),
    ]
    return stream_xlsx(filename="sales-regions", sheet_title="Regions",
                      columns=cols, rows=data["rows"], totals=data.get("totals"))


@router.get("/rfm")
async def rfm(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    sort: str = Query(default="revenue:desc"),
    page: int = Query(default=0, ge=0),
    size: int = Query(default=50, ge=1, le=500),
    search: str = Query(default=""),
    direction: str = Query(default=""),
    region: str = Query(default=""),
) -> dict:
    window, filters = _parse(from_, to, direction, region, "", "")
    return await service.rfm_segmentation(session, window, filters, page, size, sort, search)


@router.get("/seasonality")
async def seasonality(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    years: int = Query(default=4, ge=2, le=6),
    direction: str = Query(default=""),
    region: str = Query(default=""),
    manager: str = Query(default=""),
) -> dict:
    filters = Filters.parse(direction=direction, region=region, manager=manager)
    return await service.seasonality_heatmap(session, years=years, f=filters)
