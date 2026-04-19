"""Rooms service — refresh the materialised reference + read helpers.

Refresh is an idempotent INSERT … ON CONFLICT upsert driven by the ETL-owned
smartup_rep.deal_order table. Called on app boot and every 10 minutes from
main.py's lifespan; also mounted on POST /api/admin/rooms/refresh for on-demand.
"""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

log = logging.getLogger(__name__)

_UPSERT_SQL = """
INSERT INTO app.room (room_id, room_code, room_name, seen_at)
SELECT room_id, MAX(room_code), MAX(room_name), now()
  FROM smartup_rep.deal_order
 WHERE room_id IS NOT NULL
   AND room_name IS NOT NULL
 GROUP BY room_id
    ON CONFLICT (room_id) DO UPDATE
   SET room_code = EXCLUDED.room_code,
       room_name = EXCLUDED.room_name,
       seen_at   = EXCLUDED.seen_at
"""


async def refresh_rooms(session: AsyncSession) -> int:
    """Upsert from the ETL. Returns the total count of rows in app.room after."""
    await session.execute(text(_UPSERT_SQL))
    await session.commit()
    count = (await session.execute(text("SELECT COUNT(*) FROM app.room"))).scalar() or 0
    return int(count)


async def list_rooms_active(session: AsyncSession) -> list[dict[str, Any]]:
    """Simple dropdown-friendly list for non-admin UI filters."""
    rows = (
        await session.execute(
            text(
                "SELECT room_id, room_code, room_name, seen_at "
                "  FROM app.room WHERE active = true "
                " ORDER BY room_name"
            )
        )
    ).all()
    return [
        {
            "room_id": r.room_id,
            "room_code": r.room_code,
            "room_name": r.room_name,
            "seen_at": r.seen_at.isoformat(),
        }
        for r in rows
    ]


async def list_rooms_with_counts(session: AsyncSession) -> list[dict[str, Any]]:
    """Admin view — each room with its client count and last-30-days deals."""
    rows = (
        await session.execute(
            text(
                """
                SELECT r.room_id,
                       r.room_code,
                       r.room_name,
                       r.active,
                       r.seen_at,
                       COALESCE(c.clients_count, 0)   AS clients_count,
                       COALESCE(d.orders_count_30d, 0) AS orders_count_30d
                  FROM app.room r
                  LEFT JOIN (
                      SELECT room_id, COUNT(DISTINCT person_id) AS clients_count
                        FROM smartup_rep.deal_order
                       WHERE room_id IS NOT NULL
                       GROUP BY room_id
                  ) c USING (room_id)
                  LEFT JOIN (
                      SELECT room_id, COUNT(DISTINCT deal_id) AS orders_count_30d
                        FROM smartup_rep.deal_order
                       WHERE room_id IS NOT NULL
                         AND delivery_date >= (now() AT TIME ZONE 'Asia/Tashkent')::date - 29
                       GROUP BY room_id
                  ) d USING (room_id)
                 ORDER BY r.active DESC, r.room_name
                """
            )
        )
    ).all()
    return [
        {
            "room_id": r.room_id,
            "room_code": r.room_code,
            "room_name": r.room_name,
            "active": r.active,
            "seen_at": r.seen_at.isoformat(),
            "clients_count": int(r.clients_count),
            "orders_count_30d": int(r.orders_count_30d),
        }
        for r in rows
    ]


async def set_active(session: AsyncSession, room_id: str, active: bool) -> bool:
    """Returns True if the row existed and was updated."""
    result = await session.execute(
        text("UPDATE app.room SET active = :a WHERE room_id = :rid"),
        {"a": active, "rid": room_id},
    )
    await session.commit()
    return (result.rowcount or 0) > 0
