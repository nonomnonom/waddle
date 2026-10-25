import type { GlossaryRow } from '../lib/glossary-id-en.js';

/**
 * Slot hasil build kamus offline (`scripts/build-glossary.ts` lewat gateway AI kita).
 *
 * Biayanya kecil dan sekali saja (terukur $0,095 untuk 12.000 baris pada harga yang
 * tercatat di ai.service), TAPI belum pernah dijalankan di lingkungan ini karena
 * AI_API_KEY kosong. Isinya dibiarkan [] dan mesin tetap bekerja penuh memakai
 * GLOSSARY_CORE + morfologi; kalau nanti kamu menyediakan kunci, file ini yang
 * ditimpa oleh hasil build, tidak ada kode lain yang berubah.
 */
export const GLOSSARY_GEN: GlossaryRow[] = [];
