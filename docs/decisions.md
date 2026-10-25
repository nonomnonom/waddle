# Catatan keputusan

## 2026-10-25 — v1: Indonesia → Inggris, web dulu

**Keputusan.** Versi pertama hanya jalur `id → en`, hanya permukaan **web** (apps/web + apps/api),
tanpa keyboard sistem, tanpa Rime, tanpa Mandarin.

**Alasan.** Riset terhadap Keysake (`docs/keysake-research/`) menunjukkan nilai produknya ada di
"lihat bahasa Inggris dari yang kamu tulis, lalu simpan". Bagian itu bisa dibuktikan di browser
dalam hitungan hari. Sebaliknya, keyboard sistem menuntut Swift/Objective-C (macOS) atau Kotlin (Android)
— itu bukan kerja TypeScript dan tidak bisa dihindari dengan library apa pun.

**Konsekuensi.**
- Engine Mandarin (`packages/engine`: segmentasi suku kata, kamus Rime, filter Lua) tetap di repo sebagai
  kode teruji, tapi tidak dipakai jalur v1. Ia jadi fase berikutnya kalau kita memang mau pasar Mandarin.
- Yang dipakai v1: `BilingualAssist` + `PhraseBook` (kamus frasa id→en di `glossary-id-en.ts`, kami susun sendiri).
- Kontrak API sudah memuat `lane` (`local` | `remote`) dan registry tugas dari DB, jadi menambah jalur
  Mandarin atau provider lain tidak mengubah bentuk API.

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
