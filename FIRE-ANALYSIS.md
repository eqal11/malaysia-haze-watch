# Kebakaran hutan: pengesanan haba dan imej satelit, versi 2.3

Versi berasingan untuk semakan pada laptop. Laman GitHub dan job cron-job.org sedia ada tidak diubah oleh pembangunan ini. Port pratonton baharu ialah **4177**.

## Cara guna

1. Jalankan `RUN-LOCAL.bat`, biarkan pelayan terbuka, kemudian buka http://127.0.0.1:4177/.
2. Di lapisan peta, tandakan **Kebakaran hutan · kelompok haba**, atau scroll ke panel **Kebakaran hutan** dan tekan **Muat analisis kebakaran**. Fail analisis hanya dimuat apabila diminta.
3. Tapis negara, provinsi, kelas, tempoh 24/48 jam atau 7 hari dan minimum hari pengesanan. Penapis negeri utama turut mengehadkan analisis kepada negeri Malaysia yang dipilih. Penapis hotspot asal dan penapis analisis haba adalah berasingan.
4. Klik nama kelompok pada jadual untuk fokus pada peta dan membuka popup. Bulatan dibesarkan mengikut jumlah FRP. Pada zoom 10 ke atas, pengesanan individu dalam kawasan pandangan muncul, termasuk titik terpencil.
5. Guna peluncur atau **Main 7 hari** untuk mengulang tujuh hari terakhir mengikut MYT. Pilih **Haba terkini** untuk kembali mengikuti masa rujukan utama. Tarikh sebelum liputan arkib akan kelihatan kosong dengan amaran, bukan data rekaan.
6. Untuk imej, tandakan **Imej satelit · VIIRS true colour**. Pilih tarikh UTC dalam tujuh hari terakhir dan laraskan kelegapan. Tarikh imej bebas daripada masa IPU dan masa analisis haba. Tutup lapisan IPU daerah jika mahu melihat imej tanpa isian koroplet.

**Pengesanan haba, bukan bukti punca atau kawasan terbakar sebenar.** Asap yang kelihatan dalam imej tidak membuktikan pengangkutan jerebu ke Malaysia. Analisis ini tidak mengenal pasti pihak yang bertanggungjawab.

## Sumber dan lesen

| Sumber | Penggunaan dan syarat |
|---|---|
| NASA FIRMS VIIRS S-NPP | Menggunakan pengesanan sebenar sedia ada dan arkib harian. [Produk dan akses rasmi](https://firms.modaps.eosdis.nasa.gov/active_fire), [panduan VIIRS C2](https://earthdata.nasa.gov/s3fs-public/2024-07/VIIRS_C2_AF-375m_User_Guide_1.0.pdf). Data NASA boleh diakses bebas dengan kredit sumber; lihat [dasar penggunaan dan petikan NASA](https://www.earthdata.nasa.gov/engage/open-data-services-software/data-use-policy). Bukan lesen MIT aplikasi. |
| NASA GIBS / EOSDIS, Suomi NPP VIIRS | WMTS awam tanpa kunci. [Dokumentasi](https://nasa-gibs.github.io/gibs-api-docs/access-basics/) dan [capabilities sebenar](https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml). Kredit kekal pada peta. [Panduan imej NASA](https://www.nasa.gov/nasa-brand-center/images-and-media/). Tiada logo atau sokongan rasmi NASA didakwa. |
| ESA WorldCover 2021 v200 | CC BY 4.0. Menggunakan medan `landcover` daripada grid konteks sedia ada yang telah dikecilkan kepada kira-kira 667 m. Bukan peta hutan sah dan bukan data 2026. |
| PEATMAP 2017 | CC BY 4.0. Menggunakan `on_peat` sedia ada. Sumber Malaysia 2002–2009, Indonesia 2005–2010; peta boleh ketinggalan keadaan lapangan. |
| geoBoundaries / OpenStreetMap | Provinsi/negeri sedia ada, ODbL 1.0. Lesen pangkalan data terbitan dan kredit konteks asal dikekalkan. Lihat `data/context/LICENSES.md`. Kod aplikasi kekal MIT. |

## Endpoint GIBS yang diuji

Capabilities diperiksa terus pada 22 Oktober 2026, bukan meneka ID atau grid:

```text
Layer: VIIRS_SNPP_CorrectedReflectance_TrueColor
Projection: EPSG:3857
TileMatrixSet: GoogleMapsCompatible_Level9
Tile size: 256 x 256
Native levels: 0..9
Format: image/jpeg, extension .jpeg
https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/{YYYY-MM-DD}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpeg
```

Ujian jubin sebenar `2026-10-21/GoogleMapsCompatible_Level9/5/15/25.jpeg` memulangkan HTTP 200, JPEG 18,518 bait dan `Access-Control-Allow-Origin: *`. Capabilities juga mempunyai CORS `*`, selang harian dan tarikh hujung 2026-10-22 semasa semakan. Browser membaca selang tarikh capabilities apabila lapisan pertama kali diaktifkan. Tiada kunci, proksi atau muat turun imej besar ke repo.

HTTP 200 tidak semestinya bermakna kawasan itu mempunyai imej. Jubin hitam/kosong diperiksa melalui canvas CORS. Jika tiada jubin berimej, mesej menyatakan tiada imej di kawasan pandangan atau belum diterbitkan; ralat rangkaian ditunjukkan berasingan. Awan dalam imej masih imej yang sah, bukan bukti tiada kebakaran. Ketersediaan boleh berubah apabila data harian diproses. Zoom melebihi 9 hanya membesarkan jubin, tidak menambah resolusi.

## Pengelasan dan DBSCAN

`scripts/classify_fires.py` membaca `hotspots_attributed.geojson`, mengesahkan hash input sepadan dengan `hotspots.geojson`, kemudian menggunakan kelas WorldCover yang telah tersedia. Tiada pengelas AI atau kelas litupan baharu direka.

- `on_peat=true` mendapat kelas paparan `peat`, tanpa memadam litupan asal. Ini ialah keutamaan paparan bagi pertindihan gambut dan pokok.
- `Tree cover` dan `Mangroves` menjadi `forest`, dilabel **Tutupan pokok** pada UI.
- `Shrubland`, `Grassland`, `Herbaceous wetland`, `Moss and lichen` menjadi `vegetation`.
- `Cropland` menjadi `cropland`; `Built-up` menjadi `built_up`.
- `Bare / sparse vegetation`, `Permanent water bodies`, `Snow and ice` menjadi `other`.
- Medan hilang atau tidak dikenali menjadi kelas `unknown`. Status gambut, negara dan provinsi yang tiada kekal null. Penapis/chart tiga kumpulan menyatukan selain pokok/gambut ke **Lain termasuk tidak diketahui**; petunjuk peta masih menunjukkan semua tujuh kelas.

Konfigurasi bersama terdapat dalam `data/fire-config.json`: DBSCAN **eps 3 km**, **min_samples 2 termasuk titik itu sendiri**, dengan syarat jarak masa maksimum **24 jam antara jiran**. Rantaian jiran boleh merentasi beberapa hari. Jarak Haversine digunakan dengan indeks sel konservatif untuk mengelakkan perbandingan semua pasangan. Pelaksanaan menggunakan pustaka standard Python dan diuji dengan kelompok yang diketahui. Tiada kebergantungan scikit-learn atau langkah binaan frontend ditambah.

Pengesanan dideduplikasi berdasarkan sensor, koordinat dan masa, daripada fail semasa serta tujuh hari arkib. Tiada ambang FRP digunakan. Kelompok menyimpan centroid purata pusat pengesanan, jumlah/maksimum FRP, bilangan pengesanan, masa pertama/akhir, hari MYT berlainan dengan pengesanan, kelas dominan dan bahagian gambut dalam rekod yang diketahui. Jumlah FRP merentas lintasan bukan tenaga terkumpul atau kadar pelepasan asap.

Titik noise DBSCAN kekal dalam fail dan paparan individu, tetapi tidak dipanggil kelompok. Penapis minimum dua hari atau lebih mengecualikan noise satu pengesanan. Persistence ialah bilangan hari diperhatikan dalam tempoh dipilih, bukan tempoh pembakaran berterusan. Kelompok boleh merentasi sempadan pentadbiran; penapis mengambil ahli sepadan dan mengira semula statistik. Peristiwa besar boleh terbahagi atau bergabung apabila parameter atau tetingkap berubah. ID deterministik untuk input sama, tetapi bukan ID kejadian kekal.

Anggaran jejak piksel menggunakan bilangan sel nominal 375 m yang unik, didarab **0.140625 km²**, dalam grid equirectangular anggaran serantau. Sel berulang dari lintasan berbeza tidak dikira sebagai kawasan baharu. Jejak sebenar VIIRS berubah mengikut sudut imbasan dan api boleh lebih kecil daripada piksel. Angka ini **bukan keluasan terbakar**, sempadan api, atau penilaian kerosakan.

## Fail, ulangan masa dan kegagalan

`data/forest_fires.geojson` mengandungi hotspot semasa bersama `fire_class` dan `event_id` (null bagi noise). `data/fire_events.geojson` mengandungi centroid/metadata kelompok, ahli padat tujuh hari, noise, liputan dan agregat trend sehingga 30 hari. Susunan ahli ialah `[lng,lat,UTC_epoch,frp,class_index,on_peat,place_index]`; kamus kelas/tempat disertakan. Ini mengecilkan saiz tanpa mengubah koordinat atau mereka data. Kedua-dua fail WGS84 dan dihadkan bawah 5,000,000 bait.

Ulangan menggunakan ahli sebenar sebelum masa pilihan. Tiada interpolasi masa atau pengisian hari kosong. Keahlian kelompok dikira pada masa produk dijana dan digunakan secara retrospektif dalam ulangan; DBSCAN tidak dilatih semula bagi setiap bingkai. Oleh itu identiti/topologi kelompok bukan rekonstruksi tepat maklumat yang diketahui ketika itu. Peta/tabel mengira semula statistik ahli mengikut penapis masa. Trend harian menggunakan negara, provinsi dan kelas, tanpa minimum persistence kelompok. Hari tanpa arkib ialah null/gap; hari berliputan separa ditanda berongga. Sejarah sebelum arkib projek kekal tiada data.

Workflow dan pengutip laptop memanggil analisis **selepas** atribusi FIRMS. Tiada workflow penjadual atau kunci baharu diperlukan. Saiz dan skema kedua-dua produk disemak sebelum penggantian atomik. Kedua-duanya mempunyai `analysis_id` sama. Kegagalan biasa mengekalkan produk baik terdahulu dan merekodkan `meta.sources.fires`; browser menyatakan status kegagalan atau produk lama. Browser hanya memerlukan fail events untuk ulangan supaya tidak menggabungkan dua generasi berbeza. Gangguan proses di antara dua penggantian dikesan validator sebelum deployment. Commit masih hanya dibuat apabila data berubah. Paparan IPU, interpolasi, angin, hotspot asal dan arkib dikekalkan.

## Had dan perkara yang tidak diaktifkan

- Kebakaran kecil, terlindung awan/asap atau di antara lintasan mungkin tidak dikesan. Sumber haba bukan kebakaran juga boleh dikesan.
- Tutupan pokok termasuk kemungkinan ladang pokok, bukan status hutan sah; kelas litupan statik tidak mewakili perubahan harian.
- PEATMAP lama dan sempadan mempunyai ralat kedudukan. Null tidak ditukar menjadi tidak/gambut tiada.
- Tiada WDPA/kawasan perlindungan ditambah. `in_protected` tidak didakwa atau diisi palsu.
- Semakan Sentinel-2 dNBR tidak diaktifkan. Pemilihan imej sebelum/selepas bebas awan dan analisis raster memerlukan aliran kerja tambahan; `burn_confirmed` kekal **null**, bukan false. Imej true colour hanya alat pemeriksaan visual, bukan pengesahan burn scar.
- Full tujuh atau 30 hari hanya tersedia selepas rekod sebenar terkumpul. Analisis ini tidak menentukan punca jerebu atau pihak yang bertanggungjawab.

## Kemas kini GitHub dengan selamat

Semak versi laptop dahulu. Simpan release/commit versi GitHub semasa sebagai titik pemulihan. Gunakan branch baharu jika boleh.

Pakej `malaysia-haze-watch-fire-update.zip` mengandungi kod yang berubah, ujian, dokumen serta tiga fail data analisis/config yang diperlukan untuk ujian pertama. Ia **tidak** menggantikan `ipu.json`, `hotspots.geojson`, `hotspots_attributed.geojson`, `meta.json`, arkib sedia ada atau kunci. Jangan muat naik `.venv`, `work` atau fail token.

Muat naik kandungan pakej ke laluan yang sama di akar repo, termasuk `.github/workflows/fetch-data.yml` secara berasingan jika GitHub upload menyembunyikan folder itu. Nama workflow/fail dan `workflow_dispatch` dikekalkan, jadi job cron-job.org yang sedia ada boleh terus memanggil URL yang sama. Ia kekal bergantung pada token dan job tersebut, bukan bukti daripada `last_scheduled_success` cron GitHub sahaja. Tetapan cron-job.org dan Secrets tidak perlu diganti oleh upgrade ini.

Selepas commit lengkap, semak satu run pengutip baharu: ujian lulus, log `Fire analysis`, validasi, commit dan deploy. Buka laman GitHub Pages dan semak masa sumber serta analisis baharu. Jangan menganggap versi ini sudah diterbitkan hanya kerana pratonton laptop berfungsi.

Ujian: `npm test`, `python -m unittest discover -s tests -p 'test_*.py'`, `python scripts/classify_fires.py`, `python scripts/validate_data.py`. Keputusan khusus terdapat dalam `FIRE-VERIFICATION.md`.
