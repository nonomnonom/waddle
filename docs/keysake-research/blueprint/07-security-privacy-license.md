# 07 — Keamanan, privasi, dan lisensi

Urutan: (1) checklist wajib produkmu, (2) 11 temuan dari Keysake + cara tidak mengulanginya,
(3) kepatuhan lisensi, (4) postur server.

## 1. Checklist wajib sebelum rilis **[BLUEPRINT]**

**Klien**

- [ ] Hardened Runtime (`--options runtime`) + notarization + staple untuk app **dan** IME **dan** `.pkg`.
- [ ] Entitlements minimal: `com.apple.security.app-sandbox=false` (IME memang tidak bisa sandbox),
      `com.apple.security.application-groups`, `keychain-access-groups`, `com.apple.security.network.client`.
      Tidak ada `com.apple.security.get-task-allow` di build rilis.
- [ ] Token hanya di keychain (`AfterFirstUnlockThisDeviceOnly`, group bersama). Nol token di file/argv/env.
- [ ] Semua file state user: direktori `0700`, file `0600`, nama acak (UUID), bukan dapat ditebak.
- [ ] Tidak pernah menulis ke path global tanpa verifikasi signature + hash + owner.
- [ ] Validasi URL tujuan: skema https + host allowlist, tolak redirect lintas-origin
      (Keysake sudah memvalidasi skema+host untuk halaman login **[KEYSAKE]** — samakan, lalu tambah HSTS preload).
- [ ] `Idempotency-Key` di semua POST yang di-retry user, supaya retry tidak membuat duplikat koleksi.
- [ ] Update: verifikasi Ed25519 + SHA-512 sebelum eksekusi; tolak downgrade.
- [ ] Log: `os_log` dengan `privacy` default ON untuk teks user (jangan pernah `NSLog` isi ketikan —
      Keysake melakukan `NSLog` dengan nama host aplikasi **[KEYSAKE]**, itu masih aman; jangan naik level ke teks).
- [ ] Teardown bersih: uninstall menghapus user dir, cache AI, antrian fragmen, keychain item.

**Server**

- [ ] Bearer opaque + rotasi + revocation family (lihat 02 `sessions.family_id`).
- [ ] Rate limit berlapis: per token, per device digest, per IP, per route AI.
- [ ] Input AI punya batas panjang & filter prompt-injection keluar (jangan pernah render hasil LLM sebagai
      markup di UI web kamu; SwiftUI aman, web dashboard tidak).
- [ ] Object storage: prabayar URL singkat, scan malware, tidak pernah publik.
- [ ] Audit trail: akses konten user tercatat (siapa, kapan, alasan) — penting untuk klaim "local-first".
- [ ] Backup terenkripsi + uji restore; retensi TTL dijalankan worker, bukan "nanti".
- [ ] Secrets tidak pernah di-bundle: API key Firebase publik boleh; kunci AI tidak.

## 2. 11 temuan Keysake → tindakan untukmu

| #   | **[KEYSAKE]** temuan                                                                                             | Risiko                                                                                              | **[BLUEPRINT]** tindakan                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | `AuthorizationExecuteWithPrivileges` via dlopen/dlsym                                                            | API deprecated; gagal senyap di macOS baru                                                          | `.pkg` tertanda **atau** `SMAppService.daemon`; satu jalur saja                            |
| 2   | `chown -R root:staff` + `chmod -R 775` pada IME di `/Library/Input Methods`                                      | semua user `staff` bisa mengganti biner yang berjalan di dalam **setiap** app → eskalasi/penyisipan | `root:wheel`, `0755` (0644 untuk file); dan lebih baik: instal per-user                    |
| 3   | `xattr -d -r com.apple.quarantine` rekursif                                                                      | menghilangkan proteksi Gatekeeper untuk seluruh payload                                             | jangan; notarization membuat ini tidak perlu                                               |
| 4   | `killall System Settings / SystemUIServer / TextInputMenuAgent`                                                  | mengganggu user, bisa kehilangan state                                                              | hindari; andalkan API TIS + notifikasi, dan minta user melakukan langkah manual bila perlu |
| 5   | Teks user dikirim sebagai argumen `--text` ke proses Python                                                      | bocor di `ps`, `sysctl`, dan monitoring EDR                                                         | stdin/socket; tanpa shell                                                                  |
| 6   | `rime_ai.local.json` (kredensial/konfig) plaintext di `~/Library/Rime`                                           | token AI tercuri oleh proses user lain                                                              | keychain; kalau file wajib, `0600` dan tanpa rahasia                                       |
| 7   | Script Python jembatan AI tidak ikut DMG/tidak ternotaris                                                        | integrity gap: kode tak terverifikasi berjalan di jalur mengetik                                    | biner helper milikmu, satu tim signature, verifikasi cdhash sebelum eksekusi               |
| 8   | `shell_quote` buatan sendiri di Lua untuk menyusun perintah                                                      | permukaan injeksi dari teks/komentar kamus                                                          | `posix_spawn` argv array                                                                   |
| 9   | Nama job `tmp/ai_box_jobs/job-<epoch>-<counter>`                                                                 | dapat ditebak → race/symlink attack di direktori user                                               | `0700` + UUID + `open(..., O_EXCL\|O_NOFOLLOW)`                                            |
| 10  | Kontradiksi konfigurasi telemetri (`FIREBASE_ANALYTICS_COLLECTION_ENABLED=true` vs `IS_ANALYTICS_ENABLED=false`) | klaim privasi tidak bisa dibela                                                                     | satu sumber kebenaran (`user_consents`) + gerbang aktivasi SDK **setelah** consent         |
| 11  | Dua basis API (`keysake.ai/api`, `tygo.apps.wisebox.ai/api`) & alamat support domain vendor lain                 | kebingungan auditan/kepatuhan                                                                       | satu domain milik sendiri; env diberi nama; support di domain produk                       |

Hal yang justru **baik** dan layak ditiru: validasi arsip saat instalasi (anti path traversal / hardlink /
absolute link / tipe file / panjang path), `manifest.json` + SHA-256 untuk resource engine, allowlist host untuk
login web, state UI untuk setiap kegagalan instalasi, dan saklar `INPUT_INSTALL_ERROR=1` untuk menguji jalur gagal.

## 3. Kapabilitas sensitif yang harus kamu jelaskan ke user

- IME **membaca seleksi teks** aplikasi host (`attributedSubstringFromRange:` / `selectedRange`)
  **[KEYSAKE/IF]**. Itu kapabilitas setara clipboard reader. Mitigasi: hanya saat user menekan aksi koleksi,
  tampilkan pratinjau, jangan auto-upload, dan dokumentasikan di halaman privasi.
- IME **menyuntikkan teks** (`insertText:replacementRange:`). Jangan dipakai untuk auto-completion tanpa aksi user.
- Telemetri Crashlytics mengirim stack + versi OS + model perangkat; default-kan **mati** sampai user mengizinkan.
- Language pack: Apple yang mengunduh model; produkmu tidak menyimpan apa pun — sampaikan ini sebagai nilai jual.

## 4. Postur AI/LLM

- **Retensi nol** untuk teks yang tidak dikoleksi user: log hanya hash/panjang/task/biaya (lihat 02 §4).
- Jangan pernah melatih model dari konten user tanpa `user_consents.kind='ai_training'` eksplisit (opt-in).
- Prompt-injection: hasil LLM tidak pernah di-eksekusi/di-interpolasi ke tool; tugas `文献` memakai retrieval,
  bukan output model mentah (04 §6).
- Redaction sebelum kirim: pola seperti nomor kartu/ID/nomor telepon → ganti token `<REDACTED:*>`, dan tampilkan
  jumlah redaksi di UI supaya jujur.
- Mode "on-device only" (04 §12) harus benar-benar bisa dibuktikan: sediakan tombol "hitung byte outgoing hari ini".

## 5. Lisensi (ini yang paling sering salah di produk IME)

Dari `Licenses/` di bundle Keysake **[KEYSAKE]**: librime (BSD), librime-lua (BSD), OpenCC (Apache-2),
LevelDB, Marisa, Darts-clone, Lua, yaml-cpp, RapidJSON, Boost, Unicode, **`rime-frost-GPL-3.0.txt`**,
`rime-easy-en-LICENSE`, `rime-wubi-LICENSE`, dan beberapa `*-SOURCE.md`.

- **GPL-3.0 data/kamus.** Kalau kamus GPL dianggap bagian dari program (dan kamu menggabungkannya ke bundle),
  kewajiban distribusi sumber bisa menempel. Tindakan: (a) pakai kamus berlisensi BSD/MIT/Apache/CC bila ada,
  (b) bila tetap memakai rime-frost/ice, pisahkan sebagai data yang dapat diganti, sediakan tautan sumber &
  build script, dan minta pendapat hukum — jangan hanya menaruh file `GPL-3.0.txt` lalu menganggap selesai.
- **Apple `Translation.framework`.** Pakai via API resmi, jangan ekstrak modelnya; **[VERIFY]** syarat komersial.
- **Sparkle** MIT; **Alamofire** Apache-2; **Firebase** — perhatikan Google Analytics terms & kebijakan
  penggunaan data, plus kewajiban SKAN/ATT bila kamu memakai AdServices (Keysake men-link StoreKit/AdServices
  lewat Firebase **[KEYSAKE]**).
- **Font**: Gochi Hand & Figtree keduanya OFL — wajib menyertakan lisensi (Keysake sudah done
  `gochihand-OFL.txt`, `figtree-OFL.txt` **[KEYSAKE]**); kalau kamu merender via `tygo_font_filter` setara,
  cantumkan juga di "Tentang".
- Sediakan layar **Pernyataan Terbuka** yang dihasilkan otomatis dari `licenses/` + SBOM (`cyclonedx-py`/`syft`).

## 6. Kepatuhan regional **[BLUEPRINT]**

Karena targetmu penulis Mandarin: pertimbangkan PIPL (China) untuk data yang keluar perangkat, dan sediakan
titik kehadiran data (region) sejak desain skema — kolom `region` di `installations` sudah ada. Kalau kamu
menyimpan konten user di luar China, dokumentasikan; kalau tidak (disarankan: on-device + enkripsi end-to-end
untuk koleksi), risiko regulasimu turun drastis.

## 7. Uji keamanan praktis

```bash
# 1) pastikan mode & kepemilikan IME benar (tidak boleh writable oleh grup user)
ls -lO /Library/Input\ Methods/<IME>.app/Contents/MacOS/<IME>
# 2) tidak ada rahasia di file user
grep -RniE 'token|api[_-]?key|secret' ~/Library/<App>/ | head
# 3) tidak ada teks user di argumen proses saat mengetik
ps -axo command | grep -i <bridge>
# 4) verifikasi signature & requirement
codesign -dvvv --requirements - /Library/Input\ Methods/<IME>.app
# 5) tolak downgrade & paket hash salah (uji manual dengan memodifikasi manifest)
```

Sertakan hasil ini di pipeline rilis sebagai artefak, bukan hanya di dokumen.
