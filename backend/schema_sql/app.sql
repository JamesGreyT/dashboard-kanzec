-- =============================================================================
-- app.* schema — dashboard-owned tables (users, refresh tokens, audit log)
-- Apply: psql "$DATABASE_URL" -f app.sql
-- Idempotent. Runs on every deploy.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS app;

-- Users -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.user (
    id             BIGSERIAL PRIMARY KEY,
    username       TEXT UNIQUE NOT NULL,
    password_hash  TEXT NOT NULL,
    role           TEXT NOT NULL CHECK (role IN ('admin','operator','viewer')),
    is_active      BOOLEAN NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at  TIMESTAMPTZ
);

-- Refresh tokens --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.refresh_token (
    jti         TEXT PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES app.user(id) ON DELETE CASCADE,
    issued_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    user_agent  TEXT,
    ip_address  INET
);
CREATE INDEX IF NOT EXISTS idx_refresh_token_user    ON app.refresh_token (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_token_expires ON app.refresh_token (expires_at);

-- Audit log -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.audit_log (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT REFERENCES app.user(id) ON DELETE SET NULL,
    action      TEXT NOT NULL,
    target      TEXT,
    details     JSONB,
    ip_address  INET,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_time   ON app.audit_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action_time ON app.audit_log (action, created_at DESC);

-- Rooms -----------------------------------------------------------------------
-- Each Smartup filial/room is a sales-manager / debt-collector unit. We keep a
-- materialised reference table so we can attach users to rooms (see user_rooms
-- once Phase 2 lands), surface per-collector rollups on the Debt page, and let
-- admins retire stale rooms without deleting data. The table is refreshed from
-- smartup_rep.deal_order.room_id on app boot and every 10 minutes by
-- app/rooms/service.refresh_rooms.
CREATE TABLE IF NOT EXISTS app.room (
    room_id     TEXT        PRIMARY KEY,
    room_code   TEXT,
    room_name   TEXT        NOT NULL,
    active      BOOLEAN     NOT NULL DEFAULT true,
    seen_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_room_active ON app.room (active) WHERE active = true;
