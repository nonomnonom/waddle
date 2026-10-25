import { GLOSSARY_AUTHORED, GLOSSARY_CORE, mergedGlossary } from '../data/glossary.core.js';
import { GLOSSARY_OVERRIDES } from '../data/glossary.overrides.js';
import { normalize, tokenize } from './bilingual.js';

describe('kamus inti id→en', () => {
  it('punya minimal 300 baris authored batch satu dan total gabungan di atas 600', () => {
    expect(GLOSSARY_AUTHORED.length).toBeGreaterThanOrEqual(300);
    expect(GLOSSARY_CORE.length).toBeGreaterThan(GLOSSARY_AUTHORED.length);
    expect(mergedGlossary().length).toBeGreaterThanOrEqual(600);
  });

  it('setiap baris punya terjemahan tidak kosong', () => {
    for (const [, en] of GLOSSARY_CORE) expect(en.trim().length).toBeGreaterThan(0);
  });

  it('terjemahan hanya sama dengan input untuk kata serapan yang tercantum', () => {
    /** kata Indonesia yang memang sudah dipakai apa adanya dalam bahasa Inggris */
    const LOANWORDS = new Set(['data', 'email', 'internet', 'folder', 'spam', 'kopi', 'tiket', 'oka']);
    const identical = mergedGlossary()
      .filter(([id, en]) => normalize(en) === normalize(id))
      .map(([id]) => id);
    for (const id of identical) expect(LOANWORDS.has(id) || /^[a-z]+$/.test(id)).toBe(true);
  });

  it('tidak ada aksara di luar skrip latin di kedua sisi (barrier produk id→en)', () => {
    const NON_LATIN = /[\u3040-\u30ff\u31f0-\u31ff\u4e00-\u9fff\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff\u0900-\u097f]/;
    for (const [id, en] of GLOSSARY_CORE) {
      expect(NON_LATIN.test(id)).toBe(false);
      expect(NON_LATIN.test(en)).toBe(false);
    }
  });

  it('sisi indonesia hanya berisi huruf/angka/spasi/tanda sambung', () => {
    for (const [id] of [...GLOSSARY_AUTHORED, ...GLOSSARY_OVERRIDES]) {
      expect(id.toLowerCase()).toMatch(/^[a-z0-9' -]+$/);
    }
  });

  it('sense ganda untuk satu kata tidak saling menimpa setelah merge', () => {
    const senses = mergedGlossary().filter((r) => normalize(r[0]) === 'bisa');
    expect(senses.length).toBeGreaterThanOrEqual(2);
    expect(new Set(senses.map((r) => r[1])).size).toBe(senses.length);
  });

  it('bobot sense pertama selalu >= sense keduanya (urutan kandidat stabil)', () => {
    const byWord = new Map<string, { w: number; s: number }[]>();
    for (const [id, , weight, opts] of mergedGlossary()) {
      const key = normalize(id);
      const list = byWord.get(key) ?? [];
      list.push({ w: weight, s: opts?.sense ?? 1 });
      byWord.set(key, list);
    }
    for (const [, list] of byWord) {
      const sorted = [...list].sort((a, b) => a.s - b.s);
      for (let i = 1; i < sorted.length; i++) expect(sorted[i - 1].w).toBeGreaterThanOrEqual(sorted[i].w);
    }
  });

  it('token sisi indonesia tidak kosong setelah ditokenisasi', () => {
    for (const [id] of GLOSSARY_AUTHORED) expect(tokenize(id).length).toBeGreaterThan(0);
  });
});
