import { z } from 'zod';

/**
 * Registry tugas generatif. Kode dan label TIDAK di-hardcode di klien:
 * klien membaca registry dari server (`/v1/ai/tasks`), sehingga menambah tugas
 * tidak memerlukan rilis ulang desktop/mobile.
 */
export const AiTaskCodeSchema = z.enum([
  'translate_to_english',
  'translate_to_chinese',
  'paraphrase',
  'find_supporting_references',
  'explain_correction',
  'tone_adjust',
  'summarize',
]);

export const AiLaneSchema = z.enum(['local', 'remote']);

export const AiTaskSchema = z.object({
  code: AiTaskCodeSchema,
  displayLabel: z.record(z.string(), z.string()),
  lane: AiLaneSchema,
  maxInputChars: z.int().min(1).max(8000),
  timeoutMs: z.int().min(500).max(20000),
  cacheTtlSeconds: z.int().min(0),
  enabled: z.boolean(),
  requiresPlan: z.enum(['free', 'plus', 'pro']).optional(),
});

export const AiTasksResponseSchema = z.object({
  tasks: z.array(AiTaskSchema),
  /** klien meng-cache registry ini selama nilai di bawahnya (detik) */
  cacheSeconds: z.int().default(900),
});

export const AiRunRequestSchema = z.object({
  text: z.string().min(1).max(8000),
  sourceLang: z.string().min(2).max(35).default('id'),
  targetLang: z.string().min(2).max(35).nullish(),
  /** true = NDJSON streaming; false = satu JSON utuh */
  stream: z.boolean().default(true),
  /** opsional & opt-in: teks sekeliling untuk konteks. Jangan pernah dikirim diam-diam. */
  context: z.string().max(4000).nullish(),
  /** kunci cache klien; kalau dihapus server tetap bisa menghasilkan sendiri */
  clientHint: z.string().max(64).nullish(),
});

export const AiReferenceSchema = z.object({
  title: z.string(),
  authors: z.array(z.string()),
  year: z.int().nullish(),
  url: z.url(),
  provider: z.enum(['crossref', 'semantic-scholar', 'arxiv', 'openalex', 'doaj']),
  /** skor relevansi retrieval, bukan "keyakinan model" */
  score: z.number().min(0).max(1),
  retrievedAt: z.int(),
});

/** Chunk NDJSON yang juga dipakai bridge lokal (lihat bridge.ts). */
export const AiStreamChunkSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('delta'), jobId: z.string().nullish(), text: z.string() }),
  z.object({
    type: z.literal('done'),
    jobId: z.string().nullish(),
    text: z.string(),
    cacheHit: z.boolean(),
    provider: z.string().nullish(),
    usage: z.object({ input: z.int(), output: z.int(), costMicros: z.int().nullish() }).nullish(),
    references: z.array(AiReferenceSchema).nullish(),
  }),
  z.object({
    type: z.literal('error'),
    jobId: z.string().nullish(),
    code: z.enum(['validation_failed', 'quota_exceeded', 'ai_provider_error', 'rate_limited', 'internal']),
    message: z.string(),
    /** fallback yang bisa dipakai klien tanpa jaringan (mis. terjemahan on-device) */
    fallback: z.enum(['local', 'none']),
  }),
]);

export const AiQuotaSchema = z.object({
  plan: z.enum(['free', 'plus', 'pro']),
  dayUsed: z.record(z.string(), z.int()),
  dayLimit: z.record(z.string(), z.int()),
  resetsAt: z.int(),
});

export type AiTask = z.infer<typeof AiTaskSchema>;
export type AiRunRequest = z.infer<typeof AiRunRequestSchema>;
export type AiStreamChunk = z.infer<typeof AiStreamChunkSchema>;
export type AiReference = z.infer<typeof AiReferenceSchema>;
export type AiQuota = z.infer<typeof AiQuotaSchema>;
