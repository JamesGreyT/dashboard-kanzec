"""Chart annotations — long-form notes pinned to a date on a specific
chart. Surface: `debt.aging_trend` (others can be added without code
changes — just call GET/POST with a new chart_key).

Any authenticated user may create/view/delete their own notes;
admins can delete anyone's."""
from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import CurrentUser
from ..db import get_session

router = APIRouter(prefix="/api/annotations", tags=["annotations"])


class AnnotationIn(BaseModel):
    chart_key: str = Field(min_length=1, max_length=64)
    x_date: date
    note: str = Field(min_length=1, max_length=2000)


@router.get("")
async def list_annotations(
    _user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    chart_key: str,
) -> dict:
    rows = (await session.execute(text("""
        SELECT a.id, a.chart_key, a.x_date, a.note, a.created_by,
               u.username AS created_by_name,
               a.created_at, a.updated_at
          FROM app.chart_annotation a
          JOIN app.user u ON u.id = a.created_by
         WHERE a.chart_key = :k
         ORDER BY a.x_date ASC, a.created_at ASC
    """), {"k": chart_key})).mappings().all()
    return {"rows": [dict(r) for r in rows]}


@router.post("", status_code=201)
async def create(
    body: AnnotationIn,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    row = (await session.execute(text("""
        INSERT INTO app.chart_annotation (chart_key, x_date, note, created_by)
        VALUES (:k, :d, :n, :u)
        RETURNING id, chart_key, x_date, note, created_by, created_at
    """), {"k": body.chart_key, "d": body.x_date, "n": body.note,
           "u": user.id})).mappings().first()
    await session.commit()
    return dict(row) if row else {}


@router.delete("/{ann_id}", status_code=204)
async def delete(
    ann_id: int,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
):
    row = (await session.execute(text("""
        SELECT created_by FROM app.chart_annotation WHERE id = :i
    """), {"i": ann_id})).mappings().first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if row["created_by"] != user.id and user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "only the author or admin can delete")
    await session.execute(text("DELETE FROM app.chart_annotation WHERE id = :i"),
                          {"i": ann_id})
    await session.commit()
