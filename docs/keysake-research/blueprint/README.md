# Blueprint: membangun produk "IME dwibahasa + AI saat mengetik" (referensi: Keysake/Tygo)

Dokumen ini **resep pembangunan**, bukan lagi hasil reverse engineering. Basisnya: hasil RE `Keysake.dmg`
(lihat [keysake-architecture.md](../keysake-architecture.md) dan bukti mentahnya di
`D:\waddle\.rea
eports\evidence` — sengaja tidak ikut di-commit ke repo ini).

Konvensi label di seluruh dokumen:

- **[KEYSAKE]** = fakta yang terobservasi dari artefak DMG (biner, plist, Lua, install.sh, pseudocode Ghidra).
- **[BLUEPRINT]** = keputusan desain yang saya ambil untuk produkmu. Tidak dijual sebagai "pilihan", ini rekomendasi yang bisa langsung dieksekusi.
- **[VERIFY]** = harus diuji di macOS sebelum dipercaya (tidak bisa dibuktikan dari artefak statis).

## Isi

| File                                                               | Bahasan                                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| [01-reference-architecture.md](./01-reference-architecture.md)     | Topologi proses, IPC, modul klien, batas tanggung jawab             |
| [02-data-model-and-database.md](./02-data-model-and-database.md)   | Entitas, retensi, alasan di balik tiap tabel                        |
| [schema.sql](./schema.sql)                                         | DDL Postgres siap `psql`                                            |
| [03-api-contract.md](./03-api-contract.md)                         | Kontrak endpoint, amplop respons, error code, auth                  |
| [openapi.yaml](./openapi.yaml)                                     | Spesifikasi OpenAPI 3.1                                             |
| [04-ai-integration.md](./04-ai-integration.md)                     | Desain gateway AI, cache, quota, latency, protokol bridge           |
| [05-ime-and-engine.md](./05-ime-and-engine.md)                     | librime + Lua, panel kandidat, panel koleksi, Translation.framework |
| [06-installer-updates-ipc.md](./06-installer-updates-ipc.md)       | Distribusi, instalasi, registrasi TIS, update                       |
| [07-security-privacy-license.md](./07-security-privacy-license.md) | 11 temuan Keysake + cara tidak mengulanginya, lisensi kamus         |
| [08-build-plan-mvp.md](./08-build-plan-mvp.md)                     | Fase, estimasi, risiko, posisi produk                               |

## Ringkasan satu paragraf

Produk ini terdiri dari **tiga proses**: app SwiftUI (akun, koleksi, pengaturan, installer), agen input method
(libvRime + panel kustom + terjemahan on-device), dan backend (identitas, penyimpanan fragmen, statistik, gateway
AI, rilis pengaturan/update). Kesalahan desain terbesar yang harus kamu hindari adalah asumsi "semua teks user
harus ke cloud": Keysake membuktikan **terjemahan kandidat bisa 100% lokal** lewat `Translation.framework`,
sementara **generatif (改写/文献) baru naik ke server**. Pembagian itu yang membuat IME-nya terasa instan dan
biaya inferensi fitur utamanya nol. **[KEYSAKE]**
