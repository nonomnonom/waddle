/**
 * Inventaris suku kata Mandarin tanpa nada + aturan awal/akhir.
 * Ditulis per-rumus-awal supaya tidak ada yang terlewat (generasi kombinatorik
 * menghasilkan banyak suku kata tidak valid, jadi daftar eksplisit lebih aman).
 *
 * Ini data: bisa ditambah/diganti lewat resource eksternal tanpa mengubah engine.
 */

export const INITIALS = [
  '',
  'b',
  'p',
  'm',
  'f',
  'd',
  't',
  'n',
  'l',
  'g',
  'k',
  'h',
  'j',
  'q',
  'x',
  'zh',
  'ch',
  'sh',
  'r',
  'z',
  'c',
  's',
  'y',
  'w',
] as const;

const RAW = `
a ai ao an ang o ou e ei en eng er
ba bai ban bang bao bei ben beng bi bian biao bie bin bing bo bu
pa pai pan pang pao pei pen peng pi pian piao pie pin ping po pou pu
ma mai man mang mao me mei men meng mi mian miao mie min ming mo mou mu
fa fan fang fei fen feng fo fou fu
da dai dan dang dao de dei den deng di dian diao die ding diu dong dou du duan dui dun duo
ta tai tan tang tao te teng ti tian tiao tie ting tong tou tu tuan tui tun tuo
na nai nan nang nao ne nei nen neng ni nian niang niao nie nin ning nong nou nu nü nuan nüe nuo
la lai lan lang lao le lei leng li lia lian liang liao lin ling liu lo long lou lu lü lüe luan lun luo
ga gai gan gang gao ge gei gen geng gong gou gu gua guai guan guang gui gun guo
ka kai kan kang kao ke kei ken keng kong kou ku kua kuai kuan kuang kui kun kuo
ha hai han hang hao he hei hen heng hong hou hu hua huai huan huang hui hun huo
ji jia jian jiang jiao jie jin jing jiong ju jue jun
qi qia qian qiang qiao qie qin qing qiong qu que qun
xi xia xian xiang xiao xie xin xing xiong xu xue xun
zha zhai zhan zhang zhao zhe zhen zheng zhi zhong zhou zhu zhua zhuan zhuang zhui zhun zhuo
cha chai chan chang chao che chen cheng chi chong chou chu chuan chuang chui chun chuo
sha shai shan shang shao she shen sheng shi shou shu shua shuan shuang shui shun shuo
re ren reng ri rong rou ru rua ruan rui run ruo
za zai zan zang zao ze zei zen zeng zi zong zou zu zuan zui zun zuo
cai can cang cao ce cen ceng ci cong cou cu cuan cui cun cuo
sa sai san sang sao se sen seng si song sou su suan sui sun suo
ya yan yang yao ye yi yin ying yo yong you yu yuan yue yun
wa wai wan wang wei wen weng wo wu
`;

function normalize(token: string): string[] {
  // ü / v diterima sebagai ekuivalen; ju/qu/xu/yu <-> jv/qv/xv/yv untuk input keyboard tanpa umlaut
  const withV = /[ü]/.test(token) ? token.replace('ü', 'v') : token;
  const variants = new Set<string>([token, withV]);
  if (/^(j|q|x|y)u/.test(token)) variants.add(token.replace('u', 'v'));
  return [...variants];
}

export const SYLLABLES: ReadonlySet<string> = new Set(RAW.split(/\s+/).filter(Boolean).flatMap(normalize));

/** Pemetaan shuangpin (bagan natural-like, cukup untuk tahap awal). */
export const SHUANGPIN_INITIALS: Record<string, string> = {
  zh: 'v',
  ch: 'i',
  sh: 'u',
};

export const SHUANGPIN_FINALS: Record<string, string> = {
  ing: 'g',
  eng: 'f',
  ang: 'h',
  ai: 'l',
  ei: 'r',
  ao: 'w',
  ou: 'y',
  an: 'j',
  en: 'k',
  er: 'q',
  ua: 'u',
  uo: 'o',
  un: 'p',
  ue: 'e',
  uan: 'h',
  ong: 's',
  iong: 's',
};

export const isSyllable = (s: string): boolean => SYLLABLES.has(s);

/** Semua suku kata yang berawalan `prefix` — dipakai autocomplete preedit. */
export function syllablesStartingWith(prefix: string): string[] {
  const out: string[] = [];
  for (const s of SYLLABLES) if (s.startsWith(prefix)) out.push(s);
  return out.sort((a, b) => b.length - a.length || a.localeCompare(b));
}
