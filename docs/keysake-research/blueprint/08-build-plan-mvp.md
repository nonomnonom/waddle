# 08 — Rencana pembangunan, estimasi, dan posisi produk

## 1. Tebakkan yang harus kamu menangkan dulu (urutan risiko)

| #   | Hipotesis                                                                     | Cara memvalidasi                       | Biaya bila salah                                            |
| --- | ----------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------- |
| H1  | Input method per-user (`~/Library/Input Methods`) berfungsi tanpa admin       | spike 1 hari di macOS 15 & 26          | seluruh UX onboarding berubah                               |
| H2  | `Translation.framework` zh↔en cukup baik & cukup cepat untuk 9 kandidat live | spike 1 hari + 30 contoh kalimat nyata | nilai jual utama hilang → harus pakai LLM (biaya & latensi) |
| H3  | Satu process IME tidak bisa punya dua user dir / hot-swap resource            | baca kode + uji                        | desain deploy harus "sekali jalan"                          |
| H4  | User benar-benar mengoleksi teks (核心价值 收录)                              | prototype: collect → view per tanggal  | kalau nol, produk jadi sekadar IME biasa                    |
| H5  | Aksi 文献 dipakai cukup untuk dibebankan biayanya                             | telemetri opt-in                       | matikan tugas, hemat 60% biaya AI                           |

H1 dan H2 adalah **go/no-go**. Kunci dua spike itu sebelum menulis apa pun yang lain.

## 2. Fase **[BLUEPRINT]**

| Fase                   | Durasi           | Hasil yang bisa didemokan                                         | Exit criteria                                    |
| ---------------------- | ---------------- | ----------------------------------------------------------------- | ------------------------------------------------ |
| 0. Spike               | 5 hari           | IME skeleton + TIS enable + Translation batch live                | H1/H2 terjawab, ada angka latensi                |
| 1. Engine              | 2–3 minggu       | mengetik pinyin dengan kandidat (kamus bersih), halaman, commit   | crash-free 200 sesi, memori <80 MB               |
| 2. Panel dwibahasa     | 2 minggu         | kandidat = zh + en, pengaturan urutan/ukuran font                 | p95 render <80 ms, cache L0 bekerja              |
| 3. Koleksi & sinkron   | 3 minggu         | Shift+Space → panel → star → app 收录 per tanggal                 | idempoten, partial-success, offline queue benar  |
| 4. Akun & backend      | paralel 3 minggu | Sign in with Apple + web PKCE, DB 02, API 03                      | kontrak lulus Schemathesis; rate limit aktif     |
| 5. AI gateway          | 3 minggu         | 译英/译中 (fallback) + 改写 + 文献                                | cache hit ≥40%, p50 <700 ms, quota & kill switch |
| 6. Pengaturan & IPC    | 2 minggu         | app → IME sinkron tanpa restart                                   | `settingsVersion` idempoten, zero token di file  |
| 7. Installer & update  | 2 minggu         | install bersih, upgrade, rollback, Sparkle + release IME terpisah | checklist 06 §6 hijau                            |
| 8. Hardening & lisensi | 2 minggu         | consent gate, redaksi, SBOM, pernyataan terbuka                   | 11 temuan 07 §2 tidak ada yang muncul            |
| 9. Beta                | 3–4 minggu       | 200–500 user Mandarin-writers                                     | retensi D30, crash rate, cost/user               |

Total ke beta: **±15–18 minggu** untuk tim 3 orang (1 macOS/IME native, 1 backend+infra, 1 produk/design),
dengan catatan engineer macOS pernah menyentuh `IMKServer` sebelumnya. Kalau tidak, tambah 3–4 minggu —
IME adalah domain yang banyak "tahu setelah dicoba".

## 3. Cut MVP yang saya sarankan (kalau harus memangkas)

Ambil: fase 0–3 + 4 (minimum: akun + collect) + 7. **Buang dari MVP**: AI gateway penuh (cukup satu aksi:
`paraphrase`), 文献, statistik, grammar analysis, language-pack UX mulus (cukup deteksi + deep link),
multi-perangkat. Alasannya: nilai yang bisa dijelaskan dalam satu kalimat adalah
"kamu melihat terjemahan Inggris dari apa yang kamu tulis dalam Mandarin, dan bisa menyimpannya" —
itu semuanya lokal + satu tabel `contents`.

## 4. Struktur tim & kepemilikan

| Peran                   | Memiliki                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| macOS/IME engineer      | panel, librime bridge, installer, stabilitas                                             |
| iOS/backend engineer    | API, skema, auth, quota, AI gateway                                                      |
| Product/design          | onboarding copy (bahasa Mandarin asli, bukan terjemahan), panduan visual per state gagal |
| (kontraktor) linguistik | kamus/skema Rime & QA akurasi terjemahan                                                 |

## 5. Posisi produk — membaca celah dari artefak **[KEYSAKE → BLUEPRINT]**

Celah yang terbukti ada di kompetitor ini:

1. **Grammar analysis sudah di-serve tapi belum di-UI-kan** (endpoint `v1/contents/grammar-analysis`,
   tipe `AnalyzeGrammarRequest`, tapi nol string UI "语法/纠错" di biner). Tampil inline di marked text adalah
   differentiator yang murah untuk kamu.
2. **UI-nya Mandarin-only untuk teks kunci** dan onboarding-nya panjang (install → enable → language pack →
   restart menu). Versi yang lebih pendek — atau install per-user tanpa admin bila H1 lolos — menang di konversi.
3. **Mereka tidak bisa menjanjikan "teks tidak keluar perangkat"** karena AI box-nya remote + membaca seleksi host.
   Mode on-device-only yang bisa dibuktikan (04 §12) adalah klaim yang bisa kamu pertahankan dan mereka tidak.
4. **Sakunya adalah protokol jembatan**, bukan aplikasinya. Publikasikan Typing Action Protocol dan beri
   contoh integrasi untuk Rime/Fcitx: kamu dapat distribusi, dan produk tetap berdiri sendiri.
5. **Update IME butuh admin** = laju perbaikan lambat (app build 34 vs IME build 54 **[KEYSAKE]**).
   Kalau H1 lolos, kamu bisa merilis perbaikan kamus/LOGIC per-user tanpa prompt admin → kecepatan iterasi
   sebagai keunggulan struktural.

## 6. Metriks yang harus ada di dashboard sejak hari pertama **[BLUEPRINT]**

- Aktivasi: download → install selesai → input source aktif → mengetik 100 karakter → mengumpulkan 1 item.
- Kualitas: rata-rata posisi kandidat terpilih, halaman per commit, `keystrokes/committed chars`.
- Terjemahan: latensi L0 p50/p95, `canRequestDownloads=false` share, empty-translation rate.
- AI: cache hit per task, p50/p95 token pertama, biaya/user/hari, quota-exceeded rate.
- Stabilitas: crash rate per sesi, IME restart rate, "engine deploy failed" rate, install success per macOS versi.
- Privasi (kepercayaan): byte outgoing rata-rata per user-hari (target 0 di mode lokal).

## 7. Risiko yang bisa membunuh proyek

| Risiko                                              | Kemungkinan   | Mitigasi                                                               |
| --------------------------------------------------- | ------------- | ---------------------------------------------------------------------- |
| Apple mengubah/membatasi `Translation.framework`    | sedang        | isolasi di `TranslationKit`, fallback ke LLM + provider terjemahan     |
| macOS menolak instalasi IME per-user                | sedang–tinggi | jalur `.pkg` cadangan sejak fase 0, jangan tulis ulang installer nanti |
| Biaya LLM meledak karena pemakaian per-keystroke    | tinggi        | router 04 §2, speculative trigger, cache, kill switch per task         |
| Lisensi kamus                                       | tinggi        | ganti ke sumber BSD/CC sebelum beta publik                             |
| Kompetitor (Keysake/Sider) punya distribusi & brand | tinggi        | menangkan di latensi, privasi terbukti, dan kecepatan rilis per-user   |

## 8. Langkah pertama yang saya ambil besok

1. Buka Xcode, buat dua target (App + IME bundle) dengan App Group & keychain group yang sama, daftarkan
   `ComponentInputModeDict`, dan **verifikasi H1**: instal ke `~/Library/Input Methods`, registrasi TIS, enable,
   pilih, dan ketik di Notes serta Safari.
2. Dalam project yang sama, panggil `TranslationSession(installedSource: .zhHans, target: .en)` untuk 9 string
   dan catat p50/p95 + kualitas terjemahan → **verifikasi H2**.
3. Simpan kedua angka itu di `docs/decisions.md`; keputusan lain (kamus, panel, protocol) mengikuti.

Dua spike itu menjawab ±60% risiko teknis dari seluruh konsep ini, dan keduanya tidak butuh backend sama sekali.
