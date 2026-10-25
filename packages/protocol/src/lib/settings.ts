import { z } from 'zod';
import { AiTaskSchema } from './ai.js';

/**
 * Payload `/settings` berversi. Klien menyimpan `version` + ETag dan menolak
 * payload dengan `schemaVersion` lebih baru dari yang ia mengerti — ini yang
 * membuat desktop lama tidak crash saat server menambah flag.
 */
export const SETTINGS_SCHEMA_VERSION = 1;

export const ShortcutSpecSchema = z.object({
  id: z.enum(['toggle_input_mode', 'open_action_bar', 'collect_fragment', 'refresh_action']),
  /** contoh: "shift+space", "ctrl+alt+d" */
  combo: z.string().max(40),
  /** apakah user boleh mengubahnya */
  userEditable: z.boolean().default(true),
});

export const EngineLimitsSchema = z.object({
  maxCandidates: z.int().min(1).max(100).default(9),
  pageSize: z.int().min(1).max(30).default(9),
  maxPreeditChars: z.int().min(10).max(200).default(64),
  /** ambang "input stabil" sebelum memanggil lane remote (ms) */
  stabilityDelayMs: z.int().min(0).max(3000).default(350),
  /** batas absolut panggilan AI (ms) */
  actionDeadlineMs: z.int().min(300).max(20000).default(3000),
});

export const SettingsPayloadSchema = z.object({
  schemaVersion: z.int().min(1),
  version: z.int().min(1),
  flags: z.record(z.string(), z.boolean()).default({}),
  supportedLanguages: z.array(z.string()).default(['id', 'en']),
  shortcuts: z.array(ShortcutSpecSchema).default([]),
  engineLimits: EngineLimitsSchema.default({
    maxCandidates: 9,
    pageSize: 9,
    maxPreeditChars: 64,
    stabilityDelayMs: 350,
    actionDeadlineMs: 3000,
  }),
  aiTasks: z.array(AiTaskSchema).default([]),
  /** minimal versi klien yang masih dilayani, per platform */
  minAppVersion: z.record(z.string(), z.string()).default({}),
  copy: z.record(z.string(), z.record(z.string(), z.string())).default({}),
});

export const SettingsResponseSchema = z.object({
  etag: z.string(),
  changed: z.boolean(),
  payload: SettingsPayloadSchema.nullish(),
});

export type SettingsPayload = z.infer<typeof SettingsPayloadSchema>;
export type EngineLimits = z.infer<typeof EngineLimitsSchema>;
