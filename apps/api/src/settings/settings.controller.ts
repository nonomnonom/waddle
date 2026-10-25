import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import { desc, eq } from '@waddle/db';
import { settingsReleases, type Db } from '@waddle/db';
import { SettingsPayloadSchema } from '@waddle/protocol';
import { DB } from '../db/database.module.js';
import { ENV } from '../config/env.module.js';
import type { Env } from '../config/env.js';

/**
 * Pengaturan = artefak berversi dengan ETag (pola yang terbukti di Keysake:
 * SettingsDownloader + `[Settings] Cache expired because app version changed`).
 * Klien menyimpan version dan hanya menarik payload saat berubah.
 */
@Controller('settings')
export class SettingsController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get()
  async get(
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ etag: string; changed: boolean; payload?: unknown }> {
    const [row] = await this.db
      .select({ version: settingsReleases.version, payload: settingsReleases.payload, schemaVersion: settingsReleases.schemaVersion })
      .from(settingsReleases)
      .where(eq(settingsReleases.channel, this.env.APP_CHANNEL))
      .orderBy(desc(settingsReleases.version))
      .limit(1);

    if (!row) {
      res.status(503);
      return { etag: '', changed: false };
    }

    const etag = `W/"settings-${this.env.APP_CHANNEL}-${row.version}"`;
    res.setHeader('etag', etag);
    res.setHeader('cache-control', 'public, max-age=60');
    if (res.req?.headers['if-none-match'] === etag) {
      res.status(304);
      return { etag, changed: false };
    }

    const payload = SettingsPayloadSchema.parse(row.payload);
    return { etag, changed: true, payload };
  }
}
