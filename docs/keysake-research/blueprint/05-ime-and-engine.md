# 05 — IME, mesin Rime, panel kandidat, dan terjemahan on-device

## 1. Kerangka IME macOS **[BLUEPRINT]**

Fakta Keysake **[KEYSAKE]**: `InputMethodServerControllerClass = TygoInputController`,
`InputMethodConnectionName = ai.tygo.inputmethod.input_Connection`, `LSBackgroundOnly` + `LSUIElement`,
`ComponentInputModeDict` hanya satu mode (`…input.Hans`, repertoire Hans/Hant), `TISIntendedLanguage = zh-Hans`,
`TICapsLockLanguageSwitchCapable = true`.

Yang kamu tulis:

```
KeysakeLike.app/Contents/
  Info.plist            // ComponentInputModeDict, InputMethodServerControllerClass, bundle id IME
  MacOS/<IME>           // main: NSApplication + IMKServer
  Resources/InputMethod/InputMethodInfo.plist   // kalau app utama membundel payload IME
  Resources/<Engine>.bundle/Contents/Resources/{Rime,Prebuilt,manifest.json}
```

Kelas inti (nama saya, struktur meniru yang terbukti di biner Keysake):

| Kelas                               | Tanggung jawab                                                                         | Padanan Keysake **[KEYSAKE]**                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `IMEController: IMKInputController` | `inputText(_:client:)`, `commitComposition`, `didCommandBySelector`, `selectCandidate` | `TygoInputController`                                                           |
| `EngineBridge`                      | FFI ke librime: `process_key`, `get_context`, `get_candidates`, `set_option`, `sync`   | `InputEngine`, `RimeNotificationBridge`                                         |
| `CandidatePanel`                    | NSPanel borderless dekat caret; render zh+en; page up/down; klik                       | `CandidatePanel`, `CandidatePanelPosition`, `CandidateCaretPlacement`           |
| `CandidateCellView`                 | 1 kandidat: teks utama, komentar, terjemahan, badge AI                                 | `CandidateCellView`, `CandidateCardView`, `CandidateGridView`, `ExpandCellView` |
| `ActionBar`                         | tombol 译英/译中/改写/文献 + star koleksi                                              | `ai_box_actions.lua` + `ai_box_view.lua`                                        |
| `FragmentPanel`                     | jendela "koleksi teks ini": pratinjau + star + batas                                   | `FragmentPanel*`, `FragmentCollectButton`, `FragmentLimitToastView`             |
| `SettingsStore`                     | baca/monitor pengaturan bersama                                                        | `SettingsStore`, `PinyinSettings`, `CandidateDisplaySettings`                   |
| `TranslationBroker`                 | `Translation.Session` zh↔en, batch, prefetch                                          | `InputTranslationSessionBroker`, `InputTranslationTaskHost`                     |

## 2. Panel: pakai milik sendiri, bukan `IMKCandidates` **[BLUEPRINT]**

Keysake membangun panel sendiri — bukti: string `仅支持代码创建候选面板`, `仅支持代码创建收藏窗口`,
`CandidatePanelSurface`, `FragmentPanelSurface` **[KEYSAKE]**. Alasannya benar: kamu butuh dua baris per kandidat
(zh + en), badge AI, dan animasi, yang tidak bisa dilakukan `IMKCandidates` bawaan.

Yang harus kamu lakukan agar tidak patah di berbagai aplikasi:

- Posisi: `client().candidateRect(for:preferred:attributes:)` lalu `setFrame(..., display: true)`;
  fallback ke caret rect; clamp ke screen-visible frame (multi-monitor + notch). **[VERIFY]** perilaku di app
  fullscreen/kiosk.
- `NSPanel` dengan `.nonactivatingPanel`, `level = .popUpMenu`, `collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]`,
  `hidesOnDeactivate = false`, `isOpaque=false`, `backgroundColor = .clear`.
- Jangan pernah mengambil fokus keyboard. Semua klik lewat mouse-down di panel + `performClick` ke engine.
- DWM-like concern: redraw hemat — pakai layer-backed view dan hanya update sel yang berubah (Rime memberi
  `Context` penuh; diff sendiri).

## 3. librime: integrasi yang benar

Keysake **mengompilasi statis** librime ke dalam biner IME (jejak build
`/Users/avery/Desktop/RESEARCH/Tygo/rime-source/librime/...` dan `rime_version: 1.17.0` di YAML **[KEYSAKE]**).
Rekomendasi saya **[BLUEPRINT]**:

1. Build librime sebagai **static lib per arsitektur** (xcframework-ish approach) + `librime-lua` bila butuh Lua;
   atau pakai **C API saja** (`rime_setup`, `rime_process_key`, `rime_get_context`, `rime_get_candidates`,
   `rime_schedule_sync`) dan hindari Lua untuk logika produk.
2. **User dir tunggal**: Keysake punya error `一个进程只能使用一个输入引擎用户目录。` dan
   `运行中的引擎不能切换预编译资源或部署模式。` **[KEYSAKE]** — artinya mereka belajar ini dengan cara keras.
   Tetapkan satu `~/Library/<App>/rime-user` saat startup, jangan pernah ganti setelah `rime_setup`.
3. **Prebuilt verification**: tiru `manifest.json` + SHA-256 Keysake **[KEYSAKE]**, tapi verifikasi **sebelum**
   menyalin ke user dir, simpan `engine_resource_version`, dan bila hash tidak cocok → jangan deploy, tampilkan
   `输入引擎无法启动部署` setara.
4. **Deploy mode**: start dengan `rime_set_option("sync_prebuilt...")`? tidak — lebih sederhana: deploy sekali saat
   instalasi/per-ubah-versi, jangan pernah hot-swap resource saat engine jalan.
5. **Fallback degradasi**: kalau `rime_ice` gagal dimuat (Keysake: `雾凇拼音方案加载失败`,
   `雾凇拼音或 Lua 模块加载失败` **[KEYSAKE]**), tetap biarkan user mengetik dengan skema sederhana bawaan +
   tampilkan banner pemulihan. Jangan bikin IME mati total.

## 4. Data linguistik (kamus & skema) **[KEYSAKE → BLUEPRINT]**

Bundle Keysake berisi: `rime_frost` (73 MB table) sebagai dict utama, `rime_ice.schema.yaml`, `melt_eng` (Inggris),
`radical_pinyin`, `cn_dicts{,_frost,_cell_frost,_common_frost}` (tencent/base/ext/GB18030/chess/food/medication/…),
`en_dicts/cn_en_*.txt` untuk 8 gaya input (abc, double_pinyin, flypy, jiajia, mspy, sogou, ziguang), `custom_phrase.txt`,
`symbols_v.yaml`, `opencc/emoji.json`, dan **33 modul Lua** — dengan `pageSize: 9`.

Keputusan untukmu:

- Ambil **rime-ice / rime-frost** hanya kalau kamu siap dengan konsekuensi lisensinya (lihat 07 §5: GPL-3.0 files
  ikut dibundel). Alternatif bersih: `rime-pinyin-simp`/`luna-pinyin` + kamus sendiri, atau lisensi komersial.
- Jangan ship 73 MB tabel tunggal di DMG kalau targetmu download conversion: ship **core** (~10–15 MB) lalu
  unduh paket besar di belakang layar dengan resume + hash check. Keysake membayar harga ini dengan pesan
  `下载时间较长…` untuk language pack **[KEYSAKE]** — jangan tambah lagi untuk kamus.
- Simpan `config_version` dan `__build_info.timestamps` seperti mereka; itu membuat bug "kamus lama + app baru"
  bisa direproduksi **[KEYSAKE]**.

## 5. Modifikasi Lua yang benar-benar dibutuhkan (dan mana yang tidak) **[BLUEPRINT]**

Keysake memakai Lua untuk 6 hal yang berguna; salin konsepnya, jangan salin mekanismenya:

| Fungsi                                        | Modul Keysake                                                                                                                                                                                                                                        | Versi yang saya sarankan                                                                                             |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Trigger UI AI lewat kode input                | `ai_box_processor` + `ai_box_status_translator` (`idle_code = zzzzaibox`)                                                                                                                                                                            | tetap di Lua (murah), tapi request dikirim ke **Swift**, bukan `io.popen`                                            |
| Filter/append terjemahan ke komentar kandidat | `ai_box_filter`, `ai_translator`                                                                                                                                                                                                                     | **pindah ke Swift**: L0 `Translation.Session` batch, lalu render 2 baris; Lua tidak tahu jaringan                    |
| Tombol aksi generatif                         | `ai_box_actions` (译英/译中/改写/文献)                                                                                                                                                                                                               | registry dari server (04 §3) → Swift                                                                                 |
| Mode switch zh/en (kiri Shift saja)           | `mode_switch_processor`, `default.yaml` `Shift_L: commit_code`, `good_old_caps_lock: true`                                                                                                                                                           | pertahankan di Lua/Rime — ini domain engine                                                                          |
| Emoji & font                                  | `tygo_emoji_filter/map`, `tygo_font_filter`, `opencc`                                                                                                                                                                                                | pertahankan; `tygo_font_filter` penting karena mereka merender dengan font kustom (Gochi Hand/Figtree **[KEYSAKE]**) |
| Penyesuaian bobot/urut                        | `cold_word_drop/*`, `pin_cand_filter`, `long_word_filter`, `reduce_english_filter`, `is_in_user_dict`, `corrector`, `autocap_filter`, `search`, `select_character`, `t9_preedit`, `calc_translator`, `date_translator`, `number_translator`, `lunar` | ambil 4–5 yang berdampak; sisanya = utang perawatan                                                                  |

## 6. Terjemahan on-device dengan `Translation.framework`

**[KEYSAKE]** dibuktikan oleh impor: `TranslationSession.installedSource(_:target:)`, `sourceLanguage`,
`targetLanguage`, `canRequestDownloads`, `prepareAvailableMode()`, `Request(sourceText:clientIdentifier:)`,
`translate(batch:)`, `BatchResponse.AsyncIterator`.

Pola pakai yang saya sarankan **[BLUEPRINT]**:

```swift
let session = try TranslationSession(installedSource: .init(languageCode: .zhHans),
                                    target: .init(languageCode: .en))
let reqs = candidates.prefix(9).map { TranslationSession.Request(sourceText: $0.text,
                                                                clientIdentifier: $0.id) }
for try await batch in session.translate(batch: reqs) {
    for r in batch { apply(translation: r.targetText, toIdentifier: r.clientIdentifier) }
}
```

Aturan operasional:

- Buat **satu session per (source,target)**, reuse; membuat session baru itu mahal.
- `canRequestDownloads == false` atau tidak ada language pack → sembunyikan fitur terjemahan, arahkan ke
  `TranslationKit.LanguagePackStatus` (Keysake menampilkan 3 state: `语言包未就绪`, `正在检查语言包…`,
  `语言包已就绪，显示排版示例` **[KEYSAKE]**).
- Jangan menerjemahkan kandidat _preedit_; hanya **committed text** dan **kandidat halaman pertama**.
- Simpan hasil L0 ke `content_translations(provider: 'apple-on-device')` saat user mengoleksi — inilah yang
  membuat `中文已收藏，译文待补充` **[KEYSAKE]** bisa diisi belakangan tanpa panggilan jaringan.
- **[VERIFY]** EULA/istilah `Translation.framework` untuk penggunaan komersial & pembatasan penyimpanan hasil;
  ini tidak bisa disimpulkan dari biner.

## 7. Panel koleksi fragmen (fitur inti "收录")

**[KEYSAKE]**: `FragmentTextClient` + selector `attributedSubstringFromRange:` / `selectedRange`; fallback
`使用输入法追踪片段（未从宿主范围读取）`; kegagalan dicatat per host: `收藏面板：无有效文字选区，宿主=%@`,
`收藏面板：无法定位插入点，宿主=%@`; star `FragmentCollectStar`/`FragmentCollectedStar`; batas `FragmentLimitWarning`;
status sinkron `收藏正在同步，请稍后重试`.

Desain saya **[BLUEPRINT]**:

1. **Sumber teks**, berurutan: (a) seleksi aktif host (`selectedRange` + `attributedSubstringFromRange`),
   (b) fragmen yang dilacak engine (committed sejak fokus), (c) jangan pernah baca clipboard diam-diam.
2. **Pemicu**: satu shortcut global dalam konteks IME (Keysake: `Shift+Space` **[KEYSAKE]**, dapat diubah di
   `collectionShortcut`) + tombol star di panel. Jangan pakai hotkey sistem-wide (`CGEventTap`) — butuh izin
   Input Monitoring & terasa menyeramkan.
3. **Insert point**: kalau perlu menulis balik, pakai `insertText:replacementRange:`; kalau gagal,
   kembalikan toast, jangan diam-diam memakai pasteboard (Keysake menyentuh pasteboard/`pboard` saat instalasi
   **[KEYSAKE]** — untuk install, bukan koleksi; tetap saya sarankan hindari pasteboard).
4. **Batas**: kuota panel lokal (mis. 1200 char) + peringatan; simpan ke `FragmentStore` lokal dengan lock,
   upload batch saat online (03 §4).
5. **Privasi**: default **tidak** menyimpan `originAppBundle` lebih kasar dari bundle id, dan **tidak** menyimpan
   screenshot/clipboard.

## 8. Shortcut & mode (persis yang bisa kamu tiru) **[KEYSAKE]**

- `中/英键 (Caps Lock)` untuk berganti mode, dan aturan eksplisit:
  "系统使用中/英键切换输入法时，将遵循系统设置。左 Shift 仅在单独按下并松开时切换模式。"
- `Shift+Space` = lihat/menyimpan pasangan zh-en (dari onboarding: 「Shift+空格键」 随时查看当前已输入的中英对照).
- Rime bindings dari `default.yaml`: `Tab`/`Shift+Tab` (menggeser segmentasi), `Alt+Left/Right`,
  `minus`/`equal` (halaman), `Ctrl+Shift+3` (ascii punct), `Ctrl+Shift+4` (tradisional), numpad → digit,
  `[`/`]` pilih karakter pertama/terakhir, plus editor bindings (`Ctrl+BackSpace` hapus suku kata,
  `Ctrl+Return` commit mentah).
- `native_refresh_key = F20` dipakai untuk refresh AI box **[KEYSAKE]** — hindari: F20 di MacBook adalah key
  fungsional; pakai aksi eksplisit di panel.

## 9. Stabilitas (tempat IME biasanya mati) **[BLUEPRINT]**

- Engine crash = user tidak bisa mengetik di seluruh sistem. Wajib: watchdog yang merestart proses IME,
  log crash terpisah (Keysake memakai Crashlytics di kedua proses **[KEYSAKE]**), dan **mode aman**:
  kalau 3 crash dalam 5 menit, nonaktifkan filter berat (AI box, translation) dan tampilkan banner.
- Jangan alokasikan >80 MB; tabel Rime besar harus di-`mmap` (marisa trie begitu), dan panel tidak boleh
  menahan `Context` lama.
- Uji di: Notes, Safari address bar, Terminal, VS Code, Chrome (web input), app Electron, dan fullscreen game.
- Retensi memori di bawah `NSApplication` background: matikan timer saat tidak ada klien aktif.
