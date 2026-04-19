"""User-scope guard — every data read goes through this.

A user with zero rows in app.user_rooms (including all admins for now) is
*unscoped* — they see everything. A user with one or more rows is *scoped* and
only sees clients/orders/payments belonging to their assigned rooms.

`scope_for_user` is a FastAPI dependency that fetches the user's room list once
per request and returns a `UserScope` that services consume via
`clause_for_table(...)`. The resulting SQL fragment is AND'd into the existing
WHERE of each data query — no router churn besides swapping
`CurrentUser` → `ScopedUser`.

Scope is computed from `app.user_rooms` even for admins: an admin with rooms
still becomes scoped (useful for "view as" debugging). Explicit role overrides
live on top — currently only the admin-role endpoints for user/room management,
which don't touch the data tables this module protects.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Annotated

from fastapi import Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .auth.deps import CurrentUser
from .auth.models import User
from .db import get_session


@dataclass
class UserScope:
    user: User
    room_ids: list[str] = field(default_factory=list)

    @property
    def is_scoped(self) -> bool:
        return bool(self.room_ids)

    @property
    def user_id(self) -> int:
        return self.user.id

    @property
    def role(self) -> str:
        return self.user.role


async def scope_for_user(
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserScope:
    if user.role == "admin":
        # Admins are unconditionally unscoped — even if someone set user_rooms
        # rows for them, their audit/maintenance views must stay cross-room.
        return UserScope(user=user, room_ids=[])
    rows = (
        await session.execute(
            text("SELECT room_id FROM app.user_rooms WHERE user_id = :uid"),
            {"uid": user.id},
        )
    ).all()
    return UserScope(user=user, room_ids=[r.room_id for r in rows])


ScopedUser = Annotated[UserScope, Depends(scope_for_user)]


def clause_for_table(scope: UserScope, schema_table: str) -> tuple[str, dict]:
    """
    Return (sql_fragment, bind_params) to AND into the existing WHERE of a
    query against `schema_table`. Returns ("", {}) for unscoped users.

    Callers should compose like:

        fragment, extra_params = clause_for_table(scope, "smartup_rep.payment")
        if fragment:
            where = (where + " AND " if where else "WHERE ") + fragment
            params.update(extra_params)
    """
    if not scope.is_scoped:
        return "", {}

    placeholders = ", ".join(f":_scope_r{i}" for i in range(len(scope.room_ids)))
    params: dict = {f"_scope_r{i}": r for i, r in enumerate(scope.room_ids)}

    if schema_table == "smartup_rep.deal_order":
        # Direct column on the table.
        return f'"room_id" IN ({placeholders})', params

    if schema_table in ("smartup_rep.payment", "smartup_rep.legal_person"):
        # Scope via "clients the user has sold to". deal_order.person_id is
        # TEXT; the target tables use BIGINT — cast both sides to text.
        return (
            f'"person_id"::text IN ('
            f'  SELECT DISTINCT person_id FROM smartup_rep.deal_order '
            f'   WHERE room_id IN ({placeholders})'
            f')'
        ), params

    return "", {}
