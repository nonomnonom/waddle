import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * requestId dipakai di semua respons (amplop) dan di log. Kalau klien sudah
 * mengirimnya, kami hormati — itu yang membuat trace desktop→server nyambung.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request & { requestId?: string }, _res: Response, next: NextFunction): void {
    const incoming = req.header('x-request-id');
    req.requestId = isValidUuid(incoming) ? incoming : crypto.randomUUID();
    const start = process.hrtime.bigint();
    _res.setHeader('x-request-id', req.requestId);
    _res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1_000_000;
      if (ms > 250 && process.env.LOG_LEVEL === 'debug') {
        // placeholder hook: log lambat dipasang setelah logger di-inject
      }
    });
    next();
  }
}

function isValidUuid(value: string | undefined): value is string {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
