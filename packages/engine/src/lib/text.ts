/**
 * Normalisasi teks id→en — modul paling bawah, tidak boleh mengimpor apa pun dari
 * paket ini. Alasannya: `data/glossary.core.ts` dan `lib/bilingual.ts` sama-sama
 * butuh `normalize`, dan kalau salah satu mengimpor dari yang lain kita mendapat
 * siklus impor yang membuat bundler/jest gagal dengan `undefined` saat inisialisasi
 * kelas.
 */

const PUNCT = /[.,!?;:"'“”‘’()[\]{}…—–-]+/g;

/** lowercase, samakan apostrof, buang spasi tepi */
export const normalize = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .trim();

/** token bersih untuk pencocokan kamus (tanda baca bukan bagian dari kata) */
export const cleanToken = (t: string): string => t.replace(PUNCT, '').replace(/'/g, '');

export function tokenize(text: string): string[] {
  return normalize(text)
    .split(' ')
    .map((t) => cleanToken(t))
    .filter((t) => t.length > 0);
}
