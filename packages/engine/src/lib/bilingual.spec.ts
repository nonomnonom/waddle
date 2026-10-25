import { BilingualAssist, PhraseBook, normalize, tokenize } from './bilingual.js';
import { mergedGlossary } from '../data/glossary.core.js';

const assist = () => new BilingualAssist();

describe('PhraseBook (id → en)', () => {
  it('mencocokkan frasa lebih panjang sebelum kata per kata', () => {
    const book = new PhraseBook();
    expect(book.lookupPhrase('terima kasih banyak')?.en).toBe('thank you very much');
    expect(book.translateTokens(tokenize('terima kasih banyak')).parts).toEqual(['thank you very much']);
  });

  it('menandai token yang tidak dikenali dengan kurung siku', () => {
    const book = new PhraseBook();
    // 'quxzy' bukan kata: dipilih supaya test ini tidak pecah saat kamus tumbuh
    const r = book.translateTokens(tokenize('saya butuh quxzy'));
    expect(r.parts[0]).toBe('i');
    expect(r.unknown).toEqual(['quxzy']);
    expect(r.parts.join(' ')).toContain('[quxzy]');
  });

  it('memberi beberapa sense untuk kata ambigu', () => {
    const book = new PhraseBook();
    expect(book.sensesOf('lagi').length).toBeGreaterThan(0);
    expect(book.sensesOf('tidak')[0].en).toBe('not');
  });

  it('memuat kamus gabungan tanpa duplikat kunci sense', () => {
    const book = new PhraseBook();
    const keys = mergedGlossary().map((row) => `${normalize(row[0])}#${row[3]?.sense ?? 1}`);
    expect(book.size).toBe(new Set(keys).size);
    expect(book.size).toBeGreaterThan(600);
  });

  it('autocomplete frasa dari token pertama', () => {
    const book = new PhraseBook();
    const hits = book.phrasesStartingWith('selamat');
    expect(hits.length).toBeGreaterThan(3);
    expect(hits.some((h) => h.id === 'selamat pagi')).toBe(true);
  });
});

describe('BilingualAssist: jalur mengetik', () => {
  it('menghasilkan satu kandidat utama dengan coverage penuh', () => {
    const s = assist().suggest('selamat pagi');
    expect(s[0].text).toBe('good morning');
    expect(s[0].coverage).toBe(1);
    expect(s[0].kind).toBe('phrase');
  });

  it('mengutamakan frasa kalimat penuh ketimbang rakitan kata per kata', () => {
    const s = assist().suggest('saya sedang mengerjakan laporan');
    // ada entri kalimat utuh di kamus -> kandidat utama harus idiomatnya
    expect(s[0].text).toBe('i am working on the report');
    expect(s[0].coverage).toBe(1);
  });

  it('merakit kata per kata untuk kalimat yang belum ada di kamus', () => {
    const s = assist().suggest('saya sedang membaca panduan');
    expect(s[0].text.toLowerCase()).toContain('currently');
    expect(s[0].text.toLowerCase()).toContain('guide');
    expect(s[0].coverage).toBe(1);
  });

  it('needsRemote hanya menyala kalau ada token asing atau cakupan rendah', () => {
    expect(assist().needsRemote('terima kasih').needed).toBe(false);
    const gap = assist().needsRemote('saya butuh quxzy');
    expect(gap.needed).toBe(true);
    expect(gap.unknownTokens).toEqual(['quxzy']);
  });

  it('translate() konsisten dengan kandidat teratas', () => {
    const a = assist();
    const input = 'apa kabar';
    expect(a.translate(input).text).toBe(a.suggest(input)[0].text);
  });

  it('menahan diri pada input kosong atau tanda baca saja', () => {
    expect(assist().suggest('')).toEqual([]);
    expect(assist().suggest('   ')).toEqual([]);
    expect(assist().suggest('...').length).toBe(0);
  });

  it('case dan tanda baca tidak merusak pencocokan', () => {
    const s = assist().suggest('Terima kasih!');
    expect(s[0].text).toBe('thank you');
  });

  it('tidak mengembalikan kandidat duplikat', () => {
    const list = assist().suggest('saya pikir ini penting');
    const texts = list.map((x) => normalize(x.text));
    expect(new Set(texts).size).toBe(texts.length);
  });
});
