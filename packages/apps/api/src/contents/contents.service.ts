import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, sql } from '@waddle/db';
import { contentTranslations, contents, contentDailyCounts, installations, type Db } from '@waddle/db';
import {
  BusinessError,
  FragmentBatchRequestSchema,
  FragmentListQuerySchema,
  StatisticsBatchSchema,
  type Fragment,
  type FragmentBatchResponse,
  type FragmentInput,
} from '@waddle/protocol';
import { BilingualAssist } from '@waddle/engine';
import { DB } from '../db/database.module.js';

/**
 * Koleksi fragmen: potongan teks yang user simpan (setara fitur koleksi di Keysake, jalur id→en).
 *
 * Dua hal yang diambil dari desain Keysake karena terbukti perlu:
 *  1) antrian klien + hasil per-item (partial success), bukan transaksi semua-or-bukti;
 *  2) terjemahan disimpan sebagai baris terpisah, karena sering ada belakangan
 *     — fragmen bisa tersimpan dulu sementara terjemahannya menyusul.
 */
@Injectable()
export class ContentsService {
  /** assist lokal dipakai untuk mengisi terjemahan yang dikirim klien tanpa provider */
  private readonly assist = new BilingualAssist();

  constructor(@Inject(DB) private readonly db: Db) {}

  async batch(userId: string, raw: unknown, deviceDigest?: string): Promise<FragmentBatchResponse> {
    const body = FragmentBatchRequestSchema.parse(raw);
    const installationId = await this.resolveInstallation(userId, deviceDigest);

    const results: FragmentBatchResponse['results'] = [];
    const retryClientIds: string[] = [];

    // dedup dalam batch itu sendiri supaya satu klik ganda tidak membuat dua baris
    const seen = new Set<string>();

    for (const item of body.items) {
      try {
        const hash = await normalizedHash(item.sourceText);
        if (seen.has(hash)) {
          results.push({ clientId: item.clientId, id: null, code: 'duplicate', message: 'duplikat dalam batch' });
          continue;
        }
        seen.add(hash);

        const [existing] = await this.db
          .select({ id: contents.id })
          .from(contents)
          .where(and(eq(contents.userId, userId), eq(contents.normalizedHash, hash), eq(contents.status, 'active')))
          .limit(1);
        if (existing) {
          results.push({ clientId: item.clientId, id: existing.id, code: 'duplicate' });
          continue;
        }

        const translation = item.translation ?? this.localTranslation(item);

        const [inserted] = await this.db
          .insert(contents)
          .values({
            userId,
            installationId,
            kind: 'fragment',
            sourceText: item.sourceText,
            sourceLang: item.sourceLang,
            charCount: item.charCount ?? Array.from(item.sourceText).length,
            byteCount: Buffer.byteLength(item.sourceText, 'utf8'),
            normalizedHash: hash,
            originAppBundle: item.originAppBundle ?? null,
            tzOffsetMinutes: item.tzOffsetMinutes,
            collectedAt: new Date(item.collectedAt),
            status: 'active',
          })
          .returning({ id: contents.id });

        if (translation) {
          await this.db
            .insert(contentTranslations)
            .values({
              contentId: inserted.id,
              provider: translation.provider,
              targetLang: translation.targetLang,
              model: translation.model ?? null,
              text: translation.text,
            })
            .onConflictDoNothing();
        }

        results.push({ clientId: item.clientId, id: inserted.id, code: 'ok' });
      } catch (err) {
        retryClientIds.push(item.clientId);
        results.push({ clientId: item.clientId, id: null, code: 'internal', message: (err as Error).message });
      }
    }

    return { results, retryClientIds };
  }

  async list(userId: string, rawQuery: unknown): Promise<{ items: Fragment[]; nextCursor: string | null; daysWithData: string[] }> {
    const q = FragmentListQuerySchema.parse(rawQuery);
    // filter tanggal memakai tanggal lokal user: collectedAt digeser sesuai tzOffsetMinutes baris
    const conds = [eq(contents.userId, userId), eq(contents.status, 'active')];
    const localDay = sql`date(${contents.collectedAt} + (${contents.tzOffsetMinutes} || ' minutes')::interval)`;
    if (q.from) conds.push(gte(localDay, q.from));
    if (q.to) conds.push(lte(localDay, q.to));
    if (q.cursor) conds.push(lte(contents.collectedAt, new Date(Number(q.cursor))));
    if (q.search) {
      // pola LIKE: % dan _ adalah wildcard, backslash adalah escape default Postgres.
      // Tanpa pelarian, user yang mengetik "100%" akan mencari hal lain dari yang ia tulis.
      const pattern = `%${q.search.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
      conds.push(ilike(contents.sourceText, pattern));
    }

    const rows = await this.db
      .select({
        id: contents.id,
        sourceText: contents.sourceText,
        sourceLang: contents.sourceLang,
        charCount: contents.charCount,
        collectedAt: contents.collectedAt,
        tzOffsetMinutes: contents.tzOffsetMinutes,
        originAppBundle: contents.originAppBundle,
        status: contents.status,
        revision: contents.revision,
        createdAt: contents.createdAt,
      })
      .from(contents)
      .where(and(...conds))
      .orderBy(desc(contents.collectedAt))
      .limit(q.limit + 1);

    const page = rows.slice(0, q.limit);
    const ids = page.map((r) => r.id);
    const trs = ids.length
      ? await this.db
          .select({ contentId: contentTranslations.contentId, provider: contentTranslations.provider, targetLang: contentTranslations.targetLang, text: contentTranslations.text, model: contentTranslations.model })
          .from(contentTranslations)
          .where(inArray(contentTranslations.contentId, ids))
      : [];

    const days = await this.db
      .select({ day: sql<string>`to_char(date(${contents.collectedAt}), 'YYYY-MM-DD')` })
      .from(contents)
      .where(and(eq(contents.userId, userId), eq(contents.status, 'active')))
      .groupBy(sql`date(${contents.collectedAt})`)
      .orderBy(asc(sql`date(${contents.collectedAt})`))
      .limit(400);

    return {
      items: page.map((r) => {
        const t = trs.find((x) => x.contentId === r.id);
        return {
          sourceText: r.sourceText,
          sourceLang: r.sourceLang,
          charCount: r.charCount,
          collectedAt: r.collectedAt.getTime(),
          tzOffsetMinutes: r.tzOffsetMinutes ?? 0,
          originAppBundle: r.originAppBundle ?? null,
          id: r.id,
          revision: r.revision,
          status: r.status as Fragment['status'],
          createdAt: r.createdAt.getTime(),
          translation: t
            ? {
                targetLang: t.targetLang,
                provider: t.provider as 'local-dictionary' | 'remote-llm' | 'on-device' | 'none',
                text: t.text,
                model: t.model,
              }
            : undefined,
        };
      }),
      nextCursor: page.length === q.limit && rows.length > q.limit ? String(page.at(-1)?.collectedAt.getTime()) : null,
      daysWithData: days.map((d) => d.day),
    };
  }

  async remove(userId: string, id: string): Promise<{ id: string; purgeAfter: number }> {
    const [row] = await this.db
      .update(contents)
      .set({ status: 'deleted', purgeAfter: new Date(Date.now() + 30 * 86_400_000), updatedAt: new Date() })
      .where(and(eq(contents.id, id), eq(contents.userId, userId), isNull(contents.purgeAfter)))
      .returning({ id: contents.id, purgeAfter: contents.purgeAfter });
    if (!row) throw new BusinessError('data_not_found', 'fragmen tidak ditemukan atau sudah dihapus');
    return { id: row.id, purgeAfter: row.purgeAfter!.getTime() };
  }

  async statistics(userId: string, raw: unknown, deviceDigest?: string): Promise<{ accepted: number }> {
    const body = StatisticsBatchSchema.parse(raw);
    const installationId = await this.resolveInstallation(userId, deviceDigest);
    if (!installationId) {
      throw new BusinessError('validation_failed', 'daftar perangkat dulu lewat POST /v1/devices/register sebelum mengirim statistik');
    }
    for (const d of body.days) {
      await this.db
        .insert(contentDailyCounts)
        .values({
          userId,
          day: d.day,
          installationId,
          keystrokes: d.keystrokes,
          committedCount: d.committedCount,
          collectedCount: d.collectedCount,
          charsCommitted: d.charsCommitted,
          aiRequests: d.aiRequests,
        })
        .onConflictDoUpdate({
          // klien mengirim totals per hari -> ambil nilai terbesar, supaya retry/parsial tidak menurunkan angka
          target: [contentDailyCounts.userId, contentDailyCounts.day, contentDailyCounts.installationId],
          set: {
            keystrokes: sql`greatest(${contentDailyCounts.keystrokes}, excluded.keystrokes)`,
            committedCount: sql`greatest(${contentDailyCounts.committedCount}, excluded.committed_count)`,
            collectedCount: sql`greatest(${contentDailyCounts.collectedCount}, excluded.collected_count)`,
            charsCommitted: sql`greatest(${contentDailyCounts.charsCommitted}, excluded.chars_committed)`,
            aiRequests: sql`greatest(${contentDailyCounts.aiRequests}, excluded.ai_requests)`,
            updatedAt: new Date(),
          },
        });
    }
    return { accepted: body.days.length };
  }

  /**
   * Terjemahan lokal: kami tidak percaya begitu saja pada teks klien;
   * kalau tidak ada terjemahan, engine kamus lokal yang mengisi, dengan provider tercatat.
   */
  private localTranslation(item: FragmentInput): { targetLang: string; provider: 'local-dictionary'; text: string; model?: null } | undefined {
    const r = this.assist.translate(item.sourceText);
    if (!r.text || r.coverage < 0.5) return undefined;
    return { targetLang: 'en', provider: 'local-dictionary', text: r.text };
  }

  private async resolveInstallation(userId: string, digest?: string): Promise<string | null> {
    if (!digest) return null;
    const [row] = await this.db
      .select({ id: installations.id })
      .from(installations)
      .where(eq(installations.deviceDigest, digest))
      .limit(1);
    return row?.id ?? null;
  }
}

/** sha256 hex dari teks yang dinormalkan (NFKC, lowercase, rapikan spasi, buang tanda baca tepi). */
export async function normalizedHash(text: string): Promise<string> {
  const norm = text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,!?;:"'’“”]+|[\s.,!?;:"'’“”]+$/g, '');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(norm));
  return Buffer.from(buf).toString('hex');
}
