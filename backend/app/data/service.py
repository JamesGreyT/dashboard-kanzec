"""SQL builder for the DataViewer — whitelist-driven.

A filter coming in as ?filter[delivery_date]=>=:2026-04-01 parses to a
(column, op, value) triple. Both column name AND operator are checked
against the TableDef in catalog.py; value is always passed as a bound
parameter. If anything falls outside the catalog, we raise 400 up the stack.
"""
from __future__ import annotations

import csv
import io
from datetime import date, datetime
from decimal import Decimal
from typing import Any, AsyncIterator

from fastapi import HTTPException, status
from sqlalchemy import bindparam, text
from sqlalchemy.ext.asyncio import AsyncSession

from .catalog import CATALOG, ColumnDef, TableDef


def _table(key: str) -> TableDef:
    t = CATALOG.get(key)
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"unknown table {key!r}")
    return t


def _parse_filter_value(col: ColumnDef, raw: str) -> Any:
    """Coerce a string from the URL into the column's type. 400 on bad input."""
    try:
        if col.type == "date":
            return date.fromisoformat(raw)
        if col.type == "timestamp":
            # Accept either plain ISO date or full ISO datetime.
            if "T" in raw or " " in raw:
                return datetime.fromisoformat(raw.replace(" ", "T"))
            return date.fromisoformat(raw)
        if col.type == "int":
            return int(raw)
        if col.type == "numeric":
            return Decimal(raw)
        return raw  # text
    except (ValueError, TypeError) as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"bad value for {col.label}: {e}") from None


def _build_where(
    table: TableDef,
    filters: dict[str, str],
    search: str | None,
) -> tuple[str, dict[str, Any]]:
    """Returns (where_clause_sql, params_dict). Always safe — no user strings
    land in the SQL itself, only catalog-whitelisted column names."""
    clauses: list[str] = []
    params: dict[str, Any] = {}

    for i, (raw_key, raw_val) in enumerate(filters.items()):
        # raw_val is formatted as "<op>:<value>", e.g. ">=:2026-04-01" or "ilike:Maqsud"
        if ":" not in raw_val:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"bad filter {raw_key}: expected op:value")
        op, _, value_str = raw_val.partition(":")

        col = table.columns.get(raw_key)
        if col is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"unknown column {raw_key!r}")
        if op not in col.ops:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"operator {op!r} not allowed for column {raw_key}",
            )
        value = _parse_filter_value(col, value_str)
        pname = f"f{i}"
        if op == "ilike":
            clauses.append(f'"{raw_key}"::text ILIKE :{pname}')
            params[pname] = f"%{value}%"
        else:
            clauses.append(f'"{raw_key}" {op} :{pname}')
            params[pname] = value

    if search:
        # Search across text-ish columns only.
        textish = [
            name for name, c in table.columns.items()
            if c.type == "text" or c.id_column
        ]
        if textish:
            or_parts = []
            for i, name in enumerate(textish):
                pname = f"s{i}"
                or_parts.append(f'"{name}"::text ILIKE :{pname}')
                params[pname] = f"%{search}%"
            clauses.append("(" + " OR ".join(or_parts) + ")")

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    return where, params


def _build_order_by(table: TableDef, sort_raw: str | None) -> str:
    """sort_raw shaped like 'delivery_date:desc,product_amount:asc'."""
    if not sort_raw:
        parts = [(f, d) for f, d in table.default_sort]
    else:
        parts = []
        for chunk in sort_raw.split(","):
            if not chunk.strip():
                continue
            f, _, d = chunk.partition(":")
            f = f.strip()
            d = d.strip().lower() or "asc"
            if f not in table.columns:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, f"unknown sort column {f!r}")
            if d not in ("asc", "desc"):
                raise HTTPException(status.HTTP_400_BAD_REQUEST, f"bad sort direction {d!r}")
            parts.append((f, d))
    if not parts:
        return ""
    return "ORDER BY " + ", ".join(f'"{f}" {d} NULLS LAST' for f, d in parts)


# ---- Public ----------------------------------------------------------------

async def list_rows(
    session: AsyncSession,
    key: str,
    *,
    filters: dict[str, str],
    search: str | None,
    sort: str | None,
    limit: int,
    offset: int,
) -> dict[str, Any]:
    table = _table(key)
    where, params = _build_where(table, filters, search)
    order_by = _build_order_by(table, sort)

    col_list = ", ".join(f'"{c}"' for c in table.columns)
    base = f'FROM "{table.schema}"."{table.table}" {where}'

    count_row = (
        await session.execute(text(f"SELECT COUNT(*) AS c {base}"), params)
    ).one()
    total = int(count_row.c)

    params_paged = {**params, "lim": limit, "off": offset}
    rows = (
        await session.execute(
            text(f"SELECT {col_list} {base} {order_by} LIMIT :lim OFFSET :off"),
            params_paged,
        )
    ).mappings().all()

    return {
        "rows": [_jsonify(r) for r in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


async def get_row(session: AsyncSession, key: str, pk_values: list[str]) -> dict:
    table = _table(key)
    if len(pk_values) != len(table.pk):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"expected {len(table.pk)} pk parts, got {len(pk_values)}",
        )
    where_parts = []
    params: dict[str, Any] = {}
    for i, (name, raw) in enumerate(zip(table.pk, pk_values)):
        col = table.columns[name]
        pname = f"p{i}"
        where_parts.append(f'"{name}" = :{pname}')
        params[pname] = _parse_filter_value(col, raw)
    col_list = ", ".join(f'"{c}"' for c in table.columns)
    row = (
        await session.execute(
            text(f'SELECT {col_list} FROM "{table.schema}"."{table.table}" WHERE ' + " AND ".join(where_parts)),
            params,
        )
    ).mappings().first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "row not found")
    return _jsonify(row)


async def stream_csv(
    session: AsyncSession,
    key: str,
    *,
    filters: dict[str, str],
    search: str | None,
    sort: str | None,
    max_rows: int = 100_000,
) -> AsyncIterator[bytes]:
    """Yield CSV bytes in batches. Bounded at max_rows to avoid runaway exports."""
    table = _table(key)
    where, params = _build_where(table, filters, search)
    order_by = _build_order_by(table, sort)
    col_list = ", ".join(f'"{c}"' for c in table.columns)

    # Header
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(list(table.columns.keys()))
    yield buf.getvalue().encode("utf-8")

    params_paged = {**params, "lim": max_rows, "off": 0}
    stream = await session.stream(
        text(f'SELECT {col_list} FROM "{table.schema}"."{table.table}" {where} {order_by} LIMIT :lim OFFSET :off'),
        params_paged,
    )
    async for chunk in stream.mappings().partitions(1000):
        buf = io.StringIO()
        writer = csv.writer(buf)
        for r in chunk:
            writer.writerow([_csv_cell(r[c]) for c in table.columns])
        yield buf.getvalue().encode("utf-8")


def _jsonify(row) -> dict:
    out = {}
    for k, v in row.items():
        if isinstance(v, Decimal):
            out[k] = float(v)
        elif isinstance(v, datetime):
            out[k] = v.isoformat()
        elif isinstance(v, date):
            out[k] = v.isoformat()
        else:
            out[k] = v
    return out


def _csv_cell(v) -> str:
    if v is None:
        return ""
    if isinstance(v, Decimal):
        return str(float(v))
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    return str(v)
