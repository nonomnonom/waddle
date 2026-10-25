import { CandidateEngine, type Candidate } from './candidates.js';

const eng = new CandidateEngine();
const run = (s: string, limit = 9): Candidate[] => eng.suggest(s, limit);

describe('CandidateEngine', () => {
  it('tidak pernah menghasilkan sel kosong atau lebih dari limit', () => {
    for (const s of ['selamat pagi', 'aku mau minta izin hari ini karena anak saya sakit', 'x', '']) {
      const list = run(s);
      expect(list.length).toBeLessThanOrEqual(9);
      expect(list.every((c) => c.text.trim().length > 0)).toBe(true);
    }
    expect(run('')).toEqual([]);
  });

  it('menawarkan sense kedua kata ambigu sebagai sel sendiri', () => {
    const list = run('kunci rumah itu di atas meja');
    expect(list.length).toBeGreaterThan(1);
    expect(list.map((c) => c.source)).toEqual(expect.arrayContaining(['sense']));
    const texts = new Set(list.map((c) => c.text));
    expect(texts.size).toBe(list.length);
  });

  it('memakai lemma morfologi untuk bentuk berimbuhan', () => {
    expect(eng.sources('saya menolong dia')).toEqual(expect.arrayContaining(['morph']));
    const top = run('rapatnya diundur')[0];
    expect(top.unknownTokens).toEqual([]);
    expect(top.coverage).toBe(1);
  });

  it('menandai token asing, tidak pernah mengarang terjemahan', () => {
    const list = run('zzzqqqq');
    expect(list[0].text).toBe('[zzzqqqq]');
    expect(list[0].unknownTokens).toEqual(['zzzqqqq']);
  });

  it('deterministik: kalimat sama memberi urutan sama', () => {
    const a = JSON.stringify(run('saya bisa membantu besok pagi'));
    for (let i = 0; i < 3; i++) expect(JSON.stringify(run('saya bisa membantu besok pagi'))).toBe(a);
  });

  it('kandidat pertama selalu skor tertinggi dan coverage berada di 0..1', () => {
    const list = run('kopi ini sudah dingin tolong panaskan lagi');
    for (let i = 1; i < list.length; i++) expect(list[i - 1].score).toBeGreaterThanOrEqual(list[i].score);
    for (const c of list) {
      expect(c.coverage).toBeGreaterThanOrEqual(0);
      expect(c.coverage).toBeLessThanOrEqual(1);
    }
  });

  it('menghormati limit kecil (panel sempit di layar kecil)', () => {
    expect(run('saya perlu waktu lebih untuk menyelesaikan bagian ini', 3).length).toBeLessThanOrEqual(3);
  });
});
