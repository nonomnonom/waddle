import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { BusinessError } from '@waddle/protocol';
import { AuthService, type AuthSession } from './auth.service.js';

declare module 'express' {
  interface Request {
    auth?: AuthSession;
  }
}

/**
 * Menerima `Authorization: Bearer <session token>` (plugin bearer better-auth)
 * dan kuki sesi untuk web. Kalau tidak ada sesi -> credential_missing,
 * yang oleh klien ditangani dengan membuka ulang login (bukan 500).
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const headers = new Headers();
    const bearer = req.header('authorization');
    if (bearer) headers.set('authorization', bearer);
    const cookie = req.header('cookie');
    if (cookie) headers.set('cookie', cookie);
    const origin = req.header('origin');
    if (origin) headers.set('origin', origin);

    const session = headers.get('authorization') || headers.get('cookie') ? await this.auth.getSession(headers) : null;
    if (!session) throw new BusinessError('credential_missing', 'sesi tidak valid atau kedaluwarsa');
    req.auth = session;
    return true;
  }
}
