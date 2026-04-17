"""Auth service: login, refresh, logout, bootstrap admin."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from . import jwt_utils
from .models import RefreshToken, User
from .passwords import hash_password, verify_password

log = logging.getLogger(__name__)


class AuthError(Exception):
    """Any login / refresh / logout failure. Mapped to 401 by the router."""


async def authenticate(session: AsyncSession, username: str, password: str) -> User:
    user = await session.scalar(select(User).where(User.username == username))
    if not user or not user.is_active:
        raise AuthError("invalid credentials")
    if not verify_password(password, user.password_hash):
        raise AuthError("invalid credentials")
    user.last_login_at = datetime.now(tz=timezone.utc)
    await session.flush()
    return user


async def issue_tokens(
    session: AsyncSession,
    user: User,
    *,
    user_agent: str | None = None,
    ip: str | None = None,
) -> tuple[str, str, datetime, datetime]:
    """Returns (access_token, refresh_token, access_exp, refresh_exp).
    Persists the refresh jti so we can revoke it later."""
    access, access_exp = jwt_utils.make_access_token(user.id, user.username, user.role)
    refresh, jti, refresh_exp = jwt_utils.make_refresh_token(user.id)
    session.add(
        RefreshToken(
            jti=jti,
            user_id=user.id,
            expires_at=refresh_exp,
            user_agent=user_agent,
            ip_address=ip,
        )
    )
    await session.flush()
    return access, refresh, access_exp, refresh_exp


async def rotate_refresh(
    session: AsyncSession,
    refresh_token: str,
    *,
    user_agent: str | None = None,
    ip: str | None = None,
) -> tuple[User, str, str, datetime, datetime]:
    """Validate a refresh token, revoke the old jti, issue a new token pair."""
    import jwt

    try:
        claims = jwt_utils.decode_refresh(refresh_token)
    except jwt.ExpiredSignatureError:
        raise AuthError("refresh token expired") from None
    except jwt.InvalidTokenError as e:
        raise AuthError(f"invalid refresh token: {e}") from None

    row = await session.scalar(select(RefreshToken).where(RefreshToken.jti == claims["jti"]))
    if not row or row.revoked_at is not None or row.expires_at <= datetime.now(tz=timezone.utc):
        raise AuthError("refresh token no longer valid")

    user = await session.scalar(select(User).where(User.id == claims["uid"]))
    if not user or not user.is_active:
        raise AuthError("user inactive or missing")

    # Revoke the old jti, issue a new pair.
    row.revoked_at = datetime.now(tz=timezone.utc)
    access, new_refresh, access_exp, refresh_exp = await issue_tokens(
        session, user, user_agent=user_agent, ip=ip
    )
    return user, access, new_refresh, access_exp, refresh_exp


async def revoke_refresh(session: AsyncSession, refresh_token: str) -> None:
    """Best-effort revoke — if token is bad we don't care; logout should be idempotent."""
    import jwt

    try:
        claims = jwt_utils.decode_refresh(refresh_token)
    except jwt.InvalidTokenError:
        return
    row = await session.scalar(select(RefreshToken).where(RefreshToken.jti == claims["jti"]))
    if row and row.revoked_at is None:
        row.revoked_at = datetime.now(tz=timezone.utc)
        await session.flush()


# ---- Bootstrap admin -------------------------------------------------------

async def bootstrap_admin(session: AsyncSession) -> None:
    """If no admin exists and the env has KANZEC_ADMIN_USERNAME/PASSWORD, create one."""
    if not settings.admin_username or not settings.admin_password:
        return
    existing = await session.scalar(select(User).where(User.role == "admin"))
    if existing is not None:
        return
    user = User(
        username=settings.admin_username,
        password_hash=hash_password(settings.admin_password),
        role="admin",
        is_active=True,
    )
    session.add(user)
    await session.flush()
    log.info("bootstrapped admin user %r (id=%s)", user.username, user.id)
