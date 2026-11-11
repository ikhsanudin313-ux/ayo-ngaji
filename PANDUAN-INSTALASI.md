# Panduan Migrasi Ayo Ngaji → Backend Apps Script (REST API) + Frontend GitHub Pages

Arsitektur baru:

```
GitHub Pages (https://USERNAME.github.io/ayo-ngaji/)
  index.html · css/style.css · js/config.js · js/app.js
        │   fetch() POST (text/plain, JSON)
        ▼
Google Apps Script Web App (/exec)  ← Kode.gs (doGet / doPost, JSON)
        │
Google Sheets + Drive (data lama Anda tetap dipakai)
```

Yang Anda terima:

| Berkas | Untuk | Cara pakai |
|---|---|---|
| `Kode.gs` | Backend | Disalin-tempel ke editor Apps Script |
| `appsscript.json` | Backend (opsional) | Pengaturan zona waktu & akses Web App |
| `ayo-ngaji.zip` | Frontend | Diekstrak, lalu **isi foldernya** di-push ke GitHub |
| `PANDUAN-INSTALASI.md` | Panduan ini | Dibaca dulu sebelum mulai |

---

## BAGIAN A — Backend (Google Apps Script)

> **Data Anda tidak hilang.** Pakai **proyek Apps Script yang sama** dengan yang sekarang berjalan. Spreadsheet, folder Drive, akun, dan kata sandi tetap sama, karena ID-nya tersimpan di Script Properties proyek tersebut.

1. Buka proyek Apps Script **Ayo Ngaji** yang sudah ada.
2. Klik file **Kode** → **Ctrl+A** → tempel seluruh isi `Kode.gs` yang baru → **Simpan** (Ctrl+S).
3. Hapus file **Index**, **Stylesheet**, dan **JavaScript**: klik titik tiga di samping nama file → **Delete**. Ketiganya sudah pindah ke GitHub.
4. (Opsional, disarankan) Klik ⚙️ **Project Settings** → centang **Show "appsscript.json" manifest file in editor**. Buka file `appsscript.json` di editor, ganti isinya dengan file `appsscript.json` dari paket ini, lalu simpan.
5. ⚠️ **JANGAN** jalankan `setupAppEnvironment()` lagi, karena data Anda sudah ada.
   Untuk memastikan backend tersambung, pilih fungsi **`cekBackend`** → ▶ **Run**, lalu lihat Log eksekusi (harus muncul ✅).
6. **Deploy → New deployment** → ikon ⚙️ → **Web app**:
   - Description: `REST API`
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Klik **Deploy** → **salin URL Web app** (berakhiran `/exec`).
7. Uji: tempel URL `/exec` itu di tab browser baru. Yang benar adalah teks JSON seperti
   `{"ok":true,"data":{"app":"Ayo Ngaji",...,"pesan":"Backend Ayo Ngaji aktif..."}}`

> Pemasangan baru (belum pernah ada Ayo Ngaji): buat proyek baru di script.google.com, tempel `Kode.gs`, jalankan `setupAppEnvironment()` **sekali**, ambil kata sandi Master Admin dari Log eksekusi, lalu lanjut ke langkah 6.

> Setiap kali `Kode.gs` diubah: **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. Dengan cara ini URL `/exec` tidak berubah.

---

## BAGIAN B — Frontend (GitHub Pages)

### B1. Siapkan folder
1. Ekstrak `ayo-ngaji.zip`. Hasilnya folder **`ayo-ngaji`** berisi:
   ```
   ayo-ngaji\
   ├── index.html      ← harus terlihat langsung di sini
   ├── README.md
   ├── PANDUAN-INSTALASI.md
   ├── css\style.css
   └── js\config.js, js\app.js
   ```
2. Buka `js\config.js` dengan Notepad. Ganti `https://script.google.com/macros/s/GANTI_DENGAN_ID_DEPLOYMENT/exec` dengan URL `/exec` dari langkah A6, lalu simpan.

> **Folder `ayo-ngaji` inilah yang di-`git init`**, yaitu folder yang langsung berisi `index.html`. Jangan folder di atasnya, dan jangan masuk ke `css` atau `js`.

### B2. Install & siapkan Git (sekali saja)
1. Windows: unduh dan install dari https://git-scm.com/download/win (pengaturan default).
2. Buka **PowerShell**, lalu cek: `git --version`
3. Isi identitas:
   ```
   git config --global user.name "Nama Anda"
   git config --global user.email "email-akun-github@anda.com"
   ```

### B3. Buat repository di GitHub
github.com → **+** → **New repository** → nama `ayo-ngaji` → **Public** → **jangan** centang README, .gitignore, atau license → **Create repository**.

### B4. Push pertama kali
Buka folder `ayo-ngaji` di File Explorer → klik address bar → ketik `powershell` → Enter. Lalu:
```
dir
```
Pastikan `index.html` terlihat. Setelah itu jalankan satu per satu:
```
git init
git add .
git commit -m "Upload pertama"
git branch -M main
git remote add origin https://github.com/USERNAME/ayo-ngaji.git
git push -u origin main
```
Saat diminta **Password**, tempel **Personal Access Token**, bukan kata sandi GitHub. Buat token di https://github.com/settings/tokens → **Generate new token (classic)** → centang **repo** → salin token `ghp_...`.
Saat Anda menempel token, layar terlihat kosong. Itu normal; tekan Enter.

### B5. Aktifkan GitHub Pages
Repo → **Settings** → **Pages** → Source: **Deploy from a branch** → Branch: **main** / **(root)** → **Save**. Centang **Enforce HTTPS**.
Tunggu 1–2 menit, lalu situs aktif di `https://USERNAME.github.io/ayo-ngaji/`.

### B6. Update berikutnya
```
git add .
git commit -m "Update"
git push
```
Jika tampilan masih versi lama, tekan **Ctrl+Shift+R**.

---

## Setelah migrasi
- **Login ulang**: semua pengguna masuk ulang sekali di alamat baru. Akun dan kata sandi tetap sama.
- **Link lama**: URL Apps Script lama sekarang hanya menampilkan JSON. Bagikan alamat GitHub Pages ke pengurus, jamaah, dan wali, dan ganti link di Blogger (jika ada) dengan alamat baru.
- **Pesan WhatsApp ke wali/jamaah** otomatis memakai alamat GitHub Pages. Alamat ini tercatat sendiri saat aplikasi pertama kali dibuka lewat HTTPS. Untuk menggantinya: Apps Script → Project Settings → Script Properties → `APP_URL`.
- **Scan kartu (kamera)** kini lebih lancar karena aplikasi tidak lagi berada di dalam iframe.
- **Pengingat email** (`pasangTriggerPengingat`) dan semua fungsi editor lain tetap berjalan seperti biasa.

## Masalah umum
| Gejala | Penyebab & solusi |
|---|---|
| "Alamat backend belum diisi" | `GAS_URL` di `js/config.js` belum diganti → isi, lalu commit dan push |
| "Backend membalas halaman, bukan JSON" | Deployment bukan **Anyone** / **Me**, atau URL bukan `/exec` → deploy ulang dengan pengaturan benar |
| "Koneksi ke server gagal" | Internet putus, atau URL `/exec` salah ketik |
| 404 di GitHub Pages | `index.html` tidak di root repo → push dari folder yang langsung berisi `index.html` |
| Tampilan tanpa warna | Folder `css/` atau `js/` tidak ikut → selalu pakai `git add .` dari terminal, jangan upload lewat web |
| Perubahan backend tidak berlaku | Belum **Manage deployments → Edit → New version** |
