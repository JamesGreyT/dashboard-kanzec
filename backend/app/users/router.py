"""Admin-only user CRUD, plus room-scope assignment + bulk-from-rooms."""
from __future__ import annotations

import logging
import re
import secrets
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from .. import audit
from ..auth.deps import CurrentUser, require_role
from ..auth.models import RefreshToken, User
from ..auth.passwords import hash_password
from ..db import get_session

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/users", tags=["admin:users"])

Role = Literal["admin", "operator", "viewer"]


class UserOut(BaseModel):
    id: int
    username: str
    role: Role
    is_active: bool
    created_at: datetime
    last_login_at: datetime | None
    scope_room_ids: list[str]


class CreateBody(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=8, max_length=256)
    role: Role
    scope_room_ids: list[str] = Field(default_factory=list)


class PatchBody(BaseModel):
    password: str | None = Field(default=None, min_length=8, max_length=256)
    role: Role | None = None
    is_active: bool | None = None
    scope_room_ids: list[str] | None = None


async def _fetch_scope_map(session: AsyncSession) -> dict[int, list[str]]:
    rows = (
        await session.execute(
            text("SELECT user_id, room_id FROM app.user_rooms ORDER BY user_id, room_id")
        )
    ).all()
    out: dict[int, list[str]] = {}
    for r in rows:
        out.setdefault(r.user_id, []).append(r.room_id)
    return out


async def _fetch_scope_for(session: AsyncSession, user_id: int) -> list[str]:
    rows = (
        await session.execute(
            text("SELECT room_id FROM app.user_rooms WHERE user_id = :uid ORDER BY room_id"),
            {"uid": user_id},
        )
    ).all()
    return [r.room_id for r in rows]


async def _set_user_rooms(
    session: AsyncSession, user_id: int, room_ids: list[str]
) -> list[str]:
    """Replace the user's room assignment set with exactly `room_ids`.
    Silently drops room_ids that don't exist in app.room."""
    # De-dupe while preserving order.
    wanted = list(dict.fromkeys(room_ids))
    # Filter to rooms that actually exist.
    if wanted:
        valid_rows = (
            await session.execute(
                text("SELECT room_id FROM app.room WHERE room_id = ANY(:ids)"),
                {"ids": wanted},
            )
        ).all()
        valid = {r.room_id for r in valid_rows}
        wanted = [r for r in wanted if r in valid]

    await session.execute(
        text("DELETE FROM app.user_rooms WHERE user_id = :uid"),
        {"uid": user_id},
    )
    for room_id in wanted:
        await session.execute(
            text(
                "INSERT INTO app.user_rooms (user_id, room_id) VALUES (:uid, :rid) "
                "ON CONFLICT DO NOTHING"
            ),
            {"uid": user_id, "rid": room_id},
        )
    await session.flush()
    return wanted


def _to_out(u: User, scope_room_ids: list[str]) -> UserOut:
    return UserOut(
        id=u.id, username=u.username, role=u.role,  # type: ignore[arg-type]
        is_active=u.is_active,
        created_at=u.created_at,
        last_login_at=u.last_login_at,
        scope_room_ids=scope_room_ids,
    )


@router.get("")
async def list_users(
    _: Annotated[object, Depends(require_role("admin"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    users = (await session.execute(select(User).order_by(User.id))).scalars().all()
    scope_map = await _fetch_scope_map(session)
    return {
        "users": [
            _to_out(u, scope_map.get(u.id, [])).model_dump(mode="json") for u in users
        ]
    }


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: CreateBody,
    actor: CurrentUser,
    request: Request,
    _: Annotated[object, Depends(require_role("admin"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserOut:
    if await session.scalar(select(User).where(User.username == body.username)):
        raise HTTPException(status.HTTP_409_CONFLICT, "username exists")
    u = User(
        username=body.username,
        password_hash=hash_password(body.password),
        role=body.role,
        is_active=True,
    )
    session.add(u)
    await session.flush()
    applied_rooms = await _set_user_rooms(session, u.id, body.scope_room_ids)
    await audit.write(
        session, user_id=actor.id, action="user_create", target=f"user:{u.id}",
        details={"username": u.username, "role": u.role, "scope_room_ids": applied_rooms},
        ip_address=request.client.host if request.client else None,
    )
    await session.commit()
    return _to_out(u, applied_rooms)


@router.patch("/{user_id}", response_model=UserOut)
async def patch_user(
    user_id: int,
    body: PatchBody,
    actor: CurrentUser,
    request: Request,
    _: Annotated[object, Depends(require_role("admin"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserOut:
    u = await session.scalar(select(User).where(User.id == user_id))
    if u is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user not found")
    changes: dict = {}
    if body.password is not None:
        u.password_hash = hash_password(body.password)
        changes["password"] = "reset"
    if body.role is not None and body.role != u.role:
        changes["role"] = {"from": u.role, "to": body.role}
        u.role = body.role
    if body.is_active is not None and body.is_active != u.is_active:
        changes["is_active"] = body.is_active
        u.is_active = body.is_active
    if body.scope_room_ids is not None:
        before = await _fetch_scope_for(session, u.id)
        after = await _set_user_rooms(session, u.id, body.scope_room_ids)
        if set(before) != set(after):
            changes["scope_room_ids"] = {"from": before, "to": after}
    u.updated_at = datetime.utcnow()
    await session.flush()
    if changes:
        await audit.write(
            session, user_id=actor.id, action="user_patch", target=f"user:{u.id}",
            details={"username": u.username, **changes},
            ip_address=request.client.host if request.client else None,
        )
    await session.commit()
    scope = await _fetch_scope_for(session, u.id)
    return _to_out(u, scope)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    actor: CurrentUser,
    request: Request,
    _: Annotated[object, Depends(require_role("admin"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    if user_id == actor.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "cannot delete yourself")
    u = await session.scalar(select(User).where(User.id == user_id))
    if u is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user not found")
    await session.execute(delete(User).where(User.id == user_id))
    await audit.write(
        session, user_id=actor.id, action="user_delete", target=f"user:{user_id}",
        details={"username": u.username},
        ip_address=request.client.host if request.client else None,
    )
    await session.commit()


@router.post("/{user_id}/revoke-sessions", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_sessions(
    user_id: int,
    actor: CurrentUser,
    request: Request,
    _: Annotated[object, Depends(require_role("admin"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    result = await session.execute(
        select(RefreshToken).where(
            RefreshToken.user_id == user_id,
            RefreshToken.revoked_at.is_(None),
        )
    )
    now = datetime.utcnow()
    count = 0
    for tok in result.scalars().all():
        tok.revoked_at = now
        count += 1
    await session.flush()
    await audit.write(
        session, user_id=actor.id, action="user_revoke_sessions",
        target=f"user:{user_id}", details={"count": count},
        ip_address=request.client.host if request.client else None,
    )
    await session.commit()


# ---- Bulk-from-rooms --------------------------------------------------------


_USERNAME_SAFE_RE = re.compile(r"[^a-z0-9]+")


def _slugify_username(room_name: str, room_code: str | None) -> str:
    """Deterministic-ish username from a room name. Lowercased, ASCII-like,
    stripped of punctuation, falls back to room_code if the stripped name is
    empty. Caller must still check for collisions."""
    slug = _USERNAME_SAFE_RE.sub("_", room_name.lower()).strip("_")
    if not slug and room_code:
        slug = _USERNAME_SAFE_RE.sub("_", room_code.lower()).strip("_")
    if not slug:
        slug = "room"
    return f"room_{slug}"[:64]


class BulkFromRoomsBody(BaseModel):
    role: Role = "operator"
    # If the generated username already exists, we append a numeric suffix
    # until we find a free one. If True, we skip those rooms instead (safer).
    skip_existing_usernames: bool = False


class BulkCredentialOut(BaseModel):
    username: str
    temp_password: str
    room_id: str
    room_name: str


@router.post("/bulk-from-rooms", response_model=list[BulkCredentialOut])
async def bulk_from_rooms(
    body: BulkFromRoomsBody,
    actor: CurrentUser,
    request: Request,
    _: Annotated[object, Depends(require_role("admin"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[BulkCredentialOut]:
    """For each active room that doesn't yet have a user assigned, create a
    fresh user and scope them to that one room. Returns the temp passwords —
    this is the ONLY time they can be read back, so the admin must copy them
    out of the response."""

    # Find rooms with no assigned user.
    rooms = (
        await session.execute(
            text(
                """
                SELECT r.room_id, r.room_code, r.room_name
                  FROM app.room r
                 WHERE r.active = true
                   AND NOT EXISTS (
                       SELECT 1 FROM app.user_rooms ur WHERE ur.room_id = r.room_id
                   )
                 ORDER BY r.room_name
                """
            )
        )
    ).all()

    # Existing usernames for collision check.
    existing = {
        row[0]
        for row in (await session.execute(select(User.username))).all()
    }

    out: list[BulkCredentialOut] = []
    for r in rooms:
        base = _slugify_username(r.room_name, r.room_code)
        username = base
        n = 2
        while username in existing:
            if body.skip_existing_usernames:
                username = ""
                break
            username = f"{base}_{n}"[:64]
            n += 1
        if not username:
            continue

        temp_password = secrets.token_urlsafe(12)
        u = User(
            username=username,
            password_hash=hash_password(temp_password),
            role=body.role,
            is_active=True,
        )
        session.add(u)
        await session.flush()
        existing.add(username)

        await _set_user_rooms(session, u.id, [r.room_id])

        out.append(
            BulkCredentialOut(
                username=username,
                temp_password=temp_password,
                room_id=r.room_id,
                room_name=r.room_name,
            )
        )

    await audit.write(
        session, user_id=actor.id, action="user_bulk_from_rooms",
        target=None,
        details={"count": len(out), "role": body.role},
        ip_address=request.client.host if request.client else None,
    )
    await session.commit()
    return out
