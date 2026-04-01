-- ============================================================
-- PUSH TOKENS
-- Stores Expo push notification tokens per user device
-- ============================================================
CREATE TABLE push_tokens (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    token       TEXT NOT NULL,
    platform    TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (account_id, token)
);

CREATE INDEX idx_push_tokens_account ON push_tokens(account_id);

-- ============================================================
-- USER TIMEZONE
-- Stored on the account so daily notifications fire at the
-- correct local time (8 AM in the user's timezone)
-- ============================================================
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';

-- ============================================================
-- DAILY SCHEDULE
-- Influencers assign a video (and optionally a plan) to each
-- day of the week. day_of_week: 0=Sunday, 1=Monday, ..., 6=Saturday
-- Users subscribed to this influencer receive the daily push at 8 AM
-- ============================================================
CREATE TABLE daily_schedule (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    influencer_id   UUID NOT NULL REFERENCES influencer_profiles(id) ON DELETE CASCADE,
    day_of_week     INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    title           TEXT NOT NULL,
    description     TEXT,
    video_id        UUID REFERENCES videos(id) ON DELETE SET NULL,
    plan_id         UUID REFERENCES plans(id) ON DELETE SET NULL,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- One active entry per influencer per day
    UNIQUE (influencer_id, day_of_week)
);

CREATE INDEX idx_daily_schedule_influencer ON daily_schedule(influencer_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON daily_schedule
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
