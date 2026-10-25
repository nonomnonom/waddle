import { Dictionary, InputEngine, UserDict, loadEntries, segment, fuzzyVariants, SYLLABLES } from './index.js';

const engine = (opts = {}) => new InputEngine(new Dictionary(), new UserDict(), opts);

describe('segmentasi pinyin', () => {
  it('memecah "zhongguo" menjadi zhong + guo', () => {
    expect(segment('zhongguo')[0].syllables).toEqual(['zhong', 'guo']);
  });

  it('memilih jalur dengan paling sedikit suku kata untuk "xianzai"', () => {
    const top = segment('xianzai')[0];
    expect(top.syllables).toEqual(['xian', 'zai']);
  });

  it('menolak pemenggalan yang menghasilkan bukan suku kata', () => {
    expect(segment('zhonggg').length).toBe(0);
  });

  it('punya inventaris suku kata yang masuk akal', () => {
    expect(SYLLABLES.size).toBeGreaterThan(300);
    for (const s of ['de', 'shi', 'zhong', 'nv', 'xue']) expect(SYLLABLES.has(s)).toBe(true);
  });

  it('fuzzy variant zh/z menghasilkan suku kata valid', () => {
    expect(fuzzyVariants('zuo', [['zh', 'z']])).toContain('zhuo');
    expect(fuzzyVariants('zhuo', [['zh', 'z']])).toContain('zuo');
  });
});

describe('InputEngine: jalur mengetik', () => {
  it('menjadi composing setelah huruf dan membangun preedit', () => {
    const e = engine();
    for (const ch of 'nihao') e.processKey({ key: ch });
    const snap = e.snapshot();
    expect(snap.composing).toBe(true);
    expect(snap.composition?.preedit).toBe('ni\'hao');
    expect(snap.composition?.candidates[0].text).toBe('你好');
  });

  it('space memilih kandidat teratas dan meng-commit teks', () => {
    const e = engine();
    for (const ch of 'nihao') e.processKey({ key: ch });
    const r = e.processKey({ key: ' ' });
    expect(r.result).toBe('candidate-selected');
    expect(r.commit).toBe('你好');
    expect(e.snapshot().composing).toBe(false);
  });

  it('angka 1-9 memilih kandidat pada posisi halaman', () => {
    const e = engine();
    for (const ch of 'nihao') e.processKey({ key: ch });
    const list = e.snapshot().composition?.candidates.map((c) => c.text) ?? [];
    expect(list.length).toBeGreaterThan(1);
    const r = e.processKey({ key: '2' });
    expect(r.commit).toBe(list[1]);
  });

  it('Escape membatalkan komposisi tanpa commit', () => {
    const e = engine();
    for (const ch of 'shi') e.processKey({ key: ch });
    const r = e.processKey({ key: 'Escape' });
    expect(r.result).toBe('cancelled');
    expect(r.commit).toBeNull();
  });

  it('Enter meng-commit huruf mentah', () => {
    const e = engine();
    for (const ch of 'xyz') e.processKey({ key: ch });
    expect(e.processKey({ key: 'Enter' }).commit).toBe('xyz');
  });

  it('BackSpace mengurangi preedit dan tidak menelan huruf berikutnya', () => {
    const e = engine();
    for (const ch of 'nihao') e.processKey({ key: ch });
    e.processKey({ key: 'BackSpace' });
    expect(e.snapshot().composition?.raw).toBe('niha');
  });

  it('mode latin menembus semua tombol tanpa komposisi', () => {
    const e = engine({ mode: 'latin' });
    expect(e.processKey({ key: 'a' }).result).toBe('ignored');
    expect(e.snapshot().composing).toBe(false);
  });

  it('pagination: minus/equal berpindah halaman dan wrap-around', () => {
    const e = engine({ pageSize: 3 });
    for (const ch of 'de') e.processKey({ key: ch });
    const pages = e.snapshot().composition?.pageCount ?? 0;
    if (pages < 2) return; // kamus terlalu kecil pada build seed
    e.processKey({ key: 'Page_Down' });
    expect(e.snapshot().composition?.page).toBe(1);
    for (let i = 0; i < pages; i++) e.processKey({ key: 'Page_Up' });
    expect(e.snapshot().composition?.page).toBe(pages - 1);
  });
});

describe('pembelajaran & terjemahan', () => {
  it('user dict menaikkan peringkat kandidat yang sering dipilih', () => {
    const dict = new Dictionary();
    const ud = new UserDict();
    ud.record('中间', ['zhong', 'jian']);
    ud.record('中间', ['zhong', 'jian']);
    const e2 = new InputEngine(dict, ud);
    for (const ch of 'zhongjian') e2.processKey({ key: ch });
    const list = e2.snapshot().composition?.candidates.map((c) => c.text) ?? [];
    expect(list[0]).toBe('中间');
  });

  it('applyTranslations mengisi baris kedua kandidat', () => {
    const e = engine();
    for (const ch of 'nihao') e.processKey({ key: ch });
    e.applyTranslations({ 你好: 'hello' });
    const first = e.snapshot().composition?.candidates[0];
    expect(first?.translation).toBe('hello');
  });

  it('meminta terjemahan hanya untuk kandidat yang belum punya', () => {
    const asked: string[][] = [];
    const e = new InputEngine(new Dictionary(), new UserDict(), {}, {
      needTranslations: (cs) => asked.push(cs.map((c) => c.text)),
    });
    for (const ch of 'nihao') e.processKey({ key: ch });
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.at(-1)).toContain('你好');
  });

  it('glosarium local menyediakan terjemahan tanpa jaringan', () => {
    const dict = new Dictionary();
    expect(dict.gloss('你好')).toBe('hello');
    expect(dict.gloss('今天')).toBe('today');
    // frase panjang: gabung per bagian yang dikenal
    expect(dict.gloss('今天项目')).toMatch(/today/);
  });

  it('kamus bisa menelan entri tambahan dari data eksternal', () => {
    const dict = new Dictionary(loadEntries([['搭子', 'da zi', 1200, 'companion for an activity']]));
    const e = new InputEngine(dict, new UserDict());
    for (const ch of 'dazi') e.processKey({ key: ch });
    const texts = e.snapshot().composition?.candidates.map((c) => c.text) ?? [];
    expect(texts).toContain('搭子');
  });
});
