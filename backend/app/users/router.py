"""Admin-only user CRUD."""
from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import audit
from ..auth.deps import CurrentUser, require_role
from ..auth.models import RefreshToken, User
from ..auth.passwords import hash_password
from ..db import get_session

router = APIRouter(prefix="/api/admin/users", tags=["admin:users"])

Role = Literal["admin", "operator", "viewer"]


class UserOut(BaseModel):
    id: int
    username: str
    role: Role
    is_active: bool
    created_at: datetime
    last_login_at: datetime | None


class CreateBody(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=8, max_length=256)
    role: Role


class PatchBody(BaseModel):
    password: str | None = Field(default=None, min_length=8, max_length=256)
    role: Role | None = None
    is_active: bool | None = None


def _to_out(u: User) -> UserOut:
    return UserOut(
        id=u.id, username=u.username, role=u.role,  # type: ignore[arg-type]
        is_active=u.is_active,
        created_at=u.created_at,
        last_login_at=u.last_login_at,
    )


@router.get("")
async def list_users(
    _: Annotated[object, Depends(require_role("admin"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    rows = (await session.execute(select(User).order_by(User.id))).scalars().all()
    return {"users": [_to_out(u).model_dump(mode="json") for u in rows]}


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
    await audit.write(
        session, user_id=actor.id, action="user_create", target=f"user:{u.id}",
        details={"username": u.username, "role": u.role},
        ip_address=request.client.host if request.client else None,
    )
    await session.commit()
    return _to_out(u)


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
    u.updated_at = datetime.utcnow()
    await session.flush()
    if changes:
        await audit.write(
            session, user_id=actor.id, action="user_patch", target=f"user:{u.id}",
            details={"username": u.username, **changes},
            ip_address=request.client.host if request.client else None,
        )
    await session.commit()
    return _to_out(u)


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
