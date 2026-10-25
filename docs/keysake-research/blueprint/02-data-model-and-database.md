# 02 — Data model, pilihan database, dan retensi

## 1. Keputusan penyimpanan **[BLUEPRINT]**

| Kebutuhan                                            | Pakai                                                                                                          | Alasan                                                                                                                                        |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Sistem record (akun, konten, analisis, rilis, quota) | **Postgres 16+** (single primary + streaming replica; `pgBouncer` di depan)                                    | Butuh transaksi, constraint, upsert idempoten dari klien yang sering retry, dan JSONB untuk payload analisis. Tidak perlu multi-model di awal |
| Cache hasil AI, rate limiter, distribusi lock        | **Redis** (atau Postgres `unlogged table` untuk MVP)                                                           | Latency-sensitive; `GET` cache hit target >40% untuk tugas terjemahan                                                                         |
| Event telemetri & usage log                          | **OTel Collector → ClickHouse** (MVP: tabel `api_request_log` di Postgres dengan partisi harian + TTL 30 hari) | Jangan campur log Append-heavy dengan OLTP                                                                                                    |
| Attachment feedback, ekspor pengguna                 | **Object storage S3-compatible** (Cloudflare R2 / S3) + URL prabayar                                           | Biner besar, tidak layak di DB                                                                                                                |
| Antrian job (rekalkulasi statistik, hapus akun)      | **Postgres `pgq`-style tabel + worker** (MVP) ; naik ke queue eksternal saat >10k job/hari                     | Menjumlahkan dependensi                                                                                                                       |
| Config & feature flag                                | **Postgres `settings_releases`** + CDN/ETag untuk distribusi ke klien                                          | Keysake melakukan hal serupa: `/settings` + `SettingsDownloader`/`SettingsCache` **[KEYSAKE]**                                                |

Hindari: MongoDB untuk konten (kamu butuh constraint & agregat harian), dan hindari menyimpan teks user di
kolom `text` tanpa kebijakan retensi eksplisit — lihat §4.

## 2. Entitas inti (dinamai dari tipe yang terobservasi di Keysake)

**[KEYSAKE]** nama tipe di biner: `SavedFragment`, `ContentRecord`, `ContentDailyCount`, `GrammarAnalysis`,
`GrammarAnalysisList`, `BusinessCodeResponse`, `BusinessDate`, `AppleChallengeRequest/Response`,
`AppleWebLoginRequest`, `BatchRequest`/`BatchResponse`, `FeedbackImage`, `ProfileRequest`, `DeviceProfile`-setara
(`ServerEnvironment`, `ServerHost`, `installID`). Skema di bawah adalah interpretasi **[BLUEPRINT]** dari nama-nama
itu; kolom pastinya tidak bisa dibuktikan dari klien.

```
User ─┬─ Identity(apple) ──┐
      ├─ Session/token ────┤
      ├─ Installation ─────┼─ DeviceProfile (per perangkat & versi IME)
      ├─ Content (fragmen) ┼─ ContentTranslation (1:N, per provider/bahasa)
      ├─ ContentDailyCount ┼─ UsageCounter (per task AI)
      ├─ GrammarAnalysis ──┼─ AnalysisSegment (hasil, JSONB)
      ├─ FeedbackMessage ──┴─ FeedbackAttachment
      ├─ Entitlement/Subscription
      └─ UserConsent (analytics / crashlytics / ai_training)
Global: SettingsRelease, AppRelease(IME & app), TaskPromptVersion, ReferenceCache
```

## 3. Catatan desain tiap tabel

**users.** `id` UUIDv7 (terurut waktu → index lebih sehat). Tidak ada kolom teks mentah. `deleted_at` untuk
soft-delete + pekerjaan penghapusan asinkron (Keysake punya state UI "账号正在删除中" **[KEYSAKE]**, artinya
penghapusan adalah proses, bukan transaksi instan).

**identities.** Satu baris per `sub` Apple. Simpan `apple_sub`, `email`, `is_private_relay`, `real_email` bila
user memberi. `last_verified_at` untuk re-auth bertahap.

**sessions.** Jangan simpan token mentah — simpan `token_hash` (SHA-256) + `family_id` untuk rotasi.
`kind` membedakan `desktop` vs `web-exchange` (Keysake punya dua jalur: `v1/auth/apple/challenge` dan
`v1/auth/apple/web/exchange` **[KEYSAKE]**). Bind ke `installation_id` → pencurian token dari perangkat lain
jadi terdeteksi.

**login_challenges.** Nonce sekali pakai untuk flow Apple (mencegah replay). TTL 120 detik, `consumed_at`.

**web_login_tickets.** Untuk login lewat browser: `state_hash`, `code_challenge` (PKCE), `redirect_origin`
**yang diizinkan allowlist** — Keysake sudah memvalidasi skema+host URL login di `0x1000d1130` **[KEYSAKE]**,
kamu wajib minimal setara, plus PKCE (tidak terlihat bukti PKCE dari artefak **[VERIFY]**).

**installations.** Satu baris per (user?, device). `device_digest` = UUID acak per instalasi yang disimpan di
keychain (Keysake menyimpan `installID` dan membuat UUID saat instalasi **[KEYSAKE]**). Berisi `app_version`,
`ime_version`, `engine_resource_version`, `os_version`, `hardware_model`, `region`, `tz_offset_minutes`.
Ini yang dipakai untuk rollout bertahap & diagnik "IME lama + app baru".

**contents (fragmen yang dikoleksi user).** Inti produk.

- `source_text` (citext? tidak — raw), `source_lang`, `char_count`, `byte_count`, `normalized_hash`
  (unicode-normalize + lower + strip whitespace) dengan **unique partial index** per user → dedup tanpa query mahal.
- `origin_app_bundle`, `origin_device_id`, `collected_at` (waktu klien), `created_at` (waktu server) →
  tampilan "按日期展示" Keysake **[KEYSAKE]** butuh tanggal lokal user, jadi simpan juga `tz_offset` saat tulis.
- `status` = `active | archived | deleted`.
- **Jangan** simpan teks yang hanya "dilihat" di panel (belum dikoleksi). Keysake membaca seleksi host
  (`attributedSubstringFromRange:` **[KEYSAKE/IF]**) — itu hak istimewa besar; default-nya data itu tidak pernah
  dikirim.

**content_translations.** 1:N terhadap content: `provider` (`apple-on-device` | `llm` | `none`), `target_lang`,
`text`, `model`, `created_at`. Ini menjawab kondisi UI Keysake `中文已收藏，译文待补充`
(zh tersimpan, terjemahan menyusul) **[KEYSAKE]** — artinya terjemahan memang model data terpisah, bukan kolom.

**content_daily_counts.** Agregat `(user_id, day, installation_id)`: `keystrokes`, `committed_count`,
`collected_count`, `chars_committed`, `ai_requests`. Endpoint Keysake `v1/contents/statistics` + tipe
`ContentStatisticsRequest`/`ContentDailyCount` **[KEYSAKE]** menunjukkan agregasi harian di server. Simpan sebagai
`INSERT … ON CONFLICT DO UPDATE` dari batch `BatchRequest`.

**grammar_analyses.** Payload besar & berbiaya: simpan `input_text` dengan **TTL eksplisit** (`expires_at`),
`status` (`pending|ok|error`), `provider/model`, `result JSONB`, `usage_in/usage_out`, `cost_micros`,
`error_code`. Index `(user_id, created_at desc)` dan partial `WHERE status='ok'`.

**usage_counters.** `(user_id, day, task)` dengan `requests`, `tokens_in`, `tokens_out`, `cost_micros` →
penegakan quota **di server**, bukan di klien.

**feedback_messages / attachments.** Email opsional + body (Keysake membatasi **320 byte** untuk email dan
memvalidasi regex email **[KEYSAKE]** — batasi juga, tapi simpan sebagai `varchar(320)` agar konsisten) dan
attachment di object storage dengan `scan_state`.

**settings_releases.** Payload versi pengaturan yang diunduh klien (`/settings`). Kolom: `channel`, `version`,
`min_app_version`, `payload JSONB`, `rollout_pct`, `published_at`, `revoked_at`. Klien menyimpan `ETag`/`version`.

**app_releases.** Untuk app (Sparkle) **dan untuk IME** (Keysake punya state "有新版本输入法" /
"双语输入法有新版本" **[KEYSAKE]** — update IME adalah aliran produk terpisah dari update app). Kolom:
`target` (`app`|`ime`), `version`, `build`, `url`, `sha512`, `ed25519_signature`, `size`, `min_os`,
`mandatory`, `notes_url`, `released_at`.

**user_consents.** `kind` (`analytics`, `crashlytics`, `ai_training`, `references_fetch`), `granted`,
`policy_version`, `source`, `created_at`. Ini wajib karena Keysake punya konfigurasi bertentangan:
`FIREBASE_ANALYTICS_COLLECTION_ENABLED=true` di Info.plist tapi `IS_ANALYTICS_ENABLED=false` di
GoogleService-Info **[KEYSAKE]** — jangan warisi ambiguitas itu.

**reference_cache.** Untuk tugas `find_supporting_references` (文献): hasil pencarian eksternal di-cache dan
**harus** berasal dari API bibliografi nyata (Crossref/Semantic Scholar/arXiv), bukan memori model — lihat 04 §6.

## 4. Retensi & privasi (default yang saya sarankan) **[BLUEPRINT]**

| Data                                       | Retensi default                                                 | Catatan                          |
| ------------------------------------------ | --------------------------------------------------------------- | -------------------------------- |
| Teks kandidat/preedit yang tidak dikoleksi | **tidak pernah dikirim/disimpan**                               | harga mati untuk produk mengetik |
| `contents`                                 | sampai user menghapus (hard-delete ≤30 hari setelah permintaan) |                                  |
| `content_translations`                     | ikut induk                                                      |                                  |
| `grammar_analyses.input_text`              | 30 hari (`expires_at`), hasil teranonim 180 hari                |                                  |
| Permintaan AI non-koleksi                  | log hanya `hash`, panjang, task, biaya; **bukan teks**          |                                  |
| Telemetri                                  | 90 hari mentah, 400 hari agregat                                |                                  |
| Akun dihapus                               | cascade soft → hard ≤30 hari, termasuk object storage & cache   |                                  |

## 5. Skema SQL

Lihat [schema.sql](./schema.sql) — idempoten (`CREATE TABLE IF NOT EXISTS`),
sudah termasuk index, constraint, trigger `updated_at`, dan komentar yang menandai sumber bukti. Jalankan:

```bash
psql "$DATABASE_URL" -f docs/keysake-research/blueprint/schema.sql
```

## 6. Yang tidak bisa disimpulkan dari artefak klien **[VERIFY]**

- Apakah backend memakai Postgres/MySQL/SQLite, dan struktur kolom sebenarnya (nama tipe saja yang bocor).
- Apakah server menyimpan riwayat versi lama dari satu konten (Keysake hanya menunjukkan `credentialVersion`,
  bukan `contentVersion`) — saya tetap menambahkan `revision` di `contents` karena murah dan berguna untuk
  konflik sinkron dua perangkat.
- Apakah statistik mengetik dikirim per keystroke atau per hari. Desain batch harian (privacy + payload kecil).
