# Version 2.3.1: titik dan poligon jejak pengesanan

Pada pratonton http://127.0.0.1:4177/, buka panel lapisan dan aktifkan **Kebakaran hutan · kelompok haba**. Dua checkbox baharu tersedia:

- **Titik pengesanan dan kelompok**: mengekalkan bulatan kelompok serta titik individu pada zoom 10 ke atas.
- **Poligon jejak pengesanan · anggaran**: menunjukkan gabungan sel nominal 375 m yang mengandungi pengesanan terpilih.

Boleh pilih titik sahaja, poligon sahaja atau kedua-duanya. Lapisan **Titik panas** asal ialah kawalan berasingan; matikan juga lapisan itu jika mahu paparan poligon sepenuhnya tanpa titik asal. Zum sekitar 11–13 membantu melihat bentuk sel. Klik poligon untuk bilangan sel dan anggaran jejak km².

## Maksud poligon

Ini **bukan sempadan kawasan terbakar yang disahkan**. Tiada dNBR, segmentasi burn scar atau sempadan kebakaran lapangan ditambah. FIRMS hanya memberi pusat pengesanan haba; piksel nominal tidak menentukan keluasan sebenar api.

Pusat pengesanan diletakkan dalam grid serantau equirectangular yang sama dengan kiraan jejak versi 2.3. Saiz nominal sel ialah 375 m; poligon boleh beralih sehingga kira-kira satu sel berbanding bentuk piksel satelit sebenar yang tidak tersedia dalam input. Luas nominal ialah bilangan sel unik × 0.140625 km². Herotan grid kecil masih wujud di luar khatulistiwa dan jejak sensor berubah mengikut sudut imbasan.

Sel berulang dikira sekali bagi setiap kelompok. Sel bersambung digabungkan menggunakan polygon union. Ruang kosong, komponen berjauhan dan lubang dikekalkan. Tiada convex hull, peluasan buffer atau sambungan rekaan di antara titik. Ini memberikan anggaran jejak pengesanan yang lebih berhati-hati daripada melukis satu bentuk besar mengelilingi seluruh kelompok. Jangan jumlahkan luas semua kelompok sebagai luas kebakaran unik, kerana kelompok berbeza boleh bertindih dalam masa/ruang.

Poligon mengikuti ahli kelompok selepas penapis negara, provinsi/negeri, kelas, tempoh, minimum hari pengesanan dan bingkai masa. Noise DBSCAN turut dipaparkan sebagai jejak terpencil yang dikumpulkan mengikut kelas; ia bukan satu kejadian kebakaran. Warna kelompok mengikut kelas dominan seperti titik sedia ada. Pengiraan dijalankan dalam Web Worker supaya kawalan browser kekal responsif. Kerja lama dibatalkan apabila pilihan berubah. Kegagalan pustaka/geometri memaparkan ralat poligon dan tidak mematikan titik atau dashboard.

## Kebergantungan dan ujian

Frontend memuatkan **polygon-clipping 0.15.7**, MIT, secara malas daripada `https://cdn.jsdelivr.net/npm/polygon-clipping@0.15.7/+esm` apabila poligon diaktifkan. HTTP 200 dan CORS `*` telah disemak. API dan lesen diperiksa di https://github.com/mfogel/polygon-clipping. Tiada kunci atau kebergantungan Python baharu. Fail UMD versi sama dan lesen disertakan dalam `tests/vendor/` untuk ujian Node tanpa capaian rangkaian.

**50 kumpulan ujian JavaScript dan 24 ujian Python lulus.** Tujuh ujian baharu meliputi deduplikasi sel, union sel bersebelahan, komponen berjauhan, lubang, koordinat tidak sah, metadata noise/kelompok dan pengesanan sebenar. Dalam browser, titik bersama poligon, poligon sahaja, toggle off/on, popup serta BM/EN diuji. Tiada ralat console diperhatikan dalam pratonton biasa. Screenshot: `assets/screenshots/fire-points-polygons.png` dan `assets/screenshots/fire-polygon-popup.png`.

Tiada fail data FIRMS atau arkib baharu diperlukan untuk fungsi poligon. Pengutip dan URL workflow kekal. Workflow hanya ditambah arahan ujian poligon. Versi ini belum diterbitkan ke GitHub; gunakan pakej upgrade lengkap terbaru supaya fail ujian dan `tests/vendor` turut dimuat naik. Tetapan cron-job.org dan token tidak perlu diubah.
