/**
 * Laporan mutu kamus id→en — angka yang sama dengan gerbang di test, tapi bisa dibaca
 * manusia dan dipakai membandingkan sebelum/sesudah penambahan kamus.
 *
 *   pnpm coverage:id-en
 */
import { CandidateEngine, PROBE_SENTENCES, PROBE_HELDOUT, PROBE_BLIND, measure, mergedGlossary } from '../packages/engine/src/index.js';

const engine = new CandidateEngine();
const r = measure(engine, PROBE_SENTENCES);
const gate = { token: 85, kalimatPenuh: Math.ceil(PROBE_SENTENCES.length * 0.7), kandidat: 2 };

console.log(`baris kamus gabungan : ${mergedGlossary().length}`);
console.log(`token dikenali       : ${r.tokenPct}%   (gerbang >= ${gate.token})  ${r.tokenPct >= gate.token ? 'LULUS' : 'GAGAL'}`);
console.log(`kalimat penuh        : ${r.fullSentences}/${r.total}   (gerbang >= ${gate.kalimatPenuh})  ${r.fullSentences >= gate.kalimatPenuh ? 'LULUS' : 'GAGAL'}`);
console.log(`kandidat per klausa  : ${r.avgCandidates}    (gerbang >  ${gate.kandidat})  ${r.avgCandidates > gate.kandidat ? 'LULUS' : 'GAGAL'}`);
const h = measure(engine, PROBE_HELDOUT);
console.log(`held-out (ranah lain): ${h.tokenPct}% token, ${h.fullSentences}/${h.total} kalimat penuh, ${h.avgCandidates} kandidat`);
const b = measure(engine, PROBE_BLIND);
console.log(`blind (tidak pernah disterilisasi): ${b.tokenPct}% token, ${b.fullSentences}/${b.total} kalimat penuh, ${b.avgCandidates} kandidat`);
console.log(`unknown teratas      : ${r.topUnknown.slice(0, 20).map(([t, n]) => `${t}×${n}`).join(', ') || '(kosong)'}`);
process.exit(r.tokenPct >= gate.token && r.fullSentences >= gate.kalimatPenuh && r.avgCandidates > gate.kandidat ? 0 : 1);
