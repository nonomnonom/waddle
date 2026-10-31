# Waddle

Workspace **kosong** — scaffold monorepo Nx + pnpm saja, belum ada project di dalamnya.

- Monorepo: **Nx 24** + **pnpm 10** (`packageManager: pnpm@10.33.0`), default branch `master`.
- Dependensi root tinggal `nx` — toolchain lain (TypeScript, ESLint, Jest, Prettier, Vite, bundler) belum dipasang karena belum ada project yang memakainya.

## Layout workspace

`pnpm-workspace.yaml` menerima dua pola, jadi project bisa ditaruh di dua level:

```yaml
packages:
  - 'packages/*'      # packages/db
  - 'packages/*/*'    # packages/<grup>/<nama>, mis. packages/apps/api
```

Semua project yang menyusul dirancang masuk ke `packages/**/**`.

## Menjalankan

```bash
pnpm install           # pasang dependensi + build script native nx
pnpm nx show projects  # daftar project (sekarang kosong)
```

## Menambah project

```bash
pnpm nx g @nx/js:lib packages/core/mylib --importPath=@waddle/mylib
```

Generator `@nx/*` belum terpasang — pasang dulu plugin yang dibutuhkan, misal
`pnpm add -Dw @nx/js`, sebelum menjalankannya.

## File sisa yang belum dibersihkan

Konfigurasi berikut masih menunjuk plugin/package yang sudah tidak terpasang
dan baru relevan lagi saat project ditambahkan:

- `eslint.config.mjs` → `@nx/eslint-plugin`
- `jest.config.ts`, `jest.preset.js` → `@nx/jest`
- `tsconfig.base.json`, `tsconfig.json` → `typescript`
- `.prettierrc`, `.prettierignore` → `prettier`
