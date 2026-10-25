import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { FragmentBatchRequestSchema, FragmentListQuerySchema, StatisticsBatchSchema } from '@waddle/protocol';
import { ContentsService } from './contents.service.js';
import { SessionGuard } from '../auth/session.guard.js';
import { CurrentUser } from '../auth/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import type { AuthSession } from '../auth/auth.service.js';

/**
 * Rute mengikuti kontrak docs/keysake-research/blueprint/03.
 * Tidak ada global prefix: `/healthz`, `/settings`, dan `/api/auth/*` harus bisa
 * hidup berdampingan dengan `/v1/*` (kontrak klien desktop/mobile).
 */
@Controller('v1/contents')
@UseGuards(SessionGuard)
export class ContentsController {
  constructor(private readonly contents: ContentsService) {}

  @Post('batch')
  batch(
    @CurrentUser() auth: AuthSession,
    @Req() req: Request,
    @Body(new ZodPipe(FragmentBatchRequestSchema)) body: unknown,
  ) {
    return this.contents.batch(auth.user.id, body, req.header('x-device-digest') ?? undefined);
  }

  @Get()
  list(@CurrentUser() auth: AuthSession, @Query(new ZodPipe(FragmentListQuerySchema)) query: unknown) {
    return this.contents.list(auth.user.id, query);
  }

  @Post('statistics')
  statistics(
    @CurrentUser() auth: AuthSession,
    @Req() req: Request,
    @Body(new ZodPipe(StatisticsBatchSchema)) body: unknown,
  ) {
    return this.contents.statistics(auth.user.id, body, req.header('x-device-digest') ?? undefined);
  }

  @Delete(':id')
  remove(@CurrentUser() auth: AuthSession, @Param('id') id: string) {
    return this.contents.remove(auth.user.id, id);
  }
}
