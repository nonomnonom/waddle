/**
 * Verifikasi HTTP QUERY (RFC 10008) terhadap API yang sedang berjalan.
 * Bukan unit test: membuktikan rantaian nyata — Node http → Express 5 → Nest →
 * SessionGuard → Zod → Postgres — dan header yang diwajibkan spesifikasi.
 *
 *   bun scripts/check-http-query.ts [baseUrl]
 *
 * Idempoten: setiap jalan memakai user + teks unik, jadi boleh dijalankan berulang.
 */
const BASE = process.argv[2] ?? process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';
const email = `query+${Date.now()}@waddle.test`;
const password = 'query-password-123';
const DIGEST = `query-${crypto.randomUUID()}`;

type Env<T> = { code: string; message?: string | null; data?: T };

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 200)}` : ''}`);
  if (!ok) failures += 1;
}

interface Raw {
  status: number;
  envelope: Env<unknown>;
  allow: string | null;
  cacheControl: string | null;
  allowMethods: string | null;
}

async function raw(path: string, init: RequestInit = {}, token?: string): Promise<Raw> {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type') && init.body !== undefined) headers.set('content-type', 'application/json');
  headers.set('x-request-id', crypto.randomUUID());
  headers.set('x-device-digest', DIGEST);
  if (token) headers.set('authorization', `Bearer ${token}`);
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const envelope = (await res.json().catch(() => ({ code: 'internal' }))) as Env<unknown>;
  return {
    status: res.status,
    envelope,
    allow: res.headers.get('allow'),
    cacheControl: res.headers.get('cache-control'),
    allowMethods: res.headers.get('access-control-allow-methods'),
  };
}

interface Page {
  items: { id: string; sourceText: string }[];
}

const stamp = Date.now();
const SUKA = `saya suka kopi tubruk ${stamp}`;
const RAPAT = `rapatnya diundur ke jam tiga ${stamp}`;
const PERSEN = `harga 100% asli ${stamp}`;
const DEKOI = `harga 100 ribu asli ${stamp}`;

// --- sesi + data uji -------------------------------------------------------
const su = await fetch(`${BASE}/api/auth/sign-up/email`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password, name: 'Query Tester' }),
}).then((r) => r.json());
const token: string | undefined = su?.token ?? su?.session?.token;
check('sign-up email menghasilkan sesi', Boolean(token), su?.user?.email);
if (!token) {
  console.log('\nberhenti: tanpa sesi tidak ada yang bisa diuji.');
  process.exit(1);
}

const batch = await raw(
  '/v1/contents/batch',
  { method: 'POST', body: JSON.stringify({ items: [SUKA, RAPAT, PERSEN, DEKOI].map((t, i) => ({ clientId: crypto.randomUUID(), sourceText: t, sourceLang: 'id', collectedAt: stamp + i * 1000, tzOffsetMinutes: -420 })) }) },
  token,
);
check('POST /v1/contents/batch menyimpan 4 fragmen', batch.envelope.code === 'ok', batch.envelope);

// --- QUERY dengan filter ---------------------------------------------------
const q = await raw('/v1/contents', { method: 'QUERY', body: JSON.stringify({ search: 'kopi' }) }, token);
const texts = ((q.envelope.data as Page | undefined)?.items ?? []).map((i) => i.sourceText);
check('QUERY dengan search hanya mengembalikan yang cocok', q.envelope.code === 'ok' && texts.length === 1 && texts[0] === SUKA, texts);
check('QUERY mengiklankan Allow: GET, HEAD, QUERY, OPTIONS', (q.allow ?? '').includes('QUERY'), q.allow);
check('QUERY menyatakan respons tidak boleh di-cache (§2.7)', q.cacheControl === 'private, no-store', q.cacheControl);

const persen = await raw('/v1/contents', { method: 'QUERY', body: JSON.stringify({ search: '100%' }) }, token);
const persenTexts = ((persen.envelope.data as Page | undefined)?.items ?? []).map((i) => i.sourceText);
check('tanda % di kata kunci diperlakukan literal, bukan wildcard', persenTexts.length === 1 && persenTexts[0] === PERSEN, persenTexts);

const gabung = await raw('/v1/contents', { method: 'QUERY', body: JSON.stringify({ search: 'kopi', from: '2000-01-01', limit: 5 }) }, token);
check('QUERY menerima kombinasi filter + limit', gabung.envelope.code === 'ok' && ((gabung.envelope.data as Page | undefined)?.items.length ?? 0) === 1, gabung.envelope.code);

// --- paritas dengan GET ----------------------------------------------------
const g = await raw('/v1/contents?search=kopi&limit=5', {}, token);
const getIds = ((g.envelope.data as Page | undefined)?.items ?? []).map((i) => i.id).sort();
const queryIds = ((q.envelope.data as Page | undefined)?.items ?? []).map((i) => i.id).sort();
check('GET dan QUERY atas kueri yang sama memberi hasil identik', JSON.stringify(getIds) === JSON.stringify(queryIds) && getIds.length === 1, { getIds, queryIds });
check('GET juga mengiklankan QUERY lewat Allow', (g.allow ?? '').includes('QUERY'), g.allow);

// --- penolakan sesuai §2.1 -------------------------------------------------
const tanpaCt = await raw('/v1/contents', { method: 'QUERY' }, token);
check('QUERY tanpa Content-Type ditolak 400', tanpaCt.status === 400 && tanpaCt.envelope.code === 'validation_failed', { status: tanpaCt.status, code: tanpaCt.envelope.code });

const salahCt = await raw('/v1/contents', { method: 'QUERY', headers: { 'content-type': 'text/plain' }, body: 'search=kopi' }, token);
check('QUERY dengan media type non-JSON ditolak 415', salahCt.status === 415, { status: salahCt.status, code: salahCt.envelope.code });

const kosong = await raw('/v1/contents', { method: 'QUERY', body: JSON.stringify({}) }, token);
check('QUERY dengan query-content kosong ditolak 400', kosong.status === 400, { status: kosong.status, message: kosong.envelope.message });

const salahFilter = await raw('/v1/contents', { method: 'QUERY', body: JSON.stringify({ search: 'kopi', limit: 9999 }) }, token);
check('QUERY memvalidasi skema yang sama seperti GET', salahFilter.status === 400 && salahFilter.envelope.code === 'validation_failed', { status: salahFilter.status, message: salahFilter.envelope.message });

const kosongSesuai = await raw('/v1/contents', { method: 'QUERY', body: JSON.stringify({ search: 'tidak-ada-frasa-ini' }) }, token);
check('QUERY atas kata kunci tak cocok menghasilkan daftar kosong, bukan error', kosongSesuai.status === 200 && (kosongSesuai.envelope.data as Page).items.length === 0, kosongSesuai.envelope.code);

// --- QUERY bukan alias serba-boleh ----------------------------------------
const batchViaQuery = await raw('/v1/contents/batch', { method: 'QUERY', body: JSON.stringify({ items: [] }) }, token);
check('rute tulis (batch) tidak menerima QUERY', batchViaQuery.status === 404, { status: batchViaQuery.status, code: batchViaQuery.envelope.code });

// --- CORS: preflight harus mengizinkan QUERY -------------------------------
// memakai origin web, bukan origin API: preflight hanya berarti kalau browser
// datang dari origin yang benar-benar kita izinkan
const webOrigin = process.env.CHECK_WEB_ORIGIN ?? 'http://localhost:4173';
const preflight = await fetch(`${BASE}/v1/contents`, {
  method: 'OPTIONS',
  headers: {
    origin: webOrigin,
    'access-control-request-method': 'QUERY',
    'access-control-request-headers': 'content-type,authorization,x-request-id,x-device-digest',
  },
});
const acam = preflight.headers.get('access-control-allow-methods');
check(`preflight CORS dari ${webOrigin} mengizinkan method QUERY`, preflight.status < 400 && (acam ?? '').includes('QUERY'), { status: preflight.status, methods: acam });

// --- registry AI tidak lagi memuat tugas Mandarin --------------------------
const tasks = await raw('/v1/ai/tasks', {}, token);
const codes = JSON.stringify(tasks.envelope.data);
check('registry tugas AI bebas dari translate_to_chinese', !codes.includes('translate_to_chinese'), codes.slice(0, 220));
const settings = await raw('/settings?channel=dev', {}, token);
check('release pengaturan dev terbaca (payload baru)', settings.status === 200, { status: settings.status, code: settings.envelope.code });

console.log('\n' + (failures === 0 ? 'QUERY OK' : 'QUERY GAGAL: ' + String(failures) + ' pemeriksaan'));
process.exit(failures === 0 ? 0 : 1);
