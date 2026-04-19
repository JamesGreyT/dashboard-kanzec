"""ORM model for app.room — the one dashboard-owned rooms reference table.

Rooms themselves originate in smartup_rep.deal_order.room_id / room_code /
room_name; this materialisation just gives us something stable to foreign-key
user_rooms against (Phase 2) and to hang an `active` flag on.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, text
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base


class Room(Base):
    __tablename__ = "room"
    __table_args__ = {"schema": "app"}

    room_id: Mapped[str] = mapped_column(String, primary_key=True)
    room_code: Mapped[str | None] = mapped_column(String)
    room_name: Mapped[str] = mapped_column(String, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()"),
        nullable=False,
    )
