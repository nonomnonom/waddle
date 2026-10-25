/**
 * Entri terpisah untuk pabrik instance better-auth.
 *
 * Pisah dari index.ts karena `better-auth` berformat ESM dan tidak bisa di-require
 * oleh jest/CJS di paket yang cuma ingin memeriksa skema. Yang butuh auth mengimpor
 * `@waddle/db/auth`, sisanya tetap ringan.
 */
export * from './lib/auth.js';
