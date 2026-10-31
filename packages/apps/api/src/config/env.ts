import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().startsWith('postgres'),
  /** wajib >= 32 char; dipakai better-auth untuk signing */
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url().default('http://localhost:3000'),
  /** origin web yang diizinkan (CSV) */
  CORS_ORIGINS: z.string().default('http://localhost:4200'),

  AI_API_KEY: z.string().optional(),
  AI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  AI_MODEL: z.string().default('gpt-4o-mini'),
  /** mati = hanya lane lokal (glosarium) yang boleh jalan */
  AI_REMOTE_ENABLED: z.coerce.boolean().default(false),

  APP_CHANNEL: z.enum(['prod', 'staging', 'dev']).default('dev'),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Origin web yang diizinkan, dipakai dua tempat yang harus selalu sama:
 * CORS di main.ts dan `trustedOrigins` better-auth (penolakan 403 atas origin
 * yang tidak dikenal). Kalau keduanya berbeda, gejala yang muncul membingungkan:
 * preflight lolos, tapi sign-in ditolak.
 */
export const originList = (env: Env): string[] =>
  env.CORS_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export function loadEnv(overrides: Record<string, string | undefined> = {}): Env {
  const merged = { ...process.env, ...overrides };
  const parsed = EnvSchema.safeParse(merged);
  if (!parsed.success) {
    const flat = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`ENV invalid: ${flat}`);
  }
  return parsed.data;
}
