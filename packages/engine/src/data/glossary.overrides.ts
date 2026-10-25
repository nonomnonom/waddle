import type { GlossaryRow } from '../lib/glossary-id-en.js';

/**
 * Koreksi kurasi manusia. Menang atas GLOSSARY_GEN dan GLOSSARY_CORE (dibaca terakhir
 * saat merge), dipakai untuk kasus yang mesin/LLM sering salah: kata yang artinya
 * bergantung register, atau frasa yang terjemahan harfiahnya menyesatkan.
 */
export const GLOSSARY_OVERRIDES: GlossaryRow[] = [
  ['bisa', 'can', 100, { sense: 1, pos: 'func' }],
  ['bisa', 'able to', 60, { sense: 2, pos: 'func' }],
  ['boleh', 'may', 80, { sense: 1, pos: 'func', register: 'formal' }],
  ['boleh', "it's allowed", 60, { sense: 2, pos: 'func' }],
  ['butuh', 'to need', 90, { sense: 1, pos: 'v' }],
  ['kasih', 'to give', 80, { sense: 1, pos: 'v', register: 'casual' }],
  ['kasih', 'affection', 40, { sense: 2, pos: 'n' }],
  ['ambil', 'to take', 90, { sense: 1, pos: 'v' }],
  ['ambil', 'to pick up', 55, { sense: 2, pos: 'v' }],
  ['jalan', 'road', 90, { sense: 1, pos: 'n' }],
  ['jalan', 'to walk', 80, { sense: 2, pos: 'v' }],
  ['jalan', 'going on', 40, { sense: 3, pos: 'adj', register: 'casual' }],
  ['besar', 'big', 95, { sense: 1, pos: 'adj' }],
  ['besar', 'grown up', 40, { sense: 2, pos: 'adj' }],
  ['rapat', 'meeting', 95, { sense: 1, pos: 'n' }],
  ['rapat', 'tight', 40, { sense: 2, pos: 'adj' }],
];
