-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE user_role AS ENUM ('user', 'influencer', 'admin');

CREATE TYPE plan_category AS ENUM (
    'workout', 'diet', 'schedule', 'habit', 'mindset', 'other'
);

CREATE TYPE subscription_status AS ENUM (
    'active', 'trialing', 'past_due', 'canceled', 'unpaid'
);

CREATE TYPE chunk_status AS ENUM ('pending', 'indexed', 'failed');

CREATE TYPE video_status AS ENUM ('uploading', 'processing', 'ready', 'failed');

CREATE TYPE meal_type AS ENUM ('breakfast', 'lunch', 'dinner', 'snack');

-- ============================================================
-- ACCOUNTS
-- Both influencers and regular users share this table
-- ============================================================
CREATE TABLE accounts (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email               TEXT UNIQUE NOT NULL,
    password_hash       TEXT NOT NULL,
    role                user_role NOT NULL DEFAULT 'user',
    display_name        TEXT NOT NULL,
    avatar_url          TEXT,
    is_email_verified   BOOLEAN NOT NULL DEFAULT false,
    stripe_customer_id  TEXT UNIQUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_accounts_email ON accounts(email);
CREATE INDEX idx_accounts_stripe_customer ON accounts(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- ============================================================
-- INFLUENCER PROFILES
-- One-to-one extension of accounts where role = 'influencer'
-- ============================================================
CREATE TABLE influencer_profiles (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id          UUID UNIQUE NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    handle              TEXT UNIQUE NOT NULL,
    bio                 TEXT,
    -- System prompt that defines the AI persona for this influencer's chatbot
    persona_prompt      TEXT,
    specialty_tags      TEXT[] NOT NULL DEFAULT '{}',
    follower_count      INTEGER NOT NULL DEFAULT 0,
    is_published        BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_influencer_profiles_handle ON influencer_profiles(handle);
CREATE INDEX idx_influencer_profiles_published ON influencer_profiles(is_published) WHERE is_published = true;

-- ============================================================
-- SUBSCRIPTIONS
-- Tracks Stripe subscription state for both roles
-- influencer_id is set for user->influencer subscriptions
-- ============================================================
CREATE TABLE subscriptions (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id              UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    stripe_subscription_id  TEXT UNIQUE NOT NULL,
    stripe_price_id         TEXT NOT NULL,
    status                  subscription_status NOT NULL,
    current_period_start    TIMESTAMPTZ NOT NULL,
    current_period_end      TIMESTAMPTZ NOT NULL,
    cancel_at_period_end    BOOLEAN NOT NULL DEFAULT false,
    influencer_id           UUID REFERENCES influencer_profiles(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_account ON subscriptions(account_id);
CREATE INDEX idx_subscriptions_influencer ON subscriptions(influencer_id) WHERE influencer_id IS NOT NULL;
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

-- ============================================================
-- PLANS
-- Structured content documents uploaded by influencers
-- content is JSONB with a well-defined shape: {sections: [{id, heading, body}]}
-- ============================================================
CREATE TABLE plans (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    influencer_id       UUID NOT NULL REFERENCES influencer_profiles(id) ON DELETE CASCADE,
    title               TEXT NOT NULL,
    description         TEXT,
    category            plan_category NOT NULL,
    content             JSONB NOT NULL DEFAULT '{"sections": []}',
    cover_image_url     TEXT,
    is_published        BOOLEAN NOT NULL DEFAULT false,
    view_count          INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_plans_influencer ON plans(influencer_id);
CREATE INDEX idx_plans_category ON plans(category);
CREATE INDEX idx_plans_published ON plans(is_published) WHERE is_published = true;

-- ============================================================
-- VIDEOS
-- ============================================================
CREATE TABLE videos (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    influencer_id       UUID NOT NULL REFERENCES influencer_profiles(id) ON DELETE CASCADE,
    title               TEXT NOT NULL,
    description         TEXT,
    s3_key              TEXT NOT NULL,
    cdn_url             TEXT,
    thumbnail_url       TEXT,
    duration_seconds    INTEGER,
    status              video_status NOT NULL DEFAULT 'uploading',
    related_plan_id     UUID REFERENCES plans(id) ON DELETE SET NULL,
    view_count          INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_videos_influencer ON videos(influencer_id);
CREATE INDEX idx_videos_status ON videos(status);

-- ============================================================
-- DOCUMENT CHUNKS (RAG)
-- Each plan section is chunked, embedded, and stored here.
-- HNSW index enables fast approximate nearest neighbour search,
-- filtered per-influencer via the influencer_id column.
-- ============================================================
CREATE TABLE document_chunks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    influencer_id   UUID NOT NULL REFERENCES influencer_profiles(id) ON DELETE CASCADE,
    plan_id         UUID REFERENCES plans(id) ON DELETE CASCADE,
    chunk_index     INTEGER NOT NULL,
    content         TEXT NOT NULL,
    -- 1536 dimensions matches text-embedding-3-small
    embedding       VECTOR(1536),
    metadata        JSONB NOT NULL DEFAULT '{}',
    status          chunk_status NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chunks_influencer ON document_chunks(influencer_id);
CREATE INDEX idx_chunks_plan ON document_chunks(plan_id) WHERE plan_id IS NOT NULL;
-- HNSW index for ANN vector search (built after initial data load)
CREATE INDEX idx_chunks_embedding ON document_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- ============================================================
-- CHAT SESSIONS + MESSAGES
-- ============================================================
CREATE TABLE chat_sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    influencer_id   UUID NOT NULL REFERENCES influencer_profiles(id) ON DELETE CASCADE,
    title           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_sessions_user ON chat_sessions(user_account_id);
CREATE INDEX idx_chat_sessions_influencer ON chat_sessions(influencer_id);

CREATE TABLE chat_messages (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id          UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role                TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content             TEXT NOT NULL,
    retrieved_chunk_ids UUID[],
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_messages_session ON chat_messages(session_id);

-- ============================================================
-- WORKOUT TRACKING
-- ============================================================
CREATE TABLE workout_logs (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    logged_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    notes       TEXT,
    plan_id     UUID REFERENCES plans(id) ON DELETE SET NULL
);

CREATE INDEX idx_workout_logs_account ON workout_logs(account_id);
CREATE INDEX idx_workout_logs_date ON workout_logs(account_id, logged_at);

CREATE TABLE workout_exercises (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    log_id          UUID NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
    exercise_name   TEXT NOT NULL,
    sets            INTEGER,
    reps            INTEGER,
    weight_kg       NUMERIC(6,2),
    duration_secs   INTEGER,
    notes           TEXT
);

CREATE INDEX idx_workout_exercises_log ON workout_exercises(log_id);

-- ============================================================
-- MEAL TRACKING
-- ============================================================
CREATE TABLE meal_logs (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    logged_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    meal_type   meal_type,
    notes       TEXT
);

CREATE INDEX idx_meal_logs_account ON meal_logs(account_id);
CREATE INDEX idx_meal_logs_date ON meal_logs(account_id, logged_at);

CREATE TABLE meal_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meal_log_id     UUID NOT NULL REFERENCES meal_logs(id) ON DELETE CASCADE,
    food_name       TEXT NOT NULL,
    quantity_grams  NUMERIC(8,2),
    calories        INTEGER,
    protein_g       NUMERIC(6,2),
    carbs_g         NUMERIC(6,2),
    fat_g           NUMERIC(6,2)
);

CREATE INDEX idx_meal_items_log ON meal_items(meal_log_id);

-- ============================================================
-- FOLLOWS
-- Free following (pre-subscription discovery)
-- ============================================================
CREATE TABLE follows (
    follower_id     UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    influencer_id   UUID NOT NULL REFERENCES influencer_profiles(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (follower_id, influencer_id)
);

CREATE INDEX idx_follows_influencer ON follows(influencer_id);

-- ============================================================
-- SAVED PLANS
-- ============================================================
CREATE TABLE saved_plans (
    account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    plan_id     UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    saved_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (account_id, plan_id)
);

-- ============================================================
-- UPDATED_AT TRIGGER HELPER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON influencer_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON videos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
