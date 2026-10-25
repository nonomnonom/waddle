import { CandidateEngine } from './candidates.js';
import { measure, PROBE_BLIND, PROBE_HELDOUT, PROBE_SENTENCES } from './corpus.probe.js';

/**
 * Gerbang mutu yang ditetapkan di spec (docs/superpowers/specs/2026-10-25-keysake-parity-ui-design.md §4).
 * Angka ini tidak boleh diturunkan untuk membuat test hijau; yang boleh dinaikkan hanya kamusnya.
 */
describe('gerbang mutu kamus id→en', () => {
  const report = measure(new CandidateEngine(), PROBE_SENTENCES);

  it('korpus punya 60 kalimat unik', () => {
    expect(PROBE_SENTENCES.length).toBe(60);
    expect(new Set(PROBE_SENTENCES).size).toBe(60);
  });

  it('>=85% token dikenali kamus', () => {
    expect(report.tokenPct).toBeGreaterThanOrEqual(85);
  });

  it('>=70% kalimat selesai penuh (tidak ada [token] tersisa)', () => {
    expect(report.fullSentences).toBeGreaterThanOrEqual(Math.ceil(PROBE_SENTENCES.length * 0.7));
  });

  it('rata-rata lebih dari 2 kandidat per klausa (panel Keysake bisa diisi)', () => {
    expect(report.avgCandidates).toBeGreaterThan(2);
  });

  it('melaporkan antrean kerja berikutnya, bukan angka bulat manis', () => {
    expect(report.topUnknown.length).toBeLessThanOrEqual(25);
    expect(typeof report.tokenPct).toBe('number');
  });

  it('set buta tetap buta: tidak boleh beririsan dengan korpus yang kami sterilisasi', () => {
    expect(PROBE_BLIND.length).toBe(20);
    const tuned = new Set([...PROBE_SENTENCES, ...PROBE_HELDOUT]);
    for (const s of PROBE_BLIND) expect(tuned.has(s)).toBe(false);
    // angka set buta sengaja TIDAK kami jadikan gerbang gagal/lulus: ia bukti jujur,
    // bukan target yang boleh ditambal dengan menambah baris kamus
    const blind = measure(new CandidateEngine(), PROBE_BLIND);
    expect(blind.tokenPct).toBeGreaterThan(50);
  });
});
