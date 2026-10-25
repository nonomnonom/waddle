# Catatan keputusan

## 2026-10-25 — v1: Indonesia → Inggris, web dulu

**Keputusan.** Versi pertama hanya jalur `id → en`, hanya permukaan **web** (apps/web + apps/api),
tanpa keyboard sistem, tanpa Rime, tanpa Mandarin.

**Alasan.** Riset terhadap Keysake (`docs/keysake-research/`) menunjukkan nilai produknya ada di
"lihat bahasa Inggris dari yang kamu tulis, lalu simpan". Bagian itu bisa dibuktikan di browser
dalam hitungan hari. Sebaliknya, keyboard sistem menuntut Swift/Objective-C (macOS) atau Kotlin (Android)
— itu bukan kerja TypeScript dan tidak bisa dihindari dengan library apa pun.

**Konsekuensi.**
- Engine Mandarin dipindah ke `packages/engine/src/mandarin/` dan **tidak di-export** dari
  `@waddle/engine`. Ia tetap teruji (`engine.spec.ts` masih jalan) supaya bisa dipakai lagi kalau kita
  membuka pasar Mandarin, tapi tidak ada satu pun jalur produk yang bisa memanggilnya tanpa sengaja.
- Yang dipakai v1: `BilingualAssist` + `PhraseBook` (kamus frasa id→en di `glossary-id-en.ts`, kami susun sendiri).
- Kontrak API sudah memuat `lane` (`local` | `remote`) dan registry tugas dari DB, jadi menambah jalur
  Mandarin atau provider lain tidak mengubah bentuk API.
- Kode tugas `translate_to_chinese` di DB **dinonaktifkan, bukan dihapus** (`enabled = false`), karena
  `ai_results.task` dan `task_prompt_versions.task` menunjuk ke baris itu. `AiTaskCodeSchema` tidak lagi
  memuat kodenya, jadi rute AI menolak permintaan tersebut walau barisnya masih ada.

## 2026-10-25 — HTTP QUERY (RFC 10008) dipakai untuk pencarian koleksi

**Keputusan.** `GET /v1/contents` tetap ada; di sampingnya dipasang `QUERY /v1/contents` dengan body
JSON `{ from?, to?, cursor?, search?, limit? }`. Web memakai jalur QUERY untuk daftar + pencarian.

**Terukur dulu, baru dipakai.** Rantaian dukungan diverifikasi satu-satu, bukan diasumsikan:

| Lapisan | Versi | Bukti |
|---|---|---|
| `@nestjs/common` | 11.2.8 | punya `RequestMethod.QUERY` dan decorator `@QueryMethod()` (dicek juga terhadap salinan registry lewat jsDelivr, jadi bukan patch lokal) |
| `@nestjs/core` | 11.2.8 | `RouterMethodFactory` memetakan QUERY → `'query'`; log startup mencetak `Mapped {/v1/contents, QUERY} route` |
| express + router | 5.2.1 / 2.2.0 | `app.query` ada; uji langsung: `QUERY /probe` 200 dengan body terparse, `GET /probe` di path yang sama tetap jalan |
| Node | 24.18.0 | `http.METHODS` memuat `QUERY` |
| browser/CORS | — | preflight harus mendaftarkan method; `enableCors` kami beri `methods: [... 'QUERY']` dan `allow` ikut di-`exposedHeaders` |

Yang TIDAK disediakan framework: §2.1 (content-type wajib dan harus cocok) dan header wajib. Express
membiarkan body `text/plain` lolos sebagai `undefined`, jadi aturan itu ditegakkan sendiri di
`apps/api/src/common/http-query.ts` → 400 tanpa Content-Type, 415 untuk media type non-JSON, 400 untuk
query-content kosong. §2.7 minta kunci cache ikut berisi isi kueri; cache HTTP umum belum bisa, jadi
respons QUERY kami kirim `Cache-Control: private, no-store` plus `Allow: GET, HEAD, QUERY, OPTIONS`.

**Batas yang dijaga.** QUERY itu aman dan idempoten, jadi hanya rute baca yang boleh menerimanya.
Rute tulis tetap POST/DELETE — dan itu kami buktikan: `QUERY /v1/contents/batch` menjawab 404.

**Cara menjalankan:** `pnpm check:query` (18 pemeriksaan end-to-end terhadap API yang sedang jalan).

## 2026-10-25 — dua bug yang hanya muncul di browser, ketahuan waktu memverifikasi QUERY

**1) Sign-in dari web kena 403.** `bun scripts/smoke-api.ts` selalu lulus karena curl/fetch skrip
tidak mengirim header `Origin` yang berbeda dari API. better-auth punya pemeriksaan origin sendiri
(`api/middlewares/origin-check`) dan menolak dengan 403 — ini Lapisan yang berbeda dari CORS, jadi
`enableCors` yang benar pun tidak menolong. Perbaikan: `CORS_ORIGINS` sekarang satu-satunya sumber
kebenaran dan dipakai dua tempat lewat `originList(env)` — CORS di main.ts dan `trustedOrigins` di
`createAuth`. Kalau keduanya berbeda, gejalanya membingungkan: preflight lolos, sign-in ditolak.
Gerbang regresinya: pemeriksaan ke-2b di smoke (sign-in dengan `Origin: http://localhost:4200`
harus < 403) plus pengecekan manual `curl -H 'origin: http://evil.example'` → 403.

**2) Banner "API belum terjangkau" selalu muncul untuk user yang belum masuk.** Klien web memakai
`/v1/ping` sebagai pemeriksaan keterjangkauan, padahal rute itu sengaja berguard sesi (fungsinya
sinkron jam + membuktikan token). Untuk pengunjung tanpa sesi jawabannya 401, dan UI membacanya sebagai API mati.
Perbaikan: probe pindah ke `/healthz` (publik, sekaligus memeriksa Postgres). `/v1/ping` tetap dipakai
di tombol "Uji koneksi" pada halaman Akun, di sana sesi memang ada.

**Pelajaran yang diambil:** verifikasi web tidak boleh berhenti pada "halaman mengembalikan 200".
Sekarang alur login → koleksi → cari dijalankan lewat browser nyata (`scripts/check-http-query.ts`
meniru permintaannya, tapi negara bagian React hanya bisa dibuktikan di browser).

**Catatan RFC 9535 (sintaks query string).** Spec ini juga "baru" (Feb 2024) tapi tidak diadopsi
Express/qs; diukur dengan `qs@6.16.1` dan parser bawaan Express 5 (`'simple'` = `node:querystring`):
persis satu penyimpangan yang terlihat, yaitu `+` didekode jadi spasi sementara RFC 9535 meminta `+`
harus tetap `+`. Kasus lain cocok: `a` tanpa `=` menjadi string kosong, `;` literal bukan separator,
`a[b]=c` tetap key literal di mode simple, `a=b=c` utuh, pair kosong di-skip, tanpa prototype pollution.
Kita tidak menukar parser sekarang: perubahan itu mengubah makna URL yang sudah dipakai klien. Nilai
filter kosong justru kami tangani di skema (`emptyMeansAbsent`), jadi `?from&to=` tidak lagi error.

## Stack yang dipilih (dan kenapa)

| Bagian | Pilihan | Alasan singkat |
|---|---|---|
| Runtime monorepo | Nx 24 + pnpm + Bun | Nx punya project graph/cache; Bun cepat untuk skrip, migrasi, dan menjalankan bundel API |
| API | NestJS 11 + Express | struktur modul + DI bikin batas domain jelas; ekosistem auth/AI SDK lengkap |
| Auth | better-auth (drizzle adapter, Postgres) | kita butuh token opaque yang bisa dicabut (desktop/mobile), multi-perangkat, dan rotasi; bukan JWT panjang umur |
| DB | Postgres 16 + Drizzle | constraint nyata (dedup unik, PK majemuk) adalah fiturnya, bukan catatan |
| AI | Vercel AI SDK (`ai` + `@ai-sdk/openai-compatible`) | provider-agnostic + streaming; router lane ditulis sendiri, bukan dipakai dari framework agen |
| Web | React 19 + Vite | SPA statis, gampang deploy ke mana saja |

## Aturan lane AI (terpenting, jangan sampai kabur nanti)

1. Kamus lokal dulu (`local-dictionary`), baru LLM. Terjemahan biasa tidak boleh keluar biaya.
2. Cache bersama sebelum keduanya (`ai_result_cache`, key = task|model|promptVersion|targetLang|input ternormalisasi).
3. L2 (LLM) hanya kalau `AI_REMOTE_ENABLED` + kunci tersedia; tanpa itu server **degradasi**, bukan error 500.
4. Referasi/`文献` pakai retrieval nyata (Crossref dsb.), tidak pernah kutipan dari memori model.
5. Semua jalur punya `deadlineMs` dan dibatalkan saat input berubah.

## Known gap yang sengaja dibiarkan (bukan lupa)

- `punch-through` tanda `[token]` untuk kata di luar kamus: sekarang ikut tampil di hasil; nanti ditutup
  oleh lane remote atau kamus yang lebih besar.
- Lane remote belum diuji dengan kunci asli (sengaja: `AI_REMOTE_ENABLED=false` di smoke).
- Apple Sign-In belum dipakai; email+password cukup untuk web launch.
- Rate limiter per-IP belum dipasang (quota per-user/tugas sudah).
- Worker hard-delete akun & purge cache TTL belum ada (kolomnya sudah disiapkan).
