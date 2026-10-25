import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins';
import { toNodeHandler } from 'better-auth/node';
import { authSchema } from './schema.js';
import type { Db } from './client.js';

export interface AuthConfig {
  baseURL: string;
  secret: string;
  /** produksi: log lebih senyap */
  production?: boolean;
  /** jam; default 30 hari */
  sessionExpiresIn?: number;
  appName?: string;
}

/**
 * Pabrik instance better-auth.
 *
 * Sengaja hidup di paket db (bukan di api): `better-auth` dan `drizzle-orm` harus
 * berasal dari satu salinan modul, kalau tidak tipe `Auth<...>` dari api dan dari
 * adapter tidak lagi identik dan kompilasi gagal dengan error yang tampak acak.
 * Aplikasi hanya memanggil `createAuth()` + `toAuthHandler()`.
 */
export function createAuth(db: Db, config: AuthConfig) {
  return betterAuth({
    appName: config.appName ?? 'waddle',
    baseURL: config.baseURL,
    secret: config.secret,
    database: drizzleAdapter(db, { provider: 'pg', schema: authSchema }),
    emailAndPassword: { enabled: true, minPasswordLength: 10, autoSignIn: true },
    session: {
      expiresIn: config.sessionExpiresIn ?? 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      freshAge: 0,
    },
    account: { accountLinking: { enabled: false } },
    user: {
      additionalFields: {
        locale: { type: 'string', required: false, defaultValue: 'id', input: true },
        region: { type: 'string', required: false, nullable: true, input: true },
        deletedAt: { type: 'date', required: false, nullable: true, input: false },
      },
    },
    // bearer(): token sesi bisa dipakai sebagai `Authorization: Bearer <token>`
    // (web/API boleh beda domain). Opsi satu-satunya adalah requireSignature.
    plugins: [bearer()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

/** Handler express/node untuk seluruh endpoint auth (`/api/auth/*`). */
export function toAuthHandler(auth: Auth) {
  return toNodeHandler(auth);
}
