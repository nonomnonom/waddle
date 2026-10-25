import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from '../index.js';

/**
 * Test bentuk skema — tanpa needing DB.
 *
 * Lapis 1: objek drizzle (setiap ekspor tabel punya nama fisik).
 * Lapis 2: SQL migrasi yang benar-benar akan dijalankan. Constraint kunci
 * (dedup koleksi, PK agregat harian, FK ke tabel milik better-auth) dikunci di sini
 * karena kalau hilang diam-diam yang rusak adalah data user, bukan kompilasi.
 */
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'drizzle');

const files = () => readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
const sqlText = () => files().map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf-8')).join('\n');

const tables = Object.values(schema)
  .map((value) => {
    try {
      return getTableConfig(value as never).name;
    } catch {
      return null;
    }
  })
  .filter((n): n is string => Boolean(n));

describe('ekspor tabel @waddle/db', () => {
  it('setiap tabel punya nama fisik dan jumlahnya masuk akal', () => {
    expect(tables.length).toBeGreaterThanOrEqual(22);
  });

  it('menyediakan tabel yang dibaca better-auth', () => {
    for (const t of ['user', 'session', 'account', 'verification']) expect(tables).toContain(t);
  });

  it('menyediakan tabel domain inti', () => {
    for (const t of ['contents', 'content_translations', 'content_daily_counts', 'ai_tasks', 'usage_counters', 'settings_releases', 'installations']) {
      expect(tables).toContain(t);
    }
  });
});

describe('SQL migrasi mengunci constraint penting', () => {
  const sql = sqlText();

  it('ada file migrasi dan semua tabel dibuat eksplisit', () => {
    expect(files().length).toBeGreaterThan(0);
    expect((sql.match(/CREATE TABLE "/g) ?? []).length).toBeGreaterThanOrEqual(22);
  });

  it('dedup koleksi ditegakkan oleh unique index partial (bukan oleh kode aplikasi)', () => {
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "contents_user_id_normalized_hash_index" ON "contents" USING btree ("user_id","normalized_hash") WHERE "contents"."status" = \'active\';',
    );
  });

  it('agregat harian punya PK majemuk supaya retry klien idempoten', () => {
    expect(sql).toMatch(
      /CONSTRAINT "content_daily_counts_user_id_day_installation_id_pk" PRIMARY KEY\("user_id","day","installation_id"\)/,
    );
  });

  it('usage counters juga PK majemuk (user, hari, tugas)', () => {
    expect(sql).toMatch(/CONSTRAINT "usage_counters_user_id_day_task_pk" PRIMARY KEY\("user_id","day","task"\)/);
  });

  it('user_id selalu merujuk ke tabel user milik better-auth', () => {
    const refs = (sql.match(/REFERENCES "public"\."user"\("id"\)/g) ?? []).length;
    expect(refs).toBeGreaterThanOrEqual(10);
  });

  it('hash disimpan sebagai hex varchar, bukan bytea', () => {
    expect(sql).not.toContain('bytea');
    expect(sql).toContain('"normalized_hash" varchar(64) NOT NULL');
    expect(sql).toContain('"cache_key" varchar(64)');
  });

  it('bahasa default produk: id (target en)', () => {
    expect(sql).toContain(`"source_lang" varchar(35) DEFAULT 'id' NOT NULL`);
  });

  it('kolom domain memakai snake_case; kolom milik better-auth tetap camelCase sesuai contohnya', () => {
    expect(sql).toContain('"collected_at"');
    expect(sql).toContain('"created_at"');
    // tabel auth: nama kolom harus sama dengan properti yang dibaca adapter better-auth
    const account = sql.match(/CREATE TABLE "account" \(([\s\S]*?)\);/);
    expect(account?.[1]).toContain('"accessTokenExpiresAt"');
    const usr = sql.match(/CREATE TABLE "user" \(([\s\S]*?)\);/);
    expect(usr?.[1]).toContain('"emailVerified" boolean');
  });

  it('registry tugas dan prompt punya unique constraint untuk rollout aman', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX "settings_releases_channel_version_index"');
    expect(sql).toContain('CREATE UNIQUE INDEX "app_releases_target_platform_channel_build_index"');
  });
});
