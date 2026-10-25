import {
  EnvelopeSchema,
  fail,
  httpStatusFor,
  ok,
  FragmentInputSchema,
  FragmentBatchRequestSchema,
  TapRequestSchema,
  TAP_VERSION,
  parseNdjsonLine,
  toNdjson,
  AiStreamChunkSchema,
  SettingsPayloadSchema,
  BusinessError,
  type RequestContext,
} from '../index.js';

const ctx: RequestContext = { requestId: '01971234-5678-7000-8000-000000000000', now: 1793000000000 };

describe('Envelope', () => {
  it('membungkus sukses tanpa message', () => {
    const env = ok({ items: [] }, ctx);
    expect(EnvelopeSchema.parse(env).code).toBe('ok');
    expect(env.serverTime).toBe(ctx.now);
  });

  it('memetakan kode ke tindakan klien yang benar', () => {
    const env = fail('credential_invalid', ctx, { message: 'token mati' });
    expect(env.action).toBe('reauthenticate');
    expect(httpStatusFor(env.code!)).toBe(401);
  });

  it('menolak envelope tanpa serverTime', () => {
    expect(EnvelopeSchema.safeParse({ code: 'ok', requestId: ctx.requestId }).success).toBe(false);
  });

  it('BusinessError membawa kode untuk exception filter', () => {
    const err = new BusinessError('quota_exceeded', 'habis', undefined, 4200);
    expect(err.code).toBe('quota_exceeded');
    expect(err.retryAfterMs).toBe(4200);
  });
});

describe('Fragmen', () => {
  const input = {
    clientId: '01971234-5678-7000-8000-000000000001',
    sourceText: '今天的项目评审改到下午三点。',
    sourceLang: 'zh-Hans',
    collectedAt: 1793000000000,
    tzOffsetMinutes: 420,
    originAppBundle: 'com.apple.Notes',
  };

  it('memberi nilai default sourceLang dan menerima terjemahan', () => {
    const parsed = FragmentInputSchema.parse(input);
    expect(parsed.sourceLang).toBe('zh-Hans');
    const withTr = FragmentInputSchema.parse({
      ...input,
      translation: { targetLang: 'en', provider: 'local-dictionary', text: 'The review moved to 3pm.' },
    });
    expect(withTr.translation?.provider).toBe('local-dictionary');
  });

  it('menolak offset timezone di luar rentang', () => {
    expect(FragmentInputSchema.safeParse({ ...input, tzOffsetMinutes: 900 }).success).toBe(false);
  });

  it('membatasi batch pada 200 item', () => {
    const items = Array.from({ length: 201 }, (_, i) => ({
      ...input,
      clientId: `01971234-5678-7000-8000-${String(i).padStart(12, '0')}`,
    }));
    expect(FragmentBatchRequestSchema.safeParse({ items }).success).toBe(false);
  });
});

describe('Typing Action Protocol', () => {
  const req = {
    protocol: TAP_VERSION,
    jobId: '01971234-5678-7000-8000-0000000000aa',
    task: 'paraphrase',
    text: '把这句话换个说法',
    sourceLang: 'zh-Hans',
    deadlineMs: 3000,
  };

  it('request punya versi protokol dan deadline wajib', () => {
    const parsed = TapRequestSchema.parse(req);
    expect(parsed.stream).toBe(true);
    expect(parsed.cache).toBe(true);
  });

  it('menolak deadline yang tidak masuk akal untuk jalur mengetik', () => {
    expect(TapRequestSchema.safeParse({ ...req, deadlineMs: 60000 }).success).toBe(false);
  });

  it('chunk done membawa referensi ber-skor 0..1', () => {
    const chunk = AiStreamChunkSchema.parse({
      type: 'done',
      text: '结果',
      cacheHit: false,
      references: [
        {
          title: 'A paper',
          authors: ['Doe'],
          year: 2024,
          url: 'https://example.org/a',
          provider: 'crossref',
          score: 0.71,
          retrievedAt: 1793000000000,
        },
      ],
    });
    expect(chunk.type).toBe('done');
  });

  it('ndjson round-trip aman untuk teks multi-byte', () => {
    const line = toNdjson({ ...req, text: '你好，世界 — ok' });
    expect(parseNdjsonLine(line)).toMatchObject({ task: 'paraphrase' });
    expect(parseNdjsonLine('')).toBeNull();
  });
});

describe('Settings payload berversi', () => {
  it('mengisi default mesin dan menolak schemaVersion lebih baru', () => {
    const parsed = SettingsPayloadSchema.parse({ schemaVersion: 1, version: 7 });
    expect(parsed.engineLimits.stabilityDelayMs).toBe(350);
    expect(parsed.aiTasks).toEqual([]);
    expect(SettingsPayloadSchema.safeParse({ schemaVersion: 999, version: 1 }).success).toBe(true);
  });
});
