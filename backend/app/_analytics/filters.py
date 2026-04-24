"""SQL clause + params builders for the common dimensional filters.

Every analytics endpoint accepts:
    direction  — comma-separated list of legal_person.direction values
    region     — comma-separated list of legal_person.region_name values
    manager    — comma-separated list of deal_order.sales_manager values
    client     — comma-separated list of person_id values (search result)

This module turns those into SQL `AND x = ANY(:p)` fragments + a params
dict so endpoint SQL stays readable. Each builder assumes a join to
`smartup_rep.legal_person lp` where appropriate; callers are responsible
for the JOIN itself."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Filters:
    """Dashboard-side filter state. All lists empty = no filter.

    `scope_rooms` is populated by the router from the current ScopedUser.
    It is NOT exposed to the client — the user cannot disable their own
    scope by tweaking query params. Unscoped users (admins) get an
    empty list and therefore no restriction."""
    direction: list[str] = field(default_factory=list)
    region: list[str] = field(default_factory=list)
    manager: list[str] = field(default_factory=list)
    client: list[str] = field(default_factory=list)       # person_id values
    scope_rooms: list[str] = field(default_factory=list)  # server-side, not user-settable

    @classmethod
    def parse(cls, *, direction: str = "", region: str = "",
              manager: str = "", client: str = "",
              scope_rooms: list[str] | None = None) -> "Filters":
        return cls(
            direction=_split(direction),
            region=_split(region),
            manager=_split(manager),
            client=_split(client),
            scope_rooms=scope_rooms or [],
        )


def _split(csv: str) -> list[str]:
    return [s.strip() for s in csv.split(",") if s.strip()] if csv else []


def clause(f: Filters, *, person_alias: str = "lp",
           manager_table: str = "d",
           room_on: str = "d") -> tuple[str, dict[str, Any]]:
    """Return `(and_sql, params)` you can append to an outer WHERE clause.
    `and_sql` always starts with an `AND` or is empty — callers need a
    preceding WHERE.

    `room_on` is the alias of the table that has a `room_id` column.
    For deal_order-rooted queries it's `d`. For payment-rooted queries
    pass `None` to fall back to a client-based scope (see below)."""
    parts: list[str] = []
    params: dict[str, Any] = {}
    if f.direction:
        parts.append(f"AND {person_alias}.direction = ANY(:_f_dir)")
        params["_f_dir"] = f.direction
    if f.region:
        parts.append(f"AND {person_alias}.region_name = ANY(:_f_reg)")
        params["_f_reg"] = f.region
    if f.manager:
        parts.append(f"AND {manager_table}.sales_manager = ANY(:_f_mgr)")
        params["_f_mgr"] = f.manager
    if f.client:
        parts.append(f"AND {person_alias}.person_id::text = ANY(:_f_cli)")
        params["_f_cli"] = f.client
    if f.scope_rooms:
        # deal_order has room_id directly. payment doesn't, so for
        # payment-rooted queries the caller passes room_on="" which
        # triggers a client-subquery scope.
        if room_on:
            parts.append(f"AND {room_on}.room_id = ANY(:_scope_rooms)")
            params["_scope_rooms"] = f.scope_rooms
        else:
            parts.append(
                "AND " + person_alias + ".person_id::text IN ("
                " SELECT DISTINCT person_id FROM smartup_rep.deal_order"
                " WHERE room_id = ANY(:_scope_rooms))"
            )
            params["_scope_rooms"] = f.scope_rooms
    return ("\n       " + "\n       ".join(parts) if parts else "", params)


def is_active(f: Filters) -> bool:
    return bool(f.direction or f.region or f.manager or f.client)
