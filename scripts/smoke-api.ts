/**
 * Smoke test end-to-end terhadap API yang sedang berjalan (dev/staging).
 * Bukan unit test: tujuannya membuktikan rantaian sebenarnya hidup —
 * auth → sesi bearer → registrasi perangkat → simpan koleksi → baca kembali → lane AI lokal.
 *
 *   bun scripts/smoke-api.ts [baseUrl]
 */
const BASE = process.argv[2] ?? process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';
const email = `smoke+${Date.now()}@waddle.test`;
const password = 'smoke-password-123';

type Envelope<T> = { code: string; message?: string | null; data?: T; serverTime: number; requestId: string };

const DIGEST = `smoke-${crypto.randomUUID()}`;
let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 180)}` : ''}`);
  if (!ok) failures += 1;
}

async function call<T>(path: string, init: RequestInit = {}, token?: string): Promise<Envelope<T>> {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  headers.set('x-request-id', crypto.randomUUID());
  if (token) headers.set('authorization', `Bearer ${token}`);
  headers.set('x-device-digest', DIGEST);
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const body = (await res.json().catch(() => ({}))) as Envelope<T>;
  return body;
}

// 1. health
const health = await fetch(`${BASE}/healthz`).then((r) => r.json()).catch(() => null);
check('GET /healthz menjawab ok (amplop)', health?.data?.ok === true || health?.ok === true, health);

// 2. sign up via better-auth
const su = await fetch(`${BASE}/api/auth/sign-up/email`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password, name: 'Smoke Tester' }),
}).then((r) => r.json());
const token: string | undefined = su?.token ?? su?.session?.token;
check('sign-up email menghasilkan sesi', Boolean(token), { user: su?.user?.email });

if (!token) {
  console.log('\nberhenti: tanpa token sesi tidak ada yang bisa diuji.');
  process.exit(1);
}

// 3. profil
const profile = await call<{ plan: string; collected: number }>('/v1/profile', {}, token);
check('GET /v1/profile terbaca dengan bearer token', profile.code === 'ok', profile.code !== 'ok' ? profile : profile.data);

// 4. registrasi perangkat
const digest = `smoke-${crypto.randomUUID()}`;
const dev = await call('/v1/devices/register', {
  method: 'POST',
  body: JSON.stringify({ digest: DIGEST, platform: 'web', appVersion: '0.0.1-smoke', appBuild: '1', tzOffsetMinutes: 420 }),
}, token);
check('POST /v1/devices/register', dev.code === 'ok', dev.code !== 'ok' ? dev : dev.data);

// 5. simpan koleksi (dengan terjemahan lokal)
const clientId = crypto.randomUUID();
const batch = await call<{ results: { code: string; id: string | null }[] }>('/v1/contents/batch', {
  method: 'POST',
  body: JSON.stringify({
    items: [
      {
        clientId,
        sourceText: 'selamat pagi, rapatnya diundur ke jam tiga',
        sourceLang: 'id',
        collectedAt: Date.now(),
        tzOffsetMinutes: 420,
        translation: { targetLang: 'en', provider: 'local-dictionary', text: 'good morning, the meeting was postponed to 3 o’clock' },
      },
    ],
  }),
}, token);
check('POST /v1/contents/batch menyimpan item', batch.data?.results?.[0]?.code === 'ok', batch.data ?? batch);

// 6. dedup: kirim hal sama dua kali -> duplicate
const dup = await call<{ results: { code: string }[] }>('/v1/contents/batch', {
  method: 'POST',
  body: JSON.stringify({
    items: [
      {
        clientId: crypto.randomUUID(),
        sourceText: 'selamat pagi, rapatnya diundur ke jam tiga',
        sourceLang: 'id',
        collectedAt: Date.now(),
        tzOffsetMinutes: 420,
      },
    ],
  }),
}, token);
check('duplikat ditandai `duplicate` (unique index bekerja)', dup.data?.results?.[0]?.code === 'duplicate', dup.data ?? dup);

// 7. baca kembali
const list = await call<{ items: unknown[]; daysWithData: string[] }>('/v1/contents?limit=10', {}, token);
check('GET /v1/contents mengembalikan item', (list.data?.items.length ?? 0) >= 1, { count: list.data?.items.length, days: list.data?.daysWithData });

// 8. statistik harian
const stats = await call('/v1/contents/statistics', {
  method: 'POST',
  body: JSON.stringify({ days: [{ day: new Date().toISOString().slice(0, 10), keystrokes: 120, committedCount: 8, collectedCount: 1, charsCommitted: 45, aiRequests: 0 }] }),
}, token);
check('POST /v1/contents/statistics idempoten', stats.code === 'ok', stats.code !== 'ok' ? stats : stats.data);

// 9. registry AI
const tasks = await call<{ tasks: { code: string }[] }>('/v1/ai/tasks', {}, token);
check('GET /v1/ai/tasks terisi dari DB', (tasks.data?.tasks.length ?? 0) >= 4, tasks.data?.tasks.map((t) => t.code));

// 10. lane lokal: terjemahan id->en harus dijawab kamus (atau cache dari panggilan sebelumnya),
//     bukan LLM - AI_REMOTE_ENABLED sengaja false di smoke ini.
const localText = 'selamat pagi rekan, saya butuh waktu sepuluh menit';
const first = await call<{ text: string; provider: string; cacheHit: boolean }>('/v1/ai/tasks/translate_to_english', {
  method: 'POST',
  body: JSON.stringify({ text: localText, sourceLang: 'id', targetLang: 'en', stream: false }),
}, token);
check(
  'translate dijawab lane lokal (kamus/cache, bukan LLM)',
  first.data?.provider === 'local-dictionary' || first.data?.provider === 'none',
  first.data ?? first,
);

// 11. panggilan kedua dengan teks sama pasti jatuh ke cache
const second = await call<{ cacheHit: boolean }>('/v1/ai/tasks/translate_to_english', {
  method: 'POST',
  body: JSON.stringify({ text: localText, sourceLang: 'id', targetLang: 'en', stream: false }),
}, token);
check('hasil kedua datang dari cache', second.data?.cacheHit === true, second.data ?? second);

// 12. quota
const quota = await call<{ dayUsed: Record<string, number> }>('/v1/ai/quota', {}, token);
check('GET /v1/ai/quota mencatat pemakaian', (quota.data?.dayUsed['translate_to_english'] ?? 0) >= 2, quota.data ?? quota);

// 13. tanpa token -> 401 amplop
const anon = await call('/v1/profile');
check('tanpa token menghasilkan credential_missing', anon.code === 'credential_missing', anon.code);

// 14. validasi payload
const bad = await call('/v1/contents/batch', { method: 'POST', body: JSON.stringify({ items: [] }) }, token);
check('batch kosong ditolak validation_failed', bad.code === 'validation_failed', bad.code);

const summary = failures === 0 ? 'SMOKE OK' : 'SMOKE GAGAL: ' + String(failures) + ' pemeriksaan';
console.log('');
console.log(summary);
process.exit(failures === 0 ? 0 : 1);
