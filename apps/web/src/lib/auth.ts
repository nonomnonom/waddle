import { createAuthClient } from 'better-auth/react';
import { API_URL, setBearer } from './api.js';

/**
 * Sesi dikelola better-auth. Kita simpan token sesi di memori untuk header Bearer
 * (web dan API bisa berada di domain berbeda) dan tetap mengirim kuki sebagai fallback.
 */
export const authClient = createAuthClient({
  baseURL: `${API_URL}/api/auth`,
  fetchOptions: { credentials: 'include' },
});

export interface SessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export async function refreshSession(): Promise<{ user: SessionUser | null; token: string | null }> {
  const { data } = await authClient.getSession();
  const token = (data?.session as { token?: string } | undefined)?.token ?? null;
  setBearer(token);
  return { user: (data?.user as SessionUser | undefined) ?? null, token };
}

export async function signUp(input: { name: string; email: string; password: string }): Promise<{ ok: boolean; message?: string }> {
  const r = await authClient.signUp.email(input);
  if (r.error) return { ok: false, message: humanError(r.error.message ?? r.error.code) };
  await refreshSession();
  return { ok: true };
}

export async function signIn(input: { email: string; password: string }): Promise<{ ok: boolean; message?: string }> {
  const r = await authClient.signIn.email(input);
  if (r.error) return { ok: false, message: humanError(r.error.message ?? r.error.code) };
  await refreshSession();
  return { ok: true };
}

export async function signOut(): Promise<void> {
  await authClient.signOut();
  setBearer(null);
}

const MAP: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'Email atau password salah.',
  USER_ALREADY_EXISTS: 'Email ini sudah terdaftar. Coba masuk.',
  WEAK_PASSWORD: 'Password terlalu pendek (minimal 10 karakter).',
  MISSING_PASSWORD: 'Isi password dulu.',
  SESSION_EXPIRED: 'Sesi berakhir, masuk ulang ya.',
};

function humanError(raw: string | undefined): string {
  if (!raw) return 'Tidak bisa masuk sekarang.';
  for (const [code, text] of Object.entries(MAP)) if (raw.includes(code)) return text;
  return raw;
}
