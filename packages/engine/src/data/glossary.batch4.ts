import type { GlossaryRow } from '../lib/glossary-id-en.js';

/**
 * Batch keempat — diambil dari daftar unknown set **held-out** (`PROBE_HELDOUT`),
 * yaitu ranah rumah tangga, kendaraan, sekolah, tempat umum. Batch ini ada karena
 * angka jujur: kamus 680 baris memberi 100% pada korpus yang kami tune tapi cuma
 * 64% pada ranah lain. Kalau tidak ada held-out, angka 100% itu cuma pamer.
 */
export const GLOSSARY_BATCH4: GlossaryRow[] = [
  // rumah & benda daily
  ['kulkas', 'refrigerator', 60, { pos: 'n' }],
  ['lampu', 'light', 70, { pos: 'n' }],
  ['mesin', 'engine', 66, { pos: 'n' }],
  ['cuci', 'to wash', 68, { pos: 'v' }],
  ['bunyi', 'sound', 66, { pos: 'n' }],
  ['aneh', 'strange', 62, { pos: 'adj' }],
  ['dompet', 'wallet', 55, { pos: 'n' }],
  ['tipis', 'thin', 52, { pos: 'adj' }],
  ['bekal', 'packed food', 50, { pos: 'n' }],
  ['perkakas', 'tools', 40, { pos: 'n' }],
  ['lemari', 'cupboard', 48, { pos: 'n' }],
  ['sapu', 'broom', 45, { pos: 'n' }],

  // tubuh & benda abstrak
  ['tangan', 'hand', 76, { pos: 'n' }],
  ['kaki', 'leg', 70, { pos: 'n' }],
  ['kepala', 'head', 68, { pos: 'n' }],
  ['mata', 'eye', 66, { pos: 'n' }],
  ['gigi', 'tooth', 55, { pos: 'n' }],
  ['tanda', 'sign', 62, { pos: 'n' }],
  ['tanda tangan', 'signature', 58, {}],
  ['rasa', 'to feel', 75, { pos: 'v', sense: 1 }],
  ['rasa', 'taste', 60, { pos: 'n', sense: 2 }],
  ['jauh', 'far', 72, { pos: 'adj' }],
  ['penuh', 'full', 68, { pos: 'adj' }],
  ['kosong', 'empty', 60, { pos: 'adj' }],
  ['berat', 'heavy', 62, { pos: 'adj' }],
  ['ringan', 'light', 55, { pos: 'adj' }],
  ['kuat', 'strong', 58, { pos: 'adj' }],
  ['lemah', 'weak', 50, { pos: 'adj' }],
  ['kotor', 'dirty', 55, { pos: 'adj' }],
  ['bersih', 'clean', 60, { pos: 'adj' }],
  ['rusak', 'broken', 62, { pos: 'adj' }],
  ['baru saja', 'just now', 60, {}],

  // verba berfrekuensi tinggi yang belum masuk
  ['beli', 'to buy', 78, { pos: 'v' }],
  ['jual', 'to sell', 70, { pos: 'v' }],
  ['ikut', 'to join', 72, { pos: 'v' }],
  ['pakai', 'to use', 78, { pos: 'v' }],
  ['simpan', 'to keep', 76, { pos: 'v' }],
  ['suruh', 'to tell someone to', 62, { pos: 'v' }],
  ['panggil', 'to call', 64, { pos: 'v' }],
  ['angkat telepon', 'to answer the phone', 45, {}],
  ['angkat', 'to pick up', 60, { pos: 'v', sense: 2 }],
  ['parkir', 'to park', 58, { pos: 'v' }],
  ['patung', 'to chip in', 50, { pos: 'v', register: 'casual' }],
  ['rasakan', 'to experience', 45, { pos: 'v' }],
  ['ada kabar', 'to hear from', 40, {}],

  // tempat & kota
  ['warung', 'small shop', 58, { pos: 'n' }],
  ['bengkel', 'repair shop', 52, { pos: 'n' }],
  ['masjid', 'mosque', 55, { pos: 'n' }],
  ['stadion', 'stadium', 45, { pos: 'n' }],
  ['kolam', 'pool', 52, { pos: 'n' }],
  ['halaman', 'yard', 52, { pos: 'n' }],
  ['gerbang', 'gate', 50, { pos: 'n' }],
  ['lantai', 'floor', 55, { pos: 'n' }],
  ['pinggir', 'edge', 50, { pos: 'n' }],
  ['tetangga', 'neighbor', 58, { pos: 'n' }],
  ['teknisi', 'technician', 45, { pos: 'n' }],

  // sekolah, ujian, dokumen
  ['sekolah', 'school', 74, { pos: 'n' }],
  ['guru', 'teacher', 66, { pos: 'n' }],
  ['pak', 'mister', 60, { pos: 'n', register: 'casual' }],
  ['bu', 'mrs', 58, { pos: 'n', register: 'casual' }],
  ['ujian', 'exam', 62, { pos: 'n' }],
  ['susulan', 'make-up (exam)', 40, { pos: 'n' }],
  ['lomba', 'contest', 50, { pos: 'n' }],
  ['pendaftaran', 'registration', 50, { pos: 'n' }],
  ['lembar', 'sheet', 48, { pos: 'n' }],
  ['ijazah', 'diploma (certificate)', 45, { pos: 'n' }],
  ['fotokopi', 'photocopy', 45, { pos: 'n' }],
  ['renang', 'swimming', 50, { pos: 'n' }],

  // keluarga & hewan
  ['adik', 'younger sibling', 68, { pos: 'n' }],
  ['kakak', 'older sibling', 68, { pos: 'n' }],
  ['kucing', 'cat', 60, { pos: 'n' }],
  ['anjing', 'dog', 58, { pos: 'n' }],
  ['melahirkan', 'to give birth', 45, { pos: 'v' }],
  ['sepeda', 'bicycle', 60, { pos: 'n' }],

  // teknologi & situasi
  ['kuota', 'data quota', 55, { pos: 'n' }],
  ['video', 'video', 62, { pos: 'n' }],
  ['meeting', 'meeting', 55, { pos: 'n' }],
  ['telepon', 'to call', 70, { pos: 'v', sense: 2 }],
  ['gempa', 'earthquake', 45, { pos: 'n' }],
  ['getar', 'to vibrate', 45, { pos: 'v' }],
  ['listrik', 'electricity', 66, { pos: 'n' }],
  ['padahal', 'even though', 62, { pos: 'func' }],
  ['sejak', 'since', 70, { pos: 'func' }],
  ['sekalian', 'while at it', 45, { pos: 'adv', register: 'casual' }],
  ['dua kali', 'twice', 55, {}],
  ['kali', 'time', 60, { pos: 'n', sense: 1 }],
  ['kali', 'river', 40, { pos: 'n', sense: 2 }],
];
