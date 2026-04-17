"""Catalog of queryable tables — the safety surface between the UI's free-form
filter params and the live SQL. Every column name, filter operator, and sort
field that ever reaches a SQL string starts from this dict; anything the UI
sends that isn't in here gets 400'd.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

ColType = Literal["date", "timestamp", "text", "int", "numeric"]
Op = Literal["=", "!=", ">=", "<=", ">", "<", "ilike", "in"]


@dataclass(frozen=True)
class ColumnDef:
    label: str
    type: ColType
    ops: tuple[Op, ...] = ()
    visible: bool = True       # shown by default in the table
    numeric: bool = False      # renders right-aligned tabular
    id_column: bool = False    # mono font, "machine id" treatment
    currency: str | None = None  # if set, render unit caption below number


@dataclass(frozen=True)
class TableDef:
    key: str
    schema: str
    table: str
    label: str
    pk: tuple[str, ...]
    columns: dict[str, ColumnDef] = field(default_factory=dict)
    default_sort: tuple[tuple[str, Literal["asc", "desc"]], ...] = ()
    default_limit: int = 50


CATALOG: dict[str, TableDef] = {
    "deal_order": TableDef(
        key="deal_order",
        schema="smartup_rep",
        table="deal_order",
        label="Orders",
        pk=("delivery_date", "room_id", "deal_id", "product_id"),
        default_sort=(("delivery_date", "desc"),),
        columns={
            "delivery_date":      ColumnDef("Date", "date",    ("=", ">=", "<=", ">", "<"), True),
            "room_name":          ColumnDef("Room", "text",    ("=", "ilike"), True),
            "room_id":            ColumnDef("Room ID", "text", ("=",), False, id_column=True),
            "deal_id":            ColumnDef("Deal", "text",    ("=",), True, id_column=True),
            "sales_manager":      ColumnDef("Sales", "text",   ("=", "ilike"), False),
            "client_name":        ColumnDef("Client", "text",  ("=", "ilike"), True),
            "person_id":          ColumnDef("Client ID", "text", ("=",), False, id_column=True),
            "client_code":        ColumnDef("Client Code", "text", ("=", "ilike"), False),
            "client_tin":         ColumnDef("TIN", "text",     ("=", "ilike"), False),
            "client_phone":       ColumnDef("Phone", "text",   ("=", "ilike"), False),
            "product_name":       ColumnDef("Product", "text", ("=", "ilike"), True),
            "product_id":         ColumnDef("Product ID", "text", ("=",), False, id_column=True),
            "product_code":       ColumnDef("Product Code", "text", ("=", "ilike"), False),
            "product_barcode":    ColumnDef("Barcode", "text", ("=", "ilike"), False),
            "product_measure":    ColumnDef("Unit", "text",    ("=",), False),
            "product_local_code": ColumnDef("Local Code", "text", ("=", "ilike"), False),
            "brand":              ColumnDef("Group", "text",   ("=", "ilike"), True),
            "model":              ColumnDef("Category", "text", ("=", "ilike"), False),
            "sub_model":          ColumnDef("Brand", "text",   ("=", "ilike"), False),
            "sold_quant":         ColumnDef("Qty", "numeric",  (">=", "<=", "=", ">", "<"), True, numeric=True),
            "product_amount":     ColumnDef("Amount", "numeric", (">=", "<=", "=", ">", "<"), True, numeric=True, currency="USD"),
            "source_range":       ColumnDef("Source", "text",  ("=",), False),
        },
    ),
    "payment": TableDef(
        key="payment",
        schema="smartup_rep",
        table="payment",
        label="Payments",
        pk=("payment_date", "row_key"),
        default_sort=(("payment_date", "desc"),),
        columns={
            "payment_date":   ColumnDef("Date", "timestamp", ("=", ">=", "<=", ">", "<"), True),
            "person_id":      ColumnDef("Client ID", "int",  ("=",), False, id_column=True),
            "client_name":    ColumnDef("Client", "text",    ("=", "ilike"), True),
            "client_tin":     ColumnDef("TIN", "text",       ("=", "ilike"), False),
            "payer":          ColumnDef("Collector", "text", ("=", "ilike"), True),
            "payment_method": ColumnDef("Method", "text",    ("=",), True),
            "currency":       ColumnDef("Currency", "text",  ("=",), True),
            "amount":         ColumnDef("Amount", "numeric", (">=", "<=", "=", ">", "<"), True, numeric=True),
            "row_key":        ColumnDef("Row Hash", "text",  ("=",), False, id_column=True),
            "source_range":   ColumnDef("Source", "text",    ("=",), False),
        },
    ),
    "legal_person": TableDef(
        key="legal_person",
        schema="smartup_rep",
        table="legal_person",
        label="Legal persons",
        pk=("person_id",),
        default_sort=(("name", "asc"),),
        columns={
            "person_id":   ColumnDef("ID", "int",           ("=",), True, id_column=True),
            "code":        ColumnDef("Code", "text",        ("=", "ilike"), True),
            "tin":         ColumnDef("TIN", "text",         ("=", "ilike"), True),
            "name":        ColumnDef("Name", "text",        ("=", "ilike"), True),
            "state_name":  ColumnDef("State", "text",       ("=",), True),
            "created_on":  ColumnDef("Created", "timestamp", ("=", ">=", "<=", ">", "<"), False),
            "modified_on": ColumnDef("Modified", "timestamp", ("=", ">=", "<=", ">", "<"), True),
        },
    ),
}


def list_tables() -> list[dict]:
    out = []
    for t in CATALOG.values():
        out.append({
            "key": t.key,
            "label": t.label,
            "pk": list(t.pk),
            "default_sort": [{"field": f, "dir": d} for f, d in t.default_sort],
            "columns": [
                {
                    "name": name,
                    "label": c.label,
                    "type": c.type,
                    "ops": list(c.ops),
                    "visible": c.visible,
                    "numeric": c.numeric,
                    "id_column": c.id_column,
                    "currency": c.currency,
                }
                for name, c in t.columns.items()
            ],
        })
    return out
