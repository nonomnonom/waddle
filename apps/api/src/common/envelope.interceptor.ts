import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { map, Observable } from 'rxjs';
import { ok, type Envelope, type RequestContext } from '@waddle/protocol';

/**
 * Controller mengembalikan data polos; interceptor ini yang membungkus jadi amplop.
 * Streaming NDJSON (AI gateway) tidak lewat sini — route itu menulis response sendiri.
 */
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<Envelope> {
    const req = context.switchToHttp().getRequest<Request & { requestId?: string }>();
    const rc: RequestContext = { requestId: req.requestId ?? crypto.randomUUID(), now: Date.now() };

    return next.handle().pipe(
      map((payload) => {
        if (payload && typeof payload === 'object' && 'serverTime' in payload && 'requestId' in payload) {
          return payload as Envelope;
        }
        return ok(payload ?? null, rc);
      }),
    );
  }
}
