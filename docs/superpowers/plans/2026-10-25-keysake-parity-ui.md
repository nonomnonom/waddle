# Keysake-parity UI/UX (web, id→en) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membuat `apps/web` berperilaku seperti Keysake — preedit per-tekanan, panel kandidat multi-sel menempel caret, action bar 4 tugas, panel dwibahasa Shift+Space + bintang koleksi, Koleksi dengan kalender dan state penuh — di atas mesin kandidat yang benar-benar menghasilkan varian (id→en), tanpa memanggil LLM per ketikan.

**Architecture:** Semantik (morfologi, generator kandidat, state machine komposisi, matematika caret/halaman) hidup sebagai TypeScript murni di `packages/engine` sehingga bisa diuji tanpa DOM dan dipakai ulang oleh desktop/Android. `apps/web` hanya renderer: komponen presentasi yang membaca `Candidate[]` + `CompState`, dengan angka paritas (`pageSize`, `stabilityDelayMs`, `actionDeadlineMs`, urutan/ukuran font, copy layar) diambil dari rilis pengaturan server, bukan hardcode.

**Tech Stack:** TypeScript, Bun, Nx 24 + pnpm, React 19 + Vite 8, zod 4, jest (unit test murni), Postgres 16 + Drizzle, NestJS 11 (API tetap seperti sekarang), browser-use MCP untuk verifikasi UI nyata.

**Spec:** [docs/superpowers/specs/2026-10-25-keysake-parity-ui-design.md](../specs/2026-10-25-keysake-parity-ui-design.md)

## Global Constraints

- Jalur produk: **Indonesia → Inggris saja**. Tidak ada `translate_to_chinese`, tidak ada aksara CJK di `packages/*/src`, `apps/*/src`, `scripts`.
- Yang disalin dari Keysake = arsitektur layar/interaksi. **Dilarang** menyalin aset mereka (ikon/gambar dari `Assets.car`, font bawaan, string Mandarin).
- Tidak ada pemanggilan LLM pada jalur serving. Kamus/ kandidat = lokal. LLM hanya: aksi eksplisit user per klausa, dan top-up kamus offline (opsional, butuh `AI_API_KEY`).
- Angka paritas dari server: `engineLimits.pageSize = 9`, `engineLimits.stabilityDelayMs = 350`, `engineLimits.actionDeadlineMs = 3000`.
- Copy UI dalam bahasa Indonesia, padat, tanpa emoji sebagai ikon, tanpa `alert()`.
- Kontras teks ≥ 4.5:1, semua interaksi bisa keyboard, `prefers-reduced-motion` dihormati.
- Kamus: tidak memakai data GPL (rime-frost/rime-ice) dan tidak scraping sumber berhak cipta.
- Gate mutu engine (diukur, bukan diklaim): korpus probe 60 kalimat → **≥85% token dikenali** dan **≥70% kalimat selesai penuh** (baseline: 50,8% dan 1/15).
- Tidak ada dependensi npm baru tanpa kebutuhan nyata; tidak mengubah kontrak API yang sudah dipakai `smoke`/`check:query`.
- Setiap task diakhiri commit kecil. Semua hijau sebelum selesai: `nx run-many -t typecheck|lint|test|build`, `pnpm smoke` 15/15, `pnpm check:query` 18/18.

## File Structure

Dibuat:

- `packages/engine/src/lib/morphology.ts` — analisis imbuhan id (meN-, di-, ke-…-an, -kan, -an, -i, -nya/-ku/-mu, ter-, se-) → kandidat lemma.
- `packages/engine/src/lib/candidates.ts` — `CandidateEngine`: menghasilkan ≤`pageSize` varian berlabel sumber.
- `packages/engine/src/lib/composition.ts` — reducer state machine komposisi (pure).
- `packages/engine/src/lib/paging.ts` — matematika halaman kandidat + jendela caret-logis (pure, teruji).
- `packages/engine/src/lib/corpus.probe.ts` — 60 kalimat uji yang kita tulis sendiri (gerbang coverage).
- `packages/engine/src/data/glossary.core.ts` — kamus inti authored (lemma + frasa + sense + register).
- `packages/engine/src/data/glossary.overrides.ts` — koreksi kurasi, menang atas core/gen.
- `packages/engine/src/data/glossary.gen.ts` — slot hasil build LLM (kosong/`[]` kalau tidak ada kunci).
- `packages/engine/src/lib/{morphology,candidates,composition,paging}.spec.ts`, `corpus.spec.ts`
- `scripts/measure-coverage.ts` — angka coverage/avg-kandidat yang dicommit (menggantikan probe di `.rea/work`).
- `apps/web/src/components/TypingSurface.tsx`, `CandidatePanel.tsx`, `CandidateCell.tsx`, `ActionBar.tsx`, `FragmentPanel.tsx`, `CollectionRail.tsx`, `StatusBanner.tsx`, `DayStrip.tsx`
- `apps/web/src/lib/use-composition.ts` (jembatan reducer → React), `apps/web/src/lib/caret-rect.ts` (mirror-div; fallback eksplisit)
- `apps/web/src/lib/ui-copy.ts` (copy Indonesia + pembaca `copy` server)

Dimodifikasi:

- `packages/engine/src/lib/bilingual.ts` (`GlossaryRow` jadi 4-arity dengan opsi; sense lookup; `translateTokens` memakai morfologi)
- `packages/engine/src/lib/glossary-id-en.ts` (tetap, diimpor sebagai bagian core; tidak lagi satu-satunya sumber)
- `packages/engine/src/index.ts` (export baru; tetap tidak meng-export `mandarin/`)
- `packages/protocol/src/lib/settings.ts` (`display`: `englishFirst`, `fontPt`; `copy` dipakai)
- `packages/db/src/lib/seed.ts` (payload `display` + `copy` id)
- `apps/web/src/app/typing-view.tsx`, `collection-view.tsx`, `app.tsx`, `apps/web/src/styles.css`
- `docs/decisions.md`, `README.md`

---

## Task 1: Morfologi Indonesia → lemma

**Files:**
- Create: `packages/engine/src/lib/morphology.ts`
- Test: `packages/engine/src/lib/morphology.spec.ts`

**Interfaces:**
- Produces: `MorphGuess { surface: string; lemma: string; prefix: string; suffix: string; pattern: string }`, `analyzeWord(surface: string): MorphGuess[]` (urut, paling mungkin pertama, maksimum 4), `stripPunct(t: string): string`.

- [ ] **Step 1: Tulis failing test**

```ts
// packages/engine/src/lib/morphology.spec.ts
import { analyzeWord } from './morphology.js';

describe('morfologi id', () => {
  it('meN- melepas nasal sesuai pola dasar', () => {
    expect(analyzeWord('menolong').map((g) => g.lemma)).toContain('tolong');
    expect(analyzeWord('membaca').map((g) => g.lemma)).toContain('baca');
    expect(analyzeWord('pengajaran').map((g) => g.lemma)).toContain('ajar');
  });
  it('di- pasif dan -kan kausatif', () => {
    expect(analyzeWord('diundur').map((g) => g.lemma)).toContain('undur');
    expect(analyzeWord('kirimkan').map((g) => g.lemma)).toContain('kirim');
  });
  it('clitic orang dan partikel', () => {
    expect(analyzeWord('pesanmu').map((g) => g.lemma)).toContain('pesan');
    expect(analyzeWord('datangnya').map((g) => g.lemma)).toContain('datang');
  });
  it('mempertahankan bentuk asal sebagai opsi terakhir', () => {
    expect(analyzeWord('kopi').map((g) => g.lemma)).toContain('kopi');
  });
  it('tidak menghasilkan lemma kosong atau lebih dari 4', () => {
    for (const w of ['men','di','ke','-','','meNhancurkan']) {
      const g = analyzeWord(w);
      expect(g.length).toBeLessThanOrEqual(4);
      expect(g.every((x) => x.lemma.length > 0)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx nx run @waddle/engine:test --skip-nx-cache`
Expected: FAIL — `Cannot find module './morphology.js'`

- [ ] **Step 3: Implementasi**

```ts
// packages/engine/src/lib/morphology.ts
export interface MorphGuess { surface: string; lemma: string; prefix: string; suffix: string; pattern: string }

/** urutan penting: prefiks panjang dicoba lebih dulu (peng- > pe- > p-) */
const PREFIXES = ['peng','per','pen','pel','mem','men','meng','di','ke','se','ter','be','pe','p','m'] as const;
const SUFFIXES = ['kan','an','i','lah','kah','nya','ku','mu','tu'] as const;

/** peng-ajar→ajar; mem+baca→baca; men+tolong→tolong; p+eluk→peluk (k/p luluh) */
const MELASTS = new Set(['t','s','k','p']);

const stripPunct = (t: string): string => t.replace(/[^a-z0-9']/g, '');

export function analyzeWord(raw: string): MorphGuess[] {
  const surface = stripPunct(raw.toLowerCase());
  if (surface.length < 3) return [{ surface, lemma: surface || raw, prefix: '', suffix: '', pattern: 'base' }];
  const out: MorphGuess[] = [];
  const push = (lemma: string, prefix: string, suffix: string, pattern: string) => {
    if (lemma.length >= 2 && !out.some((g) => g.lemma === lemma)) out.push({ surface, lemma, prefix, suffix, pattern });
  };
  for (const pre of PREFIXES) {
    if (!surface.startsWith(pre)) continue;
    const rest = surface.slice(pre.length);
    // peluruhan: peng+ajar -> ajar (bukan ngajar), p+eluk -> peluk (tetap)
    push(rest, pre, '', 'prefix');
    if (pre === 'p' && 'aeiou'.includes(rest[0] ?? '')) push('p' + rest, 'p', '', 'prefix-p');
    if ((pre === 'mem' || pre === 'men' || pre === 'meng' || pre === 'peng') && rest && MELASTS.has(rest[0]) === false) push(rest, pre, '', 'prefix');
  }
  for (const suf of SUFFIXES) {
    if (!surface.endsWith(suf) || surface.length <= suf.length + 2) continue;
    const rest = surface.slice(0, -suf.length);
    push(rest, '', suf, 'suffix');
    if (suf === 'an' && rest.endsWith('p')) push(rest.slice(0, -1) + 'kan', '', 'kan', 'suffix-kan');
  }
  // gabungan prefiks+prefiks-klitik: anaknya -> anak
  for (const pre of ['di','ke','me','men','meng','peng']) {
    for (const suf of ['kan','an','nya']) if (surface.startsWith(pre) && surface.endsWith(suf) && surface.length > pre.length + suf.length + 2)
      push(surface.slice(pre.length, -suf.length), pre, suf, 'circum');
  }
  push(surface, '', '', 'base');
  return out.slice(0, 4);
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx nx run @waddle/engine:test --skip-nx-cache`
Expected: PASS 5 suites (termasuk spec baru)

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/lib/morphology.ts packages/engine/src/lib/morphology.spec.ts
git commit -m "feat(engine): analisis imbuhan indonesia untuk mencari lemma kamus"
```

---

## Task 2: Bentuk baris kamus v2 + data core authored

**Files:**
- Modify: `packages/engine/src/lib/glossary-id-en.ts` (tambah tipe 4-arity, jangan ubah baris lama)
- Create: `packages/engine/src/data/glossary.core.ts`
- Create: `packages/engine/src/data/glossary.overrides.ts`
- Create: `packages/engine/src/data/glossary.gen.ts`
- Test: `packages/engine/src/lib/glossary.spec.ts`

**Interfaces:**
- Produces: `type GlossaryOpts = { register?: 'neutral'|'formal'|'casual'; sense?: number; pos?: 'v'|'n'|'adj'|'adv'|'func' }`, `type GlossaryRow = [id: string, en: string, weight: number, opts?: GlossaryOpts]`, `GLOSSARY_CORE: GlossaryRow[]`, `GLOSSARY_OVERRIDES: GlossaryRow[]`, `GLOSSARY_GEN: GlossaryRow[]`, `mergedGlossary(): GlossaryRow[]` (overrides > gen > core, kunci = id ternormalisasi).

- [ ] **Step 1: Tulis failing test**

```ts
// packages/engine/src/lib/glossary.spec.ts
import { GLOSSARY_CORE, GLOSSARY_OVERRIDES, GLOSSARY_GEN, mergedGlossary } from '../data/glossary.core.js';
import { normalize } from './bilingual.js';

describe('kamus v2', () => {
  it('punya minimal 600 baris dan tidak duplikat', () => {
    expect(GLOSSARY_CORE.length).toBeGreaterThanOrEqual_600();
    const keys = GLOSSARY_CORE.map(([id]) => normalize(id));
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('setiap nilai inggris tidak kosong dan tidak sama dengan input', () => {
    for (const [id, en] of GLOSSARY_CORE) { expect(en.trim().length).toBeGreaterThan(0); expect(normalize(en)).not.toBe(normalize(id)); }
  });
  it('overrides mengalahkan core untuk id yang sama', () => {
    const dup = GLOSSARY_OVERRIDES[0];
    expect(mergedGlossary().find(([id]) => normalize(id) === normalize(dup[0]))?.[3]?.register).toBeDefined();
  });
});
```

Ganti `toBeGreaterThanOrEqual_600()` dengan `expect(GLOSSARY_CORE.length).toBeGreaterThanOrEqual(600)` saat menulis file (asserti custom tidak ada di jest).

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx nx run @waddle/engine:test --skip-nx-cache`
Expected: FAIL — modul `data/glossary.core.js` belum ada

- [ ] **Step 3: Tulis tipe baris + generator merge**

```ts
// packages/engine/src/lib/glossary-id-en.ts (ubah header tipe, baris lama tetap valid)
export type GlossaryOpts = { register?: 'neutral' | 'formal' | 'casual'; sense?: number; pos?: 'v' | 'n' | 'adj' | 'adv' | 'func' };
export type GlossaryRow = [string, string, number, GlossaryOpts?];
```

```ts
// packages/engine/src/data/glossary.overrides.ts
import type { GlossaryRow } from '../lib/glossary-id-en.js';
/** koreksi kurasi manusia; menang atas GLOSSARY_GEN dan GLOSSARY_CORE */
export const GLOSSARY_OVERRIDES: GlossaryRow[] = [
  ['bisa', 'can', 9000, { sense: 1, pos: 'func' }],
  ['bisa', 'able to', 4000, { sense: 2, pos: 'func' }],
];
```

```ts
// packages/engine/src/data/glossary.gen.ts
import type { GlossaryRow } from '../lib/glossary-id-en.js';
/**
 * Slot hasil build offline (scripts/build-glossary.ts). Kosong berarti belum
 * pernah dijalankan atau AI_API_KEY tidak tersedia - mesin tetap jalan.
 */
export const GLOSSARY_GEN: GlossaryRow[] = [];
```

```ts
// packages/engine/src/data/glossary.core.ts (potongan; isi lengkap ditulis di langkah 4)
import { ID_EN, type GlossaryRow } from '../lib/glossary-id-en.js';
import { GLOSSARY_GEN } from './glossary.gen.js';
import { GLOSSARY_OVERRIDES } from './glossary.overrides.js';
import { normalize } from '../lib/bilingual.js';

/** lemma高频 + frasa percakapan: inti jalur serving tanpa jaringan */
export const GLOSSARY_AUTHORED: GlossaryRow[] = [ /* langkah 4 */ ];

export const GLOSSARY_CORE: GlossaryRow[] = [...ID_EN as GlossaryRow[], ...GLOSSARY_AUTHORED];

export function mergedGlossary(): GlossaryRow[] {
  const byKey = new Map<string, GlossaryRow>();
  for (const row of [...GLOSSARY_CORE, ...GLOSSARY_GEN, ...GLOSSARY_OVERRIDES]) {
    const key = `${normalize(row[0])}#${row[3]?.sense ?? 0}`;
    byKey.set(key, row);
  }
  return [...byKey.values()].sort((a, b) => b[2] - a[2]);
}
```

- [ ] **Step 4: Tulis data authored (600+ baris), batch per 150**

Isi `GLOSSARY_AUTHORED` dalam 4 tahap commit-partial (agar tidak ada baris karangan): (a) 150 fungsi & kata tanya (`yang, di, ke, dari, dengan, untuk, karena, tapi, sudah, belum, akan, sedang, bisa, perlu, harus, mau, tidak, bukan, sangat, juga, lagi, masih, sana, sini, mana, kapan, siapa, mengapa, bagaimana, berapa`), (b) 200 verba高频 dengan `-kan/-an` (`tolong/bantu/beri/kirim/ubah/minta/izin/datang/pergi/panggil/UNDUR/selesaikan/bahas/setuju/tolak/maaf/terima/kasih/sayang/suka/butuh/pakai/coba/pilih/tunggu/lanjut/henti...`), (c) 150 nomina & waktu (`hari/besok/kemarin/minggu/bulan/tahun/jam/pagi/siang/sore/malam/uang/file/rapat/bos/rekan/rumah/jalan/makanan/kopi...`), (d) 100 frasa percakapan lengkap (`terima kasih banyak`, `maaf saya tidak sempat`, `bisa tolong kirim ulang`, `saya sedang di jalan`, `sampai jumpa besok`, `apa kabar`, `tolong panaskan lagi`...). Format tiap baris: `['<id>', '<en>', <weight 1..9999>, { pos?, sense?, register? }]`. Sense kedua untuk kata ambigu (`boleh` → may / allowed to; `butuh` → to need / needy).

- [ ] **Step 5: Jalankan test, pastikan lulus**

Run: `npx nx run @waddle/engine:test --skip-nx-cache`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src
git commit -m "feat(engine): bentuk baris kamus v2 + kamus inti authored (lemma, sense, register)"
```

---

## Task 3: CandidateEngine — panel 9 sel yang jujur

**Files:**
- Modify: `packages/engine/src/lib/bilingual.ts` (terima `mergedGlossary()`, sense lookup penuh, morfologi saat token tak cocok)
- Create: `packages/engine/src/lib/candidates.ts`
- Test: `packages/engine/src/lib/candidates.spec.ts`

**Interfaces:**
- Consumes: `PhraseBook`, `analyzeWord` (Task 1), `mergedGlossary` (Task 2)
- Produces: `type CandidateSource = 'phrase'|'sense'|'register'|'morph'|'partial'`, `interface Candidate { text: string; coverage: number; source: CandidateSource; score: number; unknownTokens: string[] }`, `class CandidateEngine { constructor(book?: PhraseBook); suggest(clause: string, limit?: number): Candidate[]; sources(clause: string): CandidateSource[] }`

- [ ] **Step 1: Tulis failing test**

```ts
// packages/engine/src/lib/candidates.spec.ts
import { CandidateEngine, type Candidate } from './candidates.js';

const eng = new CandidateEngine();
const run = (s: string, limit = 9): Candidate[] => eng.suggest(s, limit);

describe('CandidateEngine', () => {
  it('menghasilkan maksimal limit kandidat, tanpa sel kosong', () => {
    for (const s of ['selamat pagi', 'aku mau minta izin hari ini', 'x']) {
      const list = run(s);
      expect(list.length).toBeLessThanOrEqual(9);
      expect(list.every((c) => c.text.trim().length > 0)).toBe(true);
    }
  });
  it('muncul lebih dari satu varian untuk klausa dengan kata ambigu', () => {
    const list = run('saya bisa membantu');
    expect(list.length).toBeGreaterThan(1);
    expect(new Set(list.map((c) => c.source))).toContain('sense');
  });
  it('memakai morfologi supaya bentuk berimbuhan tetap punya terjemahan', () => {
    const list = run('rapatnya diundur');
    expect(list[0].text).toContain('moved');
    expect(list.map((c) => c.source)).toContain('morph');
  });
  it('menandai token tak dikenal, tidak pernah mengarang', () => {
    const list = run('zzzqqqq');
    expect(list[0].unknownTokens).toEqual(['zzzqqqq']);
    expect(list[0].text).toBe('[zzzqqqq]');
  });
  it('deterministik: input sama, urutan sama', () => {
    const a = JSON.stringify(run('tolong kirim ulang file itu'));
    const b = JSON.stringify(run('tolong kirim ulang file itu'));
    expect(a).toBe(b);
  });
  it('coverage 0..1 dan kandidat pertama selalu yang skor tertinggi', () => {
    const list = run('kopi ini sudah dingin');
    expect(list[0].coverage).toBeGreaterThanOrEqual(list[list.length - 1].coverage);
    for (const c of list) expect(c.coverage).toBeGreaterThanOrEqual(0) && expect(c.coverage).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx nx run @waddle/engine:test --skip-nx-cache`
Expected: FAIL — modul `./candidates.js` belum ada

- [ ] **Step 3: Implementasi**

```ts
// packages/engine/src/lib/candidates.ts
import { PhraseBook, normalize, tokenize, type GlossaryRow } from './bilingual.js';
import { mergedGlossary } from '../data/glossary.core.js';
import { analyzeWord } from './morphology.js';

export type CandidateSource = 'phrase' | 'sense' | 'register' | 'morph' | 'partial';
export interface Candidate { text: string; coverage: number; source: CandidateSource; score: number; unknownTokens: string[] }

export class CandidateEngine {
  private readonly book: PhraseBook;
  constructor(book: PhraseBook = new PhraseBook(mergedGlossary())) { this.book = book; }

  suggest(clause: string, limit = 9): Candidate[] {
    const raw = clause.replace(/\s+/g, ' ').trim();
    if (!raw) return [];
    const tokens = tokenize(raw);
    const out: Candidate[] = [];
    const push = (c: Candidate) => { if (c.text.trim() && !out.some((x) => x.text === c.text)) out.push(c); };

    const base = this.book.translateTokens(tokens);
    push({ text: base.parts.join(' '), coverage: cov(base), source: base.unknown.length ? 'partial' : 'phrase', score: 1 - cov(base) * 0.0 + base.parts.length / 1000, unknownTokens: base.unknown });

    // 1) sense kedua kata ambigu
    for (const t of tokens) for (const sense of this.book.sensesOf(t).slice(1, 3)) {
      const alt = this.substitute(tokens, t, sense.en);
      push({ ...alt, source: 'sense', score: alt.score - 0.02 });
    }
    // 2) register (casual/formal) dari sense bertanda
    for (const t of tokens) {
      const reg = this.book.sensesOf(t).find((e) => e.opts?.register && e.opts.register !== 'neutral');
      if (!reg) continue;
      const alt = this.substitute(tokens, t, reg.en);
      push({ ...alt, source: 'register', score: alt.score - 0.04 });
    }
    // 3) morfologi: token yang gagal -> coba lemma
    if (base.unknown.length) {
      const fixed = tokens.map((t) => (base.unknown.includes(t) ? this.morphFix(t) : { t, used: false }));
      if (fixed.some((f) => f.used)) {
        const parts = fixed.map((f) => f.en);
        const stillUnknown = fixed.filter((f) => !f.used).map((f) => f.t);
        push({ text: parts.join(' '), coverage: (tokens.length - stillUnknown.length) / tokens.length, source: 'morph', score: 0.5, unknownTokens: stillUnknown });
      }
    }
    return out.sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.min(limit, 9)));
  }

  private morphFix(token: string): { t: string; en?: string; used: boolean } {
    for (const g of analyzeWord(token)) {
      const hit = this.book.sensesOf(g.lemma)[0];
      if (hit) return { t: token, en: hit.en, used: true };
    }
    return { t: token, used: false };
  }
  private substitute(tokens: string[], target: string, replacement: string) {
    const swap = tokens.map((t) => (t === target ? replacement : this.enOf(t)));
    return { text: swap.join(' '), coverage: 1, score: 0.6, unknownTokens: [] as string[] };
  }
  private enOf(t: string): string { return this.book.sensesOf(t)[0]?.en ?? `[${t}]`; }
}
const cov = (b: { matched: number; total: number }): number => (b.total ? b.matched / b.total : 0);
```

Sesuaikan nama getter internal `PhraseBook` yang sudah ada (`sensesOf`, `translateTokens`) — jangan duplikasi logika max-match; tambahkan `opts` ke `PhraseEntry` agar register terbaca.

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx nx run @waddle/engine:test --skip-nx-cache`
Expected: PASS semua spec engine

- [ ] **Step 5: Update export publik**

```ts
// packages/engine/src/index.ts
export * from './lib/glossary-id-en.js';
export * from './lib/bilingual.js';
export * from './lib/morphology.js';
export * from './lib/candidates.js';
export * from './lib/paging.js'; // Task 5
```

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src
git commit -m "feat(engine): candidate engine multi-varian (phrase, sense, register, morfologi)"
```

---

## Task 4: Gerbang coverage — korpus probe + script pengukuran

**Files:**
- Create: `packages/engine/src/lib/corpus.probe.ts` (60 kalimat authored)
- Create: `scripts/measure-coverage.ts`
- Test: `packages/engine/src/lib/corpus.spec.ts`
- Modify: `package.json` (script `coverage:id-en`)

**Interfaces:**
- Produces: `PROBE_SENTENCES: string[]` (60), `CoverageReport { tokenPct: number; fullSentences: number; total: number; avgCandidates: number; topUnknown: [string, number][] }`, `measure(engine: CandidateEngine, sentences: string[]): CoverageReport`

- [ ] **Step 1: Tulis failing test gerbang**

```ts
// packages/engine/src/lib/corpus.spec.ts
import { CandidateEngine } from './candidates.js';
import { measure, PROBE_SENTENCES } from './corpus.probe.js';

describe('gerbang mutu kamus id->en', () => {
  it('korpus punya 60 kalimat unik dan semuanya bahasa Indonesia', () => {
    expect(PROBE_SENTENCES.length).toBe(60);
    expect(new Set(PROBE_SENTENCES).size).toBe(60);
  });
  it('>=85% token dikenali dan >=70% kalimat selesai penuh', () => {
    const r = measure(new CandidateEngine(), PROBE_SENTENCES);
    expect(r.tokenPct).toBeGreaterThanOrEqual(85);
    expect(r.fullSentences).toBeGreaterThanOrEqual(Math.ceil(PROBE_SENTENCES.length * 0.7));
  });
  it('mesin rata-rata memberi >2 kandidat per klausa', () => {
    expect(measure(new CandidateEngine(), PROBE_SENTENCES).avgCandidates).toBeGreaterThan(2);
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal (data belum cukup)**

Run: `npx nx run @waddle/engine:test --skip-nx-cache`
Expected: FAIL pada angka gerbang — inilah bukti nyata kemajuan kamus; catat `tokenPct` yang muncul.

- [ ] **Step 3: Implementasi `corpus.probe.ts`**

```ts
import type { CandidateEngine } from './candidates.js';
export const PROBE_SENTENCES: string[] = [ /* 60 kalimat authored: kerja, keluarga, pesan singkat, kafe, jalan, cuaca */ ];
export interface CoverageReport { tokenPct: number; fullSentences: number; total: number; avgCandidates: number; topUnknown: [string, number][] }
export function measure(engine: CandidateEngine, sentences: string[]): CoverageReport {
  let tokens = 0, known = 0, full = 0, cands = 0;
  const unknown = new Map<string, number>();
  for (const s of sentences) {
    const list = engine.suggest(s, 9);
    const top = list[0];
    if (!top) continue;
    cands += list.length;
    const tks = s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    tokens += tks.length;
    known += tks.length - top.unknownTokens.length;
    if (top.unknownTokens.length === 0) full++;
    for (const u of top.unknownTokens) unknown.set(u, (unknown.get(u) ?? 0) + 1);
  }
  return {
    tokenPct: Math.round((known / Math.max(1, tokens)) * 1000) / 10,
    fullSentences: full, total: sentences.length,
    avgCandidates: Math.round((cands / Math.max(1, sentences.length)) * 10) / 10,
    topUnknown: [...unknown.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20),
  };
}
```

- [ ] **Step 4: Tambah kamus sampai gerbang lulus**

Perbaiki dengan data, bukan menurunkan gerbang: gunakan `topUnknown` sebagai antrean kerja, tambahkan baris ke `glossary.core.ts` (atau `glossary.overrides.ts` untuk sense/register), lalu ulangi langkah 2. Ulangi sampai kedua angka gerbang lulus. Kalau setelah 3 iterasi mentok di <85%, tulis di `docs/decisions.md` angka tercapai + alasan + usulan jalur LLM (jangan sembunyikan).

- [ ] **Step 5: Tulis script laporan + sambungkan ke root script**

```ts
// scripts/measure-coverage.ts
import { CandidateEngine } from '@waddle/engine';
import { PROBE_SENTENCES, measure } from '@waddle/engine';
const r = measure(new CandidateEngine(), PROBE_SENTENCES);
console.log(`token ${r.tokenPct}% | kalimat penuh ${r.fullSentences}/${r.total} | kandidat ${r.avgCandidates}`);
console.log('unknown teratas:', r.topUnknown.map(([t, n]) => `${t}×${n}`).join(', '));
```

```jsonc
// package.json (tambah satu baris di "scripts")
"coverage:id-en": "bun scripts/measure-coverage.ts"
```

- [ ] **Step 6: Jalankan keduanya**

Run: `npx nx run @waddle/engine:test --skip-nx-cache && bun scripts/measure-coverage.ts`
Expected: PASS + satu baris angka, mis. `token 88.4% | kalimat penuh 46/60 | kandidat 3.6`

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src scripts/measure-coverage.ts package.json
git commit -m "test(engine): gerbang coverage korpus 60 kalimat + script pengukuran"
```

---

## Task 5: State machine komposisi + halaman kandidat (pure)

**Files:**
- Create: `packages/engine/src/lib/composition.ts`
- Create: `packages/engine/src/lib/paging.ts`
- Test: `packages/engine/src/lib/composition.spec.ts`, `packages/engine/src/lib/paging.spec.ts`

**Interfaces:**
- Produces: `CompState { buffer: string; caret: number; clause: string; page: number; chosen: number | null; panelOpen: boolean; pending: 'idle'|'thinking'|'ready' }`, `type CompAction = { type:'insert'|'backspace'|'moveCaret'|'pickIndex'|'pickCurrent'|'cancel'|'nextPage'|'prevPage'|'togglePanel'|'settle'|'reset'; ... }`, `initialComp(limits: EngineLimits): CompState`, `reduceComp(state, action, engine): CompState`, `pageInfo(candidates: Candidate[], page: number, pageSize: number): { items: Candidate[]; page: number; pages: number }`

- [ ] **Step 1: Tulis failing test**

```ts
// packages/engine/src/lib/composition.spec.ts
import { CandidateEngine } from './candidates.js';
import { initialComp, reduceComp } from './composition.js';

const limits = { maxCandidates: 9, pageSize: 9, maxPreeditChars: 64, stabilityDelayMs: 350, actionDeadlineMs: 3000 };
const eng = new CandidateEngine();
const s0 = initialComp(limits);
const type = (s: typeof s0, t: string) => reduceComp(s, { type: 'insert', text: t }, eng);

describe('komposisi IME-like', () => {
  it('menyimpan teks dancaret saat mengetik', () => {
    const s = type(s0, 'selamat pagi');
    expect(s.buffer).toBe('selamat pagi');
    expect(s.caret).toBe(11);
  });
  it('klausa aktif = pecah pada tanda baca/newline', () => {
    const s = type(s0, 'selamat pagi, rapatnya');
    expect(s.clause).toBe('rapatnya');
  });
  it('angka 1..9 memilih kandidat pada halaman', () => {
    const s = type(s0, 'saya bisa membantu');
    const picked = reduceComp(s, { type: 'pickIndex', index: 1 }, eng);
    expect(picked.chosen).not.toBe(null);
  });
  it('spasi mengambil kandidat teratas, Esc membatalkan', () => {
    const s = type(s0, 'selamat pagi');
    expect(reduceComp(s, { type: 'pickCurrent' }, eng).chosen).not.toBe(0);
    expect(reduceComp(s, { type: 'cancel' }, eng).panelOpen).toBe(false);
  });
  it('halaman bergeser dan tidak pernah keluar rentang', () => {
    let s = type(s0, 'saya bisa membantu besok pagi');
    s = reduceComp(s, { type: 'nextPage' }, eng);
    expect(s.page).toBeGreaterThanOrEqual(0);
    s = reduceComp(s, { type: 'prevPage' }, eng);
    expect(s.page).toBeGreaterThanOrEqual(0);
  });
  it('buffer dibatasi maxPreeditChars', () => {
    const long = 'a'.repeat(limits.maxPreeditChars + 40);
    expect(type(s0, long).buffer.length).toBeLessThanOrEqual(limits.maxPreeditChars);
  });
});
```

```ts
// packages/engine/src/lib/paging.spec.ts
import { pageInfo } from './paging.js';
const c = (t: string) => ({ text: t, coverage: 1, source: 'phrase' as const, score: 1, unknownTokens: [] });
const many = Array.from({ length: 13 }, (_, i) => c('k' + i));

it('memotong halaman sesuai pageSize dan membulatkan nomor halaman', () => {
  expect(pageInfo(many, 0, 9).items.length).toBe(9);
  expect(pageInfo(many, 1, 9).items.map((x) => x.text)).toEqual(['k9','k10','k11','k12']);
  expect(pageInfo(many, 99, 9).page).toBe(1);
  expect(pageInfo(many, -1, 9).page).toBe(0);
  expect(pageInfo(many, 0, 9).pages).toBe(2);
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx nx run @waddle/engine:test --skip-nx-cache`
Expected: FAIL — modul belum ada

- [ ] **Step 3: Implementasi `paging.ts` lalu `composition.ts`**

```ts
// packages/engine/src/lib/paging.ts
import type { Candidate } from './candidates.js';
export function pageInfo(items: Candidate[], page: number, pageSize: number) {
  const size = Math.max(1, Math.min(pageSize, 9));
  const pages = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(Math.max(0, Math.trunc(page || 0)), pages - 1);
  return { items: items.slice(p * size, p * size + size), page: p, pages };
}
```

```ts
// packages/engine/src/lib/composition.ts
import type { CandidateEngine, Candidate } from './candidates.js';
import { pageInfo } from './paging.js';

export interface CompLimits { pageSize: number; maxPreeditChars: number; stabilityDelayMs: number; actionDeadlineMs: number }
export interface CompState { buffer: string; caret: number; clause: string; page: number; chosen: string | null; panelOpen: boolean; pending: 'idle' | 'thinking' | 'ready' }
export type CompAction =
  | { type: 'insert'; text: string } | { type: 'backspace' } | { type: 'moveCaret'; caret: number }
  | { type: 'pickIndex'; index: number } | { type: 'pickCurrent' } | { type: 'cancel' }
  | { type: 'nextPage' } | { type: 'prevPage' } | { type: 'togglePanel' } | { type: 'settle' } | { type: 'reset' };

const CLAUSE_SPLIT = /[.,!?;:\n\r\t]+/;
export function clauseAt(buffer: string, caret: number): string {
  const before = buffer.slice(0, caret);
  const idx = Math.max(...[...before.matchAll(new RegExp(CLAUSE_SPLIT, 'g'))].map((m) => (m.index ?? 0) + m[0].length), -1);
  return before.slice(idx + 1 > before.length ? before.length : Math.max(idx, 0)).trim();
}
export const initialComp = (limits: CompLimits): CompState => ({ buffer: '', caret: 0, clause: '', page: 0, chosen: null, panelOpen: true, pending: 'idle' });

export function reduceComp(state: CompState, action: CompAction, engine: CandidateEngine): CompState {
  const next: CompState = { ...state };
  switch (action.type) {
    case 'insert': {
      const merged = (state.buffer.slice(0, state.caret) + action.text + state.buffer.slice(state.caret)).slice(0, state.buffer.length + action.text.length);
      next.buffer = merged.slice(0, state.max ?? Number.MAX_SAFE_INTEGER);
      next.caret = Math.min(state.caret + action.text.length, next.buffer.length);
      break;
    }
    case 'backspace':
      if (state.caret > 0) { next.buffer = next.buffer || state.buffer; next.buffer = state.buffer.slice(0, state.caret - 1) + state.buffer.slice(state.caret); next.caret = state.caret - 1; }
      break;
    case 'moveCaret': next.caret = Math.max(0, Math.min(action.caret, state.buffer.length)); break;
    case 'nextPage': case 'prevPage': next.page = state.page + (action.type === 'nextPage' ? 1 : -1); break;
    case 'togglePanel': next.panelOpen = !state.panelOpen; break;
    case 'cancel': next.panelOpen = false; break;
    case 'settle': next.pending = 'ready'; break;
    case 'reset': return initialComp({ ...limitsOf(state), pageSize: 9 } as never);
    case 'pickIndex': case 'pickCurrent': {
      const list = engine.suggest(clauseOf(next), 9);
      const i = action.type === 'pickCurrent' ? 0 : action.index + pageInfo(list, state.page, 9).page * 9;
      const chosen = list[Math.max(0, Math.min(i, list.length - 1))];
      if (chosen) next.chosen = chosen.text;
      break;
    }
  }
  next.clause = clauseAt(next.buffer, next.caret);
  next.page = pageInfo(engine.suggest(next.clause, 9), next.page, 9).page;
  return next;
}
const limitsOf = (_s: CompState) => ({ pageSize: 9, maxPreeditChars: 64, stabilityDelayMs: 350, actionDeadlineMs: 3000 });
const clauseOf = (s: CompState) => s.clause;
```

Saat implementasi: jangan tiru potongan di atas mentah-mentah kalau ada field aneh (`state.max`, `limitsOf`) — bersihkan menjadi state tanpa field hantu; `maxPreeditChars` disimpan di `CompState.limits` sejak awal. Test di langkah 1 adalah kontraknya.

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx nx run @waddle.engine:test` → `npx nx run @waddle/engine:test --skip-nx-cache`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src
git commit -m "feat(engine): state machine komposisi + halaman kandidat (pure, teruji)"
```

---

## Task 6: Kontrak display & copy datang dari server

**Files:**
- Modify: `packages/protocol/src/lib/settings.ts`
- Modify: `packages/db/src/lib/seed.ts`
- Test: `packages/protocol/src/lib/protocol.spec.ts`

**Interfaces:**
- Produces: `SettingsPayloadSchema.display: { englishFirst: boolean; fontPt: 12|14|16|18 }`, `SettingsPayloadSchema.copy: Record<locale, Record<key, string>>` (sudah ada — sekarang diisi), kunci copy: `banner.fetching`, `banner.refresh`, `banner.failed`, `empty.day`, `empty.collection`, `empty.search`, `quota.hit`, `deadline.hit`, `panel.hint`, `action.translate`, `action.paraphrase`, `action.references`, `action.explain`, `collect.saved`, `collect.translationSoon`.

- [ ] **Step 1: Tulis failing test**

```ts
it('display punya default Keysake-like dan copy.locale terbaca', () => {
  const p = SettingsPayloadSchema.parse({ schemaVersion: 1, version: 1, flags: {}, engineLimits: {} });
  expect(p.display).toEqual({ englishFirst: true, fontPt: 14 });
  expect(p.copy.id['banner.fetching']).toBeTruthy();
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx nx run @waddle/protocol:test --skip-nx-cache`
Expected: FAIL

- [ ] **Step 3: Tambah skema + seed**

```ts
// packages/protocol/src/lib/settings.ts
export const CandidateDisplaySchema = z.object({
  /** Keysake punya opsi 调换候选词的中英文上下顺序 — kita pakai urutan inggris di atas */
  englishFirst: z.boolean().default(true),
  /** konvensi Keysake: 磅 12/14/16/18 */
  fontPt: z.union([z.literal(12), z.literal(14), z.literal(16), z.literal(18)]).default(14),
});
// di SettingsPayloadSchema: display: CandidateDisplaySchema.default({ englishFirst: true, fontPt: 14 }),
// copy sudah ada sebagai record-of-record default {}
```

```ts
// packages/db/src/lib/seed.ts (payload dev)
display: { englishFirst: true, fontPt: 14 },
copy: {
  id: {
    'banner.fetching': 'Sedang mengambil koleksi…',
    'banner.refresh': 'Koleksi diperbarui.',
    'banner.failed': 'Gagal mengambil koleksi.',
    'empty.day': 'Tidak ada di tanggal ini.',
    'empty.collection': 'Belum ada yang disimpan. Koleksi muncul per tanggal sesuai waktu kamu mengetik.',
    'empty.search': (t: string) => ... // tetap string polos: 'Tidak ada yang cocok.'
    'quota.hit': 'Kuota harian habis.',
    'deadline.hit': 'Melewati batas waktu server.',
    'panel.hint': 'Angka 1-9 memilih · Spasi mengambil · Esc menutup',
    'action.translate': 'Terjemahkan', 'action.paraphrase': 'Parafrase', 'action.references': 'Rujukan', 'action.explain': 'Jelaskan',
    'collect.saved': 'Tersimpan di koleksi.',
    'collect.translationSoon': 'Tersimpan, terjemahan menyusul.',
  },
},
```

`copy` bertipe string → string: isi nilai string statis (tanpa fungsi).

- [ ] **Step 4: Jalankan test protocol + seed DB, pastikan lulus**

Run: `npx nx run @waddle/protocol:test --skip-nx-cache && DATABASE_URL='postgres://waddle:waddle@localhost:5433/waddle' bun packages/db/src/bin/seed.ts && curl -s localhost:3000/settings | head -c 200`
Expected: PASS; seed ok; `/settings` menjawab `code":"ok"` dengan `display` di payload

- [ ] **Step 5: Commit**

```bash
git add packages/protocol packages/db/src/lib/seed.ts
git commit -m "feat(protocol): display (urutan/ukuran font kandidat) + copy UI dari server"
```

---

## Task 7: Jembatan React (`useComposition`) + caret anchor

**Files:**
- Create: `apps/web/src/lib/use-composition.ts`
- Create: `apps/web/src/lib/caret-rect.ts`
- Create: `apps/web/src/lib/settings-cache.ts` (baca `/settings` sekali, expose `engineLimits`/`display`/`copy`)
- Test: logika caret yang pure dipindah ke `packages/engine/src/lib/paging.spec.ts` (sudah ada); `caret-rect.ts` diverifikasi di Task 9 lewat browser

**Interfaces:**
- Consumes: `reduceComp`, `initialComp`, `CandidateEngine`, `pageInfo`, settings cache (Task 6)
- Produces: `useComposition(): { state: CompState; candidates: Candidate[]; view: { items: Candidate[]; page: number; pages: number }; onKey(e: KeyboardEvent): boolean; commitText(): string; open: boolean; toggle(): void; caretRect(): DOMRect | null }`, `caretRectFrom(el: HTMLElement, offset: number): DOMRect | null`

- [ ] **Step 1: Tulis hook**

```ts
// apps/web/src/lib/use-composition.ts (kerangka wajib, implementasi lengkap di task ini)
import { useCallback, useMemo, useRef, useState } from 'react';
import { CandidateEngine, initialComp, pageInfo, reduceComp, type CompState } from '@waddle/engine';
import { useSettings } from './settings-cache.js';
import { caretRectFrom } from './caret-rect.js';

export function useComposition(getEditor: () => HTMLElement | null) {
  const limits = useSettings();
  const engine = useMemo(() => new CandidateEngine(), []);
  const [state, setState] = useState<CompState>(() => initialComp(limits.engineLimits));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const candidates = useMemo(() => engine.suggest(state.clause, 9), [state.clause, engine]);
  const view = useMemo(() => pageInfo(candidates, state.page, limits.engineLimits.pageSize), [candidates, state.page, limits]);

  // settle() menunda perhitungan sampai stabilityDelayMs -> state.pending 'thinking'|'ready'
  // onKey(): '1'..'9' saat panel terbuka = pickIndex (return true untuk preventDefault),
  //          ' ' = pickCurrent, 'Escape' = cancel, 'ArrowRight/Left' = prev/next page,
  //          karakter lain = insert dari beforeinput, lalu settle()
  return { state, candidates, view, limits, settle, onKey, caretRect: () => (getEditor() ? caretRectFrom(getEditor()!, state.caret) : null) };
}
```

- [ ] **Step 2: Tulis caret-rect dengan fallback eksplisit**

```ts
// apps/web/src/lib/caret-rect.ts
/** Posisi caret = rect character di offset; kalau browser tidak memberi rect (mis. string kosong),
 *  fallback ke rect elemen; kembalikan null HANYA bila keduanya nihil, agar UI bisa menyembunyikan panel. */
export function caretRectFrom(el: HTMLElement, offset: number): DOMRect | null {
  const sel = window.getSelection();
  const range = document.createRange();
  const node = textNodeAt(el, offset);
  if (node && sel) {
    range.setStart(node.node, node.offset); range.collapse(true);
    const r = range.getBoundingClientRect();
    if (r.width || r.height || r.x || r.y) return r;
  }
  const own = el.getBoundingClientRect();
  return own.width ? own : null;
}
```

- [ ] **Step 3: Build web tanpa error**

Run: `npx nx run web:build`
Expected: sukses (belum ada consumer — itu Task 8)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib
git commit -m "feat(web): jembatan state machine komposisi + jangkar caret dengan fallback"
```

---

## Task 8: TypingSurface + CandidatePanel + ActionBar (inti layar ketik)

**Files:**
- Create: `apps/web/src/components/TypingSurface.tsx`, `CandidatePanel.tsx`, `CandidateCell.tsx`, `ActionBar.tsx`
- Modify: `apps/web/src/app/typing-view.tsx` (susun ulang jadi komposisi; hapus `use-assist` lama bila menjadi redundan), `apps/web/src/lib/api.ts` (helper `uiCopy(key)`)
- Modify: `apps/web/src/styles.css` (blok `.panel`, `.cell`, `.bar`, `.badge`; skala font 12/14/16/18)

**Interfaces:**
- Consumes: `useComposition` (Task 7), `Settings` display/copy (Task 6), `POST /v1/ai/tasks/:task` dan `POST /v1/contents/batch` (kontrak tidak berubah)
- Produces: `TypingView` lama tetap punya props `{ signedIn, onSaved }` supaya `app.tsx` tidak berubah

- [ ] **Step 1: Panel kandidat (presentasi murni)**

```tsx
// apps/web/src/components/CandidatePanel.tsx
export function CandidatePanel(props: {
  items: { text: string; coverage: number; source: CandidateSource; unknownTokens: string[] }[];
  page: number; pages: number; englishFirst: boolean; fontPt: number; open: boolean; loading: boolean;
  style: { top: number; left: number }; onPick(i: number): void; onPage(d: -1 | 1): void; onClose(): void;
}) {
  if (!props.open) return null;
  return (
    <div className="panel" role="listbox" aria-label="Kandidat terjemahan" style={props.style} data-loading={props.loading ? '1' : undefined}>
      <ul>{props.items.map((c, i) => <CandidateCell key={i} index={i} {...c} englishFirst={props.englishFirst} fontPt={props.fontPt} onPick={props.onPick} />)}</ul>
      <footer>
        {props.pages > 1 && <><button onClick={() => props.onPage(-1)}>‹</button><span>{props.page + 1}/{props.pages}</span><button onClick={() => props.onPage(1)}>›</button></>}
        <span className="hint">{uiCopy('panel.hint')}</span>
        <button onClick={props.onClose} aria-label="Tutup panel">×</button>
      </footer>
    </div>
  );
}
```

`CandidateCell`: baris besar = teks kandidat (Inggris), baris kecil = klausa Indonesia + badge sumber (`sense`/`morph`/`register`/`partial`) + persen coverage; angka indeks di kiri sebagai affordance keyboard; kelas `.unknown` untuk sel berisi `[token]` (jangan disembunyikan — itu jujur).

- [ ] **Step 2: Surface contenteditable**

`TypingSurface`: `contentEditable`, `onBeforeInput` → `insert`/`backspace` action, `onKeyDown` → `useComposition.onKey` (kalau `true`, `preventDefault`), sinkronkan `state.caret` dari selection, panggil `settle()` dengan `stabilityDelayMs`, posisi panel dari `caretRect()`. Sediakan `role="textbox" aria-multiline="true"` + label Indonesia.

- [ ] **Step 3: Action bar 4 tugas + deadline + kuota**

```tsx
const TASKS = ['translate_to_english', 'paraphrase', 'find_supporting_references', 'explain_correction'] as const;
// tiap tombol: disabled=!clause, busy saat pending; AbortController.timeout(limits.engineLimits.actionDeadlineMs)
// hasil: panel bawah (text/references), kegagalan -> <StatusBanner code message retryAfterMs>; kuota -> uiCopy('quota.hit')
```

- [ ] **Step 4: Build + typecheck + lint**

Run: `npx nx run web:build && npx nx run-many -t typecheck lint -p web @waddle/engine`
Expected: hijau

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): layar ketik IME-like dengan panel kandidat menempel caret dan action bar 4 tugas"
```

---

## Task 9: Verifikasi browser sesi 1 (sebelum lanjut)

- [ ] **Step 1: Jalankan API + preview** (bun `apps/api/dist/main.js` dengan env dev; `vite preview --port 4173`), tunggu `Mapped {/v1/contents, QUERY}`.
- [ ] **Step 2: Login akun uji** lewat tab Akun (pakai akun yang sudah dibuat `scripts/ui-setup` atau sign-up baru).
- [ ] **Step 3: Ketik `saya bisa membantu besok pagi`**, lalu baca DOM: jumlah sel kandidat yang muncul (laporkan angka sebenarnya, target ≥3), badge sumber yang tampil, apakah angka `2` mengganti kandidat, apakah Spasi mengambil, apakah Esc menutup panel.
- [ ] **Step 4: Shift+Space** → `FragmentPanel` muncul dengan pasangan id/en + bintang; tekan bintang → toast "Tersimpan di koleksi." dan item muncul di rail Koleksi.
- [ ] **Step 5: Matikan API (`Stop-Process`), reload** → panel kandidat **tetap** bekerja (kamus lokal), banner offline muncul, aksi AI menampilkan failed banner. Nyalakan lagi, klik retry.
- [ ] **Step 6: Catat hasil + screenshot** ke `docs/superpowers/plans/artifacts/` (folder baru) atau lampirkan di laporan akhir.

Run contoh: `bun scripts/check-http-query.ts` harus tetap 18/18 sesudah semua perubahan web (API tidak berubah kontraknya).

---

## Task 10: FragmentPanel + toast batas + "terjemahan menyusul"

**Files:**
- Create: `apps/web/src/components/FragmentPanel.tsx`
- Modify: `apps/web/src/app/typing-view.tsx`, `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `state.clause`, kandidat teratas, `POST /v1/contents/batch` (1 item), envelope `code`/`action`/`retryAfterMs`
- Produces: `FragmentPanel(props: { clause, en, provider, collected, busy, onCollect, onClose, limitMessage? })`

- [ ] **Step 1: Komponen** — header klausa Indonesia, badan terjemahan Inggris + badge lane, bintang (SVG inline, `aria-pressed`), tombol tutup, toast bila `code==='duplicate'` → "Sudah tersimpan" dan `quota_exceeded`/`retryAfterMs` → `uiCopy('quota.hit')` + waktu reset. Saat `translation` kosong → `uiCopy('collect.translationSoon')` (padanan `中文已收藏，译文待补充`).
- [ ] **Step 2: Toggle Shift+Space** di `useComposition.onKey` → `togglePanel` (sudah ada action), mount FragmentPanel di kanan-bawah surface.
- [ ] **Step 3: Build + commit**

```bash
git add apps/web
git commit -m "feat(web): fragment panel dwibahasa dengan bintang kolektor dan toast batas"
```

---

## Task 11: CollectionRail + DayStrip + 5 state + banner

**Files:**
- Create: `apps/web/src/components/CollectionRail.tsx`, `DayStrip.tsx`, `StatusBanner.tsx`
- Modify: `apps/web/src/app/collection-view.tsx` (pakai komponen baru; query tetap lewat `apiQuery`), `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `apiQuery<Page>('/v1/contents', {from,to,search,limit})`, `daysWithData`, `Fragment.translation`
- Produces: `<CollectionRail state='idle|loading|ready|empty|failed' …>`; `StatusBanner` dipakai juga oleh Task 8/12

- [ ] **Step 1: StatusBanner**

```tsx
export type BannerKind = 'loading' | 'refresh' | 'failed' | 'quota' | 'session';
export function StatusBanner({ kind, message, onRetry }: { kind: BannerKind; message: string; onRetry?: () => void }) {
  return <p className={`banner ${kind}`} role={kind === 'failed' ? 'alert' : 'status'}>
    <span>{message}</span>{onRetry && <button className="ghost" onClick={onRetry}>Coba lagi</button>}</p>;
}
```

- [ ] **Step 2: Rail + kalender** — day-strip horizontal dari `daysWithData` (tanggal dengan isi saja; hari kosong tampil non-aktif, bukan lenyap), klik hari memfilter (`from=to=hari`), baris item = id/en + badge provider + tombol hapus dengan konfirmasi inline (bukan `window.confirm`). Empty state memakai copy server; failed state menyimpan pesan + retry, dan menampilkan `retryClientIds` sebagai "N item perlu dikirim ulang".
- [ ] **Step 3: Pertahankan pencarian QUERY** (jangan balik ke GET) dan `limit` dari settings (`pageSize * 11` cukup untuk 100; jangan hardcode angka aneh — pakai `Math.min(200, limits.pageSize * 11)`).
- [ ] **Step 4: Build + verifikasi browser seperti Task 9 langkah 4-5, lalu commit**

```bash
git add apps/web
git commit -m "feat(web): collection rail dengan day-strip, state penuh, dan banner retry"
```

---

## Task 12: App shell: sesi, offline, copy server, aksesibilitas

**Files:**
- Modify: `apps/web/src/app/app.tsx` (status offline dari `/healthz`, `action==='reauthenticate'` → pindah tab Akun, muat settings untuk `copy/display/engineLimits`), `apps/web/src/lib/settings-cache.ts`, `apps/web/src/styles.css`
- [ ] **Step 1:** muat `/settings` sekali saat mount; ekspos lewat context agar komponen lain tidak memanggil ulang.
- [ ] **Step 2:** interceptor error tunggal: `ApiError.action==='reauthenticate'` → `notify('Sesi berakhir, masuk lagi ya.')` + pindah tab.
- [ ] **Step 3:** keyboard-only walkthrough: tab order surface → panel → action bar → rail; `:focus-visible` terlihat; `aria-live="polite"` untuk toast/banner.
- [ ] **Step 4:** kontras: cek tiap fg/bg baru ≥4.5 (pakai skrip cek kontras yang sudah ada di skill antislop-human atau `node -e` hitung); `prefers-reduced-motion` mematikan animasi panel.
- [ ] **Step 5: Build + commit** `git commit -m "feat(web): shell app menyedikan copy/display dari server + state sesi dan offline"`

---

## Task 13: Regresi penuh + laporan terukur

- [ ] **Step 1:** `npx nx run-many -t typecheck lint test build` (5 project) — hijau.
- [ ] **Step 2:** `pnpm smoke` (15/15) + `pnpm check:query` (18/18).
- [ ] **Step 3:** `bun scripts/measure-coverage.ts` → catat angka akhir; bandingkan baseline (50,8% / 1 dari 15 / kandidat 1,0).
- [ ] **Step 4:** jalankan ulang walkthrough browser Task 9 dan simpan bukti (tangkapan layar + angka sel kandidat).
- [ ] **Step 5:** update `docs/decisions.md` (kenapa kamus authored+gen, gerbang coverage, telemetri token default mati) dan `README.md` (perintah baru `pnpm coverage:id-en`).
- [ ] **Step 6:** commit terakhir + laporan ke user berisi tabel sebelum/sesudah dan apa yang belum.

---

## Task 14 (opsional, TIDAK dikerjakan tanpa persetujuan): top-up kamus via LLM + celah telemetri

Hanya bila: (a) user memberi `AI_API_KEY`, (b) user menyetujui `POST /v1/lexicon/gaps` + tabel `unknown_token_counts`. Isinya: `scripts/build-glossary.ts` (batch 40 baris, checkpoint `.rea/work/glossary-checkpoint.json`, biaya terukur $0,095/12.000 baris), migrasi drizzle satu tabel, dan endpoint pelaporan token. Tanpa persetujuan ini, Task 1-13 tetap berdiri sendiri sebagai produk.

## Self-review plan (sudah kuperiksa)

- Cakupan spec: §2 arsitektur → Task 5,7,8; §3 mesin kandidat → Task 1-3; §4 kamus + gerbang → Task 2,4,14; §5 peta layar → Task 8,10,11; §6 state/error → Task 8,11,12; §7 mutu visual → Task 8,11,12; §8 verifikasi → Task 9,13; §10 risiko → caret fallback Task 7, gerbang <85% → Task 4 langkah 4, telemetri → Task 14 bergerbang. Tidak ada requirement spec yang tanpa task.
- Placeholder: tidak ada "TBD"; potongan kode Task 5 eksplisit menyatakan field hantu harus dibersihkan dan test adalah kontraknya.
- Konsistensi tipe: `Candidate`, `CandidateEngine.suggest(clause, limit)`, `CompState/CompAction/reduceComp/initialComp`, `pageInfo(items, page, pageSize)`, `uiCopy(key)`, `StatusBanner(kind,message,onRetry)` dipakai dengan nama sama di task berikutnya.
