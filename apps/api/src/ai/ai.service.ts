import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, gte, sql } from '@waddle/db';
import { aiResultCache, aiTasks, taskPromptVersions, usageCounters, type Db } from '@waddle/db';
import {
  AiRunRequestSchema,
  BusinessError,
  type AiQuota,
  type AiReference,
  type AiStreamChunk,
  type AiTask,
} from '@waddle/protocol';
import { BilingualAssist } from '@waddle/engine';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, streamText } from 'ai';
import { DB } from '../db/database.module.js';
import { ENV } from '../config/env.module.js';
import type { Env } from '../config/env.js';

const LIMITS: Record<Plan, number> = { free: 25, plus: 300, pro: 2000 };
/** USD per juta token — estimasi kasar untuk pembukuan internal, bukan tagihan */
const PRICE_PER_MTOK = { input: 150, output: 600 };
const ORDER: Plan[] = ['free', 'plus', 'pro'];

export type Plan = 'free' | 'plus' | 'pro';

export interface AiResult {
  text: string;
  provider: 'local-dictionary' | 'remote-llm' | 'crossref' | 'none';
  cacheHit: boolean;
  coverage?: number;
  usage?: { input: number; output: number; costMicros: number };
  references?: AiReference[];
}

interface TaskRow {
  code: string;
  maxInputChars: number;
  timeoutMs: number;
  cacheTtlSeconds: number;
  requiresPlan: string | null;
}

interface PromptRow {
  promptVersion: string;
  systemPrompt: string;
  userTemplate: string;
  maxTokens: number;
  temperature: string;
}

/**
 * AI gateway = router dua lane (docs 04 §2), bukan pembungkus LLM.
 *
 * Urutan yang dijamin di sini, dan dipanggil dari satu tempat (`fastLane`) supaya
 * run() dan stream() tidak pernah punya logika yang berbeda:
 *   1) cache bersama  2) lane lokal (kamus id→en, gratis, <1 ms)  3) retrieval (Crossref)
 *   4) lane remote (LLM)  5) degradasi eksplisit, bukan exception tak terkendali.
 *
 * Terjemahan id→en sebagian besar selesai di langkah 2 — itu keputusan produk:
 * biaya dan latensi tidak boleh tumbuh线性 mengikuti volume ketikan user.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly assist = new BilingualAssist();

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async registry(): Promise<{ tasks: AiTask[]; cacheSeconds: number }> {
    const rows = await this.db
      .select({
        code: aiTasks.code,
        displayLabel: aiTasks.displayLabel,
        lane: aiTasks.lane,
        maxInputChars: aiTasks.maxInputChars,
        timeoutMs: aiTasks.timeoutMs,
        cacheTtlSeconds: aiTasks.cacheTtlSeconds,
        enabled: aiTasks.enabled,
        requiresPlan: aiTasks.requiresPlan,
      })
      .from(aiTasks)
      .where(eq(aiTasks.enabled, true));

    return {
      tasks: rows.map((r) => ({
        code: r.code as AiTask['code'],
        displayLabel: r.displayLabel ?? {},
        lane: r.lane as AiTask['lane'],
        maxInputChars: r.maxInputChars,
        timeoutMs: r.timeoutMs,
        cacheTtlSeconds: r.cacheTtlSeconds,
        enabled: r.enabled,
        requiresPlan: r.requiresPlan as AiTask['requiresPlan'],
      })),
      cacheSeconds: 900,
    };
  }

  /** Satu kali jalan, respons utuh (dipakai mobile/desktop saat tidak butuh streaming). */
  async run(userId: string, plan: Plan, code: string, rawBody: unknown): Promise<AiResult> {
    const body = AiRunRequestSchema.parse(rawBody);
    const task = await this.task(code);
    const prompt = await this.activePrompt(code);
    this.validate(task, prompt, body, plan);

    const key = await this.cacheKey(code, body, prompt);
    const fast = await this.fastLane(userId, code, body, task, key);
    if (fast) return fast;

    if (!this.remoteAvailable()) {
      // degradasi: terjemahan kamus tetap diberikan walau coverage di bawah ambang
      if (isTranslate(code)) {
        const local = this.assist.translate(body.text);
        return { text: local.text, provider: 'local-dictionary', cacheHit: false, coverage: local.coverage };
      }
      throw new BusinessError('ai_provider_error', 'lane remote belum diaktifkan (AI_REMOTE_ENABLED + AI_API_KEY)');
    }

    await this.enforceQuota(userId, code, plan);
    try {
      const r = await generateText({
        model: this.model(),
        system: prompt.systemPrompt,
        prompt: renderTemplate(prompt.userTemplate, body),
        maxOutputTokens: prompt.maxTokens,
        temperature: Number(prompt.temperature),
        abortSignal: AbortSignal.timeout(task.timeoutMs),
      });
      const usage = usageOf(r.usage.inputTokens ?? 0, r.usage.outputTokens ?? 0);
      await this.store(code, key, r.text, usage, task.cacheTtlSeconds, userId);
      return { text: r.text, provider: 'remote-llm', cacheHit: false, usage };
    } catch (err) {
      this.logger.warn(`lane remote gagal (${code}): ${(err as Error).message}`);
      throw new BusinessError('ai_provider_error', (err as Error).message);
    }
  }

  /** Streaming NDJSON untuk UI yang menuntut token pertama cepat. */
  async *stream(userId: string, plan: Plan, code: string, rawBody: unknown): AsyncGenerator<AiStreamChunk> {
    const body = AiRunRequestSchema.parse(rawBody);
    const task = await this.task(code);
    const prompt = await this.activePrompt(code);
    this.validate(task, prompt, body, plan);

    const key = await this.cacheKey(code, body, prompt);
    const fast = await this.fastLane(userId, code, body, task, key);
    if (fast) {
      yield {
        type: 'done',
        text: fast.text,
        cacheHit: fast.cacheHit,
        provider: fast.provider,
        usage: fast.usage ?? null,
        references: fast.references ?? null,
      };
      return;
    }

    if (!this.remoteAvailable()) {
      yield { type: 'error', code: 'ai_provider_error', message: 'lane remote belum diaktifkan', fallback: 'local' };
      return;
    }

    await this.enforceQuota(userId, code, plan);
    try {
      const r = streamText({
        model: this.model(),
        system: prompt.systemPrompt,
        prompt: renderTemplate(prompt.userTemplate, body),
        maxOutputTokens: prompt.maxTokens,
        temperature: Number(prompt.temperature),
        abortSignal: AbortSignal.timeout(task.timeoutMs),
      });
      let full = '';
      for await (const delta of r.textStream) {
        full += delta;
        yield { type: 'delta', text: delta };
      }
      const u = await r.usage;
      const usage = usageOf(u.inputTokens ?? 0, u.outputTokens ?? 0);
      await this.store(code, key, full, usage, task.cacheTtlSeconds, userId);
      yield { type: 'done', text: full, cacheHit: false, provider: 'remote-llm', usage, references: null };
    } catch (err) {
      this.logger.warn(`stream remote gagal (${code}): ${(err as Error).message}`);
      yield { type: 'error', code: 'ai_provider_error', message: (err as Error).message, fallback: 'local' };
    }
  }

  async quota(userId: string, plan: Plan): Promise<AiQuota> {
    const day = today();
    const rows = await this.db
      .select({ task: usageCounters.task, requests: usageCounters.requests })
      .from(usageCounters)
      .where(and(eq(usageCounters.userId, userId), eq(usageCounters.day, day)));
    const dayUsed: Record<string, number> = {};
    for (const r of rows) dayUsed[r.task] = r.requests;
    const dayLimit: Record<string, number> = {};
    for (const t of (await this.registry()).tasks) dayLimit[t.code] = LIMITS[plan];
    return { plan, dayUsed, dayLimit, resetsAt: new Date(`${day}T23:59:59`).getTime() };
  }

  // ── internal ────────────────────────────────────────────────────────────────

  /** Cache → kamus lokal → retrieval. Null artinya harus naik ke lane remote. */
  private async fastLane(
    userId: string,
    code: string,
    body: { text: string; targetLang?: string | null; context?: string | null },
    task: TaskRow,
    key: string,
  ): Promise<AiResult | null> {
    const cached = await this.db
      .select({ output: aiResultCache.output })
      .from(aiResultCache)
      .where(and(eq(aiResultCache.cacheKey, key), gte(aiResultCache.expiresAt, new Date())))
      .limit(1);
    if (cached[0]) {
      await this.db
        .update(aiResultCache)
        .set({ hits: sql`${aiResultCache.hits} + 1` })
        .where(eq(aiResultCache.cacheKey, key));
      await this.recordUsage(userId, code, { input: 0, output: 0, costMicros: 0 });
      return { text: cached[0].output, provider: 'none', cacheHit: true };
    }

    if (isTranslate(code)) {
      const local = this.assist.translate(body.text);
      if (local.coverage >= 0.85) {
        await this.store(code, key, local.text, zeroUsage(), task.cacheTtlSeconds, userId);
        return { text: local.text, provider: 'local-dictionary', cacheHit: false, coverage: local.coverage };
      }
      return null;
    }

    if (code === 'find_supporting_references') {
      const refs = await this.crossref(body.text);
      const text = refs.map((r) => `${r.title}${r.year ? ` (${r.year})` : ''} — ${r.url}`).join('\n');
      await this.store(code, key, text, zeroUsage(), task.cacheTtlSeconds, userId);
      return { text, references: refs, provider: 'crossref', cacheHit: false };
    }

    return null;
  }

  private validate(
    task: TaskRow,
    _prompt: PromptRow,
    body: { text: string },
    plan?: Plan,
  ): void {
    void _prompt;
    if (body.text.length > task.maxInputChars) {
      throw new BusinessError('validation_failed', `teks melebihi batas ${task.maxInputChars} karakter`);
    }
    if (task.requiresPlan && plan && rank(plan) < rank(task.requiresPlan as Plan)) {
      throw new BusinessError('quota_exceeded', 'tugas ini butuh paket yang lebih tinggi');
    }
  }

  private model() {
    return createOpenAICompatible({
      name: 'waddle-primary',
      baseURL: this.env.AI_BASE_URL,
      apiKey: this.env.AI_API_KEY!,
    })(this.env.AI_MODEL);
  }

  private remoteAvailable(): boolean {
    return this.env.AI_REMOTE_ENABLED && Boolean(this.env.AI_API_KEY);
  }

  private async task(code: string): Promise<TaskRow> {
    const [row] = await this.db
      .select({
        code: aiTasks.code,
        maxInputChars: aiTasks.maxInputChars,
        timeoutMs: aiTasks.timeoutMs,
        cacheTtlSeconds: aiTasks.cacheTtlSeconds,
        requiresPlan: aiTasks.requiresPlan,
      })
      .from(aiTasks)
      .where(and(eq(aiTasks.code, code), eq(aiTasks.enabled, true)))
      .limit(1);
    if (!row) throw new BusinessError('validation_failed', `tugas tidak dikenal atau tidak aktif: ${code}`);
    return row;
  }

  private async activePrompt(code: string): Promise<PromptRow> {
    const [row] = await this.db
      .select({
        promptVersion: taskPromptVersions.promptVersion,
        systemPrompt: taskPromptVersions.systemPrompt,
        userTemplate: taskPromptVersions.userTemplate,
        maxTokens: taskPromptVersions.maxTokens,
        temperature: taskPromptVersions.temperature,
      })
      .from(taskPromptVersions)
      .where(and(eq(taskPromptVersions.task, code), eq(taskPromptVersions.isActive, true)))
      .orderBy(desc(taskPromptVersions.createdAt))
      .limit(1);
    if (!row) throw new BusinessError('internal', `prompt aktif belum di-seed untuk ${code}`);
    return row;
  }

  /** cacheKey = task|model|promptVersion|targetLang|normalizedInput|contextMode */
  private async cacheKey(
    code: string,
    body: { text: string; targetLang?: string | null; context?: string | null },
    prompt: PromptRow,
  ): Promise<string> {
    const norm = body.text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
    const material = [
      code,
      this.env.AI_MODEL,
      prompt.promptVersion,
      body.targetLang ?? '-',
      norm,
      body.context ? 'ctx' : 'none',
    ].join('|');
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
    return Buffer.from(buf).toString('hex');
  }

  private async store(
    code: string,
    key: string,
    output: string,
    usage: { input: number; output: number; costMicros: number },
    ttlSeconds: number,
    userId: string,
  ): Promise<void> {
    await this.db
      .insert(aiResultCache)
      .values({
        cacheKey: key,
        task: code,
        output,
        usageIn: usage.input,
        usageOut: usage.output,
        costMicros: usage.costMicros,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      })
      .onConflictDoNothing();
    await this.recordUsage(userId, code, usage);
  }

  private async recordUsage(userId: string, code: string, usage: { input: number; output: number; costMicros: number }) {
    const day = today();
    await this.db
      .insert(usageCounters)
      .values({
        userId,
        day,
        task: code,
        requests: 1,
        tokensIn: usage.input,
        tokensOut: usage.output,
        costMicros: usage.costMicros,
      })
      .onConflictDoUpdate({
        target: [usageCounters.userId, usageCounters.day, usageCounters.task],
        set: {
          requests: sql`${usageCounters.requests} + 1`,
          tokensIn: sql`${usageCounters.tokensIn} + ${usage.input}`,
          tokensOut: sql`${usageCounters.tokensOut} + ${usage.output}`,
          costMicros: sql`${usageCounters.costMicros} + ${usage.costMicros}`,
          updatedAt: new Date(),
        },
      });
  }

  private async enforceQuota(userId: string, code: string, plan: Plan) {
    const day = today();
    const [row] = await this.db
      .select({ requests: usageCounters.requests })
      .from(usageCounters)
      .where(and(eq(usageCounters.userId, userId), eq(usageCounters.day, day), eq(usageCounters.task, code)))
      .limit(1);
    const limit = LIMITS[plan];
    const used = row?.requests ?? 0;
    if (used >= limit) {
      throw new BusinessError('quota_exceeded', `batas harian ${code} (${limit}) tercapai`, { plan, limit, used });
    }
  }

  /** Retrieval nyata: Crossref tak butuh API key dan memberi DOI yang bisa diverifikasi. */
  private async crossref(query: string): Promise<AiReference[]> {
    const url = new URL('https://api.crossref.org/works');
    url.searchParams.set('query.bibliographic', query.slice(0, 300));
    url.searchParams.set('rows', '5');
    url.searchParams.set('select', 'title,author,published-online,DOI');
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'waddle/0.1 (mailto:ops@waddle.local)' } });
      if (!res.ok) throw new Error(`crossref ${res.status}`);
      const json = (await res.json()) as { message?: { items?: CrossrefItem[] } };
      return (json.message?.items ?? [])
        .filter((i) => i.title?.[0] && i.DOI)
        .map((i) => ({
          title: i.title![0],
          authors: (i.author ?? []).map((a) => [a.given, a.family].filter(Boolean).join(' ')).slice(0, 4),
          year: i['published-online']?.['date-parts']?.[0]?.[0] ?? null,
          url: `https://doi.org/${i.DOI}`,
          provider: 'crossref' as const,
          score: 0.5,
          retrievedAt: Date.now(),
        }));
    } catch (err) {
      this.logger.warn(`retrieval referensi gagal: ${(err as Error).message}`);
      throw new BusinessError('ai_provider_error', 'retrieval referensi gagal');
    }
  }
}

interface CrossrefItem {
  title?: string[];
  author?: { given?: string; family?: string }[];
  'published-online'?: { 'date-parts'?: number[][] };
  DOI?: string;
}

const isTranslate = (code: string): boolean => code.startsWith('translate_to_');
const rank = (p: Plan): number => ORDER.indexOf(p);
const today = (): string => new Date().toISOString().slice(0, 10);
const zeroUsage = () => ({ input: 0, output: 0, costMicros: 0 });

function usageOf(input: number, output: number) {
  return {
    input,
    output,
    costMicros: Math.round((input * PRICE_PER_MTOK.input + output * PRICE_PER_MTOK.output) / 1000),
  };
}

function renderTemplate(template: string, body: { text: string; context?: string | null }): string {
  return template.replaceAll('{text}', body.text).replaceAll('{context}', body.context ?? '');
}
