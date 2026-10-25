-- Blueprint schema for a bilingual-input-method + typing-AI product.
-- Derived from observed client type names in Keysake.dmg (see .rea/reports/evidence/) and
-- chosen deliberately where the artifact cannot prove server internals.
-- Postgres 16+. Idempotent: safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------- helpers
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION uuid_v7() RETURNS uuid AS $$
  -- time-ordered uuid (best effort; replace with app-side UUIDv7 if you prefer)
  SELECT encode(
    set_byte(set_byte(set_byte(
      set_byte(gen_random_bytes(16), 0, (extract(epoch from now())*1000)::bigint >> 40 & 255),
      1, (extract(epoch from now())*1000)::bigint >> 32 & 255),
      2, (extract(epoch from now())*1000)::bigint >> 24 & 255),
      3, ((extract(epoch from now())*1000)::bigint >> 16 & 255) & 15 | 16),
    'hex')::uuid
$$ LANGUAGE sql;

-- ---------------------------------------------------------------- users
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT uuid_v7(),
  display_name  text,
  locale        text NOT NULL DEFAULT 'zh-Hans',   -- app UI locale (Keysake ships en/zh-Hans/zh-Hant)
  region        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz                      -- account deletion is a process, not a transaction
);
CREATE INDEX IF NOT EXISTS users_deleted_at ON users (deleted_at) WHERE deleted_at IS NOT NULL;

-- apple identity (one row per `sub`)
CREATE TABLE IF NOT EXISTS identities (
  id              uuid PRIMARY KEY DEFAULT uuid_v7(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        text NOT NULL DEFAULT 'apple',
  provider_sub    text NOT NULL,
  email           citext,
  email_is_private_relay boolean NOT NULL DEFAULT false,
  last_verified_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_sub)
);

-- sessions: store hash only. kind = desktop | web_exchange
CREATE TABLE IF NOT EXISTS sessions (
  id              uuid PRIMARY KEY DEFAULT uuid_v7(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  installation_id uuid,                          -- filled once device registers; enables token binding
  kind            text NOT NULL CHECK (kind IN ('desktop','web_exchange')),
  token_hash      bytea NOT NULL,                -- sha256 of opaque token
  family_id       uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_used_at    timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  revoked_at      timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash ON sessions (token_hash);
CREATE INDEX IF NOT EXISTS sessions_user_active ON sessions (user_id, expires_at) WHERE revoked_at IS NULL;

-- one-shot nonce for Sign in with Apple (client: v1/auth/apple/challenge)
CREATE TABLE IF NOT EXISTS login_challenges (
  id           uuid PRIMARY KEY DEFAULT uuid_v7(),
  nonce_hash   bytea NOT NULL UNIQUE,            -- sha256(nonce)
  client_ip    inet,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL DEFAULT now() + interval '120 seconds',
  consumed_at  timestamptz
);

-- browser login ticket with PKCE + origin allowlist
CREATE TABLE IF NOT EXISTS web_login_tickets (
  id              uuid PRIMARY KEY DEFAULT uuid_v7(),
  state_hash      bytea NOT NULL UNIQUE,
  code_challenge  text,                          -- S256
  redirect_origin text NOT NULL,                -- must match allowlist at exchange time
  user_id         uuid REFERENCES users(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  exchanged_at    timestamptz
);

-- one row per installed device+app+ime tuple (drives rollout & diagnostics)
CREATE TABLE IF NOT EXISTS installations (
  id                      uuid PRIMARY KEY DEFAULT uuid_v7(),
  user_id                 uuid REFERENCES users(id) ON DELETE SET NULL,
  device_digest           text NOT NULL,          -- client-generated UUID kept in keychain
  platform                text NOT NULL DEFAULT 'macos',
  app_version             text NOT NULL,
  app_build               text NOT NULL,
  ime_version             text,
  ime_build               text,
  engine_resource_version text,                   -- rime prebuilt manifest version
  os_version              text,
  hardware_model          text,
  region                  text,
  tz_offset_minutes       int,
  first_seen_at           timestamptz NOT NULL DEFAULT now(),
  last_seen_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_digest, platform)
);

-- ---------------------------------------------------------------- collected fragments
-- Keysake state machine evidence: "收藏这段内容" -> local store -> "收藏正在同步" -> server.
CREATE TABLE IF NOT EXISTS contents (
  id               uuid PRIMARY KEY DEFAULT uuid_v7(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  installation_id  uuid REFERENCES installations(id) ON DELETE SET NULL,
  kind             text NOT NULL DEFAULT 'fragment' CHECK (kind IN ('fragment','note','clip')),
  source_text      text NOT NULL,
  source_lang      text NOT NULL DEFAULT 'zh-Hans',
  char_count       int  NOT NULL,
  byte_count       int  NOT NULL,
  normalized_hash  bytea NOT NULL,               -- sha256 of NFKC+lower+collapse-ws
  revision         int  NOT NULL DEFAULT 1,
  origin_app_bundle text,                        -- which host app the text came from
  tz_offset_minutes int,
  collected_at     timestamptz NOT NULL,          -- client clock, for "按日期展示"
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','deleted')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  purge_after      timestamptz                    -- set when deletion requested
);
CREATE UNIQUE INDEX IF NOT EXISTS contents_dedup ON contents (user_id, normalized_hash) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS contents_user_day ON contents (user_id, collected_at DESC);
CREATE INDEX IF NOT EXISTS contents_purge ON contents (purge_after) WHERE purge_after IS NOT NULL;

-- translation is a separate entity, not a column:
-- Keysake UI has "中文已收藏，译文待补充" (saved zh, translation pending)
CREATE TABLE IF NOT EXISTS content_translations (
  id           uuid PRIMARY KEY DEFAULT uuid_v7(),
  content_id   uuid NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  provider     text NOT NULL CHECK (provider IN ('apple-on-device','llm','none')),
  target_lang  text NOT NULL,
  model        text,                              -- NULL for on-device
  text         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_id, provider, target_lang)
);

-- daily aggregates (client: v1/contents/statistics, BatchRequest/ContentDailyCount)
CREATE TABLE IF NOT EXISTS content_daily_counts (
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day              date NOT NULL,
  installation_id  uuid NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  keystrokes       bigint NOT NULL DEFAULT 0,
  committed_count  bigint NOT NULL DEFAULT 0,
  collected_count  bigint NOT NULL DEFAULT 0,
  chars_committed  bigint NOT NULL DEFAULT 0,
  ai_requests      bigint NOT NULL DEFAULT 0,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day, installation_id)
);

-- ---------------------------------------------------------------- grammar / analysis
CREATE TABLE IF NOT EXISTS grammar_analyses (
  id            uuid PRIMARY KEY DEFAULT uuid_v7(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_id    uuid REFERENCES contents(id) ON DELETE SET NULL,
  installation_id uuid REFERENCES installations(id) ON DELETE SET NULL,
  input_text    text,                            -- NULL after TTL purge
  input_lang    text NOT NULL DEFAULT 'zh-Hans',
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ok','error')),
  provider      text,
  model         text,
  prompt_version text,
  result        jsonb,
  error_code    text,
  usage_in      int,
  usage_out     int,
  cost_micros   bigint NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  expires_at    timestamptz NOT NULL DEFAULT now() + interval '30 days'
);
CREATE INDEX IF NOT EXISTS ga_user_created ON grammar_analyses (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ga_expires ON grammar_analyses (expires_at) WHERE input_text IS NOT NULL;

-- ---------------------------------------------------------------- AI gateway accounting
CREATE TABLE IF NOT EXISTS ai_tasks (
  code          text PRIMARY KEY,                -- translate_to_english | translate_to_chinese | paraphrase | find_supporting_references | ...
  display_zh    text,
  display_en    text,
  lane          text NOT NULL CHECK (lane IN ('local','remote')),
  model_hint    text,
  max_input_chars int NOT NULL DEFAULT 4000,
  timeout_ms    int NOT NULL DEFAULT 3000,
  enabled       boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS usage_counters (
  user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day      date NOT NULL,
  task     text NOT NULL REFERENCES ai_tasks(code),
  requests bigint NOT NULL DEFAULT 0,
  tokens_in  bigint NOT NULL DEFAULT 0,
  tokens_out bigint NOT NULL DEFAULT 0,
  cost_micros bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day, task)
);

-- citations must come from a real bibliographic source, never model memory
CREATE TABLE IF NOT EXISTS reference_cache (
  query_hash  bytea PRIMARY KEY,                 -- sha256 of normalized query
  provider    text NOT NULL,                     -- crossref | semantic-scholar | arxiv
  payload     jsonb NOT NULL,
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '7 days'
);

CREATE TABLE IF NOT EXISTS ai_result_cache (
  cache_key   bytea PRIMARY KEY,                 -- sha256(task|model|prompt_version|normalized_input|target_lang)
  task        text NOT NULL,
  output      text NOT NULL,
  usage_in    int,
  usage_out   int,
  cost_micros bigint NOT NULL DEFAULT 0,
  hits        bigint NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_cache_expiry ON ai_result_cache (expires_at);

-- ---------------------------------------------------------------- feedback
CREATE TABLE IF NOT EXISTS feedback_messages (
  id          uuid PRIMARY KEY DEFAULT uuid_v7(),
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,   -- login required for submit, but keep nullable for support intake
  email       varchar(320),                     -- Keysake validates email + enforces 320 bytes
  body        text NOT NULL,
  app_version text,
  ime_version text,
  os_version  text,
  status      text NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','answered','closed')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz
);
CREATE INDEX IF NOT EXISTS feedback_status ON feedback_messages (status, created_at);

CREATE TABLE IF NOT EXISTS feedback_attachments (
  id           uuid PRIMARY KEY DEFAULT uuid_v7(),
  message_id   uuid NOT NULL REFERENCES feedback_messages(id) ON DELETE CASCADE,
  storage_key  text NOT NULL,
  mime         text NOT NULL,
  byte_count   int NOT NULL,
  sha256       bytea NOT NULL,
  scan_state   text NOT NULL DEFAULT 'pending' CHECK (scan_state IN ('pending','clean','rejected')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- releases & settings
CREATE TABLE IF NOT EXISTS settings_releases (
  id             uuid PRIMARY KEY DEFAULT uuid_v7(),
  channel        text NOT NULL DEFAULT 'prod' CHECK (channel IN ('prod','staging','beta')),
  version        int  NOT NULL,
  schema_version int  NOT NULL DEFAULT 1,
  min_app_version text,
  payload        jsonb NOT NULL,
  rollout_pct    int  NOT NULL DEFAULT 100 CHECK (rollout_pct BETWEEN 0 AND 100),
  published_at   timestamptz,
  revoked_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, version)
);

-- app updates (Sparkle) AND input-method updates are separate streams
CREATE TABLE IF NOT EXISTS app_releases (
  id               uuid PRIMARY KEY DEFAULT uuid_v7(),
  target           text NOT NULL CHECK (target IN ('app','ime')),
  channel          text NOT NULL DEFAULT 'prod',
  version          text NOT NULL,
  build            text NOT NULL,
  url              text NOT NULL,
  byte_size        bigint NOT NULL,
  sha512_base64    text NOT NULL,
  ed25519_signature text NOT NULL,               -- Sparkle SUPublicEDKey compatible
  min_os_version   text,
  min_app_version  text,                          -- ime release may require app >= X
  mandatory        boolean NOT NULL DEFAULT false,
  notes_url        text,
  released_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target, channel, build)
);

-- ---------------------------------------------------------------- billing / entitlements
CREATE TABLE IF NOT EXISTS subscriptions (
  id            uuid PRIMARY KEY DEFAULT uuid_v7(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan          text NOT NULL,                   -- free | plus | pro
  source        text NOT NULL CHECK (source IN ('apple','stripe','partner','internal')),
  provider_ref  text,                            -- original transaction / external account id
  status        text NOT NULL CHECK (status IN ('active','grace','expired','cancelled','refund')),
  period_start  timestamptz NOT NULL,
  period_end    timestamptz NOT NULL,
  cancel_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subs_user ON subscriptions (user_id, period_end DESC);

CREATE TABLE IF NOT EXISTS user_consents (
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('analytics','crashlytics','ai_training','references_fetch')),
  granted        boolean NOT NULL,
  policy_version text NOT NULL,
  source         text,                           -- 'ios-tracking-usage-description' | 'settings-toggle' | ...
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind)
);

-- ---------------------------------------------------------------- ops log (MVP; move to ClickHouse at scale)
CREATE TABLE IF NOT EXISTS api_request_log (
  id             bigserial PRIMARY KEY,
  ts             timestamptz NOT NULL DEFAULT now(),
  request_id     uuid NOT NULL,
  user_id        uuid,
  installation_id uuid,
  route          text NOT NULL,
  method         text NOT NULL,
  status         int  NOT NULL,
  business_code  text,
  latency_ms     int,
  byte_in        int,
  byte_out       int,
  task           text,
  cost_micros    bigint
);
CREATE INDEX IF NOT EXISTS api_log_ts ON api_request_log (ts);

-- ---------------------------------------------------------------- prompt registry (versioned, auditable)
CREATE TABLE IF NOT EXISTS task_prompt_versions (
  task           text NOT NULL REFERENCES ai_tasks(code),
  prompt_version text NOT NULL,
  system_prompt  text NOT NULL,
  user_template  text NOT NULL,
  model_hint     text,
  max_tokens     int NOT NULL DEFAULT 512,
  temperature    numeric(3,2) NOT NULL DEFAULT 0.2,
  created_at     timestamptz NOT NULL DEFAULT now(),
  is_active      boolean NOT NULL DEFAULT false,
  PRIMARY KEY (task, prompt_version)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_prompt_per_task
  ON task_prompt_versions (task) WHERE is_active;

-- triggers
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','identities','contents','grammar_analyses','feedback_messages',
                           'subscriptions','usage_counters','content_daily_counts']
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated ON %I; CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t, t, t);
  END LOOP;
END $$;

-- seed the four AI tasks observed in Keysake's rime lua (ai_box_actions.lua)
INSERT INTO ai_tasks (code, display_zh, display_en, lane, timeout_ms) VALUES
  ('translate_to_english',        '译英', 'Translate to English', 'remote', 3000),
  ('translate_to_chinese',        '译中', 'Translate to Chinese', 'remote', 3000),
  ('paraphrase',                  '改写', 'Paraphrase',           'remote', 4000),
  ('find_supporting_references',  '文献', 'Find references',      'remote', 8000)
ON CONFLICT (code) DO NOTHING;

-- RLS is optional if your API layer always scopes by user_id; enable when you expose DB to other services.
-- ALTER TABLE contents ENABLE ROW LEVEL SECURITY;
