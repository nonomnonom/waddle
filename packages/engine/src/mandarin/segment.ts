import { SYLLABLES, isSyllable } from './pinyin.js';

export interface SegmentPath {
  syllables: string[];
  /** skor lebih tinggi = lebih mungkin */
  score: number;
}

/**
 * Skor max-match: tiap suku kata bernilai tetap + bonus panjang, lalu dipotong
 * penalti per suku kata. Efeknya jalur dengan SEDIKIT mungkin suku kata panjang
 * menang (zhong'guo, bukan zhong'gu'o) — sama seperti preferensi IME pada umumnya.
 */
const SYLLABLE_BASE = 2;
const LENGTH_BONUS = 0.5;
const SYLLABLE_PENALTY = 4;

/**
 * Memecah deretan huruf menjadi kemungkinan urutan suku kata.
 * Contoh: "zhongguo" -> [zhong guo], [zhon gguo] tidak valid jadi tidak muncul.
 * Mengembalikan maksimal `limit` jalur, terurut dari yang paling mungkin.
 */
export function segment(input: string, limit = 4): SegmentPath[] {
  const s = input.toLowerCase().replace(/[^a-züv]/g, '');
  if (s.length === 0) return [];

  const results: SegmentPath[] = [];
  const walk = (pos: number, acc: string[], score: number): void => {
    if (pos === s.length) {
      results.push({ syllables: acc, score });
      return;
    }
    if (acc.length > 24) return; // penjaga kompleksitas
    for (let len = Math.min(6, s.length - pos); len >= 1; len--) {
      const slice = s.slice(pos, pos + len);
      if (!isSyllable(slice)) continue;
      walk(pos + len, [...acc, slice], score + SYLLABLE_BASE + slice.length * LENGTH_BONUS);
    }
  };
  walk(0, [], 0);

  for (const r of results) r.score -= r.syllables.length * SYLLABLE_PENALTY;

  results.sort((a, b) => b.score - a.score || a.syllables.length - b.syllables.length);
  const seen = new Set<string>();
  const out: SegmentPath[] = [];
  for (const r of results) {
    const key = r.syllables.join(' ');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

/** Varian fuzzy dari sebuah suku kata, mis. "zuo" -> ["zhuo"] untuk pasangan zh/z. */
export function fuzzyVariants(syllable: string, pairs: [string, string][]): string[] {
  const out: string[] = [];
  for (const [a, b] of pairs) {
    if (syllable.startsWith(a)) {
      const cand = b + syllable.slice(a.length);
      if (isSyllable(cand)) out.push(cand);
    }
    if (syllable.startsWith(b)) {
      const cand = a + syllable.slice(b.length);
      if (isSyllable(cand)) out.push(cand);
    }
    if (syllable.endsWith(a)) {
      const cand = syllable.slice(0, -a.length) + b;
      if (isSyllable(cand)) out.push(cand);
    }
    if (syllable.endsWith(b)) {
      const cand = syllable.slice(0, -b.length) + a;
      if (isSyllable(cand)) out.push(cand);
    }
  }
  return [...new Set(out)];
}

/** Autocomplete: suku kata yang mungkin dari prefisien (dipakai UI preedit). */
export function completePrefix(prefix: string, limit = 8): string[] {
  const p = prefix.toLowerCase();
  const hits: string[] = [];
  for (const s of SYLLABLES) if (s.startsWith(p)) hits.push(s);
  hits.sort((a, b) => a.length - b.length || a.localeCompare(b));
  return hits.slice(0, limit);
}
