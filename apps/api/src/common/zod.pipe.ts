import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Validasi body/query dengan zod (skema yang sama dipakai klien web/desktop lewat @waddle/protocol).
 * ZodError dibiarkan naik ke BusinessErrorFilter supaya bentuk error tetap satu rupa.
 */
@Injectable()
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      // BadRequestException akan dipetakan filter ke validation_failed
      throw new BadRequestException(
        parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
    }
    return parsed.data;
  }
}

export const zod = <T>(schema: ZodType<T>) => new ZodPipe(schema);
