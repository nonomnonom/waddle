/**
 * Tipe mesin input. Sengaja tidak ada dependensi ke Electron/Nest:
 * engine ini dipakai proses desktop (in-process), worker (via bridge), dan test.
 */

export const ENGINE_PROTOCOL = 'waddle.engine/1';

export interface KeyPress {
  /** karakter yang sudah diproses layout keyboard, mis. "n", atau nama tombol khusus */
  key: string;
  code?: string;
  shift?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  meta?: boolean;
  /** true kalau aplikasi target sedang punya selection/teks aktif (untuk aksi AI) */
  readonly?: boolean;
}

export type KeyResult =
  | 'ignored'
  | 'composing'
  | 'consumed'
  | 'candidate-selected'
  | 'page-changed'
  | 'mode-changed'
  | 'cancelled';

/** Satu kandidat. `translation` diisi lane lokal (on-device) atau remote. */
export interface Candidate {
  /** teks yang akan disuntik */
  text: string;
  /** komentar di sisi kandidat (mis. pinyin balik / note) */
  comment?: string;
  /** padanan bahasa Inggris, ditampilkan di baris kedua */
  translation?: string;
  /** skor internal 0..1, untuk debugging & urutan */
  score: number;
  kind: 'word' | 'char' | 'user' | 'action' | 'ai';
  /** untuk kandidat AI: task yang memproduksinya */
  task?: string;
}

export interface Composition {
  /** input mentah user (huruf) */
  raw: string;
  /** pemenggalan suku kata saat ini, mis. ["zhong","guo"] */
  syllables: string[];
  /** teks preedit yang ditampilkan, mis. "zhong'guo" */
  preedit: string;
  cursorIndex: number;
  candidates: Candidate[];
  /** halaman kandidat aktif (0-based) */
  page: number;
  pageCount: number;
  pageSize: number;
}

export interface EngineSnapshot {
  mode: 'latin' | 'hanzi';
  /** true saat ada komposisi berjalan */
  composing: boolean;
  composition: Composition | null;
  /** teks yang harus dikirim ke aplikasi target, bila ada */
  commit: string | null;
  /** opsi mesin yang bisa dibaca UI pengaturan */
  options: EngineOptions;
}

export interface EngineOptions {
  mode: 'latin' | 'hanzi';
  /** skema pemenggalan: abc (full pinyin) atau shuangpin */
  scheme: 'abc' | 'shuangpin';
  pageSize: number;
  maxCandidates: number;
  /** urutan kandidat dwibahasa: terjemahan di baris pertama atau kedua */
  translationFirst: boolean;
  /** ambang (ms) input stabil sebelum lane remote dipanggil */
  stabilityDelayMs: number;
  /** batas karakter preedit */
  maxPreeditChars: number;
  /** pasangan fuzzy, mis. ['zh','z'] */
  fuzzyPairs: [string, string][];
}

export const DEFAULT_ENGINE_OPTIONS: EngineOptions = {
  mode: 'hanzi',
  scheme: 'abc',
  pageSize: 9,
  maxCandidates: 60,
  translationFirst: false,
  stabilityDelayMs: 350,
  maxPreeditChars: 64,
  fuzzyPairs: [
    ['zh', 'z'],
    ['ch', 'c'],
    ['sh', 's'],
    ['ing', 'in'],
    ['eng', 'en'],
  ],
};

export interface EngineEvents {
  /** dipanggil saat kandidat perlu diterjemahkan (lane lokal/remote) */
  needTranslations: (candidates: Candidate[]) => void;
  /** dipanggil saat user memilih kandidat AI (untuk collect/analytics) */
  aiSelected: (candidate: Candidate) => void;
}
