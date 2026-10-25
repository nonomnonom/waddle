/**
 * Kode bisnis yang dikembalikan di dalam `Envelope.code`. HTTP status hanyalah transport;
 * klien (Electron/Expo/engine) bercabang pada kode ini, bukan pada angka HTTP.
 */
export const BUSINESS_CODES = [
  'ok',
  'validation_failed',
  'credential_missing',
  'credential_invalid',
  'unsupported_client',
  'rate_limited',
  'data_not_found',
  'duplicate',
  'quota_exceeded',
  'ai_provider_error',
  'conflict',
  'internal',
] as const;

export type BusinessCode = (typeof BUSINESS_CODES)[number];

/** Pemetaan default business code -> HTTP status. */
export const CODE_TO_HTTP: Record<BusinessCode, number> = {
  ok: 200,
  validation_failed: 400,
  credential_missing: 401,
  credential_invalid: 401,
  unsupported_client: 400,
  rate_limited: 429,
  data_not_found: 404,
  duplicate: 200,
  quota_exceeded: 402,
  ai_provider_error: 502,
  conflict: 409,
  internal: 500,
};

/** Tindakan yang disarankan ke klien; mencegah setiap klien mengarang strategi retry sendiri. */
export type ClientAction = 'none' | 'retry_after' | 'reauthenticate' | 'upgrade' | 'refresh_settings';

export const CODE_TO_ACTION: Record<BusinessCode, ClientAction> = {
  ok: 'none',
  validation_failed: 'none',
  credential_missing: 'reauthenticate',
  credential_invalid: 'reauthenticate',
  unsupported_client: 'upgrade',
  rate_limited: 'retry_after',
  data_not_found: 'none',
  duplicate: 'none',
  quota_exceeded: 'upgrade',
  ai_provider_error: 'retry_after',
  conflict: 'refresh_settings',
  internal: 'none',
};
