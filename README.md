# Waddle

Produk: **ketik bahasa Indonesia, lihat bahasa Inggrisnya, simpan yang menarik**. v1 berupa web app + API;
keyboard sistem (desktop/mobile) menyusul setelah web berjalan dan terbukti berguna.

- Monorepo: Nx 24 + pnpm 10 (`apps/*`, `packages/*`), TypeScript 6 strict, Prettier, scope impor `@waddle/*`.
- Backend: NestJS 11 dijalankan dengan **Bun**; Postgres 16 + **Drizzle**; auth dengan **better-auth**; AI lewat **Vercel AI SDK** (lane remote mati secara default).
- Frontend: React 19 + Vite.
- Spesifikasi lengkap: [docs/keysake-research/blueprint/README.md](./docs/keysake-research/blueprint/README.md);
  hasil reverse engineering yang mendasarinya: [keysake-architecture.md](./docs/keysake-research/keysake-architecture.md);
  keputusan v1: [docs/decisions.md](./docs/decisions.md).

## Jalankan

```bash
cp .env.example .env      # isi BETTER_AUTH_SECRET (>=32 char) dan DATABASE_URL
pnpm install
pnpm db:up                # Postgres 16 di localhost:5433 lewat docker compose
pnpm db:migrate && pnpm db:seed

pnpm dev:api              # NestJS di :3000 (dijalankan dengan Bun)
pnpm dev:web              # Vite di :4200
pnpm smoke                # 15 pemeriksaan end-to-end: auth -> origin trust -> perangkat -> koleksi -> lane AI
pnpm check:query          # 18 pemeriksaan HTTP QUERY (RFC 10008): header, validasi, paritas GET, CORS
```

Verifikasi penuh (typecheck + test + build semua project):

```bash
pnpm verify
```

## Project

| Project | Peran |
|---|---|
| `apps/web` | SPA React 19 + Vite — permukaan yang kita luncurkan lebih dulu (tulis, koleksi, akun) |
| `apps/api` | NestJS 11 — auth (better-auth), koleksi, statistik, pengaturan berversi, AI gateway |
| `packages/protocol` | skema zod + amplop respons + Typing Action Protocol; dipakai api dan web |
| `packages/db` | skema Drizzle, migrasi, seed, pabrik instance better-auth |
| `packages/engine` | mesin input murni TS: kamus frasa id→en + `BilingualAssist` (dipakai); mesin pinyin Mandarin ada di `src/mandarin/` dan tidak di-export |

## Keputusan penting

Baca [docs/decisions.md](./docs/decisions.md). Ringkasnya: v1 hanya **Indonesia → Inggris** di **web**;
Lane AI berurutan *cache → kamus lokal → LLM*, dan LLM mati secara default (`AI_REMOTE_ENABLED=false`).
Pencarian koleksi memakai metode **HTTP QUERY (RFC 10008)** — kueri duduk di body, `GET /v1/contents`
tetap dilayani untuk klien lama dan keduanya memberi hasil yang sama.

## Yang tidak masuk repo

`D:\waddle\.rea\` (hasil reverse engineering, bukti mentah, skrip analisis) dan `D:\waddle\rea-work\`
(proyek + pseudocode Ghidra) sengaja di-gitignore: artefak riset kompetitor tidak ikut ke dalam source produk.

## Rencana terdekat

1. `pnpm nx g @nx/js:lib packages/protocol --importPath=@waddle/protocol` — schema Tipi
   "Typing Action Protocol" (04 §7) + fixture NDJSON.
2. `pnpm nx g @nx/node:app packages/api` — implementasi kontrak [03-api-contract.md](./docs/keysake-research/blueprint/03-api-contract.md)
   dengan validasi dari [openapi.yaml](./docs/keysake-research/blueprint/openapi.yaml).
3. Spike Swift/macOS untuk H1 (install per-user tanpa admin) dan H2 (latensi `TranslationSession`) — tidak
   dibangun di Nx, tapi hasil dan angka benchmark-nya dicatat di `docs/decisions.md`.
