import { applyDecorators, BadRequestException, createParamDecorator, ExecutionContext, Header, QueryMethod, UnsupportedMediaTypeException } from '@nestjs/common';
import type { ZodType } from 'zod';
import type { Request } from 'express';

/**
 * Dukungan HTTP QUERY (RFC 10008).
 *
 * Yang dijawab metode ini: permintaan baca yang filternya terlalu besar/terlalu
 * sensitif untuk diletakkan di URL. QUERY aman dan idempoten seperti GET — bedanya
 * isi kueri ada di body, jadi tidak masuk log perantara dan tidak kena batas
 * panjang URL. Karena aman, dia TIDAK boleh dipakai untuk apa pun yang mengubah
 * state (koleksi tetap POST, pemakaian AI tetap POST).
 *
 * Nest 11 sudah menyediakan rutenya (`@QueryMethod()`, peta ke `router.query`
 * milik Express 5; `QUERY` ada di `http.METHODS` Node). Express tidak memaknai
 * Content-Type untuk QUERY, jadi aturan §2.1 kami tegakkan sendiri di bawah.
 */

/** Value `Allow` untuk sumber yang bisa dibaca lewat GET dan QUERY (Lampiran A.2). */
export const READ_ALLOW = 'GET, HEAD, QUERY, OPTIONS';

/**
 * §2.7 mensyaratkan kunci cache ikut berisi isi kueri. Cache HTTP di lapangan
 * belum melakukan itu, jadi respons QUERY kami nyatakan tidak boleh disimpan
 * siapa pun. Data koleksi juga bersifat per-user, jadi tidak ada yang hilang.
 */
const QUERY_CACHE_CONTROL = 'private, no-store';

const JSON_MEDIA_TYPE = /^application\/(?:[\w.-]+\+)?json$/i;

/**
 * Rute baca yang menerima QUERY: memasang method-nya sekaligus header
 * `Allow`/`Cache-Control` yang disyaratkan spesifikasi.
 */
export function RfcQuery(path?: string | string[]): MethodDecorator {
  return applyDecorators(QueryMethod(path), Header('Allow', READ_ALLOW), Header('Cache-Control', QUERY_CACHE_CONTROL));
}

/**
 * Aturan §2.1 atas isi permintaan, terpisah dari decorator supaya bisa diuji
 * tanpa menyalakan Nest. Bentuk argumennya sengaja kecil: hanya `header` dan
 * `body`, jadi test cukup memberi objek polos.
 */
export function readQueryContent(req: Pick<Request, 'body'> & { header(name: string): string | undefined }): unknown {
  const contentType = req.header('content-type');
  if (!contentType) {
    throw new BadRequestException('QUERY membutuhkan query-content dengan Content-Type (RFC 10008 §2.1)');
  }
  const mediaType = contentType.split(';')[0].trim();
  if (!JSON_MEDIA_TYPE.test(mediaType)) {
    throw new UnsupportedMediaTypeException(`query-content harus JSON, diterima "${mediaType}"`);
  }
  const body = req.body;
  if (body === undefined || body === null || (typeof body === 'object' && Object.keys(body).length === 0)) {
    throw new BadRequestException('query-content kosong');
  }
  return body;
}

export function RfcQueryContent<T>(schema: ZodType<T>) {
  return createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return schema.parse(readQueryContent(req));
  })();
}
