import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './auth-schema.js';

/**
 * Skema domain. Sumber keputusan desain: docs/keysake-research/blueprint/02.
 * Tabel `user`/`session`/`account`/`verification` dimiliki better-auth (auth-schema.ts),
 * jadi identitas root adalah user.id dari better-auth, bukan tabel buatan sendiri.
 */

const DATE_CFG = { withTimezone: true, mode: 'date' } as const;
const ts = (name?: string) =>
  (name ? timestamp(name, DATE_CFG) : timestamp(DATE_CFG)).notNull().defaultNow();
const tsNull = (name?: string) => (name ? timestamp(name, DATE_CFG) : timestamp(DATE_CFG));

/** Satu baris per perangkat yang pernah login/memakai engine. */
export const installations = pgTable(
  'installations',
  {
    id: uuid().primaryKey().defaultRandom(),
        userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
        deviceDigest: text('device_digest').notNull(),
    platform: varchar({ length: 20 }).notNull().default('macos'),
        appVersion: varchar('app_version', { length: 40 }).notNull(),
        appBuild: varchar('app_build', { length: 40 }).notNull(),
        engineVersion: varchar('engine_version', { length: 40 }),
        assetVersion: varchar('asset_version', { length: 40 }),
        osVersion: varchar('os_version', { length: 60 }),
        hardwareModel: varchar('hardware_model', { length: 60 }),
    region: varchar({ length: 10 }),
        tzOffsetMinutes: smallint('tz_offset_minutes'),
        firstSeenAt: ts("first_seen_at"),
        lastSeenAt: ts("last_seen_at"),
  },
  (t) => [uniqueIndex().on(t.deviceDigest, t.platform)],
);

/** Fragmen yang dikumpulkan user (收录). */
export const contents = pgTable(
  'contents',
  {
    id: uuid().primaryKey().defaultRandom(),
        userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
        installationId: uuid('installation_id').references(() => installations.id, { onDelete: 'set null' }),
    kind: varchar({ length: 20 }).notNull().default('fragment'),
        sourceText: text('source_text').notNull(),
        sourceLang: varchar('source_lang', { length: 35 }).notNull().default('id'),
        charCount: integer('char_count').notNull(),
        byteCount: integer('byte_count').notNull(),
    /** hex sha256(NFKC + lower + collapse ws) — kunci dedup per user */
        normalizedHash: varchar('normalized_hash', { length: 64 }).notNull(),
    revision: integer().notNull().default(1),
        originAppBundle: varchar('origin_app_bundle', { length: 200 }),
        tzOffsetMinutes: smallint('tz_offset_minutes'),
        collectedAt: timestamp('collected_at', { withTimezone: true, mode: 'date' }).notNull(),
    status: varchar({ length: 16 }).notNull().default('active'),
        createdAt: ts("created_at"),
        updatedAt: ts("updated_at"),
        purgeAfter: tsNull('purge_after'),
  },
  (t) => [
    uniqueIndex().on(t.userId, t.normalizedHash).where(sql`${t.status} = 'active'`),
    index().on(t.userId, t.collectedAt),
    index().on(t.purgeAfter).where(sql`${t.purgeAfter} IS NOT NULL`),
  ],
);

/**
 * Terjemahan adalah entitas terpisah (bukan kolom) — negara bagian UI
 * "中文已收藏，译文待补充" hanya bisa muncul kalau provider/teks boleh kosong dulu.
 */
export const contentTranslations = pgTable(
  'content_translations',
  {
    id: uuid().primaryKey().defaultRandom(),
        contentId: uuid('content_id')
      .notNull()
      .references(() => contents.id, { onDelete: 'cascade' }),
    provider: varchar({ length: 32 }).notNull(),
        targetLang: varchar('target_lang', { length: 35 }).notNull(),
    model: varchar({ length: 120 }),
    text: text().notNull(),
        createdAt: ts("created_at"),
  },
  (t) => [uniqueIndex().on(t.contentId, t.provider, t.targetLang)],
);

/** Agregat harian. Bukan per keystroke: privacy + payload kecil. */
export const contentDailyCounts = pgTable(
  'content_daily_counts',
  {
        userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: date().notNull(),
        installationId: uuid('installation_id')
      .notNull()
      .references(() => installations.id, { onDelete: 'cascade' }),
    keystrokes: bigint({ mode: 'number' }).notNull().default(0),
        committedCount: bigint('committed_count', { mode: 'number' }).notNull().default(0),
        collectedCount: bigint('collected_count', { mode: 'number' }).notNull().default(0),
        charsCommitted: bigint('chars_committed', { mode: 'number' }).notNull().default(0),
        aiRequests: bigint('ai_requests', { mode: 'number' }).notNull().default(0),
        updatedAt: ts("updated_at"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day, t.installationId] }), index().on(t.userId, t.day)],
);

/** Registry tugas AI: menambah tugas = insert baris, bukan rilis klien. */
export const aiTasks = pgTable('ai_tasks', {
  code: varchar({ length: 60 }).primaryKey(),
    displayLabel: jsonb('display_label').$type<Record<string, string>>().notNull().default({}),
  lane: varchar({ length: 12 }).notNull().default('remote'),
    modelHint: varchar('model_hint', { length: 120 }),
    maxInputChars: integer('max_input_chars').notNull().default(4000),
    timeoutMs: integer('timeout_ms').notNull().default(3000),
    cacheTtlSeconds: integer('cache_ttl_seconds').notNull().default(604800),
  enabled: boolean().notNull().default(true),
    requiresPlan: varchar('requires_plan', { length: 12 }),
});

export const taskPromptVersions = pgTable(
  'task_prompt_versions',
  {
    id: uuid().primaryKey().defaultRandom(),
    task: varchar({ length: 60 })
      .notNull()
      .references(() => aiTasks.code),
        promptVersion: varchar('prompt_version', { length: 40 }).notNull(),
        systemPrompt: text('system_prompt').notNull(),
        userTemplate: text('user_template').notNull(),
        maxTokens: integer('max_tokens').notNull().default(512),
    temperature: numeric({ precision: 3, scale: 2 }).notNull().default('0.20'),
        isActive: boolean('is_active').notNull().default(false),
        createdAt: ts("created_at"),
  },
  (t) => [
    uniqueIndex().on(t.task, t.promptVersion),
    // hanya satu prompt aktif per tugas
    uniqueIndex().on(t.task).where(sql`${t.isActive} = true`),
  ],
);

/** Cache hasil generatif; key = sha256(task|model|promptVersion|targetLang|normalizedInput|contextMode) */
export const aiResultCache = pgTable(
  'ai_result_cache',
  {
        cacheKey: varchar('cache_key', { length: 64 }).primaryKey(),
    task: varchar({ length: 60 }).notNull(),
    output: text().notNull(),
        usageIn: integer('usage_in'),
        usageOut: integer('usage_out'),
        costMicros: bigint('cost_micros', { mode: 'number' }).notNull().default(0),
    hits: bigint({ mode: 'number' }).notNull().default(0),
        createdAt: ts("created_at"),
        expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (t) => [index().on(t.expiresAt)],
);

/** Sitasi harus berasal dari API bibliografi nyata, bukan memori model. */
export const referenceCache = pgTable('reference_cache', {
    queryHash: varchar('query_hash', { length: 64 }).primaryKey(),
  provider: varchar({ length: 32 }).notNull(),
  payload: jsonb().notNull(),
    fetchedAt: ts("fetched_at"),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
});

export const usageCounters = pgTable(
  'usage_counters',
  {
        userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: date().notNull(),
    task: varchar({ length: 60 })
      .notNull()
      .references(() => aiTasks.code),
    requests: bigint({ mode: 'number' }).notNull().default(0),
        tokensIn: bigint('tokens_in', { mode: 'number' }).notNull().default(0),
        tokensOut: bigint('tokens_out', { mode: 'number' }).notNull().default(0),
        costMicros: bigint('cost_micros', { mode: 'number' }).notNull().default(0),
        updatedAt: ts("updated_at"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day, t.task] })],
);

/** Endpoint Keysake: v1/contents/grammar-analysis + v1/grammar-analyses. */
export const grammarAnalyses = pgTable(
  'grammar_analyses',
  {
    id: uuid().primaryKey().defaultRandom(),
        userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
        contentId: uuid('content_id').references(() => contents.id, { onDelete: 'set null' }),
        installationId: uuid('installation_id').references(() => installations.id, { onDelete: 'set null' }),
    /** di-null-kan worker saat TTL lewat; hasil boleh tetap */
        inputText: text('input_text'),
        inputLang: varchar('input_lang', { length: 35 }).notNull().default('id'),
    status: varchar({ length: 12 }).notNull().default('pending'),
    provider: varchar({ length: 60 }),
    model: varchar({ length: 120 }),
        promptVersion: varchar('prompt_version', { length: 40 }),
    result: jsonb(),
        errorCode: varchar('error_code', { length: 40 }),
        usageIn: integer('usage_in'),
        usageOut: integer('usage_out'),
        costMicros: bigint('cost_micros', { mode: 'number' }).notNull().default(0),
        createdAt: ts("created_at"),
        updatedAt: ts("updated_at"),
        completedAt: tsNull('completed_at'),
        expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now() + interval '30 days'`),
  },
  (t) => [index().on(t.userId, t.createdAt), index().on(t.expiresAt).where(sql`${t.inputText} IS NOT NULL`)],
);

export const feedbackMessages = pgTable(
  'feedback_messages',
  {
    id: uuid().primaryKey().defaultRandom(),
        userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Keysake membatasi email 320 byte; kita kunci di DB agar konsisten lintas klien */
    email: varchar({ length: 320 }),
    body: text().notNull(),
        appVersion: varchar('app_version', { length: 40 }),
        engineVersion: varchar('engine_version', { length: 40 }),
        osVersion: varchar('os_version', { length: 60 }),
    status: varchar({ length: 16 }).notNull().default('new'),
        createdAt: ts("created_at"),
        updatedAt: ts("updated_at"),
        answeredAt: tsNull('answered_at'),
  },
  (t) => [index().on(t.status, t.createdAt)],
);

export const feedbackAttachments = pgTable('feedback_attachments', {
  id: uuid().primaryKey().defaultRandom(),
    messageId: uuid('message_id')
    .notNull()
    .references(() => feedbackMessages.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull(),
  mime: varchar({ length: 80 }).notNull(),
    byteCount: integer('byte_count').notNull(),
  sha256: varchar({ length: 64 }).notNull(),
    scanState: varchar('scan_state', { length: 16 }).notNull().default('pending'),
    createdAt: ts("created_at"),
});

/** Pengaturan berversi yang di-serve dengan ETag (Keysake: SettingsDownloader + /settings). */
export const settingsReleases = pgTable(
  'settings_releases',
  {
    id: uuid().primaryKey().defaultRandom(),
    channel: varchar({ length: 16 }).notNull().default('prod'),
    version: integer().notNull(),
        schemaVersion: integer('schema_version').notNull().default(1),
        minAppVersion: jsonb('min_app_version').$type<Record<string, string>>().default({}),
    payload: jsonb().notNull(),
        rolloutPct: integer('rollout_pct').notNull().default(100),
        publishedAt: tsNull('published_at'),
        revokedAt: tsNull('revoked_at'),
        createdAt: ts("created_at"),
  },
  (t) => [uniqueIndex().on(t.channel, t.version)],
);

/** Update app dan update helper/engine terpisah (Keysake: "有新版本输入法"). */
export const appReleases = pgTable(
  'app_releases',
  {
    id: uuid().primaryKey().defaultRandom(),
    target: varchar({ length: 20 }).notNull(),
    platform: varchar({ length: 20 }).notNull(),
    channel: varchar({ length: 16 }).notNull().default('prod'),
    version: varchar({ length: 40 }).notNull(),
    build: varchar({ length: 40 }).notNull(),
    url: text().notNull(),
        byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    sha256: varchar('sha256', { length: 64 }).notNull(),
    signature: text().notNull(),
        minAppVersion: varchar('min_app_version', { length: 40 }),
        minOsVersion: varchar('min_os_version', { length: 40 }),
    mandatory: boolean().notNull().default(false),
        notesUrl: text('notes_url'),
        releasedAt: ts("released_at"),
  },
  (t) => [uniqueIndex().on(t.target, t.platform, t.channel, t.build)],
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid().primaryKey().defaultRandom(),
        userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    plan: varchar({ length: 20 }).notNull(),
    source: varchar({ length: 20 }).notNull(),
        providerRef: text('provider_ref'),
    status: varchar({ length: 16 }).notNull(),
        periodStart: timestamp('period_start', { withTimezone: true, mode: 'date' }).notNull(),
        periodEnd: timestamp('period_end', { withTimezone: true, mode: 'date' }).notNull(),
        cancelAt: tsNull('cancel_at'),
        createdAt: ts("created_at"),
        updatedAt: ts("updated_at"),
  },
  (t) => [index().on(t.userId, t.periodEnd)],
);

/** Satu sumber kebenaran untuk consent; jangan warisi konflik plist Keysake. */
export const userConsents = pgTable(
  'user_consents',
  {
        userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: varchar({ length: 32 }).notNull(),
    granted: boolean().notNull(),
        policyVersion: varchar('policy_version', { length: 40 }).notNull(),
    source: varchar({ length: 40 }),
        updatedAt: ts("updated_at"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kind] })],
);

/** Nonce sekali pakai untuk Sign in with Apple jalur native (v1/auth/apple/challenge). */
export const loginChallenges = pgTable(
  'login_challenges',
  {
    id: uuid().primaryKey().defaultRandom(),
        nonceHash: varchar('nonce_hash', { length: 64 }).notNull(),
        clientIp: varchar('client_ip', { length: 64 }),
        createdAt: ts("created_at"),
        expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now() + interval '120 seconds'`),
        consumedAt: tsNull('consumed_at'),
  },
  (t) => [uniqueIndex().on(t.nonceHash), index().on(t.expiresAt)],
);

/** Log API (pindah ke ClickHouse saat volume naik). */
export const apiRequestLog = pgTable(
  'api_request_log',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    ts: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
        requestId: uuid('request_id').notNull(),
        userId: text('user_id'),
        installationId: uuid('installation_id'),
    route: text().notNull(),
    method: varchar({ length: 10 }).notNull(),
    status: integer().notNull(),
        businessCode: varchar('business_code', { length: 40 }),
        latencyMs: integer('latency_ms'),
        byteIn: integer('byte_in'),
        byteOut: integer('byte_out'),
    task: varchar({ length: 60 }),
        costMicros: bigint('cost_micros', { mode: 'number' }),
  },
  (t) => [index().on(t.ts), index().on(t.userId, t.ts)],
);

export * from './auth-schema.js';
