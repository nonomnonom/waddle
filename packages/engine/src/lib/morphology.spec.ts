import { analyzeWord, stripPunct } from './morphology.js';

const lemmas = (w: string): string[] => analyzeWord(w).map((g) => g.lemma);

describe('morfologi Indonesia', () => {
  it('meN-: melepas prefiks dan huruf awal yang luluh', () => {
    expect(lemmas('membaca')).toContain('baca');
    expect(lemmas('menulis')).toContain('tulis');
    expect(lemmas('menolong')).toContain('tolong');
    expect(lemmas('menyapu')).toContain('sapu');
    expect(lemmas('mengirim')).toContain('kirim');
    expect(lemmas('mencuci')).toContain('cuci');
  });

  it('peN-/peng- dan -an circumfiks', () => {
    expect(lemmas('pengajaran')).toContain('ajar');
    expect(lemmas('penolong')).toContain('tolong');
    expect(lemmas('kiriman')).toContain('kirim');
    expect(lemmas('unduran')).toContain('undur');
  });

  it('di- pasif, -kan kausatif, ter-, se-', () => {
    expect(lemmas('diundur')).toContain('undur');
    expect(lemmas('kirimkan')).toContain('kirim');
    expect(lemmas('terlambat')).toContain('lambat');
    expect(lemmas('sekalian')).toContain('kali');
  });

  it('klitik orang dan partikel', () => {
    expect(lemmas('pesanmu')).toContain('pesan');
    expect(lemmas('rumahku')).toContain('rumah');
    expect(lemmas('datangnya')).toContain('datang');
    expect(lemmas('pergilah')).toContain('pergi');
  });

  it('kombinasi klitik dan pasif (anaknya -> anak, ditolong -> tolong)', () => {
    expect(lemmas('anaknya')).toContain('anak');
    expect(lemmas('ditolong')).toContain('tolong');
    for (const g of analyzeWord('zz')) expect(g.lemma.length).toBeGreaterThan(0);
  });

  it('bentuk asal selalu ikut sebagai kandidat terakhir', () => {
    expect(lemmas('kopi')).toContain('kopi');
    expect(lemmas('saya')).toContain('saya');
  });

  it('tidak pernah menghasilkan lemma kosong atau lebih dari 4 kandidat', () => {
    const inputs = ['men', 'di', 'ke', 'meNhancurkan', 'peng', 'nya', 'ter', 'abcdefghijkl', 'qqq'];
    for (const w of inputs) {
      const list = analyzeWord(w);
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list.length).toBeLessThanOrEqual(4);
      for (const g of list) expect(g.lemma.length).toBeGreaterThan(0);
    }
    // token tanpa huruf sama sekali bukan input nyata
    expect(analyzeWord('')).toEqual([]);
    expect(analyzeWord(' ,.!')).toEqual([]);
  });

  it('stripPunct membuang tanda baca/spasi tapi mempertahankan apostrof', () => {
    expect(stripPunct('jalan,')).toBe('jalan');
    expect(stripPunct('Di Jalan.')).toBe('dijalan');
    expect(stripPunct("nggak'")).toContain("'");
  });

  it('deterministik dan beralasan (pattern ikut terisi)', () => {
    const a = analyzeWord('menolong');
    expect(a.map((x) => x.lemma)).toEqual(analyzeWord('menolong').map((x) => x.lemma));
    expect(a.some((x) => x.pattern === 'restore')).toBe(true);
  });
});
