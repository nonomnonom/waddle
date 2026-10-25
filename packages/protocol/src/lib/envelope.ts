import { z } from 'zod';
import { BUSINESS_CODES, CODE_TO_HTTP, type BusinessCode, CODE_TO_ACTION, type ClientAction } from './codes.js';

/**
 * Amplop respons tunggal untuk semua endpoint. `serverTime` wajib: perangkat klien
 * tidak boleh mempercayai jam sendiri untuk retensi, quota harian, dan urutan koleksi.
 */
export const EnvelopeSchema = z.object({
  code: z.enum(BUSINESS_CODES),
  message: z.string().nullish(),
  data: z.unknown().optional(),
  serverTime: z.int(),
  requestId: z.uuid(),
  action: z.enum(Object.keys(CODE_TO_ACTION) as [ClientAction, ...ClientAction[]]).optional(),
  retryAfterMs: z.int().min(0).nullish(),
});

export type Envelope<T = unknown> = z.infer<typeof EnvelopeSchema> & { data?: T };

export function ok<T>(data: T, ctx: RequestContext): Envelope<T> {
  return { code: 'ok', data, serverTime: ctx.now, requestId: ctx.requestId };
}

export function fail(
  code: BusinessCode,
  ctx: RequestContext,
  opts?: { message?: string; data?: unknown; retryAfterMs?: number },
): Envelope {
  return {
    code,
    message: opts?.message ?? null,
    data: opts?.data,
    serverTime: ctx.now,
    requestId: ctx.requestId,
    action: CODE_TO_ACTION[code],
    retryAfterMs: opts?.retryAfterMs ?? null,
  };
}

export interface RequestContext {
  requestId: string;
  /** epoch milliseconds versi server */
  now: number;
}

export const httpStatusFor = (code: BusinessCode): number => CODE_TO_HTTP[code];

export class BusinessError extends Error {
  constructor(
    readonly code: BusinessCode,
    message?: string,
    readonly data?: unknown,
    readonly retryAfterMs?: number,
  ) {
    super(message ?? code);
    this.name = 'BusinessError';
  }
}
