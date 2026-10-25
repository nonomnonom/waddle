import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export interface DbOptions {
  /** koneksi per proses; untuk desktop/mobile pakai angka kecil, jangan 50 */
  max?: number;
  idleTimeoutSeconds?: number;
  connectTimeoutSeconds?: number;
  ssl?: boolean | 'no-verify';
}

/**
 * Satu instance postgres-js per proses, dibungkus drizzle.
 * Pooling tambahan (PgBouncer) ditaruh di depan server, bukan di sini.
 */
function buildClient(databaseUrl: string, options: DbOptions = {}) {
  const ssl =
    options.ssl === 'no-verify' ? { rejectUnauthorized: false } : options.ssl === true ? {} : undefined;
  const client = postgres(databaseUrl, {
    max: options.max ?? 10,
    idle_timeout: options.idleTimeoutSeconds ?? 30,
    connect_timeout: options.connectTimeoutSeconds ?? 10,
    ssl,
    // penting: PgBouncer mode transaction tidak suka prepared statement
    prepare: false,
  });
  return client;
}

export function createDb(databaseUrl: string, options: DbOptions = {}) {
  return drizzle(buildClient(databaseUrl, options), { schema, logger: process.env.DB_LOG === '1' });
}

/** Varian yang juga mengembalikan client mentah, untuk shutdown eksplisit. */
export function createDbWithClient(databaseUrl: string, options: DbOptions = {}) {
  const client = buildClient(databaseUrl, options);
  return { db: drizzle(client, { schema, logger: process.env.DB_LOG === '1' }), client };
}

export type Db = ReturnType<typeof createDb>;
export type DbClient = ReturnType<typeof buildClient>;

export async function pingDb(db: Db): Promise<boolean> {
  const rows = (await db.execute(sql`select 1 as ok`)) as unknown as { ok: number }[];
  return rows[0]?.ok === 1;
}
