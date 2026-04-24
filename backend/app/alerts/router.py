"""Alerts HTTP surface — CRUD rules + read/dismiss events.

Rule ownership: `user_id` nullable. NULL = shared rule (admin-created,
all users see events). Owned rules are visible only to their owner
plus admins. Admins can always edit/delete any rule.
"""
from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import CurrentUser
from ..db import get_session
from . import service

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


RuleKind = Literal[
    "dso_gt",
    "debt_total_gt",
    "single_debtor_gt",
    "over_90_count_gt",
    "revenue_drop_pct",
    "deal_count_drop_pct",
]


class RuleIn(BaseModel):
    kind: RuleKind
    threshold: float = Field(gt=0)
    label: str | None = None
    enabled: bool = True
    shared: bool = False   # admin-only: when true, user_id is NULL


@router.get("/rules")
async def list_rules(
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    if user.role == "admin":
        rows = (await session.execute(text("""
            SELECT r.id, r.user_id, u.username AS owner, r.kind, r.threshold,
                   r.label, r.enabled, r.created_at, r.updated_at
              FROM app.alert_rule r
              LEFT JOIN app.user u ON u.id = r.user_id
             ORDER BY r.created_at DESC
        """))).mappings().all()
    else:
        rows = (await session.execute(text("""
            SELECT id, user_id, NULL::text AS owner, kind, threshold,
                   label, enabled, created_at, updated_at
              FROM app.alert_rule
             WHERE user_id = :uid OR user_id IS NULL
             ORDER BY created_at DESC
        """), {"uid": user.id})).mappings().all()
    return {"rows": [dict(r) for r in rows]}


@router.post("/rules", status_code=201)
async def create_rule(
    body: RuleIn,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    if body.shared and user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "only admins can create shared rules")
    owner = None if body.shared else user.id
    row = (await session.execute(text("""
        INSERT INTO app.alert_rule (user_id, kind, threshold, label, enabled)
        VALUES (:uid, :kind, :th, :label, :en)
        RETURNING id, user_id, kind, threshold, label, enabled, created_at
    """), {"uid": owner, "kind": body.kind, "th": body.threshold,
           "label": body.label, "en": body.enabled})).mappings().first()
    await session.commit()
    return dict(row) if row else {}


@router.patch("/rules/{rule_id}")
async def toggle_rule(
    rule_id: int,
    body: dict,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    # Only `enabled` and `threshold` and `label` are mutable.
    allowed = {k: v for k, v in body.items() if k in ("enabled", "threshold", "label")}
    if not allowed:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "nothing to update")
    # Guard ownership
    owner_row = (await session.execute(text("""
        SELECT user_id FROM app.alert_rule WHERE id = :i
    """), {"i": rule_id})).mappings().first()
    if not owner_row:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    owner = owner_row["user_id"]
    if owner is not None and owner != user.id and user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    if owner is None and user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "shared rule — admin only")
    # Build SET clause safely (fixed keyset, no injection risk)
    sets = ", ".join(f"{k} = :{k}" for k in allowed) + ", updated_at = now()"
    await session.execute(text(f"UPDATE app.alert_rule SET {sets} WHERE id = :i"),
                          {**allowed, "i": rule_id})
    await session.commit()
    return {"ok": True}


@router.delete("/rules/{rule_id}", status_code=204)
async def delete_rule(
    rule_id: int,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
):
    owner_row = (await session.execute(text("""
        SELECT user_id FROM app.alert_rule WHERE id = :i
    """), {"i": rule_id})).mappings().first()
    if not owner_row:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    owner = owner_row["user_id"]
    if owner is not None and owner != user.id and user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    if owner is None and user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    await session.execute(text("DELETE FROM app.alert_rule WHERE id = :i"),
                          {"i": rule_id})
    await session.commit()


@router.get("/events")
async def list_events(
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    unread_only: bool = False,
    limit: int = 50,
) -> dict:
    where = "WHERE (r.user_id = :uid OR r.user_id IS NULL)"
    if unread_only:
        where += " AND e.read_at IS NULL"
    rows = (await session.execute(text(f"""
        SELECT e.id, e.rule_id, e.triggered_at, e.value, e.message, e.read_at,
               r.kind, r.threshold, r.label, r.user_id AS rule_user
          FROM app.alert_event e
          JOIN app.alert_rule  r ON r.id = e.rule_id
          {where}
         ORDER BY e.triggered_at DESC
         LIMIT :lim
    """), {"uid": user.id, "lim": limit})).mappings().all()
    unread = (await session.execute(text(f"""
        SELECT COUNT(*) AS n
          FROM app.alert_event e
          JOIN app.alert_rule  r ON r.id = e.rule_id
         WHERE (r.user_id = :uid OR r.user_id IS NULL)
           AND e.read_at IS NULL
    """), {"uid": user.id})).mappings().first() or {"n": 0}
    return {"rows": [dict(r) for r in rows], "unread": int(unread["n"])}


@router.post("/events/{eid}/read")
async def mark_read(
    eid: int,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    await session.execute(text("""
        UPDATE app.alert_event SET read_at = now()
         WHERE id = :i
           AND rule_id IN (SELECT id FROM app.alert_rule
                            WHERE user_id = :uid OR user_id IS NULL)
           AND read_at IS NULL
    """), {"i": eid, "uid": user.id})
    await session.commit()
    return {"ok": True}


@router.post("/events/read-all")
async def mark_all_read(
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    row = (await session.execute(text("""
        UPDATE app.alert_event SET read_at = now()
         WHERE read_at IS NULL
           AND rule_id IN (SELECT id FROM app.alert_rule
                            WHERE user_id = :uid OR user_id IS NULL)
         RETURNING id
    """), {"uid": user.id})).fetchall()
    await session.commit()
    return {"marked": len(row)}


@router.post("/evaluate")
async def run_evaluator(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    """On-demand kick — any user may trigger. The background loop
    calls the same service.evaluate_rules every 30 min."""
    created = await service.evaluate_rules(session)
    return {"created": created}
