/**
 * Morfologi Indonesia untuk jalur id→en.
 *
 * Kenapa perlu: kamus frasa tidak akan pernah cukup kalau kita menyimpan tiap bentuk
 * berimbuhan sebagai entri sendiri (`tolong`, `menolong`, `ditolong`, `penolong`,
 * `tolongan`, ...). Aturan di sini menghasilkan KANDIDAT lemma beserta skor; kamus
 * yang memutuskan mana yang nyata. Targetnya recall, bukan penjelasan linguistik.
 *
 * Huruf awal akar bisa luluh saat prefiks menempel (tulis → meN+ulis, sapu → meny+apu,
 * kirim → meng+irim), jadi tiap hasil strip prefiks juga dicoba dengan mengembalikan
 * huruf yang mungkin hilang (RESTORE). Kandidat spekulatif itu kami beri skor lebih
 * rendah supaya tidak menyingkirkan pembacaan yang lebih biasa.
 */

export interface MorphGuess {
  /** token yang diminta, sudah dinormalkan */
  surface: string;
  lemma: string;
  prefix: string;
  suffix: string;
  /** cara bentuk ini diperoleh — dipakai untuk label badge dan debugging */
  pattern: 'base' | 'prefix' | 'suffix' | 'circum' | 'restore';
}

const SUFFIXES = ['kannya', 'kan', 'nya', 'kah', 'lah', 'mu', 'ku', 'an', 'i'] as const;

/** panjang dulu, supaya 'peng' tidak kalah oleh 'pe' */
const PREFIXES = ['menge', 'meng', 'meny', 'pem', 'peng', 'peny', 'pen', 'mem', 'men', 'bel', 'per', 'pel', 'pe', 'ter', 'di', 'ke', 'se', 'be'] as const;

/** huruf awal akar yang biasanya hilang ketika prefiks ini menempel */
const RESTORE: Record<string, string[]> = {
  menge: ['k'],
  meng: ['k', 'g', 'h'],
  meny: ['s'],
  peny: ['s'],
  men: ['t', 'c', 'd', 's', 'j'],
  pen: ['t', 'c', 'd', 's', 'j'],
  pem: ['p', 'b', 'm'],
  peng: ['p', 'b', 'm'],
  pe: ['p', 'm'],
  per: ['r'],
  be: ['b'],
};

const MIN_STEM = 3;

/** tanda baca, spasi, dan digit buang; apostrof dipertahankan (transkripsi informal) */
export function stripPunct(token: string): string {
  return token.toLowerCase().replace(/[^a-z']/g, '');
}

const takeSuffix = (word: string): { stem: string; suffix: string }[] =>
  SUFFIXES.filter((s) => word.length - s.length >= MIN_STEM && word.endsWith(s)).map((s) => ({ stem: word.slice(0, -s.length), suffix: s }));

const takePrefix = (word: string): { stem: string; prefix: string }[] =>
  PREFIXES.filter((p) => word.length - p.length >= MIN_STEM && word.startsWith(p)).map((p) => ({ stem: word.slice(p.length), prefix: p }));

/**
 * Huruf yang mungkin terserap saat prefiks menempel. Selain daftar RESTORE, ada
 * kasus geminasi: `ter` + `rasa` ditulis `terasa` (r-nya rangkap hilang), jadi
 * huruf terakhir prefiks juga kami coba kembalikan kalau akarnya mulai dengan vokal.
 */
function restores(prefix: string, stem: string): string[] {
  const extra = /[aeiou]/.test(stem[0] ?? '') ? prefix.slice(-1) : '';
  return [...new Set([...(RESTORE[prefix] ?? []), extra].filter((c) => c && /[a-z]/.test(c)))];
}

interface Raw { lemma: string; prefix: string; suffix: string; pattern: MorphGuess['pattern']; score: number }

/**
 * Kandidat lemma untuk satu token, paling meyakinkan lebih dulu, maksimum 4.
 * Bentuk asal selalu ikut kalau masih ada tempat (kata tanpa imbuhan harus terjawab).
 */
export function analyzeWord(raw: string): MorphGuess[] {
  const surface = stripPunct(raw);
  // token kosong / cuma tanda baca: bukan input nyata, dan menjawabnya dengan lemma
  // kosong hanya akan memancing bug di hulu
  if (!surface) return [];
  const raws: Raw[] = [];
  const add = (r: Raw): void => {
    if (r.lemma.length >= MIN_STEM) raws.push(r);
  };

  for (const { stem, suffix } of takeSuffix(surface)) {
    // sufiks saja: pesanmu -> pesan, kirimkan -> kirim, datangnya -> datang
    add({ lemma: stem, prefix: '', suffix, pattern: 'suffix', score: 3 });
    // sufiks lalu prefiks: pengajaran -> pengajaran -> ajar
    for (const { stem: stem2, prefix } of takePrefix(stem)) {
      add({ lemma: stem2, prefix, suffix, pattern: 'circum', score: 4 });
      for (const lost of restores(prefix, stem2)) add({ lemma: lost + stem2, prefix, suffix, pattern: 'restore', score: 2.5 });
    }
  }

  for (const { stem, prefix } of takePrefix(surface)) {
    // prefiks saja: membaca -> baca, diundur -> undur, terlambat -> lambat
    add({ lemma: stem, prefix, suffix: '', pattern: 'prefix', score: 3 });
    for (const lost of restores(prefix, stem)) add({ lemma: lost + stem, prefix, suffix: '', pattern: 'restore', score: 2.5 });
    // prefiks lalu sufiks: menolong -> tolong (meny+apu -> sapu)
    for (const { stem: stem2, suffix } of takeSuffix(stem)) {
      add({ lemma: stem2, prefix, suffix, pattern: 'circum', score: 4 });
      for (const lost of restores(prefix, stem2)) add({ lemma: lost + stem2, prefix, suffix, pattern: 'restore', score: 2.5 });
    }
  }

  const byLemma = new Map<string, Raw>();
  for (const r of raws.sort((a, b) => b.score - a.score)) if (!byLemma.has(r.lemma)) byLemma.set(r.lemma, r);
  const out = [...byLemma.values()].slice(0, 4);

/** bentuk asal selalu ikut — termasuk kata pendek (di, ke, ku, ya): MIN_STEM hanya
 * menyaring hasil *setelah* pengimbuhan, bukan membungkam kata itu sendiri.
 */
  if (!byLemma.has(surface) && out.length < 4) {
    out.push({ lemma: surface, prefix: '', suffix: '', pattern: 'base', score: 1 });
  }
  return out.map((r) => ({ surface, lemma: r.lemma, prefix: r.prefix, suffix: r.suffix, pattern: r.pattern }));
}

/**
 * Kelas kata yang seharusnya dari sebuah hasil analisis. Ini yang membuat
 * `menolong` terpilih sebagai *to help* (verba), bukan sense pertama `tolong`
 * yang di kamus kita adalah *please*. Tanpa panduan ini, pemilihan sense cuma
 * mengikuti bobot dan kalimat jadi ngawur.
 */
export function expectedPos(guess: MorphGuess): 'v' | 'n' | undefined {
  const verbPrefixes = ['mem', 'men', 'meng', 'meny', 'menge', 'di', 'ter', 'be', 'bel', 'pem', 'peng', 'peny', 'pen'];
  if (guess.prefix && verbPrefixes.includes(guess.prefix)) return 'v';
  if (guess.suffix === 'kan') return 'v';
  if (guess.suffix === 'an' || guess.suffix === 'nya' || guess.prefix === 'ke') return 'n';
  return undefined;
}
