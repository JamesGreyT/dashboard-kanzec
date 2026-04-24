"""User preferences — JSONB body per user, hydrated on dashboard mount.

Known keys (clients read what they recognise, ignore the rest):

  default_window       : one of "today"/"last7"/"last30"/"last90"/"mtd"/
                         "qtd"/"ytd"/"fy" — seeds Sales/Payments window
  default_directions   : string[] — pre-selects direction filter
  default_manager      : string[] — operator's managers by default
  default_region       : string[] — operator's region focus

Admin users typically leave this empty (see-all default). Operators
working a single book set it once and never worry about filtering
again.
"""
from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import CurrentUser
from ..db import get_session

router = APIRouter(prefix="/api/preferences", tags=["preferences"])


class PreferencesBody(BaseModel):
    default_window: str | None = None
    default_directions: list[str] | None = None
    default_manager: list[str] | None = None
    default_region: list[str] | None = None


@router.get("")
async def get_mine(
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, Any]:
    row = (await session.execute(
        text("SELECT body FROM app.user_preferences WHERE user_id = :uid"),
        {"uid": user.id},
    )).mappings().first()
    return dict(row["body"]) if row else {}


@router.put("")
async def put_mine(
    body: PreferencesBody,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, Any]:
    payload = {k: v for k, v in body.model_dump().items() if v is not None}
    await session.execute(text("""
        INSERT INTO app.user_preferences (user_id, body, updated_at)
        VALUES (:uid, :body::jsonb, now())
        ON CONFLICT (user_id) DO UPDATE
           SET body = EXCLUDED.body, updated_at = now()
    """), {"uid": user.id, "body": _to_json(payload)})
    await session.commit()
    return payload


def _to_json(d: dict[str, Any]) -> str:
    import json
    return json.dumps(d, ensure_ascii=False)
