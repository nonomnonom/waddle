import { Body, Controller, Delete, Get, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { DeviceRegisterSchema, type DeviceRegister } from '@waddle/protocol';
import { installations, type Db } from '@waddle/db';
import { AccountService } from './account.service.js';
import { AuthService } from './auth.service.js';
import { SessionGuard } from './session.guard.js';
import { CurrentUser } from './decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { DB } from '../db/database.module.js';
import type { AuthSession } from './auth.service.js';

/**
 * `/api/auth/*` (login, register, session, revoke) di-handle better-auth lewat
 * node handler yang di-mount di main.ts. Yang ada di sini hanyalah rute domain kita:
 * profil, pendaftaran perangkat, challenge Apple, dan penghapusan akun.
 */
@Controller('v1')
export class AuthController {
  constructor(
    private readonly account: AccountService,
    private readonly auth: AuthService,
    @Inject(DB) private readonly db: Db,
  ) {}

  @Get('profile')
  @UseGuards(SessionGuard)
  profile(@CurrentUser() session: AuthSession, @Req() req: Request & { header(name: string): string | undefined }) {
    return this.account.profile(session.user.id, req.header('x-device-digest') ?? undefined);
  }

  /** Registrasi perangkat: anchor untuk agregat harian + binding token. */
  @Post('devices/register')
  @UseGuards(SessionGuard)
  async registerDevice(@CurrentUser() session: AuthSession, @Body(new ZodPipe(DeviceRegisterSchema)) body: DeviceRegister) {
    const [row] = await this.db
      .insert(installations)
      .values({
        userId: session.user.id,
        deviceDigest: body.digest,
        platform: body.platform,
        appVersion: body.appVersion,
        appBuild: body.appBuild,
        engineVersion: body.engineVersion ?? null,
        osVersion: body.osVersion ?? null,
        hardwareModel: body.hardwareModel ?? null,
        region: body.region ?? null,
        tzOffsetMinutes: body.tzOffsetMinutes,
        lastSeenAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [installations.deviceDigest, installations.platform],
        set: {
          userId: session.user.id,
          appVersion: body.appVersion,
          appBuild: body.appBuild,
          engineVersion: body.engineVersion ?? null,
          osVersion: body.osVersion ?? null,
          lastSeenAt: new Date(),
        },
      })
      .returning({ id: installations.id, digest: installations.deviceDigest });
    return { installationId: row.id, digest: row.digest };
  }

  /**
   * Nonce untuk Sign in with Apple jalur native. Untuk web launch ini belum dipakai;
   * login web memakai social provider via better-auth. [VERIFY] saat fase desktop mulai.
   */
  @Post('auth/apple/challenge')
  challenge(@Req() req: Request & { ip?: string }) {
    return this.account.issueLoginChallenge(req.ip);
  }

  @Delete('account')
  @UseGuards(SessionGuard)
  deleteAccount(@CurrentUser() session: AuthSession) {
    return this.account.startDeletion(session.user.id);
  }

  /** Debug-only: memastikan secret terpasang tanpa membocorkan isinya. */
  @Get('auth/health')
  authHealth() {
    return { betterAuthConfigured: Boolean(this.auth.auth.options.baseURL) };
  }
}
