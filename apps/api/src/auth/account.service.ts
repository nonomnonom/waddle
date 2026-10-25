import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, sql } from '@waddle/db';
import { aiTasks, contents, grammarAnalyses, installations, loginChallenges, subscriptions, usageCounters, users, type Db } from '@waddle/db';
import { BusinessError } from '@waddle/protocol';
import { DB } from '../db/database.module.js';

export interface ProfileView {
  userId: string;
  displayName: string | null;
  email: string | null;
  locale: string;
  plan: 'free' | 'plus' | 'pro';
  collected: number;
  aiRequestsToday: number;
  devices: { digest: string; platform: string; appVersion: string; lastSeenAt: number; isCurrent: boolean }[];
}

/**
 * Semua query domain. Sengaja bukan ORM "active record": service ini yang tahu
 * urutan upsert (dedup -> insert -> translation) supaya batch klien bisa partial-success.
 */
@Injectable()
export class AccountService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async profile(userId: string, deviceDigest?: string): Promise<ProfileView> {
    const [row] = await this.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        locale: users.locale,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!row) throw new BusinessError('data_not_found', 'akun tidak ditemukan');

    const [counts] = await this.db
      .select({ collected: sql<number>`count(*)::int` })
      .from(contents)
      .where(and(eq(contents.userId, userId), eq(contents.status, 'active')));

    const today = new Date().toISOString().slice(0, 10);
    const [usage] = await this.db
      .select({ used: sql<number>`coalesce(sum(${usageCounters.requests}), 0)::int` })
      .from(usageCounters)
      .where(and(eq(usageCounters.userId, userId), eq(usageCounters.day, today)));

    const [sub] = await this.db
      .select({ plan: subscriptions.plan })
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, 'active'), gte(subscriptions.periodEnd, new Date())))
      .orderBy(desc(subscriptions.periodEnd))
      .limit(1);

    const deviceRows = await this.db
      .select({
        digest: installations.deviceDigest,
        platform: installations.platform,
        appVersion: installations.appVersion,
        lastSeenAt: installations.lastSeenAt,
      })
      .from(installations)
      .where(eq(installations.userId, userId))
      .orderBy(desc(installations.lastSeenAt))
      .limit(10);

    return {
      userId: row.id,
      displayName: row.name ?? null,
      email: row.email ?? null,
      locale: row.locale,
      plan: (sub?.plan as ProfileView['plan']) ?? 'free',
      collected: counts?.collected ?? 0,
      aiRequestsToday: usage?.used ?? 0,
      devices: deviceRows.map((d) => ({
        digest: d.digest,
        platform: d.platform,
        appVersion: d.appVersion,
        lastSeenAt: d.lastSeenAt.getTime(),
        isCurrent: d.digest === deviceDigest,
      })),
    };
  }

  /** Penghapusan akun = proses, bukan transaksi; hard delete dilakukan worker. */
  async startDeletion(userId: string): Promise<{ status: 'deleting' }> {
    await this.db.update(users).set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(eq(users.id, userId));
    await this.db
      .update(contents)
      .set({ status: 'deleted', purgeAfter: new Date(Date.now() + 30 * 86_400_000), updatedAt: new Date() })
      .where(eq(contents.userId, userId));
    await this.db
      .update(grammarAnalyses)
      .set({ status: 'deleted', expiresAt: new Date(), updatedAt: new Date() })
      .where(eq(grammarAnalyses.userId, userId));
    return { status: 'deleting' };
  }

  /** Nonce sekali pakai untuk jalur native Sign in with Apple (fase 2). */
  async issueLoginChallenge(clientIp?: string): Promise<{ nonce: string; expiresAt: number }> {
    const nonce = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const nonceHash = Buffer.from(await sha256(nonce)).toString('hex');
    const expiresAt = new Date(Date.now() + 120_000);
    await this.db.insert(loginChallenges).values({ nonceHash, clientIp, expiresAt });
    return { nonce, expiresAt: expiresAt.getTime() };
  }

  async consumeLoginChallenge(nonce: string): Promise<boolean> {
    const nonceHash = Buffer.from(await sha256(nonce)).toString('hex');
    const [row] = await this.db
      .select({ id: loginChallenges.id, consumedAt: loginChallenges.consumedAt })
      .from(loginChallenges)
      .where(eq(loginChallenges.nonceHash, nonceHash))
      .limit(1);
    if (!row || row.consumedAt) return false;
    await this.db.update(loginChallenges).set({ consumedAt: new Date() }).where(eq(loginChallenges.id, row.id));
    return true;
  }

  async planFor(userId: string): Promise<'free' | 'plus' | 'pro'> {
    const [sub] = await this.db
      .select({ plan: subscriptions.plan })
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, 'active'), gte(subscriptions.periodEnd, new Date())))
      .limit(1);
    return (sub?.plan as 'free' | 'plus' | 'pro') ?? 'free';
  }

  async enabledTasks() {
    return this.db.select().from(aiTasks).where(eq(aiTasks.enabled, true));
  }
}

async function sha256(text: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
}
