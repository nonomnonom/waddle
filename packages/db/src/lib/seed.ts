import { aiTasks, settingsReleases, taskPromptVersions } from './schema.js';
import type { Db } from './client.js';

/**
 * Seed dasar yang idempoten: registry tugas AI + prompt v1 + satu release pengaturan.
 * Dijalankan oleh `nx run @waddle/db:seed` (bun) dan oleh CI sebagai gerbang migrasi.
 */

export const TASK_SEED = [
  {
    code: 'translate_to_english',
    label: { zh: '译英', en: 'Translate to English' },
    lane: 'remote' as const,
    maxInputChars: 2000,
    timeoutMs: 3000,
    cacheTtlSeconds: 30 * 24 * 3600,
  },
  {
    code: 'translate_to_chinese',
    label: { zh: '译中', en: 'Translate to Chinese' },
    lane: 'remote' as const,
    maxInputChars: 2000,
    timeoutMs: 3000,
    cacheTtlSeconds: 30 * 24 * 3600,
  },
  {
    code: 'paraphrase',
    label: { zh: '改写', en: 'Paraphrase' },
    lane: 'remote' as const,
    maxInputChars: 2000,
    timeoutMs: 4000,
    cacheTtlSeconds: 7 * 24 * 3600,
  },
  {
    code: 'find_supporting_references',
    label: { zh: '文献', en: 'Find references' },
    lane: 'remote' as const,
    maxInputChars: 1200,
    timeoutMs: 8000,
    cacheTtlSeconds: 7 * 24 * 3600,
  },
  {
    code: 'explain_correction',
    label: { zh: '讲解', en: 'Explain correction' },
    lane: 'remote' as const,
    maxInputChars: 1200,
    timeoutMs: 4000,
    cacheTtlSeconds: 30 * 24 * 3600,
  },
] as const;

export const PROMPT_SEED: Record<string, { system: string; template: string; maxTokens: number; temperature: string }> = {
  translate_to_english: {
    system:
      'Anda penerjemah Mandarin→Inggris gaya tight. Pertahankan nada, jangan menambah informasi, jangan menjelaskan. Jika input sudah bahasa Inggris, kembalikan apa adanya. Keluarkan HANYA terjemahan.',
    template: '{text}',
    maxTokens: 512,
    temperature: '0.20',
  },
  translate_to_chinese: {
    system:
      'Anda penerjemah Inggris→Mandarin (Hanzi sederhana). Gunakan idiom alami, jangan terjemah kata-per-kata. Keluarkan HANYA terjemahan.',
    template: '{text}',
    maxTokens: 512,
    temperature: '0.20',
  },
  paraphrase: {
    system:
      'Tulis ulang teks user dalam bahasa yang sama. Jangan ubah makna, jangan tambah fakta. Beri 2 alternatif dipisah baris "---" tanpa penjelasan dan tanpa tanda kutip pembungkus.',
    template: '{text}',
    maxTokens: 512,
    temperature: '0.40',
  },
  find_supporting_references: {
    system:
      'Ekstrak klaim yang bisa diverifikasi dari teks user. Keluarkan JSON: {"queries":[{"claim":string,"query":string}]}, maksimal 3. Hanya JSON.',
    template: '{text}',
    maxTokens: 300,
    temperature: '0.00',
  },
  explain_correction: {
    system:
      'Anda editor. Untuk tiap kesalahan kembalikan JSON {"issues":[{"start":int,"length":int,"fix":string,"why":string,"rule":string}]}. Hanya JSON; jika bersih: {"issues":[]}',
    template: '{text}',
    maxTokens: 700,
    temperature: '0.00',
  },
};

export async function seedBasic(db: Db): Promise<{ tasks: number; prompts: number; settingsVersion: number }> {
  for (const t of TASK_SEED) {
    await db
      .insert(aiTasks)
      .values({
        code: t.code,
        displayLabel: t.label,
        lane: t.lane,
        maxInputChars: t.maxInputChars,
        timeoutMs: t.timeoutMs,
        cacheTtlSeconds: t.cacheTtlSeconds,
        enabled: true,
      })
      .onConflictDoUpdate({
        target: aiTasks.code,
        set: {
          displayLabel: t.label,
          lane: t.lane,
          maxInputChars: t.maxInputChars,
          timeoutMs: t.timeoutMs,
          cacheTtlSeconds: t.cacheTtlSeconds,
        },
      });
  }

  for (const [task, p] of Object.entries(PROMPT_SEED)) {
    await db
      .insert(taskPromptVersions)
      .values({
        task,
        promptVersion: 'v1',
        systemPrompt: p.system,
        userTemplate: p.template,
        maxTokens: p.maxTokens,
        temperature: p.temperature,
        isActive: true,
      })
      .onConflictDoNothing();
  }

  const version = 1;
  await db
    .insert(settingsReleases)
    .values({
      channel: 'dev',
      version,
      schemaVersion: 1,
      payload: {
        schemaVersion: 1,
        version,
        flags: { aiBoxEnabled: true, referencesEnabled: true, telemetryEnabled: false },
        supportedLanguages: ['id', 'en'],
        shortcuts: [
          { id: 'toggle_input_mode', combo: 'capslock', userEditable: false },
          { id: 'open_action_bar', combo: 'shift+space', userEditable: true },
          { id: 'collect_fragment', combo: 'shift+s', userEditable: true },
        ],
        engineLimits: { maxCandidates: 9, pageSize: 9, maxPreeditChars: 64, stabilityDelayMs: 350, actionDeadlineMs: 3000 },
        aiTasks: TASK_SEED.map((t) => ({
          code: t.code,
          displayLabel: t.label,
          lane: t.lane,
          maxInputChars: t.maxInputChars,
          timeoutMs: t.timeoutMs,
          cacheTtlSeconds: t.cacheTtlSeconds,
          enabled: true,
        })),
        minAppVersion: {},
        copy: {},
      },
      publishedAt: new Date(),
    })
    .onConflictDoNothing();

  return { tasks: TASK_SEED.length, prompts: Object.keys(PROMPT_SEED).length, settingsVersion: version };
}
