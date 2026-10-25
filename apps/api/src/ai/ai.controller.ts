import { Body, Controller, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { SessionGuard } from '../auth/session.guard.js';
import { CurrentUser } from '../auth/decorators.js';
import { AccountService } from '../auth/account.service.js';
import { AiService } from './ai.service.js';
import { toNdjson } from '@waddle/protocol';
import type { AuthSession } from '../auth/auth.service.js';

/**
 * Kontrak AI. Dua bentuk respons, satu sumber logika (AiService.fastLane → remote):
 *  - POST /v1/ai/tasks/:task          → JSON amplop (kalau body.stream = false)
 *  - POST /v1/ai/tasks/:task/stream   → NDJSON, satu objek per baris
 * Route streaming menulis response sendiri, jadi TIDAK lewat EnvelopeInterceptor.
 */
@Controller('v1/ai')
@UseGuards(SessionGuard)
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly account: AccountService,
  ) {}

  @Get('tasks')
  registry() {
    return this.ai.registry();
  }

  @Get('quota')
  async quota(@CurrentUser() session: AuthSession) {
    return this.ai.quota(session.user.id, await this.account.planFor(session.user.id));
  }

  @Post('tasks/:task')
  async run(@CurrentUser() session: AuthSession, @Param('task') task: string, @Body() body: unknown) {
    const plan = await this.account.planFor(session.user.id);
    return this.ai.run(session.user.id, plan, task, body);
  }

  @Post('tasks/:task/stream')
  async stream(
    @CurrentUser() session: AuthSession,
    @Param('task') task: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const plan = await this.account.planFor(session.user.id);
    res.status(200);
    res.setHeader('content-type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    // matikan buffering nginx/apache
    res.setHeader('x-accel-buffering', 'no');
    try {
      for await (const chunk of this.ai.stream(session.user.id, plan, task, req.body)) {
        res.write(toNdjson(chunk));
      }
    } catch (err) {
      // BusinessError dari service: ubah jadi chunk error, jangan gantung
      const code = (err as { code?: string }).code ?? 'internal';
      res.write(toNdjson({ type: 'error', code, message: (err as Error).message, fallback: 'local' }));
    } finally {
      res.end();
    }
  }
}
