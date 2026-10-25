import { ID_EN, type GlossaryOpts, type GlossaryRow } from './glossary-id-en.js';

/**
 * Jalur "ketik bahasa Indonesia, lihat bahasa Inggris" — murni, tanpa jaringan.
 *
 * Cara kerjanya seperti yang dibutuhkan di panel mengetik:
 *  1) longankan case & pisahkan token;
 *  2) cocokkan frasa terpanjang dulu ("terima kasih banyak" menang atas "terima kasih"),
 *     sisanya kata per kata;
 *  3) hasil yang tidak 100% ter-cover mengembalikan `unknownTokens` supaya pemanggil
 *     bisa memutuskan memanggil lane remote (LLM) atau tidak.
 *
 * Ini memang bukan penerjemah sempurna: tugasnya memberi *pemahaman cepat* saat user
 * mengetik, bukan menerjemahkan dokumen.
 */

export interface PhraseEntry {
  id: string;
  en: string;
  weight: number;
  tokens: string[];
  /** sense/register dari baris kamus aslinya */
  opts?: GlossaryOpts;
}

export interface Suggestion {
  text: string;
  /** 0..1, berapa bagian input yang dikenali kamus */
  coverage: number;
  kind: 'phrase' | 'blend' | 'partial';
  score: number;
  unknownTokens: string[];
}

const PUNCT = /[.,!?;:"'“”‘’()[\]{}…—–-]+/g;

export const normalize = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .trim();

const cleanToken = (t: string): string => t.replace(PUNCT, '').replace(/'/g, '');

export class PhraseBook {
  private byId = new Map<string, PhraseEntry>();
  /** index frasa: jumlah token -> (string token joined spasi -> entry) */
  private phraseIndex = new Map<number, Map<string, PhraseEntry>>();
  /** sense kata: token id -> daftar terjemahan (urut bobot) */
  private wordSenses = new Map<string, PhraseEntry[]>();
  maxPhraseTokens = 1;

  constructor(rows: GlossaryRow[] = ID_EN) {
    for (const [id, en, weight, opts] of rows) this.add({ id, en, weight, opts, tokens: tokenize(id) });
  }

  add(entry: PhraseEntry): void {
    // sense membuat kunci unik: "bisa#1" (can) dan "bisa#2" (able to) boleh hidup bersamaan
    const key = `${normalize(entry.id)}#${entry.opts?.sense ?? 1}`;
    this.byId.set(key, entry);
    const n = entry.tokens.length;
    this.maxPhraseTokens = Math.max(this.maxPhraseTokens, n);
    const bucket = this.phraseIndex.get(n) ?? new Map<string, PhraseEntry>();
    const slot = entry.tokens.join(' ');
    const prev = bucket.get(slot);
    // Indeks frasa menampung satu terjemahan per bentuk — yang berbobot paling tinggi.
    // Sense lainnya tetap tersedia lewat wordSenses/sensesOf untuk CandidateEngine.
    if (!prev || prev.weight < entry.weight) bucket.set(slot, entry);
    this.phraseIndex.set(n, bucket);

    if (n === 1) {
      const senses = this.wordSenses.get(entry.tokens[0]) ?? [];
      senses.push(entry);
      senses.sort((a, b) => b.weight - a.weight);
      this.wordSenses.set(entry.tokens[0], senses);
    }
  }

  get size(): number {
    return this.byId.size;
  }

  sensesOf(word: string): PhraseEntry[] {
    return this.wordSenses.get(cleanToken(normalize(word))) ?? [];
  }

  lookupPhrase(text: string): PhraseEntry | undefined {
    const tokens = tokenize(normalize(text));
    return this.phraseIndex.get(tokens.length)?.get(tokens.join(' '));
  }

  /** semua frasa dengan token pertama ini, terpanjang dulu (dipakai autocomplete) */
  phrasesStartingWith(firstToken: string): PhraseEntry[] {
    const out: PhraseEntry[] = [];
    for (let n = this.maxPhraseTokens; n >= 2; n--) {
      for (const entry of this.phraseIndex.get(n)?.values() ?? []) {
        if (entry.tokens[0] === firstToken) out.push(entry);
      }
    }
    return out;
  }

  translateTokens(tokens: string[]): { parts: string[]; unknown: string[]; matched: number; total: number } {
    const parts: string[] = [];
    const unknown: string[] = [];
    let i = 0;
    let matched = 0;
    while (i < tokens.length) {
      let hit: PhraseEntry | undefined;
      for (let n = Math.min(this.maxPhraseTokens, tokens.length - i); n >= 1; n--) {
        hit = this.phraseIndex.get(n)?.get(tokens.slice(i, i + n).join(' '));
        if (hit) {
          matched += n;
          break;
        }
      }
      if (hit) {
        parts.push(hit.en);
        i += hit.tokens.length;
      } else {
        const t = tokens[i];
        unknown.push(t);
        parts.push(`[${t}]`);
        i += 1;
      }
    }
    return { parts, unknown, matched, total: tokens.length };
  }
}

export class BilingualAssist {
  constructor(private readonly book: PhraseBook = new PhraseBook()) {}

  get phraseBook(): PhraseBook {
    return this.book;
  }

  /** Kandidat untuk sebuah klausa/kalimat. Index 0 = paling dipercaya. */
  suggest(input: string, opts: { max?: number } = {}): Suggestion[] {
    const max = opts.max ?? 3;
    const raw = input.replace(/\s+/g, ' ').trim();
    if (!raw) return [];
    const tokens = tokenize(raw);
    const base = this.book.translateTokens(tokens);
    const coverage = base.total === 0 ? 0 : base.matched / base.total;
    const primary = base.parts.join(' ');

    const out: Suggestion[] = [
      {
        text: primary,
        coverage,
        kind: base.unknown.length === 0 ? 'phrase' : coverage >= 0.6 ? 'partial' : 'blend',
        score: scoreFor(primary, base, coverage, tokens.length),
        unknownTokens: base.unknown,
      },
    ];

    // variasi: kata ambigu terakhir diganti sense keduanya (mis. "bisa" -> can/able to)
    const ambiguous = tokens
      .map((t, idx) => ({ t, idx, senses: this.book.sensesOf(t) }))
      .filter((x) => x.senses.length > 1)
      .slice(-2);

    for (const { idx, senses } of ambiguous) {
      for (const sense of senses.slice(1, 3)) {
        const swapped = [...tokens];
        const alt = this.book.translateTokens(swapped);
        const text = alt.parts.join(' ').replace(
          new RegExp(escapeRe(this.book.sensesOf(tokens[idx])[0]?.en ?? ''), 'i'),
          sense.en,
        );
        if (text === primary) continue;
        out.push({
          text,
          coverage: alt.matched / Math.max(1, alt.total),
          kind: 'blend',
          score: scoreFor(text, alt, alt.matched / Math.max(1, alt.total), tokens.length) - 0.15,
          unknownTokens: alt.unknown,
        });
      }
    }

    return dedupe(out).sort((a, b) => b.score - a.score).slice(0, max);
  }

  /** Terjemahan langsung satu string (dipakai saat user mengoleksi). */
  translate(input: string): { text: string; coverage: number; unknownTokens: string[] } {
    const s = this.suggest(input, { max: 1 })[0];
    return { text: s?.text ?? '', coverage: s?.coverage ?? 0, unknownTokens: s?.unknownTokens ?? [] };
  }

  /** Kata yang tidak dikenali — sinyal untuk memanggil lane remote, bukan semuanya. */
  needsRemote(input: string): { needed: boolean; unknownTokens: string[]; coverage: number } {
    const s = this.suggest(input)[0];
    if (!s) return { needed: false, unknownTokens: [], coverage: 1 };
    return { needed: s.unknownTokens.length > 0 || s.coverage < 0.75, unknownTokens: s.unknownTokens, coverage: s.coverage };
  }
}

export function tokenize(text: string): string[] {
  return normalize(text)
    .split(' ')
    .map((t) => cleanToken(t))
    .filter((t) => t.length > 0);
}

function scoreFor(_text: string, r: { unknown: string[]; matched: number }, coverage: number, total: number): number {
  // preferensi: cakupan penuh, lalu kalimat pendek yang utuh, lalu bobot frasa
  const unknownPenalty = r.unknown.length * 0.18;
  const lengthBonus = total >= 3 ? 0.08 : 0;
  return coverage * 1.2 + r.matched * 0.02 + lengthBonus - unknownPenalty;
}

function dedupe(list: Suggestion[]): Suggestion[] {
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const s of list) {
    const k = normalize(s.text);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
