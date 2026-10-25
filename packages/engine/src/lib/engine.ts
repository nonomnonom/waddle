import { Dictionary, type Entry } from './dictionary.js';
import { fuzzyVariants, segment } from './segment.js';
import { UserDict } from './user-dict.js';
import {
  DEFAULT_ENGINE_OPTIONS,
  type Candidate,
  type Composition,
  type EngineEvents,
  type EngineOptions,
  type EngineSnapshot,
  type KeyPress,
  type KeyResult,
} from './types.js';

export interface StepResult {
  result: KeyResult;
  commit: string | null;
  snapshot: EngineSnapshot;
}

const PAGE_KEYS = new Set(['Page_Up', 'Page_Down', '-', '=', 'ArrowLeft', 'ArrowRight']);

/**
 * Mesin input dwibahasa (Fase A: murni TypeScript).
 *
 * Kontrak yang membuat mesin ini bisa dipindah ke native/WASM nanti:
 *  - murni: tidak menyentuh DOM, Electron, jaringan, atau filesystem;
 *  - deterministik: hasil hanya bergantung pada input + options + user dict;
 *  - terjemahan TIDAK dihitung di sini — engine memanggil `events.needTranslations`
 *    lalu menunggu `applyTranslations()` (lane on-device atau remote).
 */
export class InputEngine {
  private raw = '';
  private page = 0;
  private candidates: Candidate[] = [];
  private syllables: string[] = [];
  private options: EngineOptions;

  constructor(
    private readonly dict: Dictionary = new Dictionary(),
    private readonly userDict: UserDict = new UserDict(),
    options: Partial<EngineOptions> = {},
    private readonly events: Partial<EngineEvents> = {},
  ) {
    this.options = { ...DEFAULT_ENGINE_OPTIONS, ...options };
  }

  setOptions(patch: Partial<EngineOptions>): void {
    this.options = { ...this.options, ...patch };
    if (this.raw) this.recompute();
  }

  get currentOptions(): EngineOptions {
    return { ...this.options };
  }

  /** Tombol alfabet & khusus. Return commit bila ada teks yang harus disuntik. */
  processKey(kp: KeyPress): StepResult {
    if (this.options.mode === 'latin' && !isEditingKey(kp)) {
      return this.step('ignored', null);
    }

    const ch = kp.key;

    if (ch === 'Escape') {
      this.reset();
      return this.step('cancelled', null);
    }

    if (ch === 'BackSpace') {
      if (this.raw.length === 0) return this.step('ignored', null);
      this.raw = this.raw.slice(0, -1);
      this.recompute();
      return this.step(this.raw ? 'composing' : 'consumed', null);
    }

    if (ch === 'Delete') {
      this.reset();
      return this.step('cancelled', null);
    }

    if (/^[a-züv]$/i.test(ch)) {
      if (this.raw.length >= this.options.maxPreeditChars) return this.step('ignored', null);
      this.raw += ch.toLowerCase();
      this.recompute();
      return this.step('composing', null);
    }

    if (ch === ' ') {
      if (this.candidates.length === 0) return this.step('ignored', null);
      return this.pick(0);
    }

    if (/^[1-9]$/.test(ch)) {
      const idx = this.page * this.options.pageSize + (Number(ch) - 1);
      if (idx < this.candidates.length) return this.pick(idx);
      return this.step('ignored', null);
    }

    if (PAGE_KEYS.has(ch)) {
      if (this.candidates.length === 0) return this.step('ignored', null);
      const pages = Math.max(1, Math.ceil(this.candidates.length / this.options.pageSize));
      const dir = ch === 'Page_Down' || ch === '=' || ch === 'ArrowRight' ? 1 : -1;
      this.page = (this.page + dir + pages) % pages;
      return this.step('page-changed', null);
    }

    if (ch === "'") {
      // pemisah suku kata: tidak disimpan, segmenter sudah menanganinya
      return this.step(this.raw ? 'composing' : 'ignored', null);
    }

    if (ch === 'Enter') {
      if (this.raw.length === 0) return this.step('ignored', null);
      const commit = this.raw; // commit mentah, sama seperti IME pada umumnya
      this.reset();
      return this.step('candidate-selected', commit);
    }

    return this.step('ignored', null);
  }

  /** Memilih kandidat pada index absolut (dipakai klik mouse di panel). */
  select(index: number): StepResult {
    if (index < 0 || index >= this.candidates.length) return this.step('ignored', null);
    return this.pick(index);
  }

  /** Suntik terjemahan dari lane lokal/remote ke kandidat yang masih relevan. */
  applyTranslations(map: Record<string, string>): void {
    let changed = false;
    for (const c of this.candidates) {
      const t = map[c.text];
      if (t && c.translation !== t) {
        c.translation = t;
        changed = true;
      }
    }
    if (changed) this.candidates.sort((a, b) => rank(b) - rank(a));
  }

  snapshot(): EngineSnapshot {
    const composition: Composition | null = this.raw
      ? {
          raw: this.raw,
          syllables: this.syllables,
          preedit: this.syllables.join("'"),
          cursorIndex: this.raw.length,
          candidates: this.visible(),
          page: this.page,
          pageCount: Math.max(1, Math.ceil(this.candidates.length / this.options.pageSize)),
          pageSize: this.options.pageSize,
        }
      : null;

    return {
      mode: this.options.mode,
      composing: this.raw.length > 0,
      composition,
      commit: null,
      options: { ...this.options },
    };
  }

  reset(): void {
    this.raw = '';
    this.page = 0;
    this.candidates = [];
    this.syllables = [];
  }

  /** Kandidat yang terlihat di halaman aktif. */
  visible(): Candidate[] {
    const start = this.page * this.options.pageSize;
    return this.candidates.slice(start, start + this.options.pageSize);
  }

  /** Teks kandidat yang perlu diterjemahkan (belum punya terjemahan). */
  pendingTranslationRequests(): string[] {
    return this.visible().filter((c) => !c.translation && c.kind !== 'action').map((c) => c.text);
  }

  private step(result: KeyResult, commit: string | null): StepResult {
    const snapshot = this.snapshot();
    if (result === 'composing' || result === 'page-changed') {
      if (this.pendingTranslationRequests().length > 0) this.events.needTranslations?.(this.visible());
    }
    return { result, commit, snapshot };
  }

  private pick(index: number): StepResult {
    const candidate = this.candidates[index];
    if (!candidate) return this.step('ignored', null);
    this.userDict.record(candidate.text, this.syllablesFor(candidate));
    if (candidate.kind === 'ai') this.events.aiSelected?.(candidate);
    const commit = candidate.text;
    this.reset();
    return this.step('candidate-selected', commit);
  }

  private syllablesFor(candidate: Candidate): string[] {
    const entry = findEntry(this.dict, candidate.text, this.syllables);
    if (entry) return entry.syllables;
    const joined = this.syllables.join(' ');
    return joined ? joined.split(/\s+/) : [];
  }

  private recompute(): void {
    const paths = segment(this.raw, 3);
    const best = paths[0]?.syllables ?? [];
    this.syllables = best;
    this.page = 0;

    const scored = new Map<string, Candidate>();

    const addEntry = (entry: Entry, pathSyllables: string[], consumed: number, base: number) => {
      const freq = Math.log1p(entry.freq) / 10;
      const boost = this.userDict.boost(entry.hanzi, entry.syllables);
      const cover = consumed / Math.max(1, pathSyllables.length);
      const score = base + freq * 0.6 + boost * 0.9 + cover * 0.4;
      const prev = scored.get(entry.hanzi);
      if (!prev || prev.score < score) {
        scored.set(entry.hanzi, {
          text: entry.hanzi,
          score,
          kind: entry.syllables.length > 1 ? 'word' : 'char',
          comment: entry.syllables.join(' '),
          translation: prev?.translation,
        });
      }
    };

    for (const path of paths) {
      const base = path === paths[0] ? 0.25 : 0;
      const windows = this.dict.lookupWindow(path.syllables);
      for (const w of windows) addEntry(w.entry, path.syllables, w.consumed, base);

      // gabungan dua kata yang menutupi seluruh jalur (contoh: 项目 + 评审)
      for (const w of windows) {
        const rest = path.syllables.slice(w.consumed);
        if (!rest.length) continue;
        for (const w2 of this.dict.lookupWindow(rest)) {
          if (w.consumed + w2.consumed !== path.syllables.length) continue;
          const hanzi = w.entry.hanzi + w2.entry.hanzi;
          const score =
            base +
            (Math.log1p(w.entry.freq + w2.entry.freq) / 10) * 0.9 +
            this.userDict.boost(hanzi, path.syllables);
          const prev = scored.get(hanzi);
          if (!prev || prev.score < score) {
            scored.set(hanzi, {
              text: hanzi,
              score,
              kind: 'word',
              comment: path.syllables.join(' '),
              translation: prev?.translation,
            });
          }
        }
      }
    }

    // koreksi fuzzy dari path terbaik (mis. user mengetik "zuo" maksud "zhuo")
    const bestPath = paths[0];
    if (bestPath) {
      const fuzzyHits: Entry[] = [];
      bestPath.syllables.forEach((syl, i) => {
        for (const v of fuzzyVariants(syl, this.options.fuzzyPairs)) {
          const alt = [...bestPath.syllables];
          alt[i] = v;
          for (let len = Math.min(4, alt.length); len >= 1; len--) {
            for (let j = 0; j + len <= alt.length; j++) {
              fuzzyHits.push(...this.dict.lookup(alt.slice(j, j + len)));
            }
          }
        }
      });
      for (const e of fuzzyHits) {
        const prev = scored.get(e.hanzi);
        const score = 0.1 + Math.log1p(e.freq) / 10;
        if (!prev || prev.score < score) {
          scored.set(e.hanzi, {
            text: e.hanzi,
            score,
            kind: 'word',
            comment: `${e.syllables.join(' ')}?`,
            translation: prev?.translation,
          });
        }
      }
    }

    // frasa yang sering dipakai user, dicocokkan sebagian
    for (const ue of this.userDict.entries()) {
      const joined = ue.syllables.join('');
      if (joined.startsWith(this.raw) || this.raw.startsWith(joined)) {
        const prev = scored.get(ue.hanzi);
        const score = 0.5 + this.userDict.boost(ue.hanzi, ue.syllables);
        if (!prev || prev.score < score) {
          scored.set(ue.hanzi, {
            text: ue.hanzi,
            score,
            kind: 'user',
            comment: ue.syllables.join(' '),
            translation: prev?.translation,
          });
        }
      }
    }

    this.candidates = [...scored.values()].sort((a, b) => rank(b) - rank(a)).slice(0, this.options.maxCandidates);
    if (this.pendingTranslationRequests().length > 0) {
      queueMicrotask(() => this.events.needTranslations?.(this.visible()));
    }
  }
}

function rank(c: Candidate): number {
  return c.score + (c.translation ? 0.05 : 0);
}

function isEditingKey(kp: KeyPress): boolean {
  return ['BackSpace', 'Delete', 'Enter', 'Escape'].includes(kp.key);
}

function findEntry(dict: Dictionary, hanzi: string, syllables: string[]): Entry | undefined {
  return dict.lookup(syllables).find((h) => h.hanzi === hanzi);
}
