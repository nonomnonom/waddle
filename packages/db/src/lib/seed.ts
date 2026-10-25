import { and, eq, inArray, lte } from 'drizzle-orm';
import { aiTasks, settingsReleases, taskPromptVersions } from './schema.js';
import type { Db } from './client.js';

/**
 * Seed dasar yang idempoten: registry tugas AI + prompt v1 + satu release pengaturan.
 * Dijalankan oleh `nx run @waddle/db:seed` (bun) dan oleh CI sebagai gerbang migrasi.
 *
 * v1 = Indonesia → Inggris saja. Tugas Mandarin tidak di-seed; kalau barisnya masih
 * ada dari seed lama, ia dinonaktifkan (lihat RETIRED_TASK_CODES) — kode tugas tidak
 * pernah di-hard delete karena baris hasil AI lama menunjuk ke sini.
 */

/** label tampilan: kunci = kode locale, dibaca klien apa adanya */
export const TASK_SEED = [
  {
    code: 'translate_to_english',
    label: { id: 'Terjemahkan ke Inggris', en: 'Translate to English' },
    lane: 'remote' as const,
    maxInputChars: 2000,
    timeoutMs: 3000,
    cacheTtlSeconds: 30 * 24 * 3600,
  },
  {
    code: 'paraphrase',
    label: { id: 'Ubah susunan', en: 'Paraphrase' },
    lane: 'remote' as const,
    maxInputChars: 2000,
    timeoutMs: 4000,
    cacheTtlSeconds: 7 * 24 * 3600,
  },
  {
    code: 'find_supporting_references',
    label: { id: 'Cari rujukan', en: 'Find references' },
    lane: 'remote' as const,
    maxInputChars: 1200,
    timeoutMs: 8000,
    cacheTtlSeconds: 7 * 24 * 3600,
  },
  {
    code: 'explain_correction',
    label: { id: 'Jelaskan koreksi', en: 'Explain correction' },
    lane: 'remote' as const,
    maxInputChars: 1200,
    timeoutMs: 4000,
    cacheTtlSeconds: 30 * 24 * 3600,
  },
] as const;

/** pernah di-seed, sekarang keluar dari produk (fase Mandarin belum dimulai) */
export const RETIRED_TASK_CODES = ['translate_to_chinese'] as const;

export const PROMPT_SEED: Record<string, { system: string; template: string; maxTokens: number; temperature: string }> = {
  translate_to_english: {
    system:
      'Anda penerjemah Indonesia→Inggris gaya tight. Pertahankan nada, jangan menambah informasi, jangan menjelaskan. Jika input sudah bahasa Inggris, kembalikan apa adanya. Keluarkan HANYA terjemahan.',
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

  // DB dev yang ter-seed sebelum pivot id→en masih punya baris tugas Mandarin.
  // Nonaktifkan, jangan hapus: `ai_results.task` dan `task_prompt_versions.task`
  // menunjuk ke kode ini, dan registry klien hanya menampilkan yang enabled.
  if (RETIRED_TASK_CODES.length) {
    await db.update(aiTasks).set({ enabled: false }).where(inArray(aiTasks.code, [...RETIRED_TASK_CODES]));
    await db
      .update(taskPromptVersions)
      .set({ isActive: false })
      .where(and(inArray(taskPromptVersions.task, [...RETIRED_TASK_CODES]), eq(taskPromptVersions.isActive, true)));
  }

  const version = 1;
  const payload = {
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
  };
  // Rilis dev adalah milik kita sendiri: buang dulu supaya payload selalu mengikuti
  // TASK_SEED terbaru (DB yang ter-seed sebelum pivot id→en menyimpan daftar tugas
  // lama di dalam payload ini). Release channel lain tidak pernah disentuh seed.
  await db
    .delete(settingsReleases)
    .where(and(eq(settingsReleases.channel, 'dev'), lte(settingsReleases.version, version)));

  await db
    .insert(settingsReleases)
    .values({
      channel: 'dev',
      version,
      schemaVersion: 1,
      payload,
      publishedAt: new Date(),
    })
    .onConflictDoNothing();

  return { tasks: TASK_SEED.length, prompts: Object.keys(PROMPT_SEED).length, settingsVersion: version };
}
