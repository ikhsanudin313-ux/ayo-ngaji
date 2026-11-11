# Ayo Ngaji — Frontend (GitHub Pages)

Aplikasi database jamaah, jadwal pengajian, absensi, capaian, dan jadwal Jum'at.
Frontend ini statis (HTML/CSS/JS murni). Semua data diambil dari **backend Google Apps Script** (REST API) lewat `fetch()`.

```
index.html        ← halaman utama (wajib di root repository)
css/style.css     ← tampilan
js/config.js      ← ALAMAT BACKEND (GAS_URL) — wajib diisi
js/app.js         ← logika aplikasi
```

## Cara pakai singkat
1. Deploy backend `Kode.gs` di Apps Script sebagai Web App (Execute as: **Me**, Who has access: **Anyone**), lalu salin URL `/exec`.
2. Buka `js/config.js`, ganti `GAS_URL` dengan URL tersebut.
3. Push folder ini ke GitHub, lalu aktifkan **Settings → Pages → Deploy from a branch → main / (root)**.

Panduan lengkap: lihat `PANDUAN-INSTALASI.md`.

## Update
```
git add .
git commit -m "Update"
git push
```
