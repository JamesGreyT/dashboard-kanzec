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

# Cyrillic → ASCII transliteration. Covers Russian + the Uzbek-Cyrillic letters
# that show up in Smartup room names. Non-letters fall through unchanged and
# get stripped by _USERNAME_SAFE_RE below.
_CYRILLIC_MAP = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
    "ў": "o", "қ": "q", "ғ": "g", "ҳ": "h",
    "'": "", "ʼ": "", "`": "",
}


def _transliterate(s: str) -> str:
    return "".join(_CYRILLIC_MAP.get(ch, ch) for ch in s.lower())


def _slugify_username(room_name: str, room_code: str | None) -> str:
    """Full-slug username from a room name (e.g. "Sardor Yanvarov" →
    "sardor-yanvarov"). Cyrillic transliterated, punctuation stripped, spaces
    become single hyphens. Falls back to room_code if name slugifies empty.
    Caller still checks for collisions."""
    slug = _USERNAME_SAFE_RE.sub("-", _transliterate(room_name)).strip("-")
    if not slug and room_code:
        slug = _USERNAME_SAFE_RE.sub("-", _transliterate(room_code)).strip("-")
    if not slug:
        slug = "room"
    return slug[:64]


# Curated 4-7 letter words with no homoglyphs (no o/0, l/I, etc. confusables).
# Mix of nouns + adjectives so passphrases parse as English-ish. Keep at least
# 256 entries so 4-word passphrases pass entropy bar.
_PASSPHRASE_WORDS = (
    "Able", "Acorn", "Active", "Agile", "Alpha", "Amber", "Apex", "Apple",
    "April", "Arctic", "Arena", "Arrow", "Atlas", "Aurora", "Autumn", "Azure",
    "Bamboo", "Banana", "Basket", "Basil", "Beacon", "Beach", "Bear", "Bee",
    "Berry", "Birch", "Bison", "Black", "Blaze", "Blink", "Blue", "Bluff",
    "Bold", "Bonus", "Brave", "Breeze", "Bridge", "Bright", "Brisk", "Bronze",
    "Brook", "Brown", "Buddy", "Burst", "Cactus", "Calm", "Camel", "Candle",
    "Canyon", "Carbon", "Carrot", "Castle", "Cedar", "Chalk", "Charm", "Cheer",
    "Cherry", "Chime", "Cinder", "Clay", "Clean", "Clever", "Cliff", "Cloud",
    "Clover", "Coast", "Cobalt", "Cobra", "Cocoa", "Comet", "Coral", "Cosmic",
    "Cotton", "Cougar", "Cove", "Crane", "Crater", "Cream", "Crest", "Crisp",
    "Crown", "Crystal", "Cube", "Cyan", "Daisy", "Dance", "Dapper", "Dark",
    "Dart", "Dash", "Dawn", "Decay", "Deep", "Deer", "Delta", "Desert",
    "Dew", "Dice", "Diesel", "Dingo", "Dipper", "Disco", "Diver", "Dragon",
    "Drift", "Drum", "Dune", "Dusk", "Eagle", "Earth", "Easy", "Eclipse",
    "Edge", "Eden", "Ember", "Empire", "Energy", "Epic", "Equal", "Era",
    "Evergreen", "Express", "Falcon", "Fancy", "Feather", "Felt", "Fern", "Fest",
    "Field", "Fierce", "Final", "Finch", "Fire", "Fjord", "Flame", "Flash",
    "Flax", "Fleet", "Flint", "Float", "Flora", "Flute", "Foam", "Fog",
    "Forest", "Fort", "Fox", "Fresh", "Frost", "Fudge", "Fun", "Galaxy",
    "Gem", "Ginger", "Giraffe", "Glacier", "Glass", "Glow", "Goat", "Gold",
    "Grace", "Grain", "Grand", "Grape", "Grass", "Gravel", "Great", "Green",
    "Grit", "Grove", "Gust", "Hammer", "Happy", "Harbor", "Harvest", "Hawk",
    "Hazel", "Heart", "Heath", "Heavy", "Helix", "Hero", "Hickory", "Hidden",
    "Hilltop", "Honey", "Hover", "Hunter", "Husky", "Iceberg", "Indigo", "Inkwell",
    "Iris", "Iron", "Ivory", "Jade", "Jasper", "Jazz", "Jester", "Jetty",
    "Jingle", "Jolly", "Journey", "Jungle", "Juniper", "Karma", "Kayak", "Keen",
    "Kelp", "Kestrel", "Kettle", "Kiln", "Kind", "King", "Kite", "Kiwi",
    "Knack", "Knight", "Knot", "Lake", "Lamp", "Lark", "Latte", "Laurel",
    "Lava", "Leaf", "Lemon", "Lens", "Light", "Lily", "Linen", "Lion",
    "Loft", "Lotus", "Lucky", "Lumber", "Lunar", "Magic", "Maize", "Mango",
    "Maple", "Marble", "Marina", "Maroon", "Marsh", "Mason", "Master", "Matrix",
    "Meadow", "Melody", "Mercury", "Metal", "Meteor", "Mighty", "Mint", "Mirror",
    "Mist", "Modern", "Monsoon", "Moose", "Mountain", "Music", "Native", "Nectar",
    "Neon", "Nest", "Night", "Nimble", "Noble", "North", "Nova", "Nutmeg",
    "Oak", "Oasis", "Ocean", "Onyx", "Opal", "Orange", "Orbit", "Orchid",
    "Otter", "Oxide", "Pacific", "Page", "Palm", "Panda", "Panther", "Paper",
    "Park", "Patch", "Peach", "Peak", "Pearl", "Pebble", "Pepper", "Petal",
    "Phoenix", "Piano", "Pier", "Pine", "Pixel", "Plain", "Planet", "Plum",
    "Polar", "Pollen", "Pond", "Poppy", "Prairie", "Prism", "Proud", "Puma",
    "Quartz", "Queen", "Quest", "Quick", "Quiet", "Quill", "Quince", "Rabbit",
    "Radar", "Rain", "Rapid", "Raven", "Ravine", "Rebel", "Red", "Reed",
    "Reef", "Relay", "Rhythm", "Ridge", "Rift", "Ripple", "River", "Robin",
    "Rocket", "Rope", "Rose", "Royal", "Ruby", "Rust", "Saffron", "Sage",
    "Sail", "Salmon", "Sand", "Sapphire", "Saturn", "Scarlet", "Scout", "Sea",
    "Seal", "Sequoia", "Shade", "Shadow", "Shark", "Shell", "Sherbet", "Shine",
    "Shore", "Silver", "Simple", "Sincere", "Sky", "Slate", "Sleet", "Smart",
    "Smile", "Snap", "Snow", "Solar", "Solid", "Song", "Soft", "Spark",
    "Sparrow", "Spice", "Spider", "Spire", "Spring", "Sprout", "Spruce", "Stable",
    "Star", "Steady", "Steel", "Stream", "Strong", "Sugar", "Summit", "Sunny",
    "Surf", "Swan", "Sweet", "Tangerine", "Tango", "Teal", "Teak", "Thunder",
    "Tiger", "Timber", "Tinder", "Topaz", "Torch", "Trail", "Trout", "Tulip",
    "Tundra", "Turkey", "Turtle", "Tusk", "Twig", "Umber", "Uniform", "Unique",
    "Urban", "Valley", "Vast", "Velvet", "Venus", "Vibrant", "Victor", "Vine",
    "Violet", "Vivid", "Volt", "Walnut", "Warm", "Water", "Whale", "Wheat",
    "Whisper", "White", "Wild", "Willow", "Winter", "Wise", "Wolf", "Wood",
    "Yacht", "Yellow", "Yield", "Yoga", "Young", "Zebra", "Zen", "Zest",
)


def _generate_passphrase() -> str:
    """4-word passphrase joined by hyphens, suffixed with 2 random digits.
    Example: 'Bright-River-Mango-92'. ~46 bits of entropy."""
    words = [secrets.choice(_PASSPHRASE_WORDS) for _ in range(4)]
    digits = secrets.randbelow(90) + 10  # 10..99 inclusive
    return f"{'-'.join(words)}-{digits}"


class BulkFromRoomsBody(BaseModel):
    role: Role = "operator"
    # If the generated username already exists, we append a numeric suffix
    # until we find a free one. If True, we skip those rooms instead (safer).
    skip_existing_usernames: bool = False
    # If True, rooms that already have a user assigned get their existing
    # user's password reset to a fresh passphrase (and slug renamed to the
    # current rule). Existing scope assignment stays intact. Use this to
    # rotate creds for the whole sales team in one go.
    reset_existing: bool = False


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
    """For each active sales-person room, ensure there's a user scoped to it.
    Creates a new user if the room has none, or (when reset_existing=True)
    rotates the existing user's username + password to the current rule.
    Returns the plaintext passphrases — this is the ONLY time they can be
    read back, so the admin must copy them out of the response."""

    # All active rooms — we need both "no user yet" (create) and "already has
    # a user" (optionally reset). Pulling the assigned user_id in one query.
    rooms = (
        await session.execute(
            text(
                """
                SELECT r.room_id, r.room_code, r.room_name,
                       (SELECT ur.user_id
                          FROM app.user_rooms ur
                         WHERE ur.room_id = r.room_id
                         ORDER BY ur.user_id LIMIT 1) AS assigned_user_id
                  FROM app.room r
                 WHERE r.active = true
                 ORDER BY r.room_name
                """
            )
        )
    ).all()

    # Existing usernames for collision check (excluding the user we're about
    # to rename — we add that back conditionally per row).
    existing_usernames = {
        row[0]
        for row in (await session.execute(select(User.username))).all()
    }

    out: list[BulkCredentialOut] = []
    for r in rooms:
        base = _slugify_username(r.room_name, r.room_code)
        owner_id: int | None = r.assigned_user_id
        owner: User | None = None
        if owner_id is not None:
            if not body.reset_existing:
                continue  # already provisioned; skip
            owner = await session.scalar(select(User).where(User.id == owner_id))
            if owner is None:
                # Stale user_rooms row pointing at a deleted user — treat as
                # unassigned. _set_user_rooms below will fix the orphan.
                owner_id = None

        # Pick a free username. When renaming an existing user, that user's
        # current name doesn't count as "taken".
        candidate = base
        n = 2
        owner_name = owner.username if owner else None
        while candidate in existing_usernames and candidate != owner_name:
            if body.skip_existing_usernames:
                candidate = ""
                break
            candidate = f"{base}-{n}"[:64]
            n += 1
        if not candidate:
            continue
        username = candidate

        temp_password = _generate_passphrase()

        if owner is not None:
            if owner.username != username:
                existing_usernames.discard(owner.username)
                owner.username = username
            owner.password_hash = hash_password(temp_password)
            owner.is_active = True
            owner.updated_at = datetime.utcnow()
            existing_usernames.add(username)
            await session.flush()
            # Force-revoke any active sessions so the new password takes
            # effect immediately.
            tokens = (
                await session.execute(
                    select(RefreshToken).where(
                        RefreshToken.user_id == owner.id,
                        RefreshToken.revoked_at.is_(None),
                    )
                )
            ).scalars().all()
            now = datetime.utcnow()
            for tok in tokens:
                tok.revoked_at = now
            # Make sure scope still points at this room (idempotent).
            await _set_user_rooms(session, owner.id, [r.room_id])
        else:
            u = User(
                username=username,
                password_hash=hash_password(temp_password),
                role=body.role,
                is_active=True,
            )
            session.add(u)
            await session.flush()
            existing_usernames.add(username)
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
        details={
            "count": len(out),
            "role": body.role,
            "reset_existing": body.reset_existing,
        },
        ip_address=request.client.host if request.client else None,
    )
    await session.commit()
    return out
