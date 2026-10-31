import { BadRequestException, UnsupportedMediaTypeException } from '@nestjs/common';
import { RequestMethod } from '@nestjs/common';
import { HEADERS_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RfcQuery, READ_ALLOW, readQueryContent } from './http-query';

type ReqStub = { body: unknown; header: (name: string) => string | undefined };
const req = (body: unknown, contentType?: string): ReqStub => ({
  body,
  header: (name) => (name.toLowerCase() === 'content-type' ? contentType : undefined),
});

describe('readQueryContent — aturan §2.1 RFC 10008', () => {
  it('menerima JSON dan mengembalikannya apa adanya', () => {
    expect(readQueryContent(req({ search: 'kopi' }, 'application/json'))).toEqual({ search: 'kopi' });
  });

  it('mengizinkan parameter charset dan media type +json', () => {
    expect(readQueryContent(req({ limit: 5 }, 'application/json; charset=utf-8'))).toEqual({ limit: 5 });
    expect(readQueryContent(req({ a: 1 }, 'application/geo+json'))).toEqual({ a: 1 });
  });

  it('menolak QUERY tanpa Content-Type', () => {
    expect(() => readQueryContent(req({ a: 1 }))).toThrow(BadRequestException);
  });

  it('menolak media type yang bukan JSON dengan 415', () => {
    expect(() => readQueryContent(req('a=1', 'text/plain'))).toThrow(UnsupportedMediaTypeException);
  });

  it('menolak query-content kosong (body tidak ada atau objek kosong)', () => {
    expect(() => readQueryContent(req(undefined, 'application/json'))).toThrow(BadRequestException);
    expect(() => readQueryContent(req({}, 'application/json'))).toThrow(BadRequestException);
  });
});

describe('RfcQuery — pemasangan rute', () => {
  const applyTo = (): object => {
    const handler = (): void => undefined;
    RfcQuery()(handler, 'handler', { value: handler } as unknown as PropertyDescriptor);
    return handler;
  };

  it('memetakan handler ke metode QUERY, bukan GET', () => {
    expect(Reflect.getMetadata(METHOD_METADATA, applyTo())).toBe(RequestMethod.QUERY);
  });

  it('mengiklankan Allow dan menyatakan tidak boleh di-cache', () => {
    const headers = Reflect.getMetadata(HEADERS_METADATA, applyTo()) as { name: string; value: string }[];
    const pairs = headers.map((h) => `${h.name.toLowerCase()}: ${h.value}`);
    expect(pairs).toEqual(expect.arrayContaining([`allow: ${READ_ALLOW}`, 'cache-control: private, no-store']));
  });
});
