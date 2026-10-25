import { Inject, Injectable } from '@nestjs/common';
import type { Db } from '@waddle/db';
import { createAuth, toAuthHandler, type Auth } from '@waddle/db/auth';
import { DB } from '../db/database.module.js';
import { ENV } from '../config/env.module.js';
import { originList } from '../config/env.js';
import type { Env } from '../config/env.js';

export interface AuthSession {
  user: { id: string; name: string | null; email: string | null; emailVerified: boolean; locale?: string };
  session: { id: string; expiresAt: Date | string; token: string };
}

/**
 * Pembungkus instance better-auth. Instance-nya dibuat di @waddle/db
 * (packages/db/src/lib/auth.ts) supaya `better-auth` dan `drizzle-orm` cuma punya
 * satu salinan modul - kalau tidak, tipe Auth di api dan di adapter tidak identik
 * dan kompilasi gagal dengan error yang tampak acak.
 *
 * Klien mengirim `Authorization: Bearer <session token>` (plugin bearer) sehingga
 * web dan API boleh beda domain; kuki tetap ikut untuk setup satu-origin.
 */
@Injectable()
export class AuthService {
  readonly auth: Auth;
  readonly nodeHandler: ReturnType<typeof toAuthHandler>;

  constructor(@Inject(DB) db: Db, @Inject(ENV) env: Env) {
    this.auth = createAuth(db, {
      baseURL: env.BETTER_AUTH_URL,
      secret: env.BETTER_AUTH_SECRET,
      trustedOrigins: originList(env),
      production: env.NODE_ENV === 'production',
    });
    this.nodeHandler = toAuthHandler(this.auth);
  }

  async getSession(headers: Headers): Promise<AuthSession | null> {
    try {
      const session = await this.auth.api.getSession({ headers });
      return (session ?? null) as unknown as AuthSession | null;
    } catch {
      return null;
    }
  }
}
