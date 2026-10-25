export * from './lib/schema.js';
export * from './lib/client.js';
export * from './lib/seed.js';

/**
 * Re-export operator drizzle dari paket ini.
 * Alasannya praktis: kalau api dan db punya salinan `drizzle-orm` sendiri,
 * tipe `SQL<...>` tidak lagi identik dan `and(eq(...), ...)` gagal kompilasi.
 * Semua kode di luar paket ini mengimpor operator dari @waddle/db.
 */
export { and, or, not, eq, ne, gt, gte, lt, lte, inArray, isNull, isNotNull, like, ilike, between, desc, asc, count, sql } from 'drizzle-orm';
