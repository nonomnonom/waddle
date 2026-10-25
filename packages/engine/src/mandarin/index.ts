/**
 * Fase Mandarin — sengaja dipisah dan TIDAK di-export dari `@waddle/engine`.
 *
 * Produk yang kita luncurkan sekarang adalah Indonesia→Inggris (`src/lib/bilingual.ts`
 * + `src/lib/glossary-id-en.ts`). Kode di bawah ini adalah mesin IME Mandarin yang
 * sudah teruji waktu riset Keysake (segmentasi suku kata, kamus Rime, UserDict);
 * ia tidak dipakai satu jalur pun di web/API dan tidak boleh diakses tanpa keputusan
 * sadar untuk membuka pasar Mandarin.
 *
 * Kenapa tidak dihapus: ia masih bukti bahwa jalur kandidat multi-suku kata bekerja,
 * dan historinya (termasuk uji lisensi kamus GPL) ada di
 * `docs/keysake-research/blueprint/05-ime-and-engine.md`.
 */
export * from './types.js';
export * from './pinyin.js';
export * from './dictionary.js';
export * from './segment.js';
export * from './user-dict.js';
export * from './engine.js';
