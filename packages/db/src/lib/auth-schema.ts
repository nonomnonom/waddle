import { boolean, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * Tabel milik better-auth.
 *
 * Sengaja memakai nama kolom camelCase PERSIS seperti contoh resmi
 * `drizzle-schema-postgres` milik better-auth (emailVerified, accessTokenExpiresAt, …),
 * sementara tabel domain kita snake_case. Alasannya: adapter better-auth memetakan
 * kolom lewat nama properti, dan menyimpang dari contoh resminya menghasilkan error
 * login yang sulit ditebak. Kalau kelak ingin seragam, ubah kolom DAN konfigurasi
 * adapter bersama-sama lalu uji ulang seluruh alur login (sign up, sign in, revoke).
 *
 * Field tambahan (`locale`, `region`, `deletedAt`) juga dideklarasikan di
 * `betterAuth({ user: { additionalFields } })` — apps/api/src/auth/auth.service.ts.
 */
export const users = pgTable('user', {
  id: varchar({ length: 36 }).primaryKey(),
  name: text().notNull(),
  email: text().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  locale: varchar({ length: 35 }).notNull().default('id'),
  region: varchar({ length: 10 }),
  createdAt: timestamp({ mode: 'string' }).notNull(),
  updatedAt: timestamp({ mode: 'string' }).notNull(),
  /** penanda proses penghapusan akun (hard delete dikerjakan worker) */
  deletedAt: timestamp({ mode: 'string' }),
});

export const sessions = pgTable('session', {
  id: varchar({ length: 36 }).primaryKey(),
  expiresAt: timestamp({ mode: 'string' }).notNull(),
  token: varchar({ length: 255 }).notNull().unique(),
  createdAt: timestamp({ mode: 'string' }).notNull(),
  updatedAt: timestamp({ mode: 'string' }).notNull(),
  ipAddress: text(),
  userAgent: text(),
  userId: varchar({ length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
});

export const accounts = pgTable('account', {
  id: varchar({ length: 36 }).primaryKey(),
  accountId: text().notNull(),
  providerId: text().notNull(),
  userId: varchar({ length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text(),
  refreshToken: text(),
  idToken: text(),
  accessTokenExpiresAt: timestamp({ mode: 'string' }),
  refreshTokenExpiresAt: timestamp({ mode: 'string' }),
  scope: text(),
  password: text(),
  createdAt: timestamp({ mode: 'string' }).notNull(),
  updatedAt: timestamp({ mode: 'string' }).notNull(),
});

export const verifications = pgTable('verification', {
  id: varchar({ length: 36 }).primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp({ mode: 'string' }).notNull(),
  createdAt: timestamp({ mode: 'string' }).notNull(),
  updatedAt: timestamp({ mode: 'string' }).notNull(),
});

/** Dikirim apa adanya ke `drizzleAdapter(db, { provider: 'pg', schema: authSchema })`. */
export const authSchema = { user: users, session: sessions, account: accounts, verification: verifications };
