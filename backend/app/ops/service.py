"""Reports page service — reads smartup.report_sync_progress, smartup.etl_state,
and systemd is-active. Exposes a knob to enqueue a backfill range (which the
ETL workers drain on their own schedule)."""
from __future__ import annotations

import asyncio
import json
from datetime import date, datetime, timedelta
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from . import systemd

# Known report keys — we surface only these in the Ops page for now. If the
# ETL registers new ones, the only change here is to append to this list.
KNOWN_KEYS = ("order", "payment", "legal_person")

# Reference reports do a full-list pull on an `all:*` label — they don't
# have a recent-window / deep-window split. The UI renders them with a
# single "Full list" block instead of the two-column RECENT | DEEP layout.
REFERENCE_KEYS = {"legal_person"}


async def list_reports(session: AsyncSession) -> list[dict[str, Any]]:
    active_map = await asyncio.gather(*(systemd.is_active(k) for k in KNOWN_KEYS))
    progress = await _progress_summary(session)
    queue = await _queue_lengths(session)
    out = []
    for key, active in zip(KNOWN_KEYS, active_map):
        out.append({
            "key": key,
            "is_reference": key in REFERENCE_KEYS,
            "systemd_active": active,
            **progress.get(key, {}),
            "backfill_queue_len": queue.get(key, 0),
        })
    return out


async def _progress_summary(session: AsyncSession) -> dict[str, dict]:
    rows = (
        await session.execute(
            text("""
                SELECT report_key,
                       MAX(finished_at) FILTER (WHERE status='complete' AND range_label LIKE 'recent:%%')  AS last_recent_at,
                       (SELECT range_label FROM smartup.report_sync_progress r2
                          WHERE r2.report_key = r.report_key
                            AND r2.status='complete'
                            AND r2.range_label LIKE 'recent:%%'
                          ORDER BY finished_at DESC NULLS LAST LIMIT 1) AS last_recent_label,
                       (SELECT rows FROM smartup.report_sync_progress r3
                          WHERE r3.report_key = r.report_key
                            AND r3.status='complete'
                            AND r3.range_label LIKE 'recent:%%'
                          ORDER BY finished_at DESC NULLS LAST LIMIT 1) AS last_recent_rows,
                       (SELECT duration_ms FROM smartup.report_sync_progress r4
                          WHERE r4.report_key = r.report_key
                            AND r4.status='complete'
                            AND r4.range_label LIKE 'recent:%%'
                          ORDER BY finished_at DESC NULLS LAST LIMIT 1) AS last_recent_ms,
                       MAX(finished_at) FILTER (WHERE status='complete' AND range_label LIKE 'deep:%%') AS last_deep_at,
                       (SELECT range_label FROM smartup.report_sync_progress r5
                          WHERE r5.report_key = r.report_key
                            AND r5.status='complete'
                            AND r5.range_label LIKE 'deep:%%'
                          ORDER BY finished_at DESC NULLS LAST LIMIT 1) AS last_deep_label,
                       (SELECT rows FROM smartup.report_sync_progress r6
                          WHERE r6.report_key = r.report_key
                            AND r6.status='complete'
                            AND r6.range_label LIKE 'deep:%%'
                          ORDER BY finished_at DESC NULLS LAST LIMIT 1) AS last_deep_rows,
                       MAX(finished_at) FILTER (WHERE status='complete' AND range_label LIKE 'all:%%') AS last_all_at,
                       (SELECT rows FROM smartup.report_sync_progress r7
                          WHERE r7.report_key = r.report_key
                            AND r7.status='complete'
                            AND r7.range_label LIKE 'all:%%'
                          ORDER BY finished_at DESC NULLS LAST LIMIT 1) AS last_all_rows,
                       -- Only surface an error if it's newer than the most
                       -- recent successful run for the same report. Otherwise a
                       -- transient blip pins a red banner forever even though
                       -- the worker has long since recovered.
                       (SELECT last_error FROM smartup.report_sync_progress r8
                          WHERE r8.report_key = r.report_key AND r8.status='error'
                            AND r8.finished_at > COALESCE(
                              (SELECT MAX(finished_at)
                                 FROM smartup.report_sync_progress rS
                                WHERE rS.report_key = r.report_key
                                  AND rS.status='complete'),
                              '-infinity'::timestamptz
                            )
                          ORDER BY finished_at DESC NULLS LAST LIMIT 1) AS last_error,
                       (SELECT finished_at FROM smartup.report_sync_progress r9
                          WHERE r9.report_key = r.report_key AND r9.status='error'
                            AND r9.finished_at > COALESCE(
                              (SELECT MAX(finished_at)
                                 FROM smartup.report_sync_progress rS
                                WHERE rS.report_key = r.report_key
                                  AND rS.status='complete'),
                              '-infinity'::timestamptz
                            )
                          ORDER BY finished_at DESC NULLS LAST LIMIT 1) AS last_error_at
                  FROM smartup.report_sync_progress r
                 GROUP BY report_key
            """)
        )
    ).all()
    out = {}
    for r in rows:
        out[r.report_key] = {
            "last_recent_at":    r.last_recent_at.isoformat() if r.last_recent_at else None,
            "last_recent_label": r.last_recent_label,
            "last_recent_rows":  int(r.last_recent_rows) if r.last_recent_rows is not None else None,
            "last_recent_ms":    int(r.last_recent_ms)   if r.last_recent_ms   is not None else None,
            "last_deep_at":      r.last_deep_at.isoformat() if r.last_deep_at else None,
            "last_deep_label":   r.last_deep_label,
            "last_deep_rows":    int(r.last_deep_rows) if r.last_deep_rows is not None else None,
            "last_all_at":       r.last_all_at.isoformat() if r.last_all_at else None,
            "last_all_rows":     int(r.last_all_rows) if r.last_all_rows is not None else None,
            "last_error":        r.last_error,
            "last_error_at":     r.last_error_at.isoformat() if r.last_error_at else None,
        }
    return out


async def _queue_lengths(session: AsyncSession) -> dict[str, int]:
    rows = (
        await session.execute(
            text("SELECT key, value FROM smartup.etl_state WHERE key LIKE :pat"),
            {"pat": "report:%:backfill_queue"},
        )
    ).all()
    out = {}
    for r in rows:
        # key shape: "report:<name>:backfill_queue"
        name = r.key.split(":", 2)[1]
        try:
            out[name] = len(json.loads(r.value)) if r.value else 0
        except (ValueError, TypeError):
            out[name] = 0
    return out


async def progress(session: AsyncSession, key: str, limit: int = 50) -> list[dict]:
    if key not in KNOWN_KEYS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"unknown report {key!r}")
    rows = (
        await session.execute(
            text("""
                SELECT range_label, status, rows, bytes, duration_ms, started_at, finished_at, last_error
                  FROM smartup.report_sync_progress
                 WHERE report_key = :k
                 ORDER BY finished_at DESC NULLS LAST, started_at DESC
                 LIMIT :lim
            """),
            {"k": key, "lim": limit},
        )
    ).all()
    return [
        {
            "range_label": r.range_label,
            "status":      r.status,
            "rows":        int(r.rows)        if r.rows        is not None else None,
            "bytes":       int(r.bytes)       if r.bytes       is not None else None,
            "duration_ms": int(r.duration_ms) if r.duration_ms is not None else None,
            "started_at":  r.started_at.isoformat()  if r.started_at  else None,
            "finished_at": r.finished_at.isoformat() if r.finished_at else None,
            "last_error":  r.last_error,
        }
        for r in rows
    ]


async def queue(session: AsyncSession, key: str) -> list[dict]:
    if key not in KNOWN_KEYS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"unknown report {key!r}")
    row = (
        await session.execute(
            text("SELECT value FROM smartup.etl_state WHERE key = :k"),
            {"k": f"report:{key}:backfill_queue"},
        )
    ).first()
    if row is None or not row.value:
        return []
    try:
        return json.loads(row.value)
    except (ValueError, TypeError):
        return []


async def enqueue_backfill(
    session: AsyncSession,
    key: str,
    from_: date,
    to_: date,
    chunk: str,
) -> int:
    """Append range chunks to the ETL's `report:<key>:backfill_queue` KV.
    Returns the number of chunks added."""
    if key not in KNOWN_KEYS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"unknown report {key!r}")
    if from_ > to_:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "from must be <= to")
    if chunk not in ("year", "month", "week"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "bad chunk size")

    new_chunks = _chunk_ranges(from_, to_, chunk)

    queue_key = f"report:{key}:backfill_queue"
    row = (
        await session.execute(
            text("SELECT value FROM smartup.etl_state WHERE key = :k"),
            {"k": queue_key},
        )
    ).first()
    existing: list[dict] = []
    if row and row.value:
        try:
            existing = json.loads(row.value)
        except (ValueError, TypeError):
            existing = []

    for f, t in new_chunks:
        existing.append({"from": f.isoformat(), "to": t.isoformat()})

    value_json = json.dumps(existing)
    await session.execute(
        text("""
            INSERT INTO smartup.etl_state (key, value) VALUES (:k, :v)
              ON CONFLICT (key) DO UPDATE
              SET value = EXCLUDED.value, updated_at = now()
        """),
        {"k": queue_key, "v": value_json},
    )
    return len(new_chunks)


def _chunk_ranges(start: date, end: date, chunk: str) -> list[tuple[date, date]]:
    out: list[tuple[date, date]] = []
    cur = start
    while cur <= end:
        if chunk == "year":
            nxt = date(cur.year, 12, 31)
        elif chunk == "month":
            if cur.month == 12:
                nxt = date(cur.year, 12, 31)
            else:
                nxt = date(cur.year, cur.month + 1, 1) - timedelta(days=1)
        else:  # week
            nxt = cur + timedelta(days=6)
        out.append((cur, min(nxt, end)))
        cur = min(nxt, end) + timedelta(days=1)
    return out
