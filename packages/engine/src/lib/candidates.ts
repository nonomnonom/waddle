import { PhraseBook } from './bilingual.js';
import { tokenize } from './text.js';
import { mergedGlossary } from '../data/glossary.core.js';

/**
 * Mesin kandidat: apa yang mengisi panel kandidat di layar ketik.
 *
 * Panel Keysake menampilkan sampai 9 sel per halaman. Supaya sel itu jujur, tiap sel
 * harus berasal dari pembacaan kamus yang berbeda — bukan 8 sel kosong atau karangan.
 * Sumber yang kami pakai, berurutan dari paling percaya diri:
 *
 *  - `phrase`  : max-match frasa terpanjang ("terima kasih banyak" → thank you very much)
 *  - `morph`   : kata per kata dengan lemma hasil analisis imbuhan ("menolong" → tolong)
 *  - `sense`   : sense kedua kata ambigu ("kunci" → key vs to lock)
 *  - `register`: varian gaya (santai/formal) dari sense bertanda register
 *  - `partial` : masih ada token yang tidak ada di kamus → ditandai `[token]`
 *
 * Semua lokal dan deterministik: input yang sama selalu memberi urutan yang sama.
 */

export type CandidateSource = 'phrase' | 'morph' | 'sense' | 'register' | 'partial';

export interface Candidate {
  text: string;
  /** 0..1 bagian input yang terjemahannya dikenal kamus */
  coverage: number;
  source: CandidateSource;
  /** urutan panel: skor tinggi lebih dulu */
  score: number;
  unknownTokens: string[];
}

type Resolved = { en: string; via: 'lex' | 'morph' | 'unknown' };

export class CandidateEngine {
  private readonly book: PhraseBook;

  constructor(book: PhraseBook = new PhraseBook(mergedGlossary())) {
    this.book = book;
  }

  /** kandidat untuk satu klausa; `limit` = pageSize panel (maks 9) */
  suggest(clause: string, limit = 9): Candidate[] {
    const tokens = tokenize(clause);
    if (!tokens.length) return [];

    const out: Candidate[] = [];
    const add = (text: string, source: CandidateSource, score: number, coverage: number, unknownTokens: string[]): void => {
      const trimmed = text.replace(/\s+/g, ' ').trim();
      if (!trimmed) return;
      if (out.some((c) => c.text === trimmed)) return;
      out.push({ text: trimmed, coverage, source, score, unknownTokens });
    };

    // 1) max-match frasa — kandidat utama
    const phrase = this.book.translateTokens(tokens);
    const phraseCov = phrase.matched / Math.max(1, phrase.total);
    const phraseSource: CandidateSource = phrase.unknown.length ? 'partial' : phrase.viaMorph.length ? 'morph' : 'phrase';
    add(phrase.parts.join(' '), phraseSource, 1 + phraseCov, phraseCov, phrase.unknown);

    // 2) kata per kata dengan lemma morfologi (kalimat panjang sering beda hasilnya)
    const words = tokens.map((t) => this.resolve(t));
    const wordCov = (words.filter((w) => w.via !== 'unknown').length) / tokens.length;
    const viaMorph = words.some((w) => w.via === 'morph');
    add(words.map((w) => w.en).join(' '), viaMorph ? 'morph' : 'phrase', 0.92 + wordCov, wordCov, tokens.filter((_, i) => words[i].via === 'unknown'));

    // 3) sense & register: satu varian per sense cadangan, kata ambigu saja
    const unknownIdx = tokens.map((t, i) => (words[i].via === 'unknown' ? i : -1)).filter((i) => i >= 0);
    for (let i = 0; i < tokens.length; i++) {
      const senses = this.book.sensesOf(tokens[i]);
      if (senses.length < 2) continue;
      for (let k = 1; k < Math.min(senses.length, 3); k++) {
        const swap = words.map((w) => w.en);
        swap[i] = senses[k].en;
        const isRegister = Boolean(senses[k].opts?.register && senses[k].opts?.register !== 'neutral');
        add(swap.join(' '), isRegister ? 'register' : 'sense', 0.7 + wordCov - i * 0.01, wordCov, tokens.filter((_, j) => unknownIdx.includes(j)));
      }
    }

    // 4) semua kata ambigu sekaligus digeser ke sense keduanya
    const all = words.map((w, i) => this.book.sensesOf(tokens[i])[1]?.en ?? w.en);
    if (all.some((e, i) => e !== words[i].en)) {
      add(all.join(' '), 'sense', 0.55 + wordCov, wordCov, tokens.filter((_, j) => unknownIdx.includes(j)));
    }

    return out.sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.min(limit, 9)));
  }

  /** ringkas: sumber apa saja yang muncul untuk klausa ini (dipakai badge & tes) */
  sources(clause: string, limit = 9): CandidateSource[] {
    return this.suggest(clause, limit).map((c) => c.source);
  }

  private resolve(token: string): Resolved {
    const direct = this.book.sensesOf(token)[0];
    if (direct) return { en: direct.en, via: 'lex' };
    const morph = this.book.lookupMorph(token);
    if (morph) return { en: morph.entry.en, via: 'morph' };
    return { en: `[${token}]`, via: 'unknown' };
  }
}
