import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthSession } from './auth.service.js';

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<Request>();
  const auth = req.auth as AuthSession | undefined;
  if (!auth) throw new Error('CurrentUser dipakai tanpa SessionGuard');
  return auth;
});

export const RequestId = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<Request & { requestId?: string }>().requestId ?? '';
});
