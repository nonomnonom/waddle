import { DEFAULT_ENGINE_OPTIONS, type EngineOptions } from './types.js';

/**
 * Kamus. Bentuk data: [hanzi, pinyin (suku kata dipisah spasi), frekuensi, inggris?]
 *
 * Data seed di sini sengaja kecil (~150 entri) dan ditulis ulang sendiri, BUKAN diambil
 * dari bundle kompetitor maupun kamus GPL — lihat docs 07 §5 soal lisensi rime-frost/ice.
 * Untuk produksi: muat file JSON besar lewat `Dictionary.loadJson()` dan simpan di
 * resource terpisah yang bisa di-update tanpa rilis app (mengikuti pola manifest+hash Keysake).
 */
export type Entry = { hanzi: string; syllables: string[]; freq: number; en?: string };

const SEED: [string, string, number, string?][] = [
  ['你好', 'ni hao', 9900, 'hello'],
  ['你', 'ni', 9999, 'you'],
  ['好', 'hao', 9998, 'good'],
  ['中国', 'zhong guo', 9000, 'China'],
  ['中文', 'zhong wen', 8800, 'Chinese (language)'],
  ['中间', 'zhong jian', 6000, 'middle / among'],
  ['我', 'wo', 9997, 'I'],
  ['是', 'shi', 9996, 'to be'],
  ['的', 'de', 9995, 'of / possessive'],
  ['了', 'le', 9990],
  ['今天', 'jin tian', 8000, 'today'],
  ['明天', 'ming tian', 7000, 'tomorrow'],
  ['昨天', 'zuo tian', 6900, 'yesterday'],
  ['项目', 'xiang mu', 6000, 'project'],
  ['评审', 'ping shen', 5000, 'review'],
  ['会议', 'hui yi', 6500, 'meeting'],
  ['改到', 'gai dao', 3000, 'moved to'],
  ['下午', 'xia wu', 5600, 'afternoon'],
  ['三点', 'san dian', 4000, 'three o’clock'],
  ['个', 'ge', 9900, '(classifier)'],
  ['人', 'ren', 9800, 'person'],
  ['工作', 'gong zuo', 7500, 'work'],
  ['学习', 'xue xi', 7000, 'study'],
  ['英语', 'ying yu', 6800, 'English (language)'],
  ['打字', 'da zi', 5200, 'typing'],
  ['输入法', 'shu ru fa', 6200, 'input method'],
  ['翻译', 'fan yi', 6000, 'translate'],
  ['收藏', 'shou cang', 5500, 'to favorite / collection'],
  ['收录', 'shou lu', 5000, 'to record / archive'],
  ['快捷键', 'kuai jie jian', 4800, 'keyboard shortcut'],
  ['设置', 'she zhi', 6000, 'settings'],
  ['显示', 'xian shi', 5800, 'display'],
  ['候选', 'hou xuan', 4000, 'candidate'],
  ['词', 'ci', 6000, 'word'],
  ['句子', 'ju zi', 4200, 'sentence'],
  ['段落', 'duan luo', 3600, 'paragraph'],
  ['改写', 'gai xie', 3400, 'paraphrase'],
  ['文献', 'wen xian', 3000, 'literature / references'],
  ['账号', 'zhang hao', 4400, 'account'],
  ['登录', 'deng lu', 4600, 'to log in'],
  ['注销', 'zhu xiao', 3000, 'to log out'],
  ['邮箱', 'you xiang', 4000, 'email'],
  ['反馈', 'fan kui', 3500, 'feedback'],
  ['更新', 'geng xin', 4300, 'update'],
  ['安装', 'an zhuang', 4100, 'to install'],
  ['语言包', 'yu yan bao', 3200, 'language pack'],
  ['下载', 'xia zai', 4200, 'to download'],
  ['网络', 'wang luo', 4000, 'network'],
  ['连接', 'lian jie', 3800, 'connection'],
  ['失败', 'shi bai', 3900, 'failure'],
  ['重试', 'chong shi', 3000, 'retry'],
  ['这个', 'zhe ge', 6000, 'this'],
  ['那个', 'na ge', 5000, 'that'],
  ['什么', 'shen me', 7000, 'what'],
  ['怎么', 'zen me', 6500, 'how'],
  ['为什么', 'wei shen me', 5000, 'why'],
  ['可以', 'ke yi', 7000, 'can'],
  ['不能', 'bu neng', 5500, 'cannot'],
  ['没有', 'mei you', 7500, 'do not have'],
  ['已经', 'yi jing', 6000, 'already'],
  ['还在', 'hai zai', 4000, 'still'],
  ['时间', 'shi jian', 6200, 'time'],
  ['现在', 'xian zai', 6800, 'now'],
  ['时候', 'shi hou', 6000, 'when / time'],
  ['问题', 'wen ti', 5800, 'problem'],
  ['答案', 'da an', 4000, 'answer'],
  ['需要', 'xu yao', 5600, 'need'],
  ['想要', 'xiang yao', 5200, 'want'],
  ['知道', 'zhi dao', 5800, 'know'],
  ['觉得', 'jue de', 5400, 'feel / think'],
  ['希望', 'xi wang', 5000, 'hope'],
  ['因为', 'yin wei', 6000, 'because'],
  ['所以', 'suo yi', 5800, 'therefore'],
  ['但是', 'dan shi', 5600, 'but'],
  ['如果', 'ru guo', 5000, 'if'],
  ['虽然', 'sui ran', 4000, 'although'],
  ['朋友', 'peng you', 5200, 'friend'],
  ['同事', 'tong shi', 4200, 'colleague'],
  ['客户', 'ke hu', 4000, 'client'],
  ['产品', 'chan pin', 5000, 'product'],
  ['设计', 'she ji', 4800, 'design'],
  ['开发', 'kai fa', 4900, 'development'],
  ['测试', 'ce shi', 4400, 'test'],
  ['上线', 'shang xian', 3600, 'to go live'],
  ['发布', 'fa bu', 3800, 'to release'],
  ['版本', 'ban ben', 4000, 'version'],
  ['文档', 'wen dang', 3800, 'document'],
  ['报告', 'bao gao', 3600, 'report'],
  ['数据', 'shu ju', 4200, 'data'],
  ['分析', 'fen xi', 3800, 'analysis'],
  ['统计', 'tong ji', 3400, 'statistics'],
  ['邮箱地址', 'you xiang di zhi', 2000, 'email address'],
  ['双语', 'shuang yu', 2200, 'bilingual'],
  ['英文', 'ying wen', 3600, 'English writing'],
  ['对照', 'dui zhao', 2000, 'side-by-side comparison'],
  ['打字学英语', 'da zi xue ying yu', 900, 'learn English by typing'],
  ['边打字边翻译', 'bian da zi bian fan yi', 700, 'translate while typing'],
];

export class Dictionary {
  private bySyllable = new Map<string, Entry[]>();
  private byHanzi = new Map<string, Entry>();
  private maxLen = 1;

  constructor(entries: Entry[] = SEED.map(([hanzi, pinyin, freq, en]) => toEntry(hanzi, pinyin, freq, en))) {
    for (const e of entries) this.add(e);
  }

  add(entry: Entry): void {
    this.byHanzi.set(entry.hanzi, entry);
    const key = entry.syllables.join(' ');
    const list = this.bySyllable.get(key) ?? [];
    // simpan sekali per (hanzi,syllables)
    if (!list.some((x) => x.hanzi === entry.hanzi)) list.push(entry);
    list.sort((a, b) => b.freq - a.freq);
    this.bySyllable.set(key, list);
    this.maxLen = Math.max(this.maxLen, entry.syllables.length);
  }

  /** semua entri yang suku katanya persis sama dengan daftar ini */
  lookup(syllables: string[]): Entry[] {
    return this.bySyllable.get(syllables.join(' ')) ?? [];
  }

  /** entri terpendek-panjang untuk window suku kata (longest match) */
  lookupWindow(syllables: string[]): { entry: Entry; consumed: number }[] {
    const out: { entry: Entry; consumed: number }[] = [];
    for (let len = Math.min(this.maxLen, syllables.length); len >= 1; len--) {
      const hits = this.lookup(syllables.slice(0, len));
      if (hits.length > 0) {
        for (const entry of hits) out.push({ entry, consumed: len });
        if (out.length >= 12) break;
      }
    }
    return out;
  }

  /**
   * Terjemahan dari glosarium internal (lane "lokal"). Ini yang membuat demo web
   * bisa menampilkan kandidat dwibahasa tanpa API key dan tanpa jaringan.
   * Fallback: pecah per karakter lalu gabung, supaya tidak pernah mengembalikan kosong
   * untuk kalimat yang sebagian ada di kamus.
   */
  gloss(text: string): string | undefined {
    const exact = this.byHanzi.get(text);
    if (exact?.en) return exact.en;
    const parts: string[] = [];
    let rest = text;
    while (rest.length > 0) {
      let hit = false;
      for (let len = Math.min(4, rest.length); len >= 1; len--) {
        const slice = rest.slice(0, len);
        const entry = this.byHanzi.get(slice);
        if (entry?.en) {
          parts.push(entry.en);
          rest = rest.slice(len);
          hit = true;
          break;
        }
      }
      if (!hit) {
        parts.push(rest[0]);
        rest = rest.slice(1);
      }
    }
    return parts.length > 0 ? parts.join(' ') : undefined;
  }

  get size(): number {
    return this.byHanzi.size;
  }

  get options(): Pick<EngineOptions, 'maxCandidates'> {
    return { maxCandidates: DEFAULT_ENGINE_OPTIONS.maxCandidates };
  }
}

export function toEntry(hanzi: string, pinyin: string, freq: number, en?: string): Entry {
  return { hanzi, syllables: pinyin.trim().split(/\s+/), freq, en };
}

export function loadEntries(rows: [string, string, number, string?][]): Entry[] {
  return rows.map(([h, p, f, e]) => toEntry(h, p, f, e));
}
