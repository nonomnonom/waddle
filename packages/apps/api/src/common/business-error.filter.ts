import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { BusinessError, fail, httpStatusFor, type RequestContext } from '@waddle/protocol';

/**
 * Semua error keluar lewat amplop yang sama. Tidak ada stack trace ke klien;
 * request id yang kami log di sini adalah kunci untuk menelusuri server log.
 */
@Catch()
export class BusinessErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(BusinessErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { requestId?: string }>();
    const rc: RequestContext = { requestId: req.requestId ?? crypto.randomUUID(), now: Date.now() };

    if (exception instanceof BusinessError) {
      const status = httpStatusFor(exception.code);
      void res
        .status(status)
        .json(fail(exception.code, rc, { message: exception.message, data: exception.data, retryAfterMs: exception.retryAfterMs }));
      return;
    }

    if (exception instanceof ZodError) {
      const detail = exception.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      void res.status(HttpStatus.BAD_REQUEST).json(fail('validation_failed', rc, { message: detail }));
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code =
        status === 401 || status === 403
          ? 'credential_missing'
          : status === 404
            ? 'data_not_found'
            : status === 429
              ? 'rate_limited'
              : 'validation_failed';
      void res.status(status).json(fail(code, rc, { message: exception.message }));
      return;
    }

    this.logger.error(`unhandled: ${(exception as Error)?.message ?? exception}`, (exception as Error)?.stack);
    void res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(fail('internal', rc, { message: 'internal error' }));
  }
}
