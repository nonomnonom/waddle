/**
 * Klien API untuk web. Dua hal yang dijaga di sini:
 *  1) amplop respons (@waddle/protocol) di-unpack sekali, error jadi ApiError dengan code;
 *  2) auth memakai Bearer token sesi (dari better-auth) supaya web dan API boleh
 *     berada di domain berbeda; kuki ikut terkirim sebagai fallback.
 */
import { EnvelopeSchema, type Envelope } from '@waddle/protocol';

export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let bearerToken: string | null = null;
export const setBearer = (token: string | null): void => {
  bearerToken = token;
};

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  headers.set('x-request-id', crypto.randomUUID());
  if (!headers.has('x-device-digest')) headers.set('x-device-digest', deviceDigest());
  if (bearerToken) headers.set('authorization', `Bearer ${bearerToken}`);

  const res = await fetch(`${API_URL}${path}`, { ...init, headers, credentials: 'include' });
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ApiError('internal', `respons bukan JSON (${res.status})`, undefined);
  }

  const parsed = EnvelopeSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError('internal', 'bentuk respons tidak dikenali', undefined);
  }
  const envelope = parsed.data as Envelope<T>;
  if (envelope.code !== 'ok') {
    throw new ApiError(envelope.code, envelope.message ?? envelope.code, envelope.requestId);
  }
  return envelope.data as T;
}

/**
 * Baca dengan metode HTTP QUERY (RFC 10008): isi kueri duduk di body JSON, bukan di URL.
 * Aman dan idempoten seperti GET — bedanya frasa pencarian panjang tidak menabrak batas
 * panjang URL dan tidak ikut tertulis di log proxy perantara.
 */
export const apiQuery = <T>(path: string, content: Record<string, unknown>): Promise<T> =>
  api<T>(path, { method: 'QUERY', body: JSON.stringify(content) });

/** Identitas perangkat ringan untuk agregat harian; stabil per browser+profil. */function deviceDigest(): string {
  const KEY = 'waddle.device.digest';
  const existing = localStorage.getItem(KEY);
  if (existing) return existing;
  const created = `web-${crypto.randomUUID()}`;
  localStorage.setItem(KEY, created);
  return created;
}

export async function registerDevice(appVersion: string): Promise<void> {
  await api('/v1/devices/register', {
    method: 'POST',
    body: JSON.stringify({
      digest: deviceDigest(),
      platform: 'web',
      appVersion,
      appBuild: appVersion,
      tzOffsetMinutes: -new Date().getTimezoneOffset(),
    }),
  });
}
