# Desain: UI/UX parity Keysake untuk web waddle (id → en)

Tanggal: 2026-10-25 · Status: disetujui untuk dikerjakan (permukaan: web typing studio; sesi 1 = inti, sesi 2 = chrome)
Pemilik: goal `1792937489138-f8f9b1`

## 0. Baseline terukur hari ini (bukan dugaan)

Diukur dengan probe di `.rea/work/measure-assist.ts` terhadap 15 kalimat Indonesia realistis:

| Metrik | Nilai |
|---|---|
| Baris kamus `glossary-id-en.ts` | 214 (±211 token unik) |
| Token dikenali | **50,8%** |
| Kalimat selesai penuh | **1 dari 15** |
| Kandidat yang dihasilkan per klausa | **rata-rata 1,0** |
| `engineLimits.pageSize` di rilis pengaturan | 9 |

Kesimpulan yang tidak bisa ditawar: panel kandidat 9 sel ala Keysake **tidak mungkin** diisi oleh generator
yang menghasilkan 1 kandidat. Karena itu UI sekarang tampak "form + daftar". Perbaikan mesin kandidat adalah
prasyarat desain visual, bukan pemanis.

Layar yang sudah ada: kanvas ketik (textarea) + 1 daftar kandidat + 3 tombol tugas AI + simpan; Koleksi dengan
filter tanggal + cari (QUERY); Akun (profil, uji koneksi, hapus). Yang belum ada: preedit per-tekanan, panel
menempel caret, halaman kandidat, action bar lengkap 4 tugas, panel dwibahasa Shift+Space, FragmentPanel +
toast batas, banner state (loading/refresh/gagal/kosong), sidebar pengaturan.

## 1. Batas dan prinsip

- Yang ditiru 100% = **arsitektur layar, kerapatan, dan model interaksi** Keysake. Yang tidak ditiru = aset
  berhak cipta mereka (`Assets.car`, ikon, font bawaan, string Mandarin). Semua copy ditulis ulang dalam
  bahasa Indonesia.
- v1 hanya Indonesia → Inggris, hanya permukaan web. Tidak ada keyboard sistem di sesi ini.
- Angka paritas tidak di-hardcode di komponen: dibaca dari **rilis pengaturan server** (`engineLimits.pageSize`,
  `stabilityDelayMs`, `actionDeadlineMs`, `shortcuts`, `copy`) — sama seperti IME Keysake membaca
  `SettingsStore` milik app, bukan punya sendiri.
- Serving tanpa token: LLM hanya (a) aksi eksplisit user pada satu klausa, (b) proses build kamus offline.
  Tidak ada pemanggilan LLM per tekanan tombol.

## 2. Arsitektur

**Kepemilikan.** Semantik hidup di `packages/engine` (pure TS, tanpa DOM); web hanya renderer. Reducer komposisi
baru `packages/engine/src/lib/composition.ts` ikut di-test tanpa browser dan bisa dipakai ulang oleh
desktop/Android nanti tanpa ditulis ulang.

**Komponen web** (`apps/web/src/components/`):

- `TypingSurface` — contenteditable (bukan textarea) supaya caret punya geometri; mengelola selection, caret rect, dan keydown → action reducer.
- `CandidatePanel` — sel dua baris (id/inggris, urutan menghormati `englishFirst`), navigasi halaman, state loading, badge sumber per sel, `ExpandCellView` analog untuk teks panjang.
- `ActionBar` — 4 tugas dari registry server (Terjemahkan / Parafrase / Rujukan / Jelaskan).
- `FragmentPanel` — panel dwibahasa "koleksi teks ini": pratinjau klausa + pasangan en + bintang + toast batas.
- `CollectionRail` — daftar per tanggal lokal user, day-strip kalender, banner state, empty/placeholder.
- `StatusBanner` — satu komponen untuk loading/refresh/gagal/kuota/sesi-hilang; teks dari `copy` server bila ada.

**Alur data.** keydown → reducer → `{ preedit, clause, page, selection }` → `CandidateEngine.suggest()` (sinkron,
lokal, deterministik) → panel. Spasi/angka mengambil kandidat → commit ke buffer. Bintang →
`POST /v1/contents/batch` satu item. Aksi AI → `POST /v1/ai/tasks/:task` dengan deadline klien
`actionDeadlineMs`.

## 3. Mesin kandidat (yang membuat panel 9 sel jujur)

`CandidateEngine.suggest(clause)` menghasilkan maksimum `pageSize` varian, berurutan, tanpa sel kosong palsu:

1. max-match frasa (`PhraseBook`, sudah ada) — kandidat utama.
2. sense kedua kata ambigu (`bisa` → can / able to), diperluas ke semua token ambigu, bukan hanya 2 terakhir.
3. **register**: varian santai / formal / literal per sense (kolom baru di baris kamus: `register`).
4. **morfologi** (`morphology.ts`): bentuk berimbuhan diurai ke lemma + pola, sehingga `menolong/ditolong/
   penolong/tolongan` cukup satu entri lemma. Ini yang menaikkan coverage tanpa menulis jutaan baris.
5. **varian susunan** untuk pola umum (`X diundur ke Y` → 2-3 susunan Inggris yang wajar).
6. fallback parsial: frasa terpanjang yang cocok, sisanya `[token]`.

Setiap kandidat membawa `{ text, coverage, sumber, badgeLane }`. `sumber` menentukan badge: `phrase`, `sense`,
`register`, `morph`, `partial`. Badge lane tetap milik jalur AI (`local-dictionary` vs `remote-llm` vs cache).

Token tak dikenal: ditampilkan apa adanya (`[sepuluh]`), tidak pernah diisi karangan. Pengiriman daftar token
ke server (`POST /v1/lexicon/gaps` + tabel `unknown_token_counts(user_id, day, token, count)`) adalah **item
tambahan yang tidak memblokir sesi 1**: hanya aktif bila user menyalakan `flags.telemetryEnabled` di Akun
(default mati, sama seperti seed sekarang), hanya token tunggal (bukan kalimat), dan kalau kamu menolak fitur
ini kamus tetap tumbuh dari korpus probe saja.

## 4. Kamus: dibangun offline, bukan ditulis tangan

- `scripts/build-glossary.ts` — head-list (±3.000 lemma frekuensi tinggi → diekspansi morfologi jadi ±9.000
  bentuk + ±2.500 frasa percakapan yang polanya kita susun) dikirim ke gateway AI kita sendiri dalam batch 40
  baris/permintaan, checkpoint-able, idempoten, hasil ke `packages/engine/src/data/glossary.gen.ts` (+ header
  berisi tanggal build, hash sumber, dan laporan coverage). Biaya terukur: **$0,095 untuk 12.000 baris**
  (harga tercatat di `ai.service.ts`: $0,15/MTok in, $0,60/MTok out).
- `glossary.overrides.ts` — koreksi kurasi manusia, kecil, menang atas file generated.
- `glossary-id-en.ts` yang sekarang tetap ada sebagai seed/contoh dan tidak jadi sumber utama.
- Gerbang mutu (wajib diukur ulang di CI): pada korpus probe 60 kalimat yang kita tulis sendiri
  (`packages/engine/src/lib/corpus.probe.ts`): **≥85% token dikenali** dan **≥70% kalimat selesai penuh**.
  Baseline yang dicatat hari ini: 50,8% dan 1/15.
- Lisensi: tidak memakai kamus GPL (rime-frost/rime-ice) dan tidak scraping sumber berhak cipta — data hasil
  build kita sendiri + koreksi kita sendiri.

## 5. Peta layar Keysake → web (sesi 1)

| Keysake (bukti dari biner) | Waddle web |
|---|---|
| `CandidatePanel`, `CandidateCellView`, `CandidateGridView`, `CandidateLoadingView`, `ExpandCellView` | `CandidatePanel` menempel caret; sel dua baris; halaman `pageSize`; skeleton saat recalculating |
| `CandidateDisplaySettings` (`englishFirst`, `磅 12/14/16/18`) | pengaturan urutan + ukuran font kandidat (dipakai di sesi 2, hook-nya disiapkan sekarang lewat settings release) |
| `ai_box_actions.lua` 译英/译中/改写/文献 | `ActionBar` 4 tugas id→en dari registry `/v1/ai/tasks`: Terjemahkan, Parafrase, Rujukan, **Jelaskan** (`explain_correction` — tombol ke-4 yang belum ada di toolbar sekarang; `translate_to_chinese` sengaja tidak diganti) |
| `FragmentPanel*`, `FragmentCollectButton`, `FragmentLimitToastView` | `FragmentPanel` dwibahasa + bintang + toast batas/kuota |
| `CollectionView`, `CollectionCalendarView`, `LibraryEmptyView`, `CollectionPlaceholderView`, banner `CollectionLoading/Refresh/LoadFailure` | `CollectionRail` + day-strip + 5 state + retry |
| `「Shift+空格键」查看中英对照` | Shift+Space membuka/menutup `FragmentPanel` (id↔en); Ctrl/Cmd+Enter menyimpan |
| `正在拉取收录`, `当天暂无收录`, `中文已收藏，译文待补充` | copy kita: "Sedang mengambil…", "Tidak ada di tanggal ini", "Tersimpan, terjemahan menyusul" |

Sesi 2 (dicatat, tidak dikerjakan sekarang): sidebar Display + pratinjau, panduan Shortcut, Profil/hapus akun,
Umpan balik, HUD update, onboarding carousel.

## 6. State & error

- Setiap panel/rail punya 5 state eksplisit: `idle · loading · ready · empty · failed`, dengan retry; tidak ada
  spinner tanpa ujung.
- Aksi AI dibatasi `actionDeadlineMs`; lewat batas → banner "Melewati batas waktu server" + tombol coba, bukan
  menunggu selamanya.
- Kuota habis → memakai `retryAfterMs` dari envelope: toast "Kuota hari ini habis, reset pukul X".
- Sesi mati → `action: reauthenticate` dari envelope langsung memindahkan user ke tab Akun dengan pesan
  Indonesia; tidak ada `alert()`.
- API mati (`/healthz` gagal) → banner tetap, tapi `CandidatePanel` **tetap bekerja** (kamus lokal adalah
  nilai produk; ini juga yang diuji ke baliknya: fitur inti tidak boleh bergantung jaringan).

## 7. Mutu visual

Token desain yang ada dipakai ulang (kontras, dark mode, `:focus-visible` sudah ada). Arah visual: kerapatan
panel IME — baris rapat, angka kecil di kiri sel, satu garis pemisah, bukan card marketing; skala font kandidat
12/14/16/18 mengikuti konvensi Keysake; ikon SVG inline buatan sendiri; tanpa gradien generik, tanpa emoji
sebagai ikon; semua interaksi bisa keyboard; `prefers-reduced-motion` dihormati; kontras teks ≥ 4.5:1.

## 8. Verifikasi (semua wajib hijau sebelum goal kuklaim selesai)

1. `nx run-many -t typecheck|lint|test|build` untuk 5 project.
2. Unit: transisi reducer (≥20 kasus: digit, spasi, Esc, panah, halaman, batas buffer), determinisme
   `CandidateEngine`, aturan morfologi, gerbang coverage korpus 60 kalimat, pembacaan engineLimits dari server.
3. `pnpm smoke` tetap 15/15 dan `pnpm check:query` tetap 18/18.
4. Browser nyata (bukan hanya build): ketik kalimat Indonesia → panel tampil dengan N sel (dilaporkan jujur),
   angka 2 memilih kandidat, Spasi mengambil, Shift+Space membuka panel dwibahasa, bintang menyimpan, item
   muncul di `CollectionRail` dan kalender, dan pencarian tetap jalan.
5. State diuji dengan mematikan API (failed banner) dan user baru (empty state).
6. Keyboard-only walkthrough + cek kontras.
7. Laporan akhir memuat tabel coverage sebelum/sesudah, jumlah baris kamus baru, dan tangkapan layar.

## 9. Non-goals sesi ini

Keyboard sistem (Android/iOS/macOS), pembayaran/langganan, provider LLM baru, multi-bahasa di luar id→en,
dan pemindahan data Keysake mana pun.

## 10. Risiko terbesar (disebutkan, bukan dikubur)

- **Morfologi Indonesia lebih produktif daripada yang bisa ditutupi aturan**; kalau gerbang 85% tidak
  tercapai dengan 12.000 baris, naiknya head-list (bukan kualitas prompt) yang harus ditambah, dan itu tetap
  di bawah $1.
- **Contenteditable + caret rect** adalah bagian paling rawan lintas browser; mitigasi: fallback ke posisi
  mirror-div bila `caretRangeFromPoint`/`getClientRects()` kosong, plus test manual di Chromium.
- **Telemetri token** harus default mati dan hanya token; kalau kamu tidak mau itu, kita buang dan kamus
  tumbuh berdasarkan korpus probe saja.
