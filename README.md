# Waddle

Nx workspace untuk produk **input method dwibahasa + aksi generatif saat mengetik** (macOS + backend).
Rancangan lengkapnya ada di [docs/](./docs/README.md); dasar risetnya:
[keysake-architecture.md](./docs/keysake-research/keysake-architecture.md).

## Workspace

- Nx v24, preset `ts`, pnpm 10, `packages/*` (lihat `pnpm-workspace.yaml`), TypeScript 6 strict, Prettier.
- Scope impor: `@waddle/*` (`package.json` name `@waddle/source`).
- Target yang sudah aktif dari plugin `@nx/js/typescript`: `typecheck`, `build`, `build-deps`, `watch-deps`.
- Belum ada project — keputusan pertama (spike H1/H2 di [08-build-plan-mvp.md](./docs/keysake-research/blueprint/08-build-plan-mvp.md)) menentukan bentuknya.

## Perintah

```bash
pnpm nx version              # versi Nx lokal
pnpm nx show projects        # daftar project (kosong sampai generator pertama)
pnpm nx graph --file=nx-graph.json
pnpm nx format:write
pnpm nx run-many -t typecheck
```

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
