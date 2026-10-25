# 06 — Instalasi, pembaruan, dan siklus rilis

## 1. Cara distribusi **[BLUEPRINT]**

Input method **tidak bisa** lewat Mac App Store (butuh menulis ke folder Input Methods & registrasi TIS).
Jalur kamu: **Developer ID + notarization + Sparkle**, sama seperti Keysake **[KEYSAKE]**
(`Developer ID Application: Vidline Inc. (DY69LKWHQV)`, Sparkle framework, `SUPublicEDKey`,
`SUFeedURL = https://cdn.keysake.ai/releases/macos/appcast.xml`, `SUAllowsAutomaticUpdates=false`,
`SUEnableAutomaticChecks=true`).

## 2. Lokasi instalasi — dan perbedaan terbesar dengan Keysake

**[BLUEPRINT]** keputusan utama: coba **per-user** dulu, `~/Library/Input Methods/<IME>.app`. macOS memindai
lokasi itu untuk input method, sehingga **tidak perlu prompt admin sama sekali**. **[VERIFY]** wajib kamu buktikan
di macOS 15/26 dan pada beberapa host app, karena seluruh pengalaman onboarding-mu (dan risiko keamanan)
berubah drastis kalau ini berhasil.

Kalau per-user tidak bisa diterima di lingkungan target (lab/MDM/multi-user), baru pakai
`/Library/Input Methods` dengan satu di antara dua jalur sah:

| Jalur                  | Cara                                                                                                                     | Catatan                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| **A. `.pkg` tertanda** | `productbuild` + component plist + `installer`/`open` (Authorization ke-2 dari sistem), lalu `pkgutil --check-signature` | ini "the Apple-approved way"; tidak ada API deprecated; bisa didistribusikan & di-deploy MDM |
| **B. Helper daemon**   | `SMAppService.daemon` (macOS 13+) untuk pekerjaan root terkecil (pindahkan payload, verifikasi)                          | lebih modern dari `AuthorizationExecuteWithPrivileges`, tetap butuh persetujuan              |

**Jangan** meniru Keysake: `AuthorizationCreate` + `dlsym("AuthorizationExecuteWithPrivileges")` (API yang
deprecated sejak 10.7 dan akan gagal tanpa peringatan di macOS baru) **dan** fallback `do shell script "… with
administrator privileges"` **[KEYSAKE]**. Dua jalur otorisasi berbeda = dua bug surface, dan yang pertama itu
tidak terdokumentasi.

## 3. Alur instalasi yang saya sarankan

```
1. staging      unduh / unpack payload ke Application Support (group container), mode 0700/0600
2. verifikasi   manifest SHA-256 per file + SecStaticCodeCheckValidityWithErrors (requirement = team id)
                + cdhash dicatat; GAGAL = berhenti, jangan pernah "coba install dulu"
3. pasang        A: buka .pkg tertanda   |  B: minta helper memindahkan + set owner/mode
4. registrasi    TISRegisterInputSource(url)  lalu TISCreateInputSourceList({TISPropertyInputSourceID})
5. enable        TISEnableInputSource(src); bila gagal → panduan manual (screenshot langkah nyata)
6. pilih (ops.)  TISSelectInputSource(src); jangan paksa; tampilkan "klik ikon input di menu bar"
7. verifikasi    polling status ≤ 8 s; kalau belum muncul → state "Reinstall" (Keysake:
                 安装完成后未检测到可用的输入法，请重新安装。)
8. diagnostik    tulis log terstruktur ke App Support + (opsional) upload redacted saat user kirim feedback
```

Pembanding **[KEYSAKE]**, rantai asli Keysake (dibuktikan dari string + `install.sh`): ekstrak zip → validasi
arsip keras (top-level wajib `KeysakeInput.app`, tolak absolute link/hardlink/traversal/path panjang) → validasi
versi & signature → otorisasi admin (dua jalur) → `install.sh`: `killall -9 TygoInput KeysakeInput`, hapus legacy
`TygoInput.app`, `rm -rf` target lama, `mkdir -p /Library/Input Methods`, `mv -f`, `chown -R root:staff`,
`chmod -R 775`, `xattr -d -r com.apple.quarantine`, `killall System Preferences|System Settings|SystemUIServer` →
muat ulang menu input lewat `pboard`/`TextInputMenuAgent reload` → tunggu notifikasi input source →
`select Keysake begin/end` (`com.apple.keylayout.ABC` dipakai sebagai fallback) → log `ai.tygo.installation-log`,
plus saklar QA `INPUT_INSTALL_ERROR=1`.

Yang bagus dari sana dan **harus kamu salin**: validasi arsip yang ketat, pemisahan nama legacy saat upgrade,
log instalasi timestamped, state UI untuk tiap kegagalan, dan saklar simulasi kegagalan untuk QA.

Yang **tidak boleh** kamu salin: `chmod -R 775` + group `staff` (lihat 07 §2), `xattr -d -r quarantine` massal,
`killall` aplikasi Sistem, API deprecated.

## 4. State onboarding yang perlu kamu desain

Keysake punya 6+ state yang saya petakan dari nama tipe & string **[KEYSAKE]**
(`InputFirstInstallView`, `InputInstalledView`, `InputNotAddedView`, `InputRemovedView`, `InputUpdateAvailableView`,
`InputInstallationErrorView`, `InputInstallationHUDView`, `InputInstallationRecoveryToast`):

| State                                    | Pesan kunci                                                         | Aksi                                           |
| ---------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------- |
| belum install                            | 第一步：安装双语输入法 / 安装输入法                                 | Install (admin)                                |
| sedang install                           | 输入法安装中... + HUD                                               | progress, jangan bisa klik dua kali            |
| install sukses, belum ditambah ke daftar | 请启用双语输入法 / 为了正常使用，请将「双语输入法」添加到输入法列表 | Enable + panduan gambar                        |
| ditambah tapi tidak aktif                | 如果无法启用，请按下方步骤启用                                      | 切换到 ABC 键盘 lalu pilih; 重新启用           |
| install sukses penuh                     | 双语输入法安装成功 / 输入法 & 语言包安装成功！                      | lanjut ke langkah 2 (language pack)            |
| terhapus/hilang                          | 未检测到已安装的输入法，重新安装即可继续使用 / 重新安装输入法       | Reinstall                                      |
| versi IME baru                           | 有新版本输入法 / 双语输入法有新版本                                 | Update (butuh admin lagi → desain agar jarang) |
| gagal                                    | 输入法安装失败 / 管理员安装脚本失败（…） / 解压失败 / 归档…         | tampilkan log singkat + contact                |
| QA/manual test                           | 模拟输入法安装失败（INPUT_INSTALL_ERROR=1）                         | gate debug build saja **[BLUEPRINT]**          |

Detail yang sering dilupakan **[KEYSAKE]**: mereka **harus mengembalikan keyboard ABC** saat install
(`系统无法选择 ABC 键盘。请先手动切换输入法…`). Artinya pemilihan input source saat instalasi bisa gagal;
desainmu harus memperlakukan "switch keyboard" sebagai langkah opsional yang boleh gagal tanpa merusak install.

## 5. Update

**[BLUEPRINT]**

- App: Sparkle 2.x, Ed25519, appcast di CDN dengan cache-control pendek, `SUAllowsAutomaticChecks=true` tapi
  biarkan user mengontrol instalasi otomatis — Keysake mematikannya (`SUAllowsAutomaticUpdates=false`) karena
  update IME butuh hak admin **[KEYSAKE]**.
- IME: **jangan** update diam-diam. Dua tahap: (1) app mengunduh & memverifikasi paket, (2) user mengonfirmasi
  "perbarui input method" → satu prompt otorisasi. Simpan hash paket yang terpasang agar bisa membuktikan
  versi yang aktif (kolom `engine_resource_version` di `installations`, lihat 02).
- Resource linguistik (kamus/tabel): update tanpa admin, karena hidup di user dir — ini jalur yang harus sering
  dipakai supaya rilis besar jadi jarang.
- Remote settings: artefak berversi + ETag (Keysake `SettingsDownloader`/`SettingsCache` +
  `[Settings] Cache expired because app version changed` **[KEYSAKE]**).

## 6. Build & rilis (perintah nyata) **[BLUEPRINT]**

```bash
# sign & notarize kedua artefak
codesign --force --options runtime --timestamp \
  --entitlements ime.entitlements -s "Developer ID Application: <You>" KeysakeLikeIME.app
codesign --force --options runtime --timestamp --deep \
  -s "Developer ID Application: <You>" KeysakeLike.app
xcrun notarytool submit keysake.pkg --keychain-profile rc --wait
xcrun stapler staple keysake.pkg
productbuild --component KeysakeLikeIME.app /Library/Input Methods \
  --distribution distribution.plist --sign "Developer ID Installer: <You>" keysake.pkg
```

Checklist gerbang rilis (minimal): `spctl -a -vv` lolos; install bersih di user baru; upgrade dari versi N-1;
uninstall meninggalkan nol state; mode gelap/terang; macOS 15 & terbaru; Apple Silicon & Intel; memori IME <80 MB;
0 crash di 200 sesi smoke; dan **tes "user mengetik saat install berjalan"**.
