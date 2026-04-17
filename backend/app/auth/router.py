"""Auth routes.

- POST /api/auth/login     — body {username, password} → {access_token, user}; sets refresh cookie
- POST /api/auth/refresh   — reads refresh cookie → new token pair; rotated cookie
- POST /api/auth/logout    — revokes refresh cookie jti, clears cookie
- GET  /api/auth/me        — current user from access token
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db import get_session
from . import service
from .deps import CurrentUser
from .models import User

router = APIRouter(prefix="/api/auth", tags=["auth"])

_REFRESH_COOKIE = "kanzec_refresh"


class LoginBody(BaseModel):
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=256)


class UserOut(BaseModel):
    id: int
    username: str
    role: str

    @classmethod
    def from_user(cls, u: User) -> "UserOut":
        return cls(id=u.id, username=u.username, role=u.role)


class TokenResponse(BaseModel):
    access_token: str
    user: UserOut


def _set_refresh_cookie(response: Response, token: str, ttl_seconds: int) -> None:
    # httpOnly + Secure + SameSite=Strict + scoped to /api/auth only.
    response.set_cookie(
        key=_REFRESH_COOKIE,
        value=token,
        max_age=ttl_seconds,
        httponly=True,
        secure=True,
        samesite="strict",
        path="/api/auth",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=_REFRESH_COOKIE, path="/api/auth")


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginBody,
    request: Request,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TokenResponse:
    try:
        user = await service.authenticate(session, body.username, body.password)
    except service.AuthError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid credentials") from None

    access, refresh, _, _ = await service.issue_tokens(
        session,
        user,
        user_agent=request.headers.get("user-agent"),
        ip=request.client.host if request.client else None,
    )
    await session.commit()
    _set_refresh_cookie(response, refresh, settings.refresh_ttl_seconds)
    return TokenResponse(access_token=access, user=UserOut.from_user(user))


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    request: Request,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_session)],
    kanzec_refresh: Annotated[str | None, Cookie()] = None,
) -> TokenResponse:
    if not kanzec_refresh:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "no refresh cookie")
    try:
        user, access, new_refresh, _, _ = await service.rotate_refresh(
            session,
            kanzec_refresh,
            user_agent=request.headers.get("user-agent"),
            ip=request.client.host if request.client else None,
        )
    except service.AuthError as e:
        _clear_refresh_cookie(response)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(e)) from None
    await session.commit()
    _set_refresh_cookie(response, new_refresh, settings.refresh_ttl_seconds)
    return TokenResponse(access_token=access, user=UserOut.from_user(user))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    session: Annotated[AsyncSession, Depends(get_session)],
    kanzec_refresh: Annotated[str | None, Cookie()] = None,
) -> None:
    if kanzec_refresh:
        await service.revoke_refresh(session, kanzec_refresh)
        await session.commit()
    _clear_refresh_cookie(response)


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser) -> UserOut:
    return UserOut.from_user(user)
