# 04 — Integrasi AI: desain yang saya rekomendasikan

## 1. Fakta dari Keysake yang jadi titik awal **[KEYSAKE]**

| Fakta                                                           | Bukti                                                                                                                        |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Ada 4 tugas AI di dalam IME: 译英 / 译中 / 改写 / 文献          | `Rime/lua/ai_box_actions.lua` (`translate_to_english`, `translate_to_chinese`, `paraphrase`, `find_supporting_references`)   |
| Tugas generatif dieksekusi **di luar** proses IME, lewat Python | `ai_box_processor.lua:452/521` → `io.popen` / `os.execute("nohup … &")`, default `python_bin = /usr/bin/python3` (baris 644) |
| Streaming aktif secara default                                  | `env.enable_stream` default `true` (baris 651-653)                                                                           |
| Anggaran waktu: 12 detik sinkron, +8 detik tunggu asinkron      | `timeout_seconds or 12`, `wait_timeout_seconds or timeout+8`                                                                 |
| Pemantik UI: ketik kode idle, bukan tombol                      | `idle_code` default `zzzzaibox`; refresh native `F20` (`native_refresh_key`)                                                 |
| Hasil dipisah separator kontrol `\x19`                          | `kResultSeparator = "\31"`                                                                                                   |
| Script & kredensial **tidak** ada di DMG                        | hanya path `~/Library/Rime/scripts/rime_ai_*.py` + `rime_ai.local.json` yang direferensikan                                  |
| Terjemahan kandidat adalah lane **lokal**, bukan LLM            | impor `TranslationSession` di app & IME; UI "unduh language pack" menunjuk System Settings; `当前系统暂不支持中英翻译。`     |
| Tidak ada model neural di paket                                 | semua `.bin` = tabel Rime (marisa/LevelDB); nol CoreML/ONNX/GGUF; nol string ollama/localhost                                |
| Fitur AI butuh akun                                             | `请先登录账号`, `无法保存登录凭证…共享钥匙串`, error prefix `AI 请求失败：`                                                  |

Kesimpulan arsitektural: **Keysake memakai model "offline-first untuk yang repetitif, online untuk yang generatif"**.
Itu keputusan yang benar dan harus kamu pertahankan.

## 2. Dua lane, satu router **[BLUEPRINT]**

```
                 ┌──────────────────────────── client (IME) ────────────────────────────┐
input稳定 >350ms → router.task(text, task)                                                │
                 │                                                                       │
                 ├─ L0 lokal (0–40 ms)  : Apple Translation zh↔en, kamus, normalisasi      │
                 ├─ L1 cache (0–5 ms)   : shared cache disk + memori (normalized hash)     │
                 ├─ L2 remote (p50 700ms, cap 3.0s) : AI gateway streaming                 │
                 └─ L3 degradasi        : tampilkan "tunggu" lalu isi, atau fallback L0     │
```

Aturan router yang saya sarankan, eksplisit supaya tidak jadi perdebatan nanti:

1. `translate_to_english` / `translate_to_chinese` → **selalu coba L0/L1 lebih dulu**. LLM hanya dipakai bila
   (a) user meminta register/gaya, (b) kalimat > 60 karakter dan L0 gagal, (c) konteks paragraf dibutuhkan.
   Ini kebalikan dari Keysake (mereka menjalankan LLM untuk semua aksi AI box) dan memangkas biaya ~90%.
2. `paraphrase` / `find_supporting_references` → langsung L2 (tidak ada padanan lokal yang layak).
3. Tidak pernah memanggil L2 tanpa kandidat yang sudah di-stabilkan (lihat §4) — panggilan sia-sia adalah
   pembakar uang terbesar di produk seperti ini.
4. Semua jalur punya `AbortController`; teks berubah = batalkan request in-flight, jangan ditumpuk.

## 3. Registry tugas (initial) **[BLUEPRINT]**

| code                          | label zh | label en   | lane   | max input | timeout | cache TTL |
| ----------------------------- | -------- | ---------- | ------ | --------- | ------- | --------- |
| `translate_to_english`        | 译英     | Translate  | L0→L2  | 2000 char | 3.0 s   | 30 hari   |
| `translate_to_chinese`        | 译中     | Translate  | L0→L2  | 2000 char | 3.0 s   | 30 hari   |
| `paraphrase`                  | 改写     | Rewrite    | L2     | 2000 char | 4.0 s   | 7 hari    |
| `find_supporting_references`  | 文献     | References | L2+API | 1200 char | 8.0 s   | 7 hari    |
| `explain_correction` _(baru)_ | 讲解     | Explain    | L2     | 1200 char | 4.0 s   | 30 hari   |
| `tone_adjust` _(baru)_        | 语气     | Tone       | L2     | 2000 char | 3.0 s   | 7 hari    |
| `summarize` _(baru)_          | 摘要     | Summarize  | L2     | 8000 char | 8.0 s   | 7 hari    |

Perluas registry lewat tabel `ai_tasks` di server (02), **jangan** hardcode di klien: Keysake menyimpan daftar
aksinya di file Lua di dalam bundle, sehingga menambah tugas = rilis ulang IME (yang butuh install ulang admin
**[KEYSAKE]**). Itu jebakan operasional; buat tugas dapat ditambahkan dari server.

## 4. Latency engineering (yang menentukan produk ini terasa "ajaib" atau "rusak")

| Tahap                     | Budget                                      | Cara mencapainya                                                                                                      |
| ------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Deteksi "input stabil"    | 350 ms idle setelah commit/kandidat dipilih | timer di Swift; jangan trigger per-keystroke                                                                          |
| Speculative prefetch      | paralel dengan render kandidat              | panggil `translate` untuk kalimat committed sebelum user membuka AI box                                               |
| Pertama tampil (skeleton) | <80 ms                                      | selalu tampilkan slot "…"/spinner dulu (Keysake: `candidateTranslationLoading`, `CandidateLoadingView` **[KEYSAKE]**) |
| Token pertama L2          | p50 ≤700 ms, p95 ≤1.5 s                     | streaming; model kecil; region inference dekat user; HTTP/2 keep-alive                                                |
| Total                     | cap 3 s lalu degradasi                      | jangan pernah menahan panel kandidat >1 s                                                                             |
| Cache                     | hit target ≥40% translate, ≥15% paraphrase  | key di §5                                                                                                             |

Detail implementasi yang sering salah: **jangan** sinkronkan UI ke `Task` Swift di thread main saat streaming;
baca `URLSession` bytes → parse NDJSON per baris → publish ke panel lewat satu `AsyncStream<CandidateUpdate>`.

## 5. Kunci cache & versioning prompt **[BLUEPRINT]**

```
cache_key = sha256( task | model | prompt_version | target_lang | normalize(input) | context_mode )
```

- `normalize()` = NFKC → lowercase → hapus semua whitespace berlebih → strip punctuation trailing.
- `context_mode` = `none` | `sentence` | `paragraph` (jangan hash teks konteks penuh; itu membunuh hit-rate).
- Simpan `prompt_version` di DB (`task_prompt_versions`) dan di respons AI; tanpa itu kamu tidak akan pernah
  bisa menjelaskan mengapa hasil berubah.
- Cache dua tingkat di klien: memori LRU 512 entri + disk (`Application Support/cache/ai-v1/`, mode `0600`).

## 6. Tugas "文献" (find_supporting_references) — jangan pakai memori model

Keysake punya aksi ini di UI, jadi pasarnya ada. Cara yang benar **[BLUEPRINT]**:

1. **Ekstraksi** klaim/entitas dari teks (small model / prompt singkat, output JSON `{queries: [...]}`).
2. **Cari** di sumber bibliografi nyata: Semantic Scholar (Graph API), Crossref, arXiv, OpenAlex.
3. **Rank & dedup** (cosine pada embedding judul+abstrak vs kalimat sumber) → ambil 3–5.
4. **Format** kandidat: `judul — penulis (tahun) tautan`; simpan `provider` + `query_hash` ke `reference_cache`.
5. **Anti-halusinasi**: jangan pernah merangkai kutipan dari bobot model; kalau skor rendah, kembalikan
   "tidak ditemukan" daripada mengarang. Sertakan `retrieved_at` di payload supaya bisa diaudit.

Biaya tambahan per permintaan: 1 panggilan LLM kecil (~200 token) + 2–4 HTTP eksternal; latensi 8 s masuk akal.

## 7. Protokol jembatan: tiga opsi, dan mana yang saya pilih

| Opsi            | Cara                                                                                                                           | Kelebihan                                                                                    | Kekurangan                                                                                                                                                                   | Verdict                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| A. Keysake      | Lua → `io.popen("/usr/bin/python3" … --text "<teks user>")`                                                                    | gampang, tanpa IPC                                                                           | teks user di argv (kebocoran `ps`), spawn proses per aksi, kredensial di `rime_ai.local.json` plaintext, script tak ada di DMG = tak terverifikasi, bergantung python sistem | **Jangan**                               |
| B. CLI helper   | Lua → `keysake-ai --task x` dengan **stdin** untuk teks                                                                        | tetap sederhana, tidak ada argv leak, biner ikut ternotaris                                  | tetap spawn proses (2–20 ms), parsing NDJSON di Lua                                                                                                                          | Bagus untuk MVP & untuk engine non-Swift |
| C. Socket lokal | helper Swift (LaunchAgent) membuka `unix://…/ai.sock`; Lua memanggil `RimeNotificationBridge`/API kecil → Swift melakukan HTTP | tanpa spawn, satu titik auth (keychain), koneksi TCP di-reuse, bisa prefetch & batalkan rapi | perlu daemon lifecycle & auth socket                                                                                                                                         | **Rekomendasi final**                    |

**[BLUEPRINT] keputusan:** mulai dari **B** di MVP (satu biner helper kecil `ai-bridge`, mode `0755`, milik
`root:wheel`? tidak — milik user, di dalam bundle app yang di-staging), lalu pindah ke **C** begitu kamu punya
prefetch/speculative (§4) karena spawn-per-request tidak akan cukup cepat.

Kontrak protokol (berlaku untuk B dan C):

```
request  (stdin / socket, satu JSON per baris):
  { "jobId": "uuid", "task": "paraphrase", "text": "…", "sourceLang": "zh-Hans",
    "targetLang": "en", "deadlineMs": 3000, "context": null, "cache": true }

response (NDJSON):
  { "type": "delta", "jobId": "…", "text": "partial…" }
  { "type": "done",  "jobId": "…", "text": "final…", "cacheHit": false, "usage": {...}, "provider": "llm-x" }
  { "type": "error", "jobId": "…", "code": "quota_exceeded", "message": "…", "fallback": "local" }
```

Aturan keamanan wajib:

- **Selalu** kirim teks lewat stdin/socket, tidak pernah lewat argv.
- File job (kalau dipakai): direktori privat user dengan mode `0700`, file `0600`, nama `job-<uuid>` — bukan
  `job-<epoch>-<counter>` yang bisa ditebak seperti Keysake (`tmp/ai_box_jobs/job-<time>-<n>` **[KEYSAKE]**).
- Token diambil dari **keychain** oleh sisi Swift. Jangan pernah menulis token ke `~/Library/Rime/*.json`.
- Batasi panjang input di klien **dan** server (2000 char), potong dengan elipsis eksplisit, jangan diam-diam.
- Jangan pakai shell untuk menyusun perintah; `posix_spawn` dengan array argumen (menghilangkan kelas bug
  injeksi dari `shell_quote` buatan sendiri di `ai_box_processor.lua` **[KEYSAKE]**).

## 8. Prompt yang saya sarankan (baseline, versi 1)

`translate_to_english` (hanya dipakai bila L0 gagal):

```
system: Anda Penerjemah gaya-tight. Terjemahkan TIONGHOA KE INGGRIS.
Ketentuan: pertahankan nada, jangan menambah informasi, jangan menjelaskan.
Jika input sudah berbahasa Inggris, kembalikan teks asli apa adanya.
Keluarkan HANYA terjemahan.
user: {text}
```

`paraphrase`:

```
system: Tulis ulang kalimat user dalam bahasa yang sama.
Aturan: jangan ubah makna, jangan tambah fakta, 1–2 alternatif dipisah "\n---\n",
tanpa penjelasan, tanpa tanda kutip pembungkus.
user: {text}
```

`explain_correction` (untuk fitur grammar yang belum muncul di UI Keysake **[KEYSAKE]**):

```
system: Anda editor. Untuk tiap kesalahan kembalikan JSON:
{"start":int,"length":int,"fix":string,"why":string,"rule":string}
Hanya JSON. Jika tidak ada kesalahan: {"issues":[]}
user: {text}
```

Temperatur 0.2 untuk terjemahan/parafrase, 0 untuk ekstraksi JSON. `max_tokens` 512 (parafrase) / 900 (references).

## 9. Routing model & biaya (angka kerja, bukan vendor gospel) **[BLUEPRINT]**

| Tugas                | Prioritas 1                             | Prioritas 2              | Perkiraan biaya/1k permintaan |
| -------------------- | --------------------------------------- | ------------------------ | ----------------------------- |
| translate (fallback) | model kecil 8B/flash, region-lokal      | API terjemahan komersial | US$3–8                        |
| paraphrase           | mid-tier reasoning ringan               | small + 2-pass           | US$15–40                      |
| references           | small (ekstraksi) + retrieval eksternal | —                        | US$25–60 (termasuk outbound)  |
| explain_correction   | small, JSON mode                        | —                        | US$10–25                      |

Yang harus ada di gateway sejak hari pertama: pencatatan `usage_in/out` + `cost_micros` per permintaan
(kolomnya sudah ada di `grammar_analyses` dan `usage_counters`), quota per user per hari, dan **kill switch per
task** (`ai_tasks.enabled`) supaya kamu bisa mematikan fitur mahal tanpa rilis klien.

## 10. Failure matrix **[BLUEPRINT]**

| Kegagalan                     | Deteksi                                                  | Perilaku UI                                                                                |
| ----------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Tidak ada jaringan            | `URLError` / timeout                                     | slot tetap kosong + tooltip "jaringan"; jangan tampilkan error merah per kandidat          |
| Language pack belum siap (L0) | `TranslationSession` error / `canRequestDownloads=false` | deep-link ke Pengaturan → Bahasa (Keysake punya `LanguagePackDownloadGuide` **[KEYSAKE]**) |
| Token kedaluwarsa             | 401 `credential_invalid`                                 | hapus token, `didLogout`, tampilkan login di app — IME hanya berhenti diam                 |
| Quota habis                   | 402                                                      | tawarkan upgrade; cache tetap boleh dipakai                                                |
| Provider 5xx                  | 502 `ai_provider_error`                                  | 1 retry dengan backoff 250 ms, lalu degradasi ke L0                                        |
| Teks terlalu panjang          | klien                                                    | potong + badge "dipotong"                                                                  |
| Proses bridge mati (opsi A/B) | EOF/exit≠0                                               | tandai tugas tidak aktif 60 detik (circuit breaker), log ke os_log                         |

## 11. Yang Keysake lakukan salah di sini (dan kamu tidak boleh) **[KEYSAKE]**

1. Teks user di **argv** proses anak → terlihat di `ps`/monitor proses.
2. Kredensial & konfigurasi AI di **JSON plaintext** (`~/Library/Rime/rime_ai.local.json`).
3. Kode AI bridge **tidak ikut ter-sign/notarize** (Python + script tidak ada di DMG) → integrity gap.
4. Menyusun perintah shell dengan koutasi buatan sendiri → permukaan injeksi.
5. Menamai file job dengan pola dapat ditebak di `tmp/`.
6. Spawn interpreter sistem (`/usr/bin/python3`) — di Mac modern itu bergantung pada CLT dan bisa hilang.

## 12. Peluang diferensiasi (karena kamu bilang ingin membangun hal serupa, bukan menyalin) **[BLUEPRINT]**

Keysake menambal AI ke Rime dengan Lua + Python + file job. Celah produk yang saya lihat:

- **Protokol jembatan terbuka.** Definisikan "Typing Action Protocol" (kontrak §7) sebagai spesifikasi publik:
  engine apa pun (Rime, Fcitx5, Windows IME) bisa memanggil aksi generatif apa pun lewat socket lokal,
  tanpa shell. Tidak ada pemain yang punya standar ini sekarang; itu jalur adopsi yang kamu cari
  (dan itu sendiri bisa jadi lapisan bisnis, terpisah dari aplikasi Keysake-mu).
- **Local-first sebagai fitur jual.** Jalankan L0 (Apple Translation) **dan** L2 (model kecil on-device via
  `MLX`/CoreML, 3–4 bit, hanya untuk parafrase pendek) → tawarkan mode "tidak ada satu karakter pun keluar
  perangkat" yang bisa diverifikasi (metrics byte outgoing = 0). Keysake tidak bisa menjanjikan ini karena
  AI box-nya remote.
- **Sitasi nyata, bukan karangan.** Banyak AI writing tool salah kutip; retrieval-first (§6) adalah moat
  kredibilitas untuk pasar akademik/penulis Mandarin.
- **Jalankan grammar-analysis sebagai UI.** Endpoint-nya ada di Keysake tapi belum muncul di produk
  (tidak ada string UI "语法/纠错" di biner) **[KEYSAKE]** — itu bukti mereka baru siap 60%; kamu bisa jadi
  yang pertama menampilkannya: inline underline di marked text + popover 讲解.
