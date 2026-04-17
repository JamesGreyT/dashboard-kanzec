"""JWT encode/decode — HS256, access + refresh tokens.

Access token carries {sub, uid, role}. Refresh carries {jti, uid} with a
random UUID jti that's stored in app.refresh_token so we can revoke.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal, TypedDict

import jwt

from ..config import settings

_ALGO = "HS256"


class AccessClaims(TypedDict):
    sub: str
    uid: int
    role: str
    iat: int
    exp: int
    typ: Literal["access"]


class RefreshClaims(TypedDict):
    jti: str
    uid: int
    iat: int
    exp: int
    typ: Literal["refresh"]


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _ts(dt: datetime) -> int:
    return int(dt.timestamp())


def make_access_token(user_id: int, username: str, role: str) -> tuple[str, datetime]:
    exp = _now() + timedelta(seconds=settings.access_ttl_seconds)
    claims: AccessClaims = {
        "sub": username,
        "uid": user_id,
        "role": role,
        "iat": _ts(_now()),
        "exp": _ts(exp),
        "typ": "access",
    }
    return jwt.encode(claims, settings.jwt_secret, algorithm=_ALGO), exp


def make_refresh_token(user_id: int) -> tuple[str, str, datetime]:
    """Returns (token, jti, expires_at). jti is persisted for revocation."""
    jti = secrets.token_urlsafe(24)
    exp = _now() + timedelta(seconds=settings.refresh_ttl_seconds)
    claims: RefreshClaims = {
        "jti": jti,
        "uid": user_id,
        "iat": _ts(_now()),
        "exp": _ts(exp),
        "typ": "refresh",
    }
    return jwt.encode(claims, settings.jwt_secret, algorithm=_ALGO), jti, exp


def decode_access(token: str) -> AccessClaims:
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[_ALGO])
    if payload.get("typ") != "access":
        raise jwt.InvalidTokenError("not an access token")
    return payload  # type: ignore[return-value]


def decode_refresh(token: str) -> RefreshClaims:
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[_ALGO])
    if payload.get("typ") != "refresh":
        raise jwt.InvalidTokenError("not a refresh token")
    return payload  # type: ignore[return-value]
