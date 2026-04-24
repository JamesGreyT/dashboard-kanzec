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
    """Dashboard-side filter state. All lists empty = no filter."""
    direction: list[str] = field(default_factory=list)
    region: list[str] = field(default_factory=list)
    manager: list[str] = field(default_factory=list)
    client: list[str] = field(default_factory=list)   # person_id values

    @classmethod
    def parse(cls, *, direction: str = "", region: str = "",
              manager: str = "", client: str = "") -> "Filters":
        return cls(
            direction=_split(direction),
            region=_split(region),
            manager=_split(manager),
            client=_split(client),
        )


def _split(csv: str) -> list[str]:
    return [s.strip() for s in csv.split(",") if s.strip()] if csv else []


def clause(f: Filters, *, person_alias: str = "lp",
           manager_table: str = "d") -> tuple[str, dict[str, Any]]:
    """Return `(and_sql, params)` you can append to an outer WHERE clause.
    `and_sql` always starts with an `AND` or is empty — callers need a
    preceding WHERE."""
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
    return ("\n       " + "\n       ".join(parts) if parts else "", params)


def is_active(f: Filters) -> bool:
    return bool(f.direction or f.region or f.manager or f.client)
