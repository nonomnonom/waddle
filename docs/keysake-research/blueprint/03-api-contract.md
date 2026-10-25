# 03 — Kontrak API

Basis: endpoint yang benar-benar ditemukan sebagai literal di biner Keysake **[KEYSAKE]**
(`evidence/04`): `v1/auth/apple/challenge`, `v1/auth/apple/web/`, `v1/auth/apple/web/exchange`,
`v1/contents/grammar-analysis`, `v1/contents/statistics`, `v1/grammar-analyses`, `v1/grammar-analyses/`,
`/settings`, base `https://keysake.ai/api` (alt `https://tygo.apps.wisebox.ai/api`).
Sisanya adalah desain saya **[BLUEPRINT]** — tetapi bentuknya dibatasi oleh nama tipe request/response yang
bocor di metadata Swift (`BatchRequest`, `BusinessCodeResponse`, `SaveContentRequest`, `ListContentRequest`,
`DeleteContentRequest`, `ContentStatisticsRequest`, `AnalyzeGrammarRequest`, `FeedbackRequest/Response`,
`ProfileRequest`, `LogoutRequest`, `DeleteAccountRequest`, `HealthRequest`), jadi kemungkinan besar backend asli
mereka berbentuk mirip.

## 1. Aturan umum **[BLUEPRINT]**

```
Base            https://api.<domain>/v1
Auth            Authorization: Bearer <opaque userToken>     # bukan JWT: rotasi & revocation instan
Content-Type    application/json; charset=utf-8              # multipart hanya untuk feedback
Idempotency     header `Idempotency-Key: <uuid>` wajib untuk POST /contents, /grammar-analysis
Compression     gzip/br dibolehkan (Accept-Encoding)
TLS             verifikasi sistem default + allowlist host; jangan terima redirect ke host lain
                  (Keysake memvalidasi skema+host URL login di fungsi 0x1000d1130 [KEYSAKE])
Clock skew      respons selalu menyertakan `serverTime` (epoch ms) — klien IME tidak boleh percaya jam sendiri
```

Header permintaan wajib dari klien:

| Header                  | Isi           | Catatan                                                              |
| ----------------------- | ------------- | -------------------------------------------------------------------- |
| `X-Product-Version`     | `1.0.0 (34)`  | app                                                                  |
| `X-InputMethod-Version` | `1.0.0 (54)`  | IME; Keysake membedakan versi app vs IME **[KEYSAKE]**               |
| `X-Engine-Version`      | `2026-08-22`  | versi resource rime (config_version di `default.yaml` **[KEYSAKE]**) |
| `X-Device-Digest`       | UUID keychain | untuk binding token & agregat harian                                 |
| `X-Locale`              | `zh-Hans`     |                                                                      |
| `X-Request-Id`          | UUID          | di-echo ke log & respons                                             |

## 2. Amplop respons (satu bentuk untuk semua endpoint)

Keysake memiliki `BusinessCodeResponse` + pesan lokal berjenis `业务错误码：`, `无数据错误码：`,
`网络超时错误：请求超时`, `数据未找到错误：未找到请求的数据`, `未知错误类型：` **[KEYSAKE]** — artinya
HTTP status **dan** business code terpisah. Bentuk yang saya sarankan:

```json
{
  "code": "ok",
  "message": null,
  "data": {},
  "serverTime": 1793000000000,
  "requestId": "01J..."
}
```

| `code`               | HTTP | Makna              | Tindakan klien                                                                                           |
| -------------------- | ---- | ------------------ | -------------------------------------------------------------------------------------------------------- |
| `ok`                 | 200  | sukses             | —                                                                                                        |
| `validation_failed`  | 400  | input tidak sah    | tampilkan `message`                                                                                      |
| `credential_missing` | 401  | tidak ada token    | kirim notifikasi `credential.changed`; state "请先登录账号"                                              |
| `credential_invalid` | 401  | token mati/rotasi  | **hapus token lokal**, paksa re-auth (Keysake: `com.Tygo.NetworkClient.credentialInvalid` **[KEYSAKE]**) |
| `rate_limited`       | 429  | throttle           | hormati `Retry-After`; jangan retry agresif                                                              |
| `data_not_found`     | 404  | tidak ada data     | tampilkan empty-state (`当天暂无收录`)                                                                   |
| `quota_exceeded`     | 402  | habis quota AI     | tampilkan CTA berlangganan                                                                               |
| `ai_provider_error`  | 502  | upstream LLM gagal | fallback lane lokal, cache kosong, jangan ulangi >1x                                                     |
| `conflict`           | 409  | revisi basi        | tarik ulang (`账户已变化，请重试` **[KEYSAKE]**)                                                         |
| `internal`           | 500  | bug                | log + Sentry, tampilkan pesan generik                                                                    |

## 3. Auth

```
POST /v1/auth/apple/challenge          -> { nonce, timestamp }               # sekali pakai, TTL 120s
POST /v1/auth/apple/verify             -> token                              # body: identityToken(含 nonce), fullName, email?
GET  /auth/apple/web?state=…           -> halaman web (browser, bukan ASWebAuthenticationSession embedded)
POST /v1/auth/apple/web/exchange       -> token                              # body: { ticket, codeVerifier? }
POST /v1/auth/logout                   -> ok                                 # revoke sesi pemanggil saja
DELETE /v1/account                      -> { status: "deleting" }             # async purge (Keysake: 账号正在删除中)
GET  /v1/profile                        -> { displayName, email, plan, usage, imeVersion }
```

Token: opaque 256-bit, hash disimpan di DB (`sessions.token_hash`), TTL 30 hari dengan rotasi sliding;
`family_id` untuk deteksi replay setelah rotasi (reuse → cabut seluruh family). **[BLUEPRINT]**

Penting untuk IME: token **tidak pernah** dibaca dari argumen proses atau file; IME ambil dari keychain group.
Keysake melanggarnya di jalur AI (config `rime_ai.local.json` di `~/Library/Rime`) **[KEYSAKE]** — lihat 04 §7.

## 4. Konten (koleksi fragmen)

```
POST   /v1/contents/batch       SaveContentRequest[]   # upload antrian lokal; respons per-item status
GET    /v1/contents?from=2026-10-01&to=2026-10-25&cursor=&limit=100
GET    /v1/contents/{id}
PATCH  /v1/contents/{id}        { translation?: {...}, status?: 'archived' }
DELETE /v1/contents/{id}
POST   /v1/contents/statistics  ContentDailyCount[]     # agregat harian, bukan per-keystroke
```

`POST /v1/contents/batch` body (maks 200 item / 256 KB terkompresi):

```json
{
  "items": [
    {
      "clientId": "uuid",
      "sourceText": "…",
      "sourceLang": "zh-Hans",
      "translation": {
        "targetLang": "en",
        "provider": "apple-on-device",
        "text": "…"
      },
      "collectedAt": 1792999999000,
      "tzOffsetMinutes": 420,
      "originAppBundle": "com.microsoft.Word",
      "charCount": 128
    }
  ],
  "device": { "digest": "…", "imeVersion": "1.0.0 (54)" }
}
```

Respons: `results: [{ clientId, id | code | message }]` — **partial success wajib**, karena antrian klien
di-scroll ulang per item (Keysake punya state `收藏正在同步，请稍后重试` + `无法保存本地收藏，请重试`
**[KEYSAKE]**, tanda mereka juga menyimpan & retry lokal).

Konflik dedup: server memakai `normalized_hash` per user; item duplikat → `code: "duplicate"` + idexisting,
klien membuang dari antrian.

## 5. Analisis

```
POST /v1/contents/grammar-analysis      { text, lang, contentId? }  -> { id, status: "pending"|"ok", result? }
GET  /v1/grammar-analyses?cursor=&limit=
GET  /v1/grammar-analyses/{id}
DELETE /v1/grammar-analyses/{id}
```

Catatan **[KEYSAKE]**: endpoint ini **tidak punya representasi UI** di build 34/54 (tidak ada string Mandarin
"语法/纠错/分析" di biner). Artinya fitur siap-serve tapi belum muncul di produk — baca 08 §5 untuk memanfaatkan
celah ini.

## 6. Pengaturan berversi & rilis

```
GET /settings?channel=prod&appVersion=…&imeVersion=…&deviceDigest=…
    -> 200 { version, etag, payload } | 304
    payload berisi: remoteFlags, shortcutDefaults, supportedLangs,
                    minIeVersion, aiTaskRegistry, quotaMatrix, copyOverrides
GET /v1/releases?target=app|ime&channel=prod
    -> { latest: { version, build, url, sha512, ed25519, mandatory, notesUrl } }
GET /healthz      -> { ok: true, version, commit }      # tanpa auth, tanpa data user
GET /v1/ping      -> { serverTime }                     # dengan auth; sinkronisasi jam klien
```

Keysake memiliki `HealthRequest`, `PingResponse`, `ServerEnvironment`, `ServerHost`, `RemoteConfigConstants`,
`SettingsDownloader`/`SettingsCache` dan log `[Settings] Cache expired because app version changed`
**[KEYSAKE]** → pola "settings = artefak berversi + ETag + invalidasi saat versi berubah" sudah terbukti work;
salin polanya, jangan salin implementasinya.

## 7. Feedback

```
POST /v1/feedback      multipart/form-data
   fields: body(<=4000), email?(<=320 bytes, regex), appVersion, imeVersion, osVersion, locale
   files:  images[] (<=4, <=8 MB, tipe image/*, scan malware)
   -> { id }        # wajib login (Keysake: 请先登录后再提交反馈 [KEYSAKE])
```

## 8. AI (dikonsumsi IME, lihat 04 untuk detail protokol)

```
POST /v1/ai/tasks/{task}            { text, sourceLang, targetLang, stream: true }
    -> NDJSON stream: {type:"delta"|"done"|"error"}
GET  /v1/ai/tasks                   # registry + batas, di-cache klien 15 menit
```

## 9. Versi & kompatibilitas **[BLUEPRINT]**

- Jangan pernah menghapus field; tambahkan.
- `schemaVersion` di payload settings & `minAppVersion`/`minImeVersion` di server: tolak dengan
  `code: "unsupported_client"` + `data.upgradeUrl` bila terlalu tua (ini jawaban untuk kenyataan Keysake
  build app 34 vs IME 54 bergerak terpisah **[KEYSAKE]**).
- Buat kontrak test suite (Pact/Schemathesis) dan jalankan di CI terhadap skema OpenAPI.

## 10. Rate limit & abuse **[BLUEPRINT]**

| Route               | Per token         | Per device      | Catatan                                                             |
| ------------------- | ----------------- | --------------- | ------------------------------------------------------------------- |
| `/auth/*`           | 10/jam            | 20/hari         | `登录请求过于频繁，请稍后重试` **[KEYSAKE]** = sudah mereka lakukan |
| `/contents/batch`   | 60/jam            | —               | idempoten                                                           |
| `/ai/tasks/*`       | sesuai quota plan | 200/hari gratis | soft-fail ke lane lokal                                             |
| `/grammar-analysis` | 30/jam            | —               |                                                                     |

Simpan `X-RateLimit-Remaining` agar UI bisa menampilkan peringatan sebelum user menabrak dinding.

Spesifikasi mesin-terbaca: [openapi.yaml](./openapi.yaml).
