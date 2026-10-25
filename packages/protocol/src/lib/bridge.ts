import { z } from 'zod';

/**
 * Typing Action Protocol (TAP) v1 — kontrak antara mesin ketik (engine di desktop/mobile)
 * dan lane generatif (server AI gateway). Bentuknya identik dengan chunk NDJSON `/v1/ai/tasks/*`
 * supaya adapter lokal (stdin/socket) bisa memakai parser yang sama.
 *
 * Aturan yang membuat protokol ini aman dipakai di jalur mengetik:
 *  - teks dikirim di body/stdin, tidak pernah di argv atau env;
 *  - setiap request punya `deadlineMs`, dan klien WAJIB membatalkan saat input berubah;
 *  - `jobId` dari klien dipakai untuk mencocokkan respons yang sudah basi.
 */
export const TAP_VERSION = 'waddle.tap/1';

export const TapHelloSchema = z.object({
  protocol: z.literal(TAP_VERSION),
  role: z.enum(['engine', 'gateway']),
  clientId: z.string().min(1).max(64),
  appVersion: z.string().max(40),
  platform: z.enum(['macos', 'windows', 'linux', 'ios', 'android', 'web']),
  /** apa yang boleh dilakukan sisi penerima */
  supports: z.object({ stream: z.boolean(), references: z.boolean(), localLane: z.boolean() }),
});

export const TapRequestSchema = z.object({
  protocol: z.literal(TAP_VERSION),
  jobId: z.uuid(),
  task: z.string().min(1).max(60),
  text: z.string().min(1).max(8000),
  sourceLang: z.string().min(2).max(35),
  targetLang: z.string().min(2).max(35).nullish(),
  context: z.string().max(4000).nullish(),
  deadlineMs: z.int().min(200).max(20000),
  stream: z.boolean().default(true),
  /** true = boleh membaca/menulis cache bersama */
  cache: z.boolean().default(true),
});

export const TapCancelSchema = z.object({
  protocol: z.literal(TAP_VERSION),
  jobId: z.uuid(),
  reason: z.enum(['input_changed', 'deadline', 'user_abort']),
});

export type TapHello = z.infer<typeof TapHelloSchema>;
export type TapRequest = z.infer<typeof TapRequestSchema>;
export type TapCancel = z.infer<typeof TapCancelSchema>;

/** Helper: satu baris NDJSON (tanpa newline di akhir, tanpa spasi berlebih). */
export const toNdjson = (value: unknown): string => `${JSON.stringify(value)}\n`;

export function parseNdjsonLine(line: string): unknown | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;
  return JSON.parse(trimmed);
}
