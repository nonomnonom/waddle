import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { pingDb, type Db } from '@waddle/db';
import { BusinessError } from '@waddle/protocol';
import { DB } from '../db/database.module.js';
import { SessionGuard } from '../auth/session.guard.js';

/**
 * Dua endpoint dengan kepentingan berbeda:
 *  - GET /healthz : monitor & load balancer, tanpa auth, 500 kalau DB tidak terjangkau
 *  - GET /v1/ping : klien menyinkronkan jam server sekaligus membuktikan tokennya masih hidup
 */
@Controller()
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(@Inject(DB) private readonly db: Db) {}

  @Get('healthz')
  async healthz() {
    const healthy = await pingDb(this.db).catch(() => false);
    if (!healthy) throw new BusinessError('internal', 'database tidak terjangkau');
    return { ok: true, uptimeMs: Date.now() - this.startedAt, version: process.env.APP_VERSION ?? '0.0.0' };
  }

  @Get('v1/ping')
  @UseGuards(SessionGuard)
  ping() {
    return { serverTime: Date.now() };
  }
}
