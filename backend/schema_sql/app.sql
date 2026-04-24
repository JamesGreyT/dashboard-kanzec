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
-- below), surface per-collector rollups on the Debt page, and let admins retire
-- stale rooms without deleting data. Refreshed from smartup_rep.deal_order on
-- app boot and every 10 minutes by app/rooms/service.refresh_rooms.
CREATE TABLE IF NOT EXISTS app.room (
    room_id     TEXT        PRIMARY KEY,
    room_code   TEXT,
    room_name   TEXT        NOT NULL,
    active      BOOLEAN     NOT NULL DEFAULT true,
    seen_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_room_active ON app.room (active) WHERE active = true;

-- User ↔ rooms (M:N) ----------------------------------------------------------
-- 0 rows for a user  = unscoped (sees all — default behaviour for admins and
--                      for any not-yet-migrated operator/viewer)
-- 1 row             = single-room collector
-- N rows            = team lead / supervisor (union of N rooms)
CREATE TABLE IF NOT EXISTS app.user_rooms (
    user_id   BIGINT NOT NULL REFERENCES app.user(id) ON DELETE CASCADE,
    room_id   TEXT   NOT NULL REFERENCES app.room(room_id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, room_id)
);
CREATE INDEX IF NOT EXISTS idx_user_rooms_room ON app.user_rooms (room_id);

-- Debt contact log ------------------------------------------------------------
-- A row per call / note a collector makes against a client. The Debt worklist
-- joins the latest row per person_id so collectors can see the last outcome +
-- any promised-payment commitment inline without opening a drawer. `outcome`
-- is enum-in-code (see app/debt/service.py).
CREATE TABLE IF NOT EXISTS app.debt_contact_log (
    id               BIGSERIAL PRIMARY KEY,
    person_id        BIGINT      NOT NULL,
    contacted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    contacted_by     BIGINT      NOT NULL REFERENCES app.user(id) ON DELETE RESTRICT,
    outcome          TEXT        NOT NULL CHECK (outcome IN
                       ('called','no_answer','promised','rescheduled','refused','paid','note')),
    promised_amount  NUMERIC(18,4),
    promised_by_date DATE,
    follow_up_date   DATE,
    note             TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_debt_log_person    ON app.debt_contact_log (person_id, contacted_at DESC);
CREATE INDEX IF NOT EXISTS idx_debt_log_follow_up ON app.debt_contact_log (follow_up_date) WHERE follow_up_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_debt_log_by_user   ON app.debt_contact_log (contacted_by, contacted_at DESC);

-- User preferences ------------------------------------------------------------
-- One JSONB blob per user: { default_window: "last90", default_directions: [...]
-- , default_manager: [...] }. Dashboards read this on mount to pre-seed
-- filter state. Unknown keys are ignored so the shape can evolve without a
-- migration dance.
CREATE TABLE IF NOT EXISTS app.user_preferences (
    user_id     BIGINT PRIMARY KEY REFERENCES app.user(id) ON DELETE CASCADE,
    body        JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Chart annotations -----------------------------------------------------------
-- Long-form notes pinned to a date on a specific chart. Reads as a vertical
-- reference line on the target chart, with a hover-popover showing the note
-- and author. Current targets: debt.aging_trend.
CREATE TABLE IF NOT EXISTS app.chart_annotation (
    id          BIGSERIAL PRIMARY KEY,
    chart_key   TEXT        NOT NULL,
    x_date      DATE        NOT NULL,
    note        TEXT        NOT NULL,
    created_by  BIGINT      NOT NULL REFERENCES app.user(id) ON DELETE RESTRICT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chart_ann_chart ON app.chart_annotation (chart_key, x_date);

-- Alert rules + events --------------------------------------------------------
-- `alert_rule` = a threshold subscription owned by a user (or 'shared' when
-- user_id IS NULL — admin-created broadcast rules, all users see events).
-- Kinds (enum-in-code, see app/alerts/service.py):
--   dso_gt             threshold = DSO days; fires when 12mo-weighted DSO exceeds
--   debt_total_gt      threshold = $; fires when total outstanding exceeds
--   single_debtor_gt   threshold = $; fires when any single debtor exceeds
--   over_90_count_gt   threshold = count; fires when # of 90+ debtors exceeds
CREATE TABLE IF NOT EXISTS app.alert_rule (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT REFERENCES app.user(id) ON DELETE CASCADE,
    kind        TEXT        NOT NULL CHECK (kind IN (
                  'dso_gt','debt_total_gt','single_debtor_gt','over_90_count_gt')),
    threshold   NUMERIC(18,4) NOT NULL,
    label       TEXT,
    enabled     BOOLEAN     NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alert_rule_user ON app.alert_rule (user_id) WHERE enabled = true;

-- `alert_event` = a fact that a rule crossed its threshold at a point in time.
-- Created by app/alerts/service.evaluate_rules, read by the bell-icon drawer.
CREATE TABLE IF NOT EXISTS app.alert_event (
    id            BIGSERIAL PRIMARY KEY,
    rule_id       BIGINT      NOT NULL REFERENCES app.alert_rule(id) ON DELETE CASCADE,
    triggered_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    value         NUMERIC(18,4),
    message       TEXT,
    read_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_alert_event_rule_time ON app.alert_event (rule_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_event_unread    ON app.alert_event (triggered_at DESC) WHERE read_at IS NULL;
