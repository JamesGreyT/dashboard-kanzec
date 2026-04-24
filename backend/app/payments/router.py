"""Payments analytics HTTP surface."""
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

router = APIRouter(prefix="/api/payments", tags=["payments"])


def _parse(from_: date | None, to: date | None, direction: str, region: str):
    return resolve_window(from_=from_, to=to), Filters.parse(direction=direction, region=region)


@router.get("/overview")
async def overview(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    direction: str = Query(default=""),
    region: str = Query(default=""),
) -> dict:
    w, f = _parse(from_, to, direction, region)
    return await service.overview(session, w, f)


@router.get("/timeseries")
async def timeseries(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    granularity: Literal["day", "week", "month", "quarter"] = Query(default="day"),
    direction: str = Query(default=""),
    region: str = Query(default=""),
) -> dict:
    w, f = _parse(from_, to, direction, region)
    g: Granularity = granularity  # type: ignore[assignment]
    return {"series": await service.timeseries(session, w, g, f)}


@router.get("/method-split")
async def method_split(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    direction: str = Query(default=""),
    region: str = Query(default=""),
) -> dict:
    w, f = _parse(from_, to, direction, region)
    return {"split": await service.method_split(session, w, f)}


@router.get("/weekday")
async def weekday(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    direction: str = Query(default=""),
    region: str = Query(default=""),
) -> dict:
    w, f = _parse(from_, to, direction, region)
    return {"pattern": await service.weekday_pattern(session, w, f)}


@router.get("/velocity")
async def velocity(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    direction: str = Query(default=""),
    region: str = Query(default=""),
) -> dict:
    w, f = _parse(from_, to, direction, region)
    return {"histogram": await service.velocity(session, w, f)}


@router.get("/collection-ratio")
async def collection_ratio(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    direction: str = Query(default=""),
    region: str = Query(default=""),
) -> dict:
    w, f = _parse(from_, to, direction, region)
    return {"series": await service.collection_ratio_trend(session, w, f)}


@router.get("/payers")
async def payers(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    sort: str = Query(default="receipts:desc"),
    page: int = Query(default=0, ge=0),
    size: int = Query(default=50, ge=1, le=500),
    search: str = Query(default=""),
    direction: str = Query(default=""),
    region: str = Query(default=""),
) -> dict:
    w, f = _parse(from_, to, direction, region)
    return await service.payers_ranked(session, w, f, sort, page, size, search)


@router.get("/prepayers")
async def prepayers(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    sort: str = Query(default="credit:desc"),
    page: int = Query(default=0, ge=0),
    size: int = Query(default=50, ge=1, le=500),
    search: str = Query(default=""),
    direction: str = Query(default=""),
    region: str = Query(default=""),
) -> dict:
    f = Filters.parse(direction=direction, region=region)
    return await service.prepayers_ranked(session, f, sort, page, size, search)


@router.get("/regularity")
async def regularity(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    sort: str = Query(default="receipts:desc"),
    page: int = Query(default=0, ge=0),
    size: int = Query(default=50, ge=1, le=500),
    search: str = Query(default=""),
    direction: str = Query(default=""),
    region: str = Query(default=""),
) -> dict:
    f = Filters.parse(direction=direction, region=region)
    return await service.regularity(session, f, sort, page, size, search)


@router.get("/export/payers.xlsx")
async def export_payers(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    sort: str = Query(default="receipts:desc"),
    search: str = Query(default=""),
    direction: str = Query(default=""),
    region: str = Query(default=""),
):
    w, f = _parse(from_, to, direction, region)
    data = await service.payers_ranked(session, w, f, sort, page=0, size=500, search=search)
    cols = [
        ExportColumn("name", "Payer", kind="text", width=30),
        ExportColumn("direction", "Direction"),
        ExportColumn("region", "Region"),
        ExportColumn("receipts", "Receipts", kind="money"),
        ExportColumn("payments", "Count", kind="int"),
        ExportColumn("avg_payment", "Avg", kind="money"),
        ExportColumn("yoy_pct", "YoY", kind="pct"),
        ExportColumn("last_pay", "Last pay", kind="date"),
        ExportColumn("first_pay", "First pay", kind="date"),
    ]
    return stream_xlsx(filename="payments-payers", sheet_title="Payers",
                      columns=cols, rows=data["rows"], totals=data.get("totals"))


@router.get("/export/prepayers.xlsx")
async def export_prepayers(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    sort: str = Query(default="credit:desc"),
    search: str = Query(default=""),
    direction: str = Query(default=""),
    region: str = Query(default=""),
):
    f = Filters.parse(direction=direction, region=region)
    data = await service.prepayers_ranked(session, f, sort, page=0, size=500, search=search)
    cols = [
        ExportColumn("name", "Client", kind="text", width=30),
        ExportColumn("direction", "Direction"),
        ExportColumn("region", "Region"),
        ExportColumn("credit", "Credit", kind="money"),
        ExportColumn("paid", "Paid", kind="money"),
        ExportColumn("invoiced", "Invoiced", kind="money"),
        ExportColumn("last_pay", "Last pay", kind="date"),
    ]
    return stream_xlsx(filename="payments-prepayers", sheet_title="Prepayers",
                      columns=cols, rows=data["rows"], totals=data.get("totals"))


@router.get("/export/regularity.xlsx")
async def export_regularity(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    sort: str = Query(default="receipts:desc"),
    search: str = Query(default=""),
    direction: str = Query(default=""),
    region: str = Query(default=""),
):
    f = Filters.parse(direction=direction, region=region)
    data = await service.regularity(session, f, sort, page=0, size=500, search=search)
    cols = [
        ExportColumn("name", "Client", kind="text", width=30),
        ExportColumn("class", "Class"),
        ExportColumn("direction", "Direction"),
        ExportColumn("region", "Region"),
        ExportColumn("receipts", "Receipts", kind="money"),
        ExportColumn("payments", "Count", kind="int"),
        ExportColumn("avg_gap", "Avg gap (d)", kind="qty"),
        ExportColumn("last_pay", "Last pay", kind="date"),
    ]
    return stream_xlsx(filename="payments-regularity", sheet_title="Regularity",
                      columns=cols, rows=data["rows"], totals=data.get("totals"))


@router.get("/export/churned.xlsx")
async def export_churned(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    sort: str = Query(default="receipts:desc"),
    search: str = Query(default=""),
    direction: str = Query(default=""),
    region: str = Query(default=""),
):
    f = Filters.parse(direction=direction, region=region)
    data = await service.churned_ranked(session, f, sort, page=0, size=500, search=search)
    cols = [
        ExportColumn("name", "Client", kind="text", width=30),
        ExportColumn("direction", "Direction"),
        ExportColumn("region", "Region"),
        ExportColumn("receipts", "Past receipts", kind="money"),
        ExportColumn("last_pay", "Last pay", kind="date"),
        ExportColumn("days_since", "Days since", kind="int"),
    ]
    return stream_xlsx(filename="payments-churned", sheet_title="Churned",
                      columns=cols, rows=data["rows"], totals=data.get("totals"))


@router.get("/churned")
async def churned(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    sort: str = Query(default="receipts:desc"),
    page: int = Query(default=0, ge=0),
    size: int = Query(default=50, ge=1, le=500),
    search: str = Query(default=""),
    direction: str = Query(default=""),
    region: str = Query(default=""),
) -> dict:
    f = Filters.parse(direction=direction, region=region)
    return await service.churned_ranked(session, f, sort, page, size, search)
