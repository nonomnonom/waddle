import { Global, Module } from '@nestjs/common';
import { loadEnv, type Env } from './env.js';

export const ENV = Symbol('ENV');

/**
 * Env divalidasi sekali saat boot (zod). Kalau salah, proses mati dengan pesan
 * yang menyebutkan variabelnya — bukan crash samar saat request pertama.
 */
@Global()
@Module({
  providers: [{ provide: ENV, useFactory: (): Env => loadEnv() }],
  exports: [ENV],
})
export class EnvModule {}
