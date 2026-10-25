import { z } from 'zod';

export const PlanSchema = z.enum(['free', 'plus', 'pro']);

export const ProfileSchema = z.object({
  userId: z.uuid(),
  displayName: z.string().max(120).nullish(),
  email: z.string().email().nullish(),
  locale: z.string().max(35),
  plan: PlanSchema,
  /** kapan sesi/token ini kedaluwarsa (epoch ms) */
  tokenExpiresAt: z.int(),
  /** perangkat aktif untuk akun ini; klien menampilkan "perangkat lain" dari sini */
  devices: z
    .array(
      z.object({
        digest: z.string(),
        platform: z.string(),
        appVersion: z.string(),
        engineVersion: z.string().nullish(),
        lastSeenAt: z.int(),
        isCurrent: z.boolean(),
      }),
    )
    .default([]),
  usage: z.object({ collected: z.int(), aiRequestsToday: z.int() }).default({
    collected: 0,
    aiRequestsToday: 0,
  }),
});

export const DeviceRegisterSchema = z.object({
  digest: z.string().min(8).max(64),
  platform: z.enum(['macos', 'windows', 'linux', 'ios', 'android', 'web']),
  appVersion: z.string().max(40),
  appBuild: z.string().max(40),
  engineVersion: z.string().max(40).nullish(),
  osVersion: z.string().max(60).nullish(),
  hardwareModel: z.string().max(60).nullish(),
  region: z.string().max(10).nullish(),
  tzOffsetMinutes: z.int().min(-840).max(840).default(0),
});

export const ReleaseSchema = z.object({
  target: z.enum(['app', 'engine-assets', 'ime-helper']),
  platform: z.enum(['macos', 'windows', 'linux', 'ios', 'android', 'web']),
  version: z.string().max(40),
  build: z.string().max(40),
  url: z.url(),
  byteSize: z.int().positive(),
  sha256: z.string().length(64),
  signature: z.string().min(16).max(256),
  minAppVersion: z.string().max(40).nullish(),
  mandatory: z.boolean().default(false),
  notesUrl: z.url().nullish(),
  releasedAt: z.int(),
});

export const FeedbackSubmitSchema = z.object({
  body: z.string().min(4).max(4000),
  /** Keysake membatasi email pada 320 byte; kita samakan agar konsisten di semua klien */
  email: z.string().email().max(320).nullish(),
  appVersion: z.string().max(40).nullish(),
  engineVersion: z.string().max(40).nullish(),
  osVersion: z.string().max(60).nullish(),
});

export type Profile = z.infer<typeof ProfileSchema>;
export type DeviceRegister = z.infer<typeof DeviceRegisterSchema>;
export type Release = z.infer<typeof ReleaseSchema>;
