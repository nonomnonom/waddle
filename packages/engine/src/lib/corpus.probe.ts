/**
 * Korpus probe id→en — alat ukur, bukan data produk.
 *
 * Aturan mainnya supaya angkanya berarti:
 *  1) kalimatnya kami tulis seperti orang Indonesia benar-benar mengirim chat/email
 *     kerja — bukan daftar kata yang sudah pasti ada di kamus;
 *  2) kamus tidak boleh ditambal "khusus kalimat di sini". Kalau sebuah kata hanya
 *     muncul di korpus ini, ia masuk kamus karena memang kata berfrekuensi tinggi,
 *     bukan karena kita ingin lulus gerbang;
 *  3) angka yang keluar dicatat di docs/decisions.md setiap kali ambang berubah.
 *
 * Baseline 2026-10-25 (sebelum kerja ini): 50,8% token dikenali, 1/15 kalimat penuh,
 * rata-rata 1,0 kandidat. Gerbang yang ditetapkan di spec: >=85% token dan
 * >=70% kalimat selesai penuh.
 */

/** 60 kalimat Indonesia sehari-hari (kerja, keluarga, jalan, makan, pesan singkat) */
export const PROBE_SENTENCES: string[] = [
  'selamat pagi, rapatnya diundur ke jam tiga sore',
  'saya minta izin hari ini karena anak saya sakit',
  'tolong kirim ulang filenya, yang tadi tidak bisa saya buka',
  'kalau bisa kita bahas ulang bagian anggaran besok pagi',
  'terima kasih banyak atas bantuannya, sangat berarti',
  'saya masih di jalan, macet parah dari kemarin',
  'jangan lupa bayar listrik sebelum tanggal dua puluh',
  'dia susah diajak bicara soal uang',
  'kopi ini sudah dingin, tolong panaskan lagi',
  'kita perlu waktu lebih untuk menyelesaikan bagian ini',
  'maaf saya tidak sempat membaca pesanmu tadi malam',
  'ubah kalimat ini supaya terdengar lebih sopan',
  'harga beras naik lagi minggu ini',
  'sudah saya kirim lewat email, coba cek folder spam',
  'besok saya masuk agak siang, ada urusan keluarga',
  'apa kabar, kamu terlihat lelah sekali',
  'aku mau pesan nasi goreng satu tanpa telur',
  'rumah kami di ujung jalan, sebelah toko roti',
  'ibu minta tolong ambil obat di apotek sepulang kerja',
  'kalau hujan deras begini, lebih baik kita tunggu dulu',
  'rapat tadi membicarakan proyek yang akan dimulai bulan depan',
  'bos bilang laporan terakhir harus selesai hari jumat',
  'saya belum paham bagian kedua, bisa dijelaskan ulang',
  'kapan kamu balik dari luar kota',
  'jangan lupa bawa payung, ramalan bilang hujan malam ini',
  'uang muka sudah dibayar, sisanya bulan depan',
  'kami butuh dua orang lagi untuk tim ini',
  'maaf saya terlambat, ban motor saya bocor di jalan',
  'tolong jangan kirim pesan kerja setelah jam sembilan malam',
  'anak saya masuk sekolah Senin pagi',
  'dia orang paling sabar yang saya kenal',
  'saya lupa menutup laptop di kantor',
  'makan siang sudah, sekarang giliran kopi',
  'kamu sudah makan atau belum',
  'minggu depan kami pindah ke rumah baru',
  'biar saya yang ambil barangnya, kamu tunggu di kafe',
  'harga tiket pesawat mahal sekali menjelang libur',
  'saya ragu jawabannya benar, tapi tidak ada waktu mengecek',
  'busnya terlambat dua puluh menit dari jadwal',
  'jangan marah, saya tidak bermaksud begitu',
  'saya perlu nomor rekening untuk transfer hari ini',
  'coba tanya rekan yang lain, dia lebih paham datanya',
  'kemarin saya tidur jam dua belas malam',
  'pagi ini udara dingin dan jalanan sepi',
  'kita sepakat menunda tanpa mengubah isi kontrak',
  'dia sedang belajar bahasa inggris setiap malam',
  'tolong catat pesan ini supaya tidak hilang',
  'rumah sakit dekat sini atau harus naik kendaraan',
  'saya tidak bisa datang, ada urusan mendadak',
  'sudah saya simpan di folder bersama',
  'berapa menit lagi kamu sampai di kantor',
  'dia gagal mengirim laporan karena internet mati',
  'cukup sekali saja saya mengulang penjelasan ini',
  'kami akan coba cara lain minggu depan',
  'kalau ada perubahan jadwal, kabari saya lebih awal',
  'senang bicara denganmu tadi, sampai jumpa besok',
  'saya kurang paham maksud kalimat terakhirmu',
  'ambil rapor anak hari rabu bersama ibu',
  'uang bensin bulan ini habis lebih cepat',
  'semoga kamu segera sembuh dan bisa kerja lagi',
];

/** Bentuk minimal yang dibutuhkan: suggest(text, limit) -> kandidat dengan unknownTokens */
export interface Suggester {
  suggest(text: string, limit?: number): { unknownTokens: string[] }[];
}

export interface CoverageReport {
  /** persen token yang terjemahannya dikenal (0..100, satu desimal) */
  tokenPct: number;
  /** kalimat yang selesai penuh (tidak ada token tak dikenal) */
  fullSentences: number;
  total: number;
  /** rata-rata jumlah kandidat per kalimat: menentukan panel Keysake bisa diisi berapa sel */
  avgCandidates: number;
  /** antrean kerja berikutnya untuk kamus */
  topUnknown: [string, number][];
}

export function measure(suggester: Suggester, sentences: string[] = PROBE_SENTENCES): CoverageReport {
  let tokens = 0;
  let known = 0;
  let full = 0;
  let candidates = 0;
  const unknown = new Map<string, number>();

  for (const sentence of sentences) {
    const list = suggester.suggest(sentence, 9);
    const top = list[0];
    if (!top) continue;
    candidates += list.length;
    const words = sentence.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    tokens += words.length;
    known += words.length - top.unknownTokens.length;
    if (top.unknownTokens.length === 0) full++;
    for (const u of top.unknownTokens) unknown.set(u, (unknown.get(u) ?? 0) + 1);
  }

  return {
    tokenPct: Math.round((known / Math.max(1, tokens)) * 1000) / 10,
    fullSentences: full,
    total: sentences.length,
    avgCandidates: Math.round((candidates / Math.max(1, sentences.length)) * 10) / 10,
    topUnknown: [...unknown.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 25),
  };
}
