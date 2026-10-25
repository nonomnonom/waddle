import { z } from 'zod';

/** Sebuah potongan teks yang pengguna kumpulkan. */
export const FragmentKindSchema = z.enum(['fragment', 'note', 'clip']);

export const TranslationProviderSchema = z.enum(['local-dictionary', 'remote-llm', 'on-device', 'none']);

export const TranslationSchema = z.object({
  targetLang: z.string().min(2).max(35),
  provider: TranslationProviderSchema,
  text: z.string().max(20000),
  model: z.string().max(120).nullish(),
});

export const FragmentInputSchema = z.object({
  /** UUID dibuat klien; dipakai sebagai kunci idempoten saat retry. */
  clientId: z.uuid(),
  sourceText: z.string().min(1).max(20000),
  sourceLang: z.string().min(2).max(35).default('id'),
  translation: TranslationSchema.optional(),
  /** epoch millis menurut klien; server menyimpannya apa adanya untuk tampilan "per tanggal". */
  collectedAt: z.int(),
  tzOffsetMinutes: z.int().min(-840).max(840),
  originAppBundle: z.string().max(200).nullish(),
  charCount: z.int().min(0).optional(),
});

export const FragmentSchema = FragmentInputSchema.omit({ clientId: true })
  .extend({
    id: z.uuid(),
    revision: z.int().min(1),
    status: z.enum(['active', 'archived', 'deleted']),
    createdAt: z.int(),
  })
  .required({ sourceLang: true });

export const FragmentBatchRequestSchema = z.object({
  items: z.array(FragmentInputSchema).min(1).max(200),
  device: z
    .object({
      digest: z.string().min(8).max(64),
      appVersion: z.string().max(40),
      engineVersion: z.string().max(40).nullish(),
    })
    .partial()
    .optional(),
});

/** Hasil per item: success partial, bukan all-or-nothing (antrian klien di-resume per item). */
export const FragmentBatchResultSchema = z.object({
  clientId: z.uuid(),
  id: z.uuid().nullish(),
  code: z.enum(['ok', 'duplicate', 'validation_failed', 'credential_missing', 'quota_exceeded', 'internal']),
  message: z.string().nullish(),
});

export const FragmentBatchResponseSchema = z.object({
  results: z.array(FragmentBatchResultSchema),
  /** antrian yang masih perlu dikirim klien (server menolak sebagian) */
  retryClientIds: z.array(z.uuid()),
});

/**
 * Kueri daftar dipakai dua jalur: string-URL (`GET /v1/contents?from=...`) dan
 * query-content (`QUERY /v1/contents` dengan body JSON, RFC 10008). Keduanya bisa
 * membawa nilai kosong — `?from` tanpa nilai, atau `{"search": ""}` dari form yang
 * baru dikosongkan. Perlakukan keduanya sebagai "filter tidak dipakai", bukan error.
 */
const emptyMeansAbsent = (value: unknown): unknown =>
  typeof value === 'string' ? (value.trim() === '' ? undefined : value.trim()) : value;

export const FragmentListQuerySchema = z.object({
  from: z.preprocess(emptyMeansAbsent, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  to: z.preprocess(emptyMeansAbsent, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  cursor: z.preprocess(emptyMeansAbsent, z.string().max(200).optional()),
  /**
   * Pencocokan tidak peka-kasar pada teks sumber. Sengaja lewat query-content:
   * frasa panjang tidak tersangkut di batas panjang URL dan tidak ikut tertulis
   * di log proxy perantara (RFC 10008 §4).
   */
  search: z.preprocess(emptyMeansAbsent, z.string().max(200).optional()),
  limit: z.preprocess(emptyMeansAbsent, z.coerce.number().int().min(1).max(200).default(50)),
});

export const FragmentListResponseSchema = z.object({
  items: z.array(FragmentSchema),
  nextCursor: z.string().nullish(),
  /** tanggal lokal user yang punya isi, untuk kalender */
  daysWithData: z.array(z.string()),
});

export const DailyCountSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  keystrokes: z.int().min(0).default(0),
  committedCount: z.int().min(0).default(0),
  collectedCount: z.int().min(0).default(0),
  charsCommitted: z.int().min(0).default(0),
  aiRequests: z.int().min(0).default(0),
});

export const StatisticsBatchSchema = z.object({ days: z.array(DailyCountSchema).min(1).max(92) });

export type FragmentInput = z.infer<typeof FragmentInputSchema>;
export type Fragment = z.infer<typeof FragmentSchema>;
export type FragmentBatchRequest = z.infer<typeof FragmentBatchRequestSchema>;
export type FragmentBatchResponse = z.infer<typeof FragmentBatchResponseSchema>;
export type FragmentListQuery = z.infer<typeof FragmentListQuerySchema>;
export type DailyCount = z.infer<typeof DailyCountSchema>;
