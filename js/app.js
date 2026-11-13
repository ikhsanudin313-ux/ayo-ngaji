/* Ayo Ngaji — logika aplikasi (frontend statis, backend Google Apps Script REST API) */
'use strict';
/* ============================================================
   AYO NGAJI — Frontend (JavaScript.html)
   Prinsip instant UX:
   1) SPA: semua halaman ada di DOM, navigasi = tampil/sembunyi (0 ms)
   2) Optimistic UI: UI berubah dulu, sinkron ke Sheets di latar belakang
   3) Data awal 1x panggilan + snapshot localStorage (buka ulang instan)
   4) Filter/cari/hitung statistik di klien (tanpa RTT server)
   ============================================================ */

// ── Util ───────────────────────────────────────────────────
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = v => String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const attr = esc;
const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const sum = (arr, f = x => x) => arr.reduce((a, b) => a + (Number(f(b)) || 0), 0);
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

const LS = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* abaikan */ } },
  json(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
  setJson(k, v) { return this.set(k, JSON.stringify(v)); }
};

const JENJANG = ['Balita', 'PAUD/TK', 'Caberawit', 'Pra Remaja', 'Remaja', 'Usia Nikah', 'Dewasa'];
const JENJANG_TARGET = JENJANG.filter(j => j !== 'Dewasa'); // kurikulum & target disusun Master Admin
const STATUS_JM = { // status jamaah: label, badge, ikon
  'Aktif': ['Aktif', 'b-ok', 'bi-person-check'], 'Nonaktif': ['Nonaktif', 'b-bad', 'bi-person-dash'],
  'Pindah': ['Pindah', 'b-warn', 'bi-box-arrow-right'], 'Meninggal': ['Meninggal Dunia', 'b-dark', 'bi-flower1']
};
const statusBadge = j => { const s = STATUS_JM[j.Status_Aktif] || STATUS_JM.Nonaktif; return `<span class="badge ${s[1]}"><i class="bi ${s[2]}"></i> ${s[0]}</span>`; };
const KELAS = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6']; // kelas khusus jenjang Caberawit
const kelasBadge = k => k ? `<span class="badge b-gold" title="Kelas ${attr(k)}"><i class="bi bi-mortarboard"></i> ${esc(k)}</span>` : '';
const JJ_COLOR = { 'Balita': '#D97A98', 'PAUD/TK': '#4F8FD0', 'Caberawit': '#0F6B4F', 'Pra Remaja': '#69DCA2', 'Remaja': '#1E9E6A', 'Usia Nikah': '#C9A227', 'Dewasa': '#52606D', 'Gabungan': '#B8860B' };
const GABUNGAN = 'Gabungan', KEL_SEMUA = 'SEMUA'; // pengajian gabungan semua jamaah
const isGab = k => !!k && k.ID_Kelompok === KEL_SEMUA;
/** Menu yang terbuka untuk akun Penerobos Desa. */
const PNR_NAV = ['dashboard', 'jamaah', 'kegiatan', 'absensi', 'kehadiran'];
/** Menu yang terbuka untuk akun Penerobos Kelompok. */
const PNRK_NAV = ['dashboard', 'jamaah', 'kegiatan', 'absensi', 'kehadiran', 'jumat'];
/** Jenjang yang punya No. HP pribadi jamaah (selain No. HP wali). */
const JENJANG_HP = ['Pra Remaja', 'Remaja', 'Usia Nikah', 'Dewasa'];
// Dapukan baku (jamaah boleh punya lebih dari satu, disimpan "994, MT")
const DAPUKAN = ['994', 'Wakil 994', '995', 'Wakil 995', 'Penulis KU Kelompok', 'KU Kelompok', 'Penulis KU Desa', 'Penerobos Desa', 'Penerobos Kelompok',
  "Agnia' Desa", "Agnia' Kelompok", 'Mubalegh Desa', 'Mubalegh Kelompok', 'MT', 'MS', "Ro'yah"];
const DAPUKAN_PENGURUS = DAPUKAN.slice(0, 13);
const dpkList = v => String(v || '').split(/[,;\n]/).map(x => x.trim()).filter(Boolean);
const dpkBadges = v => dpkList(v).map(d => `<span class="badge b-gold"><i class="bi bi-award"></i> ${esc(d)}</span>`).join(' ');
// Jenis pengajian gabungan → peserta daftar absen
const GAB_JENIS = [
  ['UMUM', 'Pengajian Gabungan', 'Semua jamaah aktif semua kelompok & jenjang', 'bi-people-fill'],
  ['MUDAMUDI', 'Pengajian Muda-mudi Desa', 'Jenjang Pra Remaja, Remaja & Usia Nikah', 'bi-person-arms-up'],
  ['MTMS', 'Pengajian MT/MS', 'Jamaah yang punya dapukan MT atau MS', 'bi-mortarboard'],
  ['IBU', 'Pengajian Ibu-ibu dan Keputrian', 'Wanita jenjang Pra Remaja sampai Dewasa', 'bi-gender-female'],
  ['PENGURUS', 'Pengajian Pengurus', 'Dapukan 994, 995, KU, Penerobos, Agnia\', Mubalegh (desa & kelompok)', 'bi-briefcase'],
  ['AGHNIA', 'Pengajian Aghnia', 'Dapukan Agnia\' (desa & kelompok) + peserta tambahan', 'bi-gem']
];
const DAPUKAN_AGHNIA = ["Agnia' Desa", "Agnia' Kelompok"]; // + peserta yang ditambahkan manual
const tambahan = k => String((k && k.Peserta_Tambahan) || '').split(',').map(x => x.trim()).filter(Boolean);
/** Peserta sesi gabungan = sesuai jenis ATAU ditambahkan manual (sama dengan server). */
const gabPeserta = (k, j) => gabCocok(k.Jenis_Gabungan || 'UMUM', j) || tambahan(k).includes(j.ID_Jamaah);
// Jenis kelamin: disimpan Ikhwan/Akhwat, ditampilkan Laki-laki/Wanita
const JK_LABEL = { Ikhwan: 'Laki-laki', Akhwat: 'Wanita' };
const jkLabel = jk => JK_LABEL[jk] || jk || '';
const gabJenis = k => GAB_JENIS.find(g => g[0] === ((k && k.Jenis_Gabungan) || 'UMUM')) || GAB_JENIS[0];
/** Apakah jamaah j peserta pengajian gabungan jenis ini? (aturan sama dengan server) */
const gabCocok = (jenis, j) => {
  const d = dpkList(j.Dapukan);
  switch (jenis) {
    case 'MUDAMUDI': return ['Pra Remaja', 'Remaja', 'Usia Nikah'].includes(j.Jenjang);
    case 'MTMS': return d.includes('MT') || d.includes('MS');
    case 'IBU': return j.Jenis_Kelamin === 'Akhwat' && ['Pra Remaja', 'Remaja', 'Usia Nikah', 'Dewasa'].includes(j.Jenjang);
    case 'PENGURUS': return d.some(x => DAPUKAN_PENGURUS.includes(x));
    case 'AGHNIA': return d.some(x => DAPUKAN_AGHNIA.includes(x));
    default: return true;
  }
};
/** Daftar materi + guru sebuah sesi (Dewasa bisa sampai 3 materi dengan guru berbeda). */
/** Susunan materi manual pengajian gabungan: [{m, p, d}] (d = durasi menit). */
const susunan = k => { if (!k || !k.Susunan_Materi) return []; try { const a = typeof k.Susunan_Materi === 'string' ? JSON.parse(k.Susunan_Materi) : k.Susunan_Materi; return Array.isArray(a) ? a : []; } catch (e) { return []; } };
const menit = n => { n = Number(n) || 0; const h = Math.floor(n / 60), m = n % 60; return h ? h + ' jam' + (m ? ' ' + m + ' mnt' : '') : m + ' mnt'; };
const durasiSesi = k => { const t = v => { const [h, m] = String(v || '0:0').split(':').map(Number); return h * 60 + m; }; return Math.max(0, t(k.Waktu_Selesai) - t(k.Waktu_Mulai)); };
const kegMateri = k => !k ? [] : susunan(k).length ? susunan(k).map(x => ({ mat: { Nama_Materi: x.m }, guru: x.p || '', durasi: x.d }))
  : [[k.ID_Materi, k.Pengajar], [k.ID_Materi_2, k.Pengajar_2], [k.ID_Materi_3, k.Pengajar_3]]
  .filter(s => s[0] || s[1]).map(s => ({ mat: S.idx.mat.get(s[0]), guru: s[1] || '' }));
const JJ_SUB = { 'Balita': 'Usia 0–3', 'PAUD/TK': 'PAUD/TK', 'Caberawit': 'Anak-anak (SD)', 'Pra Remaja': 'SMP', 'Remaja': 'SMA/SMK', 'Usia Nikah': 'Dewasa Muda', 'Dewasa': 'Bapak/Ibu' };
const ST_LABEL = { H: 'Hadir', I: 'Izin', S: 'Sakit', A: 'Alpa' };
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const BULAN_S = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const D = {
  pad: n => String(n).padStart(2, '0'),
  iso(d) { return d.getFullYear() + '-' + D.pad(d.getMonth() + 1) + '-' + D.pad(d.getDate()); },
  today() { return D.iso(new Date()); },
  ym(d) { return (typeof d === 'string' ? d : D.iso(d)).slice(0, 7); },
  parse(s) { return new Date(String(s).slice(0, 10) + 'T00:00:00'); },
  addMonths(ym, n) { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return D.ym(d); },
  months(endYm, n) { const out = []; for (let i = n - 1; i >= 0; i--) out.push(D.addMonths(endYm, -i)); return out; },
  monthLabel(ym) { const [y, m] = ym.split('-').map(Number); return BULAN[m - 1] + ' ' + y; },
  monthShort(ym) { const [, m] = ym.split('-').map(Number); return BULAN_S[m - 1]; },
  addDays(s, n) { const d = D.parse(s); d.setDate(d.getDate() + n); return D.iso(d); },
  /** "Selasa, 10 November 2026" */
  dayLong(s) { const d = D.parse(s); return isNaN(d) ? String(s) : HARI[d.getDay()] + ', ' + d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear(); },
  long(s) { if (!s) return '–'; const d = D.parse(s); return isNaN(d) ? esc(s) : d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear(); },
  short(s) { if (!s) return '–'; const d = D.parse(s); return isNaN(d) ? esc(s) : D.pad(d.getDate()) + ' ' + BULAN_S[d.getMonth()] + ' ' + d.getFullYear(); },
  day(s) { const d = D.parse(s); return HARI[d.getDay()]; },
  rel(s) {
    if (!s) return '';
    const t = new Date(String(s).replace(' ', 'T')).getTime();
    if (isNaN(t)) return s;
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'baru saja'; if (m < 60) return m + ' menit lalu';
    const h = Math.round(m / 60); if (h < 24) return h + ' jam lalu';
    const d = Math.round(h / 24); if (d < 30) return d + ' hari lalu';
    return D.short(s);
  },
  age(tgl) {
    if (!tgl) return null;
    const b = D.parse(tgl), r = new Date();
    let a = r.getFullYear() - b.getFullYear();
    const m = r.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && r.getDate() < b.getDate())) a--;
    return a;
  }
};
const F = {
  rp: n => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID'),
  rpShort(n) { n = Number(n) || 0; if (n >= 1e9) return 'Rp ' + (n / 1e9).toFixed(1).replace('.', ',') + ' M'; if (n >= 1e6) return 'Rp ' + (n / 1e6).toFixed(2).replace('.', ',') + ' jt'; if (n >= 1e3) return 'Rp ' + Math.round(n / 1e3) + ' rb'; return F.rp(n); },
  num: n => (Number(n) || 0).toLocaleString('id-ID'),
  pct: (n, d = 1) => (Number(n) || 0).toFixed(d).replace('.', ',') + '%',
  initials: s => String(s || '?').replace(/^(Bpk\.|Ibu|Ust\.|Ustzh\.|H\.)\s*/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
};
const uid = p => p + '-' + (crypto.getRandomValues ? Array.from(crypto.getRandomValues(new Uint8Array(4))).map(b => b.toString(16).padStart(2, '0')).join('') : Math.random().toString(16).slice(2, 10)).toUpperCase();
const jjKey = j => String(j || '').replace(/[^A-Za-z0-9]/g, '');
const jjBadge = j => j ? `<span class="jj jj-${jjKey(j)}">${esc(j)}</span>` : '';
const jkBadge = jk => jk ? `<span class="badge ${jk === 'Akhwat' ? 'b-akhwat' : 'b-ikhwan'}">${esc(jkLabel(jk))}</span>` : '';
const avatar = (j, cls = '') => {
  const ini = esc(F.initials(j.Nama_Lengkap || j.Nama));
  return j.Foto_URL
    ? `<span class="avatar ${cls}"><img src="${attr(j.Foto_URL)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.textContent='${ini}'"></span>`
    : `<span class="avatar ${cls}">${ini}</span>`;
};
const emptyState = (icon, text) => `<div class="empty"><i class="bi ${icon}"></i>${esc(text)}</div>`;
const opt = (v, label, sel) => `<option value="${attr(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(label)}</option>`;

function computeJenjang(tgl, usia) {
  const a = D.age(tgl);
  if (a === null || isNaN(a)) return '';
  for (const j of JENJANG) {
    const r = usia[j];
    if (a >= Number(r[0]) && (r[1] === '' || r[1] === null || a <= Number(r[1]))) return j;
  }
  return a < Number(usia[JENJANG[0]][0]) ? JENJANG[0] : JENJANG[JENJANG.length - 1];
}

// ── API (fetch → backend Google Apps Script REST) ─────────
const GAS_URL = String((window.APP_CONFIG && window.APP_CONFIG.GAS_URL) || '').trim();
const API = {
  /** Panggil fungsi backend. POST text/plain agar tidak memicu preflight CORS. */
  async call(name, ...args) {
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(GAS_URL) || /GANTI/.test(GAS_URL)) {
      throw new Error('Alamat backend belum diisi. Isi GAS_URL di file js/config.js dengan URL /exec dari Apps Script.');
    }
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), /^apiUpload/.test(name) ? 300000 : 90000) : null; // unggah file besar: 5 menit
    let res;
    try {
      const r = await fetch(GAS_URL, {
        method: 'POST', redirect: 'follow', signal: ctl ? ctl.signal : undefined,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ fn: name, args, app: location.protocol === 'https:' ? location.href : '' })
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const txt = await r.text();
      try { res = JSON.parse(txt); }
      catch (e) { throw new Error(/<html/i.test(txt) ? 'Backend membalas halaman, bukan JSON. Pastikan deployment Apps Script: Execute as "Me" dan akses "Anyone".' : 'Balasan server tidak valid.'); }
    } catch (err) {
      if (err && err.name === 'AbortError') throw new Error('Server terlalu lama merespons. Coba lagi.');
      throw new Error(err && /^Backend|^Balasan|^HTTP/.test(err.message) ? err.message : 'Koneksi ke server gagal. Periksa internet Anda.');
    } finally { if (timer) clearTimeout(timer); }
    if (res && res.ok) return res.data;
    const e = new Error((res && res.message) || 'Terjadi kesalahan di server.');
    e.code = res && res.code;
    if (e.code === 'AUTH') App.sessionExpired(e.message);
    throw e;
  },
  /** Panggilan terautentikasi (token otomatis jadi argumen pertama). */
  run(name, ...args) { return API.call(name, S.token, ...args); }
};

// ── Logo aplikasi (bisa diganti Master Admin) ─────────────
const Logo = {
  ICON: '<i class="bi bi-book-half"></i>',
  url: '',
  ok(u) { return typeof u === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(u); },
  get() { if (Logo.url) return Logo.url; const u = LS.get('an_logo'); return Logo.ok(u) ? (Logo.url = u) : ''; },
  html() { const u = Logo.get(); return u ? `<img src="${u}" alt="Logo">` : Logo.ICON; },
  /** Simpan logo baru (string kosong = bawaan) lalu terapkan ke semua tempat. */
  set(u) {
    u = Logo.ok(u) ? u : '';
    if (u === Logo.get()) return;
    Logo.url = u;
    if (u) LS.set('an_logo', u); else LS.del('an_logo');
    Logo.apply();
  },
  apply() {
    const has = !!Logo.get();
    $$('.app-logo').forEach(el => { el.innerHTML = Logo.html(); el.classList.toggle('has-img', has); });
  },
  /** Ambil logo publik (tanpa login) di latar belakang. */
  sync() { API.call('apiPublicInfo').then(r => { if (r) Logo.set(r.logo || ''); }).catch(() => {}); },
  /** Kecilkan gambar ke ≤256px agar muat di satu sel Sheets (< 45.000 karakter). */
  compress(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('Pilih berkas gambar (PNG, JPG, atau WEBP).'));
      if (file.size > 5 * 1024 * 1024) return reject(new Error('Ukuran gambar maksimal 5 MB.'));
      const fr = new FileReader();
      fr.onerror = () => reject(new Error('Gambar tidak bisa dibaca.'));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Format gambar tidak didukung.'));
        img.onload = () => {
          const tries = [];
          [256, 200, 160, 128, 96].forEach(px => { tries.push([px, 'image/webp', 0.9], [px, 'image/png'], [px, 'image/webp', 0.7]); });
          [160, 128, 96].forEach(px => tries.push([px, 'image/jpeg', 0.85]));
          for (const [px, type, q] of tries) {
            const sc = Math.min(1, px / Math.max(img.width, img.height));
            const w = Math.max(1, Math.round(img.width * sc)), h = Math.max(1, Math.round(img.height * sc));
            const c = document.createElement('canvas'); c.width = w; c.height = h;
            const x = c.getContext('2d');
            if (type === 'image/jpeg') { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); }
            x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, w, h);
            const u = c.toDataURL(type, q);
            if (u.indexOf('data:' + type) === 0 && u.length <= 45000) return resolve(u);
          }
          reject(new Error('Gambar terlalu rumit untuk dijadikan logo. Coba gambar yang lebih sederhana.'));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
};

// ── Store (state lokal = sumber render) ────────────────────
const S = {
  token: null, user: null, d: null, idx: {}, pending: 0, lastSync: 0, charts: {},
  page: 'dashboard',
  ui: {
    kel: 'ALL', dashMonth: D.ym(new Date()),
    jm: { q: '', jenjang: 'ALL', kelas: 'ALL', dapukan: 'ALL', status: 'Aktif', jk: 'ALL', page: 1, per: 10 },
    kur: { jenjang: 'Caberawit', kelas: 'ALL' },
    keg: { jenjang: 'ALL', bulan: D.ym(new Date()), status: 'ALL', q: '' },
    abs: { kegId: null, filter: 'ALL', q: '' },
    cap: { jenjang: 'Caberawit', kelas: 'ALL', q: '', filter: 'ALL', page: 1 },
    buku: { jenjang: 'ALL', kelas: 'ALL', q: '', sel: null },
    khd: { per: '3', status: 'Aktif', jenjang: 'ALL', kelas: 'ALL', q: '', only: 'ALL', sort: 'jenjang', page: 1, mode: 'jenjang' },
    khdg: { jenis: 'ALL', kel: 'ALL', q: '', page: 1, sort: 'pct_asc', only: 'ALL' },
    jmt: { per: 'next', kel: 'ALL' },
    inf: { bulan: D.ym(new Date()), q: '' },
    lap: { bulan: D.ym(new Date()), jenjang: '', jamaah: '' },
    usr: { q: '' }
  },
  absDraft: {}
};

const Store = {
  isMaster() { return S.user && S.user.Peran === 'Master Admin'; },
  /** Admin PPG (dulu "Super Admin"): seperti Master untuk generus, tanpa kelola pengguna, tanpa Dewasa & gabungan. */
  isSuper() { return !!S.user && (S.user.Peran === 'Admin PPG' || S.user.Peran === 'Super Admin'); },
  /** Admin pusat (Master Admin & Admin PPG). */
  isAdm() { return Store.isMaster() || Store.isSuper(); },
  isGuru() { return !!S.user && S.user.Peran === 'Guru'; },
  /** Jenjang yang diajar Guru (Balita–Usia Nikah). */
  guruJJ() { return String((S.user && S.user.Jenjang_Ajar) || '').split(',').map(x => x.trim()).filter(j => JENJANG_TARGET.includes(j)); },
  guruSemua() { return Store.isGuru() && String(S.user.ID_Kelompok) === KEL_SEMUA; },
  isPenerobos() { return !!S.user && S.user.Peran === 'Penerobos Desa'; },
  /** Boleh membuat/mengubah/mengunci pengajian gabungan. */
  canGab() { return Store.isMaster() || Store.isPenerobos(); },
  /** Akun hanya-lihat untuk data induk jamaah (Guru & Penerobos Desa). */
  isPnrKel() { return !!S.user && S.user.Peran === 'Penerobos Kelompok'; },
  /** Boleh mengelola jadwal Khotbah Jum'at. */
  /** Jadwal Jum'at: hanya Master Admin, Admin Kelompok & Penerobos Kelompok. */
  canJumat() { return Store.isMaster() || (!!S.user && S.user.Peran === 'Admin Kelompok') || Store.isPnrKel(); },
  /** Infaq Jum'atan dicatat Penerobos Kelompok / Admin Kelompok; Master Admin hanya melihat. */
  canInfaqJumat() { return (!!S.user && S.user.Peran === 'Admin Kelompok') || Store.isPnrKel(); },
  readOnly() { return Store.isGuru() || Store.isPenerobos() || Store.isPnrKel(); },
  allKel() { return Store.isMaster() || Store.isSuper() || Store.guruSemua() || Store.isPenerobos(); },
  /** Jenjang yang boleh dikelola: Admin PPG tanpa Dewasa; Guru jenjang ajarnya. */
  jj() { return Store.isGuru() ? Store.guruJJ() : Store.isSuper() ? JENJANG_TARGET : JENJANG; },
  /** Jenjang untuk absensi & rekap kehadiran: Guru mengabsen semua pengajian kelompoknya (termasuk Dewasa). */
  jjAbs() { return Store.isGuru() ? JENJANG : Store.jj(); },
  /** Sesi yang infaqnya boleh dicatat akun ini (bukan gabungan; Guru hanya Balita–Usia Nikah). */
  infOk(k) { return !!k && !isGab(k) && (!Store.isGuru() || JENJANG_TARGET.includes(k.Jenjang)); },
  /** Boleh mencatat/mengubah infaq (Admin Kelompok & Guru; Master/Admin PPG hanya melihat). */
  canInfaq() { return !Store.isMaster() && !Store.isSuper() && !Store.isPenerobos() && !Store.isPnrKel(); },
  myKel() { return S.user ? String(S.user.ID_Kelompok || '') : ''; },
  /** Filter kelompok global: master bisa pilih, admin selalu kelompoknya. */
  scopeKel() { return Store.allKel() ? S.ui.kel : Store.myKel(); },
  inScope(r) { const k = Store.scopeKel(); return k === 'ALL' || String(r.ID_Kelompok) === k || r.ID_Kelompok === KEL_SEMUA; },
  kelName(id) { if (id === KEL_SEMUA) return 'Semua Kelompok'; const k = S.idx.kel.get(String(id)); return k ? k.Nama_Kelompok : (id ? id : '–'); },
  scopeLabel() { const k = Store.scopeKel(); return k === 'ALL' ? 'Semua Kelompok' : Store.kelName(k); },

  load(data) {
    S.d = data;
    S.d.jumat = S.d.jumat || [];
    S.d.dokumen = S.d.dokumen || [];
    ['jamaah', 'kelompok', 'materi', 'target', 'kegiatan', 'infaq', 'log', 'pengguna', 'absensi', 'capaian', 'buku'].forEach(k => { if (!Array.isArray(S.d[k])) S.d[k] = []; });
    if (!S.d.settings) S.d.settings = { usia: { Caberawit: [4, 11], 'Pra Remaja': [12, 14], Remaja: [15, 18], 'Usia Nikah': [19, 30], Dewasa: [31, ''] } };
    S.d.infaq.forEach(i => { i.Jumlah = Number(i.Jumlah) || 0; });
    S.d.absFrom = S.d.absFrom || '';           // '' = seluruh riwayat absensi sudah termuat
    if (S.d.absFrom0 === undefined) S.d.absFrom0 = S.d.absFrom; // batas bawaan dari server (untuk snapshot)
    if (S.d.settings.logo !== undefined) Logo.set(S.d.settings.logo);
    Store.index();
  },

  index() {
    const d = S.d;
    const idx = S.idx = {};
    idx.kel = new Map(d.kelompok.map(k => [String(k.ID_Kelompok), k]));
    idx.jam = new Map(d.jamaah.map(j => [j.ID_Jamaah, j]));
    idx.bukuJam = new Map(); d.buku.forEach(b => { if (!idx.bukuJam.has(b.ID_Jamaah)) idx.bukuJam.set(b.ID_Jamaah, []); idx.bukuJam.get(b.ID_Jamaah).push(b); });
    idx.mat = new Map(d.materi.map(m => [m.ID_Materi, m]));
    idx.tgt = new Map(d.target.map(t => [t.ID_Target, t]));
    idx.keg = new Map(d.kegiatan.map(k => [k.ID_Kegiatan, k]));
    idx.tgtByJenjang = {};
    JENJANG_TARGET.forEach(j => { idx.tgtByJenjang[j] = d.target.filter(t => t.Jenjang === j && t.Status_Aktif !== 'Nonaktif'); });
    idx.abs = new Map();      // idKeg → Map(idJam → {s, c})
    idx.absJam = new Map();   // idJam → [{keg, s}]
    d.absensi.forEach(a => {
      let m = idx.abs.get(a[0]); if (!m) idx.abs.set(a[0], m = new Map());
      m.set(a[1], { s: a[2], c: a[3], m: a[4] ? 1 : 0 });
      let l = idx.absJam.get(a[1]); if (!l) idx.absJam.set(a[1], l = []);
      l.push({ keg: a[0], s: a[2] });
    });
    idx.cap = new Map();      // idJam → Map(idTarget → {s, t, c, u})
    d.capaian.forEach(c => {
      let m = idx.cap.get(c[0]); if (!m) idx.cap.set(c[0], m = new Map());
      m.set(c[1], { s: c[2], t: c[3], c: c[4], u: c[5] });
    });
    idx.infKeg = new Map(d.infaq.map(i => [i.ID_Kegiatan, i]));
  },

  persist: debounce(() => {
    if (!S.user || !S.d) return;
    // Snapshot hanya menyimpan absensi periode bawaan agar tidak membengkak setelah membuka riwayat lama
    let d = S.d;
    if (d.absFrom0 && d.absFrom !== d.absFrom0) {
      const f = d.absFrom0;
      d = Object.assign({}, d, { absFrom: f, absensi: d.absensi.filter(a => { const k = S.idx.keg.get(a[0]); return !k || String(k.Tanggal) >= f; }) });
    }
    const ok = LS.setJson('an_snap_' + S.user.Email, { v: 1, at: Date.now(), d });
    if (!ok) LS.del('an_snap_' + S.user.Email); // kuota penuh → abaikan snapshot
  }, 600),

  /** Riwayat absensi: saat login hanya 12 bulan terakhir; yang lebih lama dimuat saat dibutuhkan. */
  absKnown(tgl) { const f = S.d.absFrom; return !f || String(tgl) >= f; },
  absLabel() { return S.d.absFrom ? 'sejak ' + D.monthLabel(S.d.absFrom.slice(0, 7)) : 'keseluruhan'; },
  /** Muat absensi sejak tanggal `dari` (bila belum termuat). Mengembalikan Promise<boolean>. */
  ensureAbs(dari) {
    if (Store.absKnown(dari)) return Promise.resolve(true);
    if (S.absLoad) return S.absLoad.then(() => Store.ensureAbs(dari));
    const sampai = S.d.absFrom, user = S.user && S.user.Email;
    S.absLoad = API.run('apiAbsensiLama', dari, sampai).then(res => {
      if (!S.d || S.d.absFrom !== sampai || (S.user && S.user.Email) !== user) return false; // data sudah diganti (refresh/logout)
      const ada = new Set(S.d.absensi.map(a => a[0] + '|' + a[1]));
      S.d.absensi = (res.absensi || []).filter(a => !ada.has(a[0] + '|' + a[1])).concat(S.d.absensi);
      S.d.absFrom = dari <= '0000-00-00' ? '' : dari;
      Store.index();
      return true;
    }).finally(() => { S.absLoad = null; });
    return S.absLoad;
  },
  /** Gerbang halaman: true bila data siap; jika belum, mulai memuat lalu panggil `rerender` saat selesai. */
  absGate(dari, rerender, el) {
    if (Store.absKnown(dari)) return true;
    if (el) el.innerHTML = `<div class="card"><div class="empty"><i class="bi bi-arrow-repeat spin-icon"></i>Memuat riwayat absensi lama dari server…<div class="tiny muted mt-1">Saat login hanya absensi 12 bulan terakhir yang dimuat agar aplikasi tetap ringan.</div></div></div>`;
    Store.ensureAbs(dari).then(ok => { if (ok) rerender(); }).catch(e => {
      UI.toast('Gagal memuat riwayat absensi lama: ' + e.message, 'bad');
      if (el) el.innerHTML = `<div class="card"><div class="empty"><i class="bi bi-wifi-off"></i>Riwayat absensi lama belum bisa dimuat.<div class="mt-2"><button class="btn btn-primary btn-sm" onclick="Router.go(S.page)"><i class="bi bi-arrow-clockwise"></i> Coba Lagi</button></div></div></div>`;
    });
    return false;
  },

  /** Upsert ke array (mengembalikan array baru agar rollback mudah). */
  upsert(arrName, rec, key) {
    const arr = S.d[arrName].slice();
    const i = arr.findIndex(x => x[key] === rec[key]);
    if (i >= 0) arr[i] = Object.assign({}, arr[i], rec); else arr.push(rec);
    S.d[arrName] = arr;
  },

  // Turunan umum
  /** Jamaah dalam cakupan. Guru: hanya jenjang ajarnya, kecuali `semuaJJ` (absensi/rekap kehadiran). */
  jamaahScope(all, semuaJJ) { const g = Store.isGuru() && !semuaJJ ? Store.guruJJ() : null; return S.d.jamaah.filter(j => Store.inScope(j) && (all || j.Status_Aktif === 'Aktif') && (!g || g.includes(j.Jenjang))); },
  kegScope() { return S.d.kegiatan.filter(Store.inScope); },
  infScope() { return S.d.infaq.filter(Store.inScope); },
  kegiatanLabel(k) { return k ? `${D.short(k.Tanggal)} · ${k.Waktu_Mulai} — ${k.Nama_Kegiatan}` : '–'; }
};

// ── Statistik (semua di klien) ─────────────────────────────
const Stats = {
  att(kegList) {
    const c = { H: 0, I: 0, S: 0, A: 0 };
    kegList.forEach(k => { const m = S.idx.abs.get(k.ID_Kegiatan); if (m) m.forEach(v => { if (c[v.s] !== undefined) c[v.s]++; }); });
    const n = c.H + c.I + c.S + c.A;
    return Object.assign(c, { n, pct: pct(c.H, n) });
  },
  kegMonth(ym, list) { return (list || Store.kegScope()).filter(k => String(k.Tanggal).slice(0, 7) === ym); },
  held(list) { const t = D.today(); return list.filter(k => k.Tanggal <= t); },
  infMonth(ym) { return Store.infScope().filter(i => String(i.Tanggal).slice(0, 7) === ym); },
  /** Target yang berlaku bagi jamaah: materi Caberawit khusus kelas hanya untuk kelas itu. */
  targetsOf(j) {
    return (S.idx.tgtByJenjang[j.Jenjang] || []).filter(t => { const m = S.idx.mat.get(t.ID_Materi); return !m || !m.Kelas || m.Kelas === j.Kelas; });
  },
  jamProgress(j) {
    const tg = Stats.targetsOf(j);
    const m = S.idx.cap.get(j.ID_Jamaah) || new Map();
    let done = 0, proc = 0, last = '';
    tg.forEach(t => { const c = m.get(t.ID_Target); if (c) { if (c.s === 'Tercapai') done++; else if (c.s === 'Proses') proc++; if (c.u > last) last = c.u; } });
    return { total: tg.length, done, proc, pct: tg.length ? Math.round(done / tg.length * 100) : 0, last };
  },
  jamAttendance(idJam, lastN) {
    let rows = (S.idx.absJam.get(idJam) || []).map(r => ({ s: r.s, k: S.idx.keg.get(r.keg) })).filter(r => r.k);
    rows.sort((a, b) => (b.k.Tanggal + b.k.Waktu_Mulai).localeCompare(a.k.Tanggal + a.k.Waktu_Mulai));
    if (lastN) rows = rows.slice(0, lastN);
    const h = rows.filter(r => r.s === 'H').length;
    let alpaStreak = 0;
    for (const r of rows) { if (r.s === 'A') alpaStreak++; else break; }
    return { total: rows.length, h, pct: rows.length ? Math.round(h / rows.length * 100) : 0, alpaStreak, lastAlpa: rows.filter(r => r.s === 'A').length };
  },
  jenjangCapaian(jj) {
    const jams = Store.jamaahScope().filter(j => j.Jenjang === jj);
    const tg = S.idx.tgtByJenjang[jj] || [];
    let done = 0, total = 0;
    jams.forEach(j => { const m = S.idx.cap.get(j.ID_Jamaah) || new Map(); const tj = Stats.targetsOf(j); total += tj.length; tj.forEach(t => { const c = m.get(t.ID_Target); if (c && c.s === 'Tercapai') done++; }); });
    return { pct: total ? Math.round(done / total * 1000) / 10 : 0, done, total, jamaah: jams.length, materi: new Set(tg.map(t => t.ID_Materi)).size };
  }
};

// ── UI helpers ─────────────────────────────────────────────
const UI = {
  toast(msg, type = 'ok', action) {
    const icon = { ok: 'bi-check-circle-fill', bad: 'bi-exclamation-octagon-fill', warn: 'bi-exclamation-triangle-fill', info: 'bi-info-circle-fill' }[type] || 'bi-info-circle-fill';
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.setAttribute('role', type === 'bad' ? 'alert' : 'status');
    el.innerHTML = `<i class="bi ${icon}"></i><span>${esc(msg)}</span>${action ? `<button class="t-action">${esc(action.label)}</button>` : ''}`;
    if (action) el.querySelector('.t-action').onclick = () => { action.fn(); el.remove(); };
    $('#toastRoot').appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 250); }, type === 'bad' ? 6000 : 3200);
  },

  modal({ title, body, foot, size = '', onOpen, onClose, dismissable = true }) {
    const root = $('#modalRoot');
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `<div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${attr(title)}">
      <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn sm" data-close aria-label="Tutup"><i class="bi bi-x-lg"></i></button></div>
      <div class="modal-body">${body || ''}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div>`;
    const prevFocus = document.activeElement;
    const close = () => {
      wrap.remove();
      document.removeEventListener('keydown', onKey);
      if (onClose) onClose();
      if (prevFocus && prevFocus.focus) prevFocus.focus();
    };
    const onKey = e => { if (e.key === 'Escape' && dismissable) close(); };
    wrap.addEventListener('click', e => { if ((e.target === wrap && dismissable) || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', onKey);
    root.appendChild(wrap);
    const m = { el: wrap.querySelector('.modal'), close };
    const f = m.el.querySelector('input:not([type=hidden]):not([readonly]), select, textarea, button.btn-primary');
    if (f && window.innerWidth > 768) setTimeout(() => f.focus(), 30);
    if (onOpen) onOpen(m);
    return m;
  },

  confirm(message, { title = 'Konfirmasi', ok = 'Ya, lanjutkan', danger = false } = {}) {
    return new Promise(resolve => {
      let done = false;
      const m = UI.modal({
        title, size: 'sm',
        body: `<p>${message}</p>`,
        foot: `<button class="btn btn-light" data-close>Batal</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(ok)}</button>`,
        onClose: () => { if (!done) resolve(false); }
      });
      m.el.querySelector('[data-ok]').onclick = () => { done = true; m.close(); resolve(true); };
    });
  },

  busy(btn, on, label) {
    if (!btn) return;
    if (on) { btn.dataset.html = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spin"></span> ${esc(label || 'Memproses…')}`; }
    else { btn.disabled = false; if (btn.dataset.html) btn.innerHTML = btn.dataset.html; }
  },

  sync() {
    const pill = $('#syncText'), dot = $('#syncPill .dot'), card = $('#syncCardText'), sd = $('#syncDot');
    if (!pill) return;
    let text, cls;
    if (S.pending > 0) { text = `Menyimpan ${S.pending} perubahan…`; cls = 'dot dot-warn dot-pulse'; }
    else if (S.syncError) { text = 'Sebagian perubahan gagal disimpan'; cls = 'dot dot-bad'; }
    else if (!S.lastSync) { text = 'Memakai data tersimpan · menyinkronkan…'; cls = 'dot dot-warn dot-pulse'; }
    else { text = 'Tersambung ke Google Sheets · ' + D.rel(new Date(S.lastSync).toISOString()); cls = 'dot dot-ok'; }
    pill.textContent = text; dot.className = cls; sd.className = cls;
    card.textContent = S.pending > 0 ? 'Sinkronisasi berjalan…' : 'Sinkron Google Workspace';
  },

  theme(t) {
    document.documentElement.setAttribute('data-theme', t);
    const b = $('#themeBtn i'); if (b) b.className = 'bi ' + (t === 'dark' ? 'bi-sun' : 'bi-moon-stars');
    const meta = $('meta[name=theme-color]'); if (meta) meta.content = t === 'dark' ? '#0F1412' : '#0F6B4F';
  },
  toggleTheme() {
    const t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    UI.theme(t); LS.set('an_theme', t);
    if (S.d) Router.render(); // gambar ulang grafik dengan warna tema
  },
  openSidebar() { $('#sidebar').classList.add('open'); $('#sidebarBackdrop').classList.add('show'); },
  closeSidebar() { $('#sidebar').classList.remove('open'); $('#sidebarBackdrop').classList.remove('show'); },

  pdf(res) {
    const bin = atob(res.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    UI.modal({
      title: res.name, size: 'xl pdf',
      body: `<iframe src="${url}" title="Pratinjau ${attr(res.name)}"></iframe>`,
      foot: `${res.url ? `<a class="btn btn-light" href="${attr(res.url)}" target="_blank" rel="noopener"><i class="bi bi-google"></i> Buka di Drive</a>` : ''}
             <a class="btn btn-primary" href="${url}" download="${attr(res.name)}"><i class="bi bi-download"></i> Unduh PDF</a>
             <button class="btn btn-light" data-close>Tutup</button>`,
      onClose: () => setTimeout(() => URL.revokeObjectURL(url), 1000)
    });
  },

  pager(total, page, per, onPage) {
    const pages = Math.max(1, Math.ceil(total / per));
    const p = clamp(page, 1, pages);
    const nums = [];
    for (let i = 1; i <= pages; i++) { if (i === 1 || i === pages || Math.abs(i - p) <= 1) nums.push(i); else if (nums[nums.length - 1] !== '…') nums.push('…'); }
    return `<div class="pager">
      <button ${p <= 1 ? 'disabled' : ''} onclick="${onPage}(${p - 1})" aria-label="Sebelumnya"><i class="bi bi-chevron-left"></i></button>
      ${nums.map(n => n === '…' ? '<span class="faint">…</span>' : `<button class="${n === p ? 'active' : ''}" onclick="${onPage}(${n})">${n}</button>`).join('')}
      <button ${p >= pages ? 'disabled' : ''} onclick="${onPage}(${p + 1})" aria-label="Berikutnya"><i class="bi bi-chevron-right"></i></button></div>`;
  },

  /** Kompres gambar di klien (maks 480px, JPEG) sebelum diunggah. */
  compressImage(file, max = 480) {
    return new Promise((resolve, reject) => {
      if (!/^image\//.test(file.type)) return reject(new Error('File harus berupa gambar.'));
      const r = new FileReader();
      r.onload = () => {
        const img = new Image();
        img.onload = () => {
          const s = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = () => reject(new Error('Gambar tidak dapat dibaca.'));
        img.src = r.result;
      };
      r.onerror = () => reject(new Error('Gagal membaca file.'));
      r.readAsDataURL(file);
    });
  }
};

// ── Grafik (Chart.js) ──────────────────────────────────────
const Charts = {
  /** Muat Chart.js di latar belakang (tidak menunda aplikasi); setelah siap, halaman aktif digambar ulang. */
  load() {
    if (window.Chart || Charts._p) return;
    Charts._p = true;
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js';
    s.async = true;
    s.onload = () => { try { if (S.d && !$('#appView').hidden) Router.render(); } catch (e) { console.warn(e); } };
    s.onerror = () => { Charts._p = false; console.warn('Chart.js gagal dimuat (CDN tidak terjangkau). Grafik dilewati.'); };
    document.head.appendChild(s);
  },
  css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); },
  make(id, cfg) {
    if (!window.Chart) return;
    const el = document.getElementById(id);
    if (!el) return;
    if (S.charts[id]) S.charts[id].destroy();
    const text = Charts.css('--muted'), grid = Charts.css('--border');
    Chart.defaults.font.family = "Inter, system-ui, sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.color = text;
    cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: { duration: 350 } }, cfg.options || {});
    const sc = cfg.options.scales;
    if (sc) Object.values(sc).forEach(a => { a.grid = Object.assign({ color: grid, drawTicks: false }, a.grid || {}); a.border = { display: false }; a.ticks = Object.assign({ padding: 8 }, a.ticks || {}); });
    cfg.options.plugins = Object.assign({ legend: { display: false }, tooltip: { backgroundColor: '#1F2933', padding: 10, cornerRadius: 8, titleFont: { weight: '600' } } }, cfg.options.plugins || {});
    S.charts[id] = new Chart(el, cfg);
  },
  destroyAll() { Object.keys(S.charts).forEach(k => { try { S.charts[k].destroy(); } catch (e) { /* abaikan */ } delete S.charts[k]; }); }
};

// ── Ekspor Excel (SheetJS dimuat saat pertama dibutuhkan) ──
const Excel = {
  _p: null,
  load() {
    if (window.XLSX) return Promise.resolve();
    if (Excel._p) return Excel._p;
    Excel._p = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      s.onload = res; s.onerror = () => { Excel._p = null; rej(new Error('Gagal memuat modul Excel. Periksa koneksi.')); };
      document.head.appendChild(s);
    });
    return Excel._p;
  },
  async export(filename, sheets) {
    try {
      UI.toast('Menyiapkan file Excel…', 'info');
      await Excel.load();
      const wb = XLSX.utils.book_new();
      sheets.forEach(sh => {
        const ws = XLSX.utils.json_to_sheet(sh.rows.length ? sh.rows : [{ Keterangan: 'Tidak ada data' }]);
        const keys = Object.keys(sh.rows[0] || { Keterangan: '' });
        ws['!cols'] = keys.map(k => ({ wch: Math.min(40, Math.max(k.length, ...sh.rows.slice(0, 200).map(r => String(r[k] === undefined ? '' : r[k]).length)) + 2) }));
        XLSX.utils.book_append_sheet(wb, ws, sh.name.slice(0, 31));
      });
      XLSX.writeFile(wb, filename + '.xlsx');
      UI.toast('File Excel diunduh.', 'ok');
    } catch (e) { UI.toast(e.message, 'bad'); }
  }
};

// ── Router SPA (tanpa URL, tanpa server) ───────────────────
const NAV = [
  { g: 'Utama' },
  { id: 'dashboard', icon: 'bi-grid-1x2', label: 'Dashboard' },
  { id: 'jamaah', icon: 'bi-people', label: 'Data Jamaah' },
  { g: 'Pembinaan & Kegiatan' },
  { id: 'kurikulum', icon: 'bi-journal-bookmark', label: 'Kurikulum & Materi' },
  { id: 'kegiatan', icon: 'bi-calendar3', label: 'Kegiatan & Jadwal' },
  { id: 'absensi', icon: 'bi-check2-square', label: 'Absensi Cepat' },
  { id: 'jumat', icon: 'bi-moon-stars', label: "Jadwal Jum'at", jumat: true },
  { id: 'capaian', icon: 'bi-award', label: 'Capaian Jamaah' },
  { id: 'buku', icon: 'bi-journal-richtext', label: 'Buku Penghubung' },
  { g: 'Keuangan & Laporan' },
  { id: 'infaq', icon: 'bi-cash-coin', label: 'Infaq Pengajian' },
  { id: 'kehadiran', icon: 'bi-percent', label: 'Persentase Kehadiran' },
  { id: 'laporan', icon: 'bi-file-earmark-bar-graph', label: 'Laporan & Rekap', noGuru: true },
  { g: 'Sistem', adm: true },
  { id: 'pengguna', icon: 'bi-person-gear', label: 'Kelola Pengguna', master: true },
  { id: 'pengaturan', icon: 'bi-gear', label: 'Pengaturan', adm: true }
];
const BOTTOM = [['dashboard', 'bi-grid-1x2', 'Beranda'], ['jamaah', 'bi-people', 'Jamaah'], ['absensi', 'bi-check2-square', 'Absensi'], ['capaian', 'bi-award', 'Capaian'], ['__menu', 'bi-list', 'Menu']];

const Router = {
  allowed(id) { const n = NAV.find(x => x.id === id); return n && (!n.master || Store.isMaster()) && (!n.adm || Store.isAdm()) && (!n.noGuru || !Store.isGuru()) && (!n.jumat || Store.canJumat()) && (!Store.isPenerobos() || PNR_NAV.includes(id)) && (!Store.isPnrKel() || PNRK_NAV.includes(id)); },
  go(page, params) {
    if (!Router.allowed(page)) page = 'dashboard';
    S.page = page;
    LS.set('an_page', page);
    if (Date.now() - (S.lastCheck || 0) > 5000) setTimeout(App.checkVer, 0); // pindah menu → cek data baru di latar
    $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
    $$('[data-nav]').forEach(b => { const on = b.dataset.nav === page; b.classList.toggle('active', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    UI.closeSidebar();
    Router.render(params);
    const main = $('#main'); if (main) { window.scrollTo({ top: 0 }); main.focus({ preventScroll: true }); }
  },
  render(params) {
    if (!S.d) return;
    const P = Pages[S.page];
    if (!P) return;
    try { P.render(params); } catch (e) { console.error(e); $('#page-' + S.page).innerHTML = `<div class="card">${emptyState('bi-bug', 'Halaman gagal ditampilkan: ' + e.message)}</div>`; }
  },
  buildNav() {
    $('#sideNav').innerHTML = NAV.filter(n => Router.allowed(n.id)).map(n => n.g
      ? `<div class="nav-group">${esc(n.g)}</div>`
      : `<button class="nav-item" data-nav="${n.id}" onclick="Router.go('${n.id}')"><i class="bi ${n.icon}"></i><span>${esc(n.label)}</span></button>`).join('');
    $('#bottomNav').innerHTML = BOTTOM.filter(([id]) => id === '__menu' || Router.allowed(id)).map(([id, ic, l]) => id === '__menu'
      ? `<button onclick="UI.openSidebar()"><i class="bi ${ic}"></i>${l}</button>`
      : `<button data-nav="${id}" onclick="Router.go('${id}')"><i class="bi ${ic}"></i>${l}</button>`).join('');
  },
  buildKelSwitch() {
    const el = $('#kelSwitch');
    if (Store.allKel()) {
      el.innerHTML = `<i class="bi bi-people-fill lead"></i><div class="grow"><small>Kelompok Aktif</small>
        <select id="kelSelect" aria-label="Pilih kelompok aktif">${opt('ALL', 'Semua Kelompok (Pusat)', S.ui.kel)}${S.d.kelompok.filter(k => k.Status_Aktif !== 'Nonaktif').map(k => opt(k.ID_Kelompok, k.Nama_Kelompok, S.ui.kel)).join('')}</select></div>
        ${Store.isSuper() ? '<span class="badge b-primary">PPG</span>' : Store.isGuru() ? '<span class="badge b-mint">Guru</span>' : '<span class="badge b-gold">Pusat</span>'}`;
      $('#kelSelect').onchange = e => { S.ui.kel = e.target.value; LS.set('an_kel', S.ui.kel); S.ui.jm.page = 1; S.ui.cap.page = 1; Router.render(); };
    } else {
      el.innerHTML = `<i class="bi bi-people-fill lead"></i><div class="grow"><small>Kelompok Aktif</small><b>${esc(Store.kelName(Store.myKel()))}</b></div>${Store.isGuru() ? '<span class="badge b-mint">Guru</span>' : Store.isPnrKel() ? '<span class="badge b-gold">Penerobos</span>' : '<span class="badge b-ok">Admin</span>'}`;
    }
  }
};

// ── App lifecycle ──────────────────────────────────────────
const App = {
  boot() {
    try { App._boot(); } catch (e) { console.error(e); App.splashFail('Aplikasi gagal dibuka: ' + e.message); }
  },
  _boot() {
    window.__booted = true;
    Charts.load();
    UI.theme(LS.get('an_theme') || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
    App.bindStatic();
    Logo.apply();
    if (!LS.get('an_token')) Logo.sync();
    const wtok = LS.get('an_wali'), jtok = LS.get('an_jm');
    if (wtok && !LS.get('an_token')) { Wali.init(wtok); return; }
    if (jtok && !LS.get('an_token')) { JamaahApp.init(jtok); return; }
    const token = LS.get('an_token');
    const user = LS.json('an_user');
    if (token && user) {
      S.token = token; S.user = user;
      const snap = LS.json('an_snap_' + user.Email);
      let opened = false;
      if (snap && snap.d) {
        // Buka instan dari snapshot, lalu sinkron di latar belakang
        try { Store.load(snap.d); App.start(); opened = true; App.refresh(true); }
        catch (e) { console.warn('Snapshot lama tidak bisa dipakai:', e); LS.del('an_snap_' + user.Email); }
      }
      if (!opened) {
        $('#splashMsg').textContent = 'Memuat data dari Google Sheets…';
        const slow = setTimeout(() => { if ($('#appView').hidden) App.splashFail('Pemuatan data lebih lama dari biasanya. Periksa koneksi internet Anda.'); }, 25000);
        App.refresh(true).then(ok => { clearTimeout(slow); if (ok) App.start(); else if ($('#appView').hidden && S.token && !$('#splash').classList.contains('failed')) App.splashFail('Data gagal dimuat. Periksa koneksi lalu coba lagi.'); })
          .catch(e => { clearTimeout(slow); App.splashFail(e.message); });
      }
    } else {
      App.showLogin();
    }
  },

  bindStatic() {
    $('#loginForm').addEventListener('submit', App.login);
    $('#waliLoginForm').addEventListener('submit', Wali.login);
    $('#jmLoginForm').addEventListener('submit', JamaahApp.login);
    $$('#loginMode button').forEach(b => { b.onclick = () => App.loginMode(b.dataset.mode); });
    $('#togglePw').onclick = () => { const i = $('#loginPassword'); const show = i.type === 'password'; i.type = show ? 'text' : 'password'; $('#togglePw i').className = 'bi ' + (show ? 'bi-eye-slash' : 'bi-eye'); };
    const ub = $('#userBtn'), dd = $('#userDropdown');
    ub.onclick = e => { e.stopPropagation(); dd.hidden = !dd.hidden; ub.setAttribute('aria-expanded', String(!dd.hidden)); };
    document.addEventListener('click', e => { if (!e.target.closest('.user-menu')) dd.hidden = true; if (!e.target.closest('.global-search')) $('#searchPop').hidden = true; });
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#globalSearch').focus(); }
    });
    GlobalSearch.bind();
    setInterval(UI.sync, 30000);
    // Sinkron otomatis: cek perubahan dari admin lain tiap 20 detik & saat tab/aplikasi kembali dibuka
    setInterval(App.checkVer, 20000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') App.checkVer(); });
    window.addEventListener('focus', () => { if (Date.now() - (S.lastCheck || 0) > 5000) App.checkVer(); });
    // Cadangan: muat ulang penuh tiap 5 menit saat tab terlihat
    setInterval(() => { if (S.token && document.visibilityState === 'visible' && !S.pending) App.refresh(true); }, 300000);
    window.addEventListener('beforeunload', e => { if (S.pending > 0) { e.preventDefault(); e.returnValue = ''; } });
  },

  /** Layar loading gagal: tampilkan pesan + jalan keluar (coba lagi / masuk ulang), jangan berhenti di loading. */
  splashFail(msg) {
    const sp = $('#splash');
    if (!sp || sp.classList.contains('hide') || sp.classList.contains('failed')) return;
    $('#splashMsg').innerHTML = `<div class="splash-err">${esc(msg || 'Data gagal dimuat.')}</div>
      <div class="row-wrap mt-3" style="justify-content:center"><button class="btn btn-primary btn-sm" onclick="location.reload()"><i class="bi bi-arrow-clockwise"></i> Coba lagi</button>
      <button class="btn btn-light btn-sm" onclick="App.resetLogin()"><i class="bi bi-box-arrow-in-right"></i> Masuk ulang</button></div>`;
    sp.classList.add('failed');
  },
  /** Hapus sesi & salinan data di perangkat, lalu kembali ke layar masuk. */
  resetLogin() {
    const u = LS.json('an_user');
    if (u) LS.del('an_snap_' + u.Email);
    LS.del('an_token'); LS.del('an_wali'); LS.del('an_wali_snap'); LS.del('an_jm'); LS.del('an_jm_snap');
    S.token = null; S.user = null; S.d = null;
    $('#splash').classList.remove('failed');
    App.showLogin();
  },
  /** Ganti mode layar masuk: pengurus (email) atau orang tua/wali (ID + PIN). */
  loginMode(mode) {
    if (!['admin', 'jamaah', 'wali'].includes(mode)) mode = 'admin';
    $$('#loginMode button').forEach(b => { const on = b.dataset.mode === mode; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); });
    $('#loginForm').hidden = mode !== 'admin'; $('#waliLoginForm').hidden = mode !== 'wali'; $('#jmLoginForm').hidden = mode !== 'jamaah';
    LS.set('an_login_mode', mode);
    const pick = (a, b) => ($(a).value ? $(b) : $(a));
    setTimeout(() => { const el = mode === 'wali' ? pick('#waliId', '#waliPin') : mode === 'jamaah' ? pick('#jmId', '#jmPin') : pick('#loginEmail', '#loginPassword'); if (el) el.focus(); }, 30);
  },
  showLogin() {
    $('#splash').classList.add('hide');
    $('#waliView').hidden = true;
    $('#appView').hidden = true;
    $('#loginView').hidden = false;
    const last = LS.get('an_last_email'); if (last) $('#loginEmail').value = last;
    const lw = LS.get('an_wali_id'); if (lw) $('#waliId').value = lw;
    const lj = LS.get('an_jm_id'); if (lj) $('#jmId').value = lj;
    App.loginMode(LS.get('an_login_mode') || 'admin');
  },

  async login(e) {
    e.preventDefault();
    const email = $('#loginEmail').value.trim(), pw = $('#loginPassword').value;
    const err = $('#loginError');
    err.hidden = true;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = 'Masukkan email yang valid.'; err.hidden = false; $('#loginEmail').focus(); return; }
    if (!pw) { err.textContent = 'Masukkan kata sandi.'; err.hidden = false; $('#loginPassword').focus(); return; }
    const btn = $('#loginBtn');
    UI.busy(btn, true, 'Memeriksa…');
    try {
      const res = await API.call('apiLogin', email, pw);
      S.token = res.token; S.user = res.user;
      LS.set('an_token', res.token); LS.setJson('an_user', res.user); LS.set('an_last_email', email);
      Store.load(res.data);
      S.lastSync = Date.now();
      Store.persist();
      $('#loginPassword').value = '';
      App.start();
      UI.toast(`Ahlan wa sahlan, ${res.user.Nama}!`, 'ok');
    } catch (ex) {
      err.textContent = ex.message; err.hidden = false;
    } finally { UI.busy(btn, false); }
  },

  start() {
    $('#splash').classList.add('hide');
    $('#loginView').hidden = true;
    $('#appView').hidden = false;
    if (Store.allKel()) { const k = LS.get('an_kel'); S.ui.kel = k && (k === 'ALL' || S.idx.kel.has(k)) ? k : 'ALL'; }
    $('#userName').textContent = S.user.Nama;
    $('#userRole').textContent = S.user.Peran + (Store.isGuru() ? ' · ' + Store.guruJJ().join(', ') : Store.allKel() ? '' : ' · ' + Store.kelName(Store.myKel()));
    document.body.classList.toggle('is-guru', Store.readOnly());
    $('#userAvatar').textContent = F.initials(S.user.Nama);
    $('#rolePill span').textContent = Store.isMaster() ? 'Master Admin · Pusat' : Store.isSuper() ? 'Admin PPG · Generus' : Store.isPenerobos() ? 'Penerobos Desa · Gabungan' : Store.isPnrKel() ? 'Penerobos · ' + Store.kelName(Store.myKel()) : Store.isGuru() ? 'Guru · ' + (Store.guruSemua() ? 'Semua Kelompok' : Store.kelName(Store.myKel())) : 'Admin · ' + Store.kelName(Store.myKel());
    Router.buildNav();
    Router.buildKelSwitch();
    UI.sync();
    Router.go(LS.get('an_page') || 'dashboard');
  },

  /** Ambil data terbaru (1 panggilan). silent=true → tanpa mengganggu UI. */
  async refresh(silent) {
    if (!S.token) return false;
    const btn = $('#refreshBtn i');
    if (btn) btn.classList.add('spin-icon');
    if (!silent) UI.toast('Memuat ulang data…', 'info');
    try {
      const res = await API.run('apiBootstrap');
      if (S.pending > 0) { setTimeout(() => App.refresh(true), 2500); return true; } // jangan timpa perubahan yang sedang dikirim
      S.user = res.user; LS.setJson('an_user', res.user);
      // Pertahankan riwayat absensi lama yang sudah dimuat (tidak ikut dikirim ulang saat sinkron)
      let lama = null;
      if (S.d && S.d.absFrom0 && S.d.absFrom !== S.d.absFrom0 && res.data.absFrom) {
        const batas = res.data.absFrom;
        lama = { from: S.d.absFrom, rows: S.d.absensi.filter(r => { const k = S.idx.keg.get(r[0]); return k && String(k.Tanggal) < batas; }) };
      }
      Store.load(res.data);
      if (lama) { S.d.absensi = lama.rows.concat(S.d.absensi); S.d.absFrom = lama.from; Store.index(); }
      S.ver = res.data.ver || S.ver; S.lastCheck = Date.now();
      S.lastSync = Date.now(); S.syncError = false;
      Store.persist();
      if (!$('#appView').hidden) { Router.buildNav(); Router.buildKelSwitch(); Router.go(S.page); }
      if (!silent) UI.toast('Data terbaru dimuat.', 'ok');
      UI.sync();
      return true;
    } catch (e) {
      if (e.code === 'AUTH') return false;
      if ($('#appView').hidden && !S.d) App.splashFail(e.message);
      else UI.toast('Gagal sinkron: ' + e.message, 'bad');
      return false;
    } finally { if (btn) btn.classList.remove('spin-icon'); }
  },

  /** Sinkron otomatis: cek versi data di server (ringan); muat ulang hanya bila ada perubahan dari admin lain. */
  async checkVer() {
    if (!S.token || !S.d || S.pending > 0 || S.checking || document.visibilityState !== 'visible' || $('#appView').hidden) return;
    const ae = document.activeElement;
    if ($('#modalRoot').children.length || (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.id !== 'globalSearch')) return; // jangan ganggu yang sedang mengetik
    S.checking = true; S.lastCheck = Date.now();
    try {
      const v = await API.run('apiVersion');
      if (S.ver && v !== S.ver && !S.pending) await App.refresh(true);
      else S.ver = v;
    } catch (e) { /* diam: dicoba lagi pada siklus berikutnya */ } finally { S.checking = false; }
  },

  sessionExpired(msg) {
    if (!S.token) return;
    S.token = null;
    LS.del('an_token');
    Charts.destroyAll();
    $('#modalRoot').innerHTML = '';
    UI.toast(msg || 'Sesi berakhir. Silakan masuk kembali.', 'warn');
    App.showLogin();
  },

  async logout() {
    if (S.pending > 0 && !(await UI.confirm('Masih ada perubahan yang sedang disimpan. Tetap keluar?', { danger: true, ok: 'Keluar' }))) return;
    const t = S.token;
    S.token = null;
    LS.del('an_token');
    if (S.user) LS.del('an_snap_' + S.user.Email); // jangan tinggalkan data di perangkat bersama
    S.user = null; S.d = null;
    Charts.destroyAll();
    API.call('apiLogout', t).catch(() => {});
    App.showLogin();
  },

  /**
   * Optimistic mutation: apply() mengubah state lokal → UI langsung berubah,
   * call() dikirim ke server di latar belakang. Gagal → rollback() + toast.
   */
  mutate({ apply, rollback, call, okMsg, onSaved, after }) {
    apply();
    Store.index();
    Router.render();
    if (okMsg) UI.toast(okMsg, 'ok');
    S.pending++; UI.sync();
    return call().then(res => {
      if (onSaved) onSaved(res);
      Store.index();
      S.lastSync = Date.now(); S.syncError = false;
      Store.persist();
      if (after) after(res);
      return res;
    }).catch(e => {
      rollback();
      Store.index();
      Router.render();
      S.syncError = true;
      UI.toast('Gagal disimpan, perubahan dibatalkan: ' + e.message, 'bad');
      throw e;
    }).finally(() => { S.pending--; UI.sync(); if (!S.pending) setTimeout(UI.sync, 50); });
  }
};

// ── Pencarian global ───────────────────────────────────────
const GlobalSearch = {
  bind() {
    const inp = $('#globalSearch'), pop = $('#searchPop');
    inp.addEventListener('input', debounce(() => GlobalSearch.run(inp.value), 120));
    inp.addEventListener('focus', () => { if (inp.value) GlobalSearch.run(inp.value); });
    inp.addEventListener('keydown', e => {
      const items = $$('button', pop);
      if (!items.length) return;
      let i = items.findIndex(b => b.classList.contains('focus'));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items.forEach(b => b.classList.remove('focus')); i = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length; items[i].classList.add('focus'); items[i].scrollIntoView({ block: 'nearest' }); }
      if (e.key === 'Enter') { e.preventDefault(); (items[i] || items[0]).click(); }
      if (e.key === 'Escape') { pop.hidden = true; inp.blur(); }
    });
  },
  run(q) {
    const pop = $('#searchPop');
    q = q.trim().toLowerCase();
    if (!q || !S.d) { pop.hidden = true; return; }
    const jam = Store.jamaahScope(true).filter(j => (j.Nama_Lengkap + ' ' + j.ID_Jamaah).toLowerCase().includes(q)).slice(0, 6);
    const keg = Store.kegScope().filter(k => (k.Nama_Kegiatan + ' ' + k.Tempat + ' ' + k.Pengajar).toLowerCase().includes(q)).sort((a, b) => b.Tanggal.localeCompare(a.Tanggal)).slice(0, 4);
    if (!jam.length && !keg.length) { pop.innerHTML = '<div class="empty small">Tidak ada hasil</div>'; pop.hidden = false; return; }
    pop.innerHTML = (jam.length ? '<div class="grp">Jamaah</div>' + jam.map(j => `<button onclick="GlobalSearch.pick('j','${j.ID_Jamaah}')">${avatar(j)}<span class="grow"><b>${esc(j.Nama_Lengkap)}</b><br><span class="tiny muted">${esc(j.ID_Jamaah)} · ${esc(j.Jenjang)} · ${esc(Store.kelName(j.ID_Kelompok))}</span></span></button>`).join('') : '') +
      (keg.length ? '<div class="grp">Kegiatan</div>' + keg.map(k => `<button onclick="GlobalSearch.pick('k','${k.ID_Kegiatan}')"><span class="avatar"><i class="bi bi-calendar3"></i></span><span class="grow"><b>${esc(k.Nama_Kegiatan)}</b><br><span class="tiny muted">${D.short(k.Tanggal)} · ${esc(k.Jenjang)}</span></span></button>`).join('') : '');
    pop.hidden = false;
  },
  pick(type, id) {
    $('#searchPop').hidden = true;
    $('#globalSearch').value = '';
    if (type === 'j') Pages.jamaah.profile(id);
    else { S.ui.abs.kegId = id; Router.go('absensi'); }
  }
};


// ============================================================
// HALAMAN (render dari state lokal — instan)
// ============================================================
const Pages = {};
const pageHead = (crumb, title, desc, actions, extra) => `
  <div class="page-head">
    <div class="grow">
      <div class="crumbs">${crumb}</div>
      <div class="row-wrap"><h1 class="page-title">${title}</h1>${extra || ''}</div>
      ${desc ? `<p class="page-desc">${desc}</p>` : ''}
    </div>
    ${actions ? `<div class="page-actions">${actions}</div>` : ''}
  </div>`;
const monthOptions = (sel, n = 12) => D.months(D.addMonths(D.ym(new Date()), 1), n + 1).reverse().map(m => opt(m, D.monthLabel(m), sel)).join('');
const kelOptions = (sel, withAll) => (withAll ? opt('', 'Semua Kelompok', sel) : '') + S.d.kelompok.filter(k => k.Status_Aktif !== 'Nonaktif' || k.ID_Kelompok === sel).map(k => opt(k.ID_Kelompok, k.Nama_Kelompok, sel)).join('');
const trend = (cur, prev, unit = '%', invert) => {
  if (!prev) return '<span class="faint">–</span>';
  const d = unit === '%' ? cur - prev : pct(cur - prev, prev);
  const up = d >= 0;
  return `<span class="${(up !== !!invert) ? 'trend-up' : 'trend-down'}"><i class="bi bi-graph-${up ? 'up' : 'down'}-arrow"></i> ${up ? '+' : ''}${F.pct(d)}${unit === '%' ? '' : ''}</span>`;
};

/* ───────────────────────── DASHBOARD ───────────────────────── */
Pages.dashboard = {
  render() {
    const ym = S.ui.dashMonth, prev = D.addMonths(ym, -1);
    const jam = Store.jamaahScope();
    const allJam = Store.jamaahScope(true);
    const ikh = jam.filter(j => j.Jenis_Kelamin === 'Ikhwan').length;
    const baru = allJam.filter(j => String(j.Tanggal_Dibuat).slice(0, 7) === ym).length;
    const kegM = Stats.kegMonth(ym), heldM = Stats.held(kegM);
    const att = Stats.att(heldM), attPrev = Stats.att(Stats.held(Stats.kegMonth(prev)));
    const infM = sum(Stats.infMonth(ym), i => i.Jumlah), infPrev = sum(Stats.infMonth(prev), i => i.Jumlah);
    const kelCount = Store.scopeKel() === 'ALL' ? S.d.kelompok.filter(k => k.Status_Aktif !== 'Nonaktif').length : 1;
    const hour = new Date().getHours();
    const sapa = hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 18 ? 'Selamat sore' : 'Selamat malam';

    const byJ = Store.jj().map(j => ({ j, n: jam.filter(x => x.Jenjang === j).length }));
    const today = D.today();
    const agenda = Store.kegScope().filter(k => k.Tanggal >= today).sort((a, b) => (a.Tanggal + a.Waktu_Mulai).localeCompare(b.Tanggal + b.Waktu_Mulai)).slice(0, 3);

    $('#page-dashboard').innerHTML = `
      <div class="card hero">
        <div class="row-wrap" style="justify-content:space-between;align-items:flex-start;gap:16px">
          <div class="grow" style="min-width:260px">
            <span class="badge b-ok"><span class="dot"></span>Google Sheets terhubung · ${S.lastSync ? 'sinkron ' + D.rel(new Date(S.lastSync).toISOString()) : 'memakai data tersimpan'}</span>
            <h1 class="hero-title">Assalamu'alaikum, ${esc(S.user.Nama)}</h1>
            <p class="muted">${sapa}. Ringkasan pembinaan jamaah <b>${esc(Store.scopeLabel())}</b> untuk ${esc(D.monthLabel(ym))}.</p>
          </div>
          <div class="row-wrap">
            <select class="select" style="width:auto" aria-label="Pilih bulan" onchange="S.ui.dashMonth=this.value;Pages.dashboard.render()">${monthOptions(ym)}</select>
            <button class="btn btn-primary" onclick="Router.go('kegiatan');setTimeout(()=>Pages.kegiatan.form(),0)"><i class="bi bi-plus-lg"></i> Buat Sesi Pengajian</button>
          </div>
        </div>
      </div>

      <div class="grid-4 section-gap">
        <div class="card kpi"><div class="kpi-label">Total Jamaah Aktif</div><div class="kpi-icon"><i class="bi bi-people-fill"></i></div>
          <div class="kpi-value">${F.num(jam.length)}</div>
          <div class="kpi-foot"><span class="trend-up"><i class="bi bi-graph-up-arrow"></i> +${baru} baru</span><span>${ikh} Laki-laki · ${jam.length - ikh} Wanita</span></div></div>
        <div class="card kpi"><div class="kpi-label">Sesi Pengajian Bulan Ini</div><div class="kpi-icon"><i class="bi bi-journal-richtext"></i></div>
          <div class="kpi-value">${kegM.length}<small>Sesi</small></div>
          <div class="kpi-foot" style="align-items:center"><div class="progress dark grow"><span style="width:${pct(heldM.length, kegM.length)}%"></span></div><span>${heldM.length} terlaksana</span></div></div>
        <div class="card kpi"><div class="kpi-label">Rata-rata Kehadiran</div><div class="kpi-icon gold"><i class="bi bi-check2-circle"></i></div>
          <div class="kpi-value">${F.pct(att.pct)}</div>
          <div class="kpi-foot">${trend(att.pct, attPrev.pct)}<span>${F.num(att.H)} dari ${F.num(att.n)} kehadiran</span></div></div>
        <div class="card kpi no-guru"><div class="kpi-label">Infaq Pengajian</div><div class="kpi-icon gold"><i class="bi bi-cash-coin"></i></div>
          <div class="kpi-value">${F.rp(infM)}</div>
          <div class="kpi-foot">${trend(infM, infPrev, 'rp')}<span>${kelCount} kelompok · vs ${D.monthShort(prev)}</span></div></div>
      </div>

      <div class="grid-2 section-gap dash-row-1">
        <div class="card">
          <div class="card-head"><div><div class="card-title">Distribusi Jamaah per Jenjang</div><div class="card-sub">${JENJANG.length} jenjang pembinaan · ${esc(Store.scopeLabel())}</div></div><i class="bi bi-pie-chart muted" style="font-size:18px"></i></div>
          <div class="chart-box donut"><canvas id="chDonut" aria-label="Diagram donat distribusi jenjang" role="img"></canvas><div class="donut-center"><div><b>${F.num(jam.length)}</b><small>JAMAAH AKTIF</small></div></div></div>
          <div class="legend">${byJ.map(x => `<div class="legend-row"><span class="sw" style="background:${JJ_COLOR[x.j]}"></span><span>${esc(x.j)} <span class="faint">(${JJ_SUB[x.j]})</span></span><span class="n">${F.num(x.n)} jamaah</span><span class="p">${F.pct(pct(x.n, jam.length))}</span></div>`).join('')}</div>
          <div class="center mt-2"><button class="btn btn-light btn-sm" onclick="Router.go('jamaah')">Lihat Detail Data Jamaah <i class="bi bi-arrow-right"></i></button></div>
        </div>
        <div class="card">
          <div class="card-head"><div><div class="card-title">Capaian Target Kurikulum & Kehadiran</div><div class="card-sub">Persentase target tercapai per jenjang · kehadiran ${esc(D.monthLabel(ym))}</div></div><span class="badge b-outline"><i class="bi bi-bullseye"></i> Target 75%</span></div>
          ${JENJANG_TARGET.filter(j => Store.jj().includes(j)).map(j => {
            const c = Stats.jenjangCapaian(j);
            const a = Stats.att(heldM.filter(k => k.Jenjang === j));
            const low = c.pct < 75;
            return `<div class="tbar"><div class="tbar-head"><span>${esc(j)}</span><span class="pct">${F.pct(c.pct, 0)} <small>(${c.done}/${c.total} target)</small></span></div>
              <div class="progress lg ${low ? 'gold' : 'dark'}"><span style="width:${c.pct}%"></span></div>
              <div class="tbar-foot"><span>Kehadiran rata-rata: ${a.n ? F.pct(a.pct) : '–'}</span><span>${c.jamaah} jamaah · ${c.materi} materi</span></div></div>`;
          }).join('')}
          <div class="note mt-3"><i class="bi bi-info-circle"></i><div><b>Catatan Kurikulum Dewasa:</b> jenjang Dewasa memakai kajian tematik yang disusun masing-masing kelompok, dinilai melalui kehadiran tanpa target pencapaian.</div></div>
        </div>
      </div>

      <div class="grid-2 section-gap">
        <div class="card"><div class="card-head"><div><div class="card-title">Tren Kehadiran</div><div class="card-sub">Persentase hadir 6 bulan terakhir per jenjang</div></div></div><div class="chart-box"><canvas id="chAtt" role="img" aria-label="Grafik garis tren kehadiran"></canvas></div></div>
        <div class="card no-guru"><div class="card-head"><div><div class="card-title">Infaq per Bulan</div><div class="card-sub">Total pemasukan infaq pengajian 6 bulan terakhir</div></div></div><div class="chart-box"><canvas id="chInf" role="img" aria-label="Grafik batang infaq per bulan"></canvas></div></div>
      </div>

      <div class="grid-2 section-gap">
        <div class="card">
          <div class="card-head"><div class="card-title"><span class="dot dot-ok"></span> Agenda Pengajian Terdekat</div>${agenda.length ? '<span class="tiny muted mono">JADWAL AKTIF</span>' : ''}</div>
          ${agenda.length ? agenda.map(k => {
            const isToday = k.Tanggal === today;
            const n = Store.jamaahScope().filter(j => j.ID_Kelompok === k.ID_Kelompok && j.Jenjang === k.Jenjang).length;
            const mat = S.idx.mat.get(k.ID_Materi);
            return `<div class="agenda"><div class="row-wrap"><span class="badge ${isToday ? 'b-primary' : 'b-outline'}">${isToday ? 'Hari Ini' : esc(D.day(k.Tanggal) + ', ' + D.short(k.Tanggal))}</span><span class="mono">${esc(k.Waktu_Mulai)} – ${esc(k.Waktu_Selesai)} WIB</span><span class="spacer"></span><span class="tiny muted"><i class="bi bi-people"></i> ${n} jamaah</span></div>
              <h4>${esc(k.Nama_Kegiatan)}</h4>
              <div class="meta-row"><span><i class="bi bi-geo-alt"></i> ${esc(k.Tempat || '–')}</span><span><i class="bi bi-person"></i> ${esc(k.Pengajar || '–')}</span>${mat ? `<span><i class="bi bi-book"></i> ${esc(mat.Nama_Materi)}</span>` : ''}</div>
              <div class="row">${jjBadge(k.Jenjang)}<span class="tiny muted">${esc(Store.kelName(k.ID_Kelompok))}</span><span class="spacer"></span><button class="btn btn-primary btn-sm" onclick="S.ui.abs.kegId='${k.ID_Kegiatan}';Router.go('absensi')"><i class="bi bi-clipboard-check"></i> Mulai Absensi</button></div></div>`;
          }).join('') + `<div class="card-foot"><span class="muted">${Store.kegScope().filter(k => k.Tanggal >= today).length} jadwal mendatang</span><button class="btn btn-light btn-sm" onclick="Router.go('kegiatan')">Lihat Semua Jadwal <i class="bi bi-chevron-right"></i></button></div>` : `<div class="empty" style="padding:40px 16px"><i class="bi bi-calendar-x"></i><div class="muted">Belum ada jadwal mendatang.</div><button class="btn btn-primary btn-sm mt-3" onclick="Router.go('kegiatan')"><i class="bi bi-plus-lg"></i> Buat Jadwal</button></div>`}
        </div>
        <div class="grid" style="align-content:start">
          <div class="card insight"><div class="card-head"><div class="card-title"><i class="bi bi-stars" style="color:var(--gold)"></i> Insight Otomatis</div><span class="badge b-outline">Analisis data</span></div><ul>${Pages.dashboard.insights(ym, heldM, att, attPrev, infM, infPrev).map(t => `<li><i class="bi bi-arrow-right-circle"></i><span>${t}</span></li>`).join('')}</ul></div>
          <div class="card"><div class="card-head"><div class="card-title"><i class="bi bi-clock-history"></i> Aktivitas Terkini</div><span class="badge b-ok">Live</span></div>
            ${S.d.log.length ? `<ul class="timeline">${S.d.log.slice(0, 6).map(l => {
              const cls = /INFAQ/.test(l.Aksi) ? 'gold' : /TAMBAH|FOTO/.test(l.Aksi) ? 'mint' : /NONAKTIF|HAPUS/.test(l.Aksi) ? 'bad' : '';
              const u = S.d.pengguna.find(p => p.Email === l.Pengguna);
              return `<li class="${cls}"><b>${esc(u ? u.Nama : l.Pengguna)}</b> · ${esc(Pages.dashboard.aksi(l.Aksi))}<br><span>${esc(l.Keterangan)}</span><div class="t">${esc(D.rel(l.Waktu))}</div></li>`;
            }).join('')}</ul>` : emptyState('bi-activity', 'Belum ada aktivitas.')}
          </div>
        </div>
      </div>`;
    Pages.dashboard.charts(ym, byJ);
  },

  aksi(a) {
    return ({ LOGIN: 'masuk aplikasi', TAMBAH_JAMAAH: 'menambah jamaah', UBAH_JAMAAH: 'memperbarui jamaah', NONAKTIFKAN_JAMAAH: 'menonaktifkan jamaah', AKTIFKAN_JAMAAH: 'mengaktifkan jamaah', SIMPAN_ABSENSI: 'menyimpan absensi', KUNCI_ABSENSI: 'mengunci absensi', BUKA_KUNCI_ABSENSI: 'membuka kunci absensi', CATAT_INFAQ: 'mencatat infaq', UBAH_INFAQ: 'mengubah infaq', HAPUS_INFAQ: 'menghapus infaq', UPDATE_CAPAIAN: 'memperbarui capaian', TAMBAH_KEGIATAN: 'membuat sesi', UBAH_KEGIATAN: 'mengubah sesi', TAMBAH_MATERI: 'menambah materi', UBAH_MATERI: 'mengubah materi', TAMBAH_TARGET: 'menambah target', UBAH_TARGET: 'mengubah target', CETAK_LAPORAN: 'mencetak laporan', SETUP: 'setup sistem' })[a] || String(a).toLowerCase().replace(/_/g, ' ');
  },

  insights(ym, heldM, att, attPrev, infM, infPrev) {
    const out = [];
    const perJ = Store.jj().map(j => ({ j, a: Stats.att(heldM.filter(k => k.Jenjang === j)) })).filter(x => x.a.n);
    if (perJ.length) {
      const lo = perJ.reduce((a, b) => (b.a.pct < a.a.pct ? b : a));
      const hi = perJ.reduce((a, b) => (b.a.pct > a.a.pct ? b : a));
      out.push(`Kehadiran tertinggi di <b>${esc(hi.j)}</b> (${F.pct(hi.a.pct)}), terendah di <b>${esc(lo.j)}</b> (${F.pct(lo.a.pct)})${lo.a.pct < 80 ? ' — perlu penguatan, misalnya pengingat ke wali sebelum sesi.' : '.'}`);
    } else out.push('Belum ada data absensi untuk bulan ini.');
    if (attPrev.n) out.push(`Rata-rata kehadiran ${att.pct >= attPrev.pct ? 'naik' : 'turun'} <b>${F.pct(Math.abs(att.pct - attPrev.pct))}</b> dibanding bulan lalu.`);
    if (infPrev && !Store.isGuru()) out.push(`Infaq ${infM >= infPrev ? 'naik' : 'turun'} <b>${F.pct(Math.abs(pct(infM - infPrev, infPrev)))}</b> menjadi ${F.rp(infM)}.`);
    const butuh = Store.jamaahScope().filter(j => j.Jenjang !== 'Dewasa' && Stats.jamAttendance(j.ID_Jamaah, 3).alpaStreak >= 2).length;
    if (butuh) out.push(`<b>${butuh} jamaah</b> alpa 2 sesi berturut-turut atau lebih. Cek di halaman Capaian → filter "Perlu Pendampingan".`);
    const noInf = Stats.held(Stats.kegMonth(ym)).filter(k => !S.idx.infKeg.has(k.ID_Kegiatan)).length;
    if (noInf && !Store.isGuru()) out.push(`${noInf} sesi bulan ini belum memiliki catatan infaq.`);
    return out.slice(0, 4);
  },

  charts(ym, byJ) {
    const months = D.months(ym, 6);
    Charts.make('chDonut', {
      type: 'doughnut',
      data: { labels: byJ.map(x => x.j), datasets: [{ data: byJ.map(x => x.n), backgroundColor: byJ.map(x => JJ_COLOR[x.j]), borderWidth: 3, borderColor: Charts.css('--surface'), hoverOffset: 6 }] },
      options: { cutout: '70%' }
    });
    const kegAll = Store.kegScope();
    const ds = Store.jj().map(j => ({
      label: j, data: months.map(m => { const a = Stats.att(Stats.held(Stats.kegMonth(m, kegAll)).filter(k => k.Jenjang === j)); return a.n ? a.pct : null; }),
      borderColor: JJ_COLOR[j], backgroundColor: JJ_COLOR[j], tension: .35, pointRadius: 3, pointHoverRadius: 5, borderWidth: 2.5, spanGaps: true
    }));
    Charts.make('chAtt', {
      type: 'line', data: { labels: months.map(D.monthShort), datasets: ds },
      options: { interaction: { mode: 'index', intersect: false }, scales: { y: { suggestedMin: 50, max: 100, ticks: { callback: v => v + '%' } }, x: { grid: { display: false } } },
        plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${c.parsed.y === null ? '–' : F.pct(c.parsed.y)}` } } } }
    });
    const inf = months.map(m => sum(Stats.infMonth(m), i => i.Jumlah));
    Charts.make('chInf', {
      type: 'bar',
      data: { labels: months.map(D.monthShort), datasets: [{ data: inf, backgroundColor: months.map(m => m === ym ? Charts.css('--primary') : Charts.css('--tint-2')), borderRadius: 8, maxBarThickness: 46 }] },
      options: { scales: { y: { ticks: { callback: v => F.rpShort(v) } }, x: { grid: { display: false } } }, plugins: { tooltip: { callbacks: { label: c => ' ' + F.rp(c.parsed.y) } } } }
    });
  }
};

/* ───────────────────────── DATA JAMAAH ───────────────────────── */
Pages.jamaah = {
  filtered() {
    const f = S.ui.jm, q = f.q.trim().toLowerCase();
    return Store.jamaahScope(true).filter(j =>
      (f.jenjang === 'ALL' || j.Jenjang === f.jenjang) &&
      (f.jenjang !== 'Caberawit' || f.kelas === 'ALL' || (f.kelas === '-' ? !j.Kelas : j.Kelas === f.kelas)) &&
      (f.dapukan === 'ALL' || (f.dapukan === '-' ? !j.Dapukan : f.dapukan === '*PENGURUS' ? dpkList(j.Dapukan).some(x => DAPUKAN_PENGURUS.includes(x)) : dpkList(j.Dapukan).includes(f.dapukan))) &&
      (f.status === 'ALL' || j.Status_Aktif === f.status) &&
      (f.jk === 'ALL' || j.Jenis_Kelamin === f.jk) &&
      (!q || (j.Nama_Lengkap + ' ' + j.ID_Jamaah + ' ' + j.Nama_Wali + ' ' + j.No_HP + ' ' + (j.No_HP_Jamaah || '') + ' ' + (j.Kelas || '') + ' ' + (j.Dapukan || '')).toLowerCase().includes(q))
    ).sort((a, b) => JENJANG.indexOf(a.Jenjang) - JENJANG.indexOf(b.Jenjang) || String(a.Kelas || 'Z').localeCompare(String(b.Kelas || 'Z')) || a.Nama_Lengkap.localeCompare(b.Nama_Lengkap));
  },
  render() {
    const all = Store.jamaahScope(true), f = S.ui.jm;
    const aktif = all.filter(j => j.Status_Aktif === 'Aktif');
    const ikh = all.filter(j => j.Jenis_Kelamin === 'Ikhwan').length;
    const lengkap = all.filter(j => j.No_HP && j.Nama_Wali && j.Alamat).length;
    const foto = all.filter(j => j.Foto_URL).length;
    const base = all.filter(j => (f.status === 'ALL' || j.Status_Aktif === f.status) && (f.jk === 'ALL' || j.Jenis_Kelamin === f.jk));
    const cnt = j => base.filter(x => x.Jenjang === j).length;
    const cntKelas = k => base.filter(x => x.Jenjang === 'Caberawit' && (k === '-' ? !x.Kelas : x.Kelas === k)).length;
    const top = JENJANG.reduce((a, b) => (cnt(b) > cnt(a) ? b : a));

    if (!all.length) { // belum ada jamaah sama sekali: halaman dikosongkan (tanpa statistik & filter)
      $('#page-jamaah').innerHTML = pageHead('<i class="bi bi-database"></i> Master Data <i class="bi bi-chevron-right"></i> <b>Database Data Jamaah</b>',
        'Database Data Jamaah', `Kelola data jamaah terpusat dari ${JENJANG.length} jenjang pembinaan — ${esc(Store.scopeLabel())}.`,
        `<button class="btn btn-primary no-guru" onclick="Pages.jamaah.form()"><i class="bi bi-person-plus"></i> Tambah Jamaah</button>`) +
        `<div class="card section-gap"><div class="empty" style="padding:56px 16px"><i class="bi bi-people"></i><div class="cell-strong mb-1">Belum ada data jamaah</div><div class="muted small mb-3">Data jamaah akan tampil di sini setelah ditambahkan.</div><button class="btn btn-primary no-guru" onclick="Pages.jamaah.form()"><i class="bi bi-person-plus"></i> Tambah Jamaah</button></div></div>`;
      return;
    }

    $('#page-jamaah').innerHTML = pageHead('<i class="bi bi-database"></i> Master Data <i class="bi bi-chevron-right"></i> <b>Database Data Jamaah</b>',
      'Database Data Jamaah', `Kelola data jamaah terpusat dari ${JENJANG.length} jenjang pembinaan — ${esc(Store.scopeLabel())}.`,
      `<button class="btn btn-light" onclick="Pages.jamaah.idcards()"><i class="bi bi-person-vcard"></i> Cetak ID Card</button>
       <button class="btn btn-light" onclick="Pages.jamaah.exportXlsx()"><i class="bi bi-download"></i> Ekspor Excel</button>
       <button class="btn btn-primary no-guru" onclick="Pages.jamaah.form()"><i class="bi bi-person-plus"></i> Tambah Jamaah</button>`,
      '<span class="badge b-mint"><i class="bi bi-patch-check"></i> Terverifikasi Terpusat</span>') + `
      <div class="grid-4">
        <div class="card kpi compact"><div class="kpi-label">Total Terdaftar</div><div class="kpi-icon"><i class="bi bi-people"></i></div><div class="kpi-value">${F.num(all.length)}</div>
          <div class="kpi-foot"><span><span class="dot dot-ok"></span> ${ikh} Laki-laki</span><span><span class="dot" style="background:var(--mint-dim)"></span> ${all.length - ikh} Wanita</span></div></div>
        <div class="card kpi compact"><div class="kpi-label">Status Keaktifan</div><div class="kpi-icon"><i class="bi bi-person-check"></i></div><div class="kpi-value">${F.num(aktif.length)}<small class="trend-up">${F.pct(pct(aktif.length, all.length))} aktif</small></div>
          <div class="kpi-foot" style="align-items:center"><div class="progress dark grow"><span style="width:${pct(aktif.length, all.length)}%"></span></div><span>${all.length - aktif.length} nonaktif</span></div></div>
        <div class="card kpi compact"><div class="kpi-label">Kelengkapan Data</div><div class="kpi-icon"><i class="bi bi-ui-checks"></i></div><div class="kpi-value">${F.pct(pct(lengkap, all.length))}</div>
          <div class="kpi-foot"><span><i class="bi bi-image"></i> Foto: ${foto}</span><span><i class="bi bi-person-vcard"></i> Lengkap: ${lengkap}</span></div></div>
        <div class="card kpi compact"><div class="kpi-label">Distribusi ${JENJANG.length} Jenjang</div><div class="kpi-icon"><i class="bi bi-pie-chart"></i></div><div class="cell-strong" style="font-size:14px">${esc(top)} terbesar</div>
          <div class="row" style="height:8px;border-radius:99px;overflow:hidden;gap:0;margin-top:6px">${Store.jj().map(j => `<span style="height:8px;background:${JJ_COLOR[j]};width:${pct(cnt(j), base.length)}%"></span>`).join('')}</div>
          <div class="row tiny muted" style="justify-content:space-between;margin-top:6px">${JENJANG.map(j => `<span title="${attr(j)}">${['Blt', 'TK', 'SD', 'SMP', 'SMA', 'Nkh', 'Dws'][JENJANG.indexOf(j)]}<br><b class="mono">${cnt(j)}</b></span>`).join('')}</div></div>
      </div>

      <div class="card section-gap">
        <div class="chips" role="tablist" aria-label="Filter jenjang">
          <button class="chip ${f.jenjang === 'ALL' ? 'active' : ''}" onclick="Pages.jamaah.set('jenjang','ALL')">Semua Jenjang <span class="count">${base.length}</span></button>
          ${Store.jj().map(j => `<button class="chip ${f.jenjang === j ? 'active' : ''}" onclick="Pages.jamaah.set('jenjang','${j}')"><span class="dot" style="background:${JJ_COLOR[j]}"></span>${esc(j)} <span class="count">${cnt(j)}</span></button>`).join('')}
        </div>
        ${f.jenjang === 'Caberawit' ? `<div class="chips mt-3" role="tablist" aria-label="Filter kelas Caberawit">
          <button class="chip ${f.kelas === 'ALL' ? 'active' : ''}" onclick="Pages.jamaah.set('kelas','ALL')"><i class="bi bi-mortarboard"></i> Semua Kelas <span class="count">${cnt('Caberawit')}</span></button>
          ${KELAS.map(k => `<button class="chip ${f.kelas === k ? 'active' : ''}" onclick="Pages.jamaah.set('kelas','${k}')">Kelas ${k} <span class="count">${cntKelas(k)}</span></button>`).join('')}
          ${cntKelas('-') ? `<button class="chip ${f.kelas === '-' ? 'active' : ''}" onclick="Pages.jamaah.set('kelas','-')"><i class="bi bi-question-circle"></i> Belum ada kelas <span class="count">${cntKelas('-')}</span></button>` : ''}
        </div>` : ''}
        <div class="toolbar mt-3">
          <label class="search-input"><i class="bi bi-search"></i><input class="input" id="jmSearch" placeholder="Cari nama, ID jamaah, nama wali, no. HP…" value="${attr(f.q)}" aria-label="Cari jamaah"></label>
          <select class="select" onchange="Pages.jamaah.set('status',this.value)" aria-label="Status">${Object.keys(STATUS_JM).map(s => opt(s, 'Status: ' + STATUS_JM[s][0] + ' (' + all.filter(x => x.Status_Aktif === s).length + ')', f.status)).join('')}${opt('ALL', 'Semua Status', f.status)}</select>
          <select class="select" onchange="Pages.jamaah.set('dapukan',this.value)" aria-label="Dapukan">${opt('ALL', 'Semua Dapukan', f.dapukan)}${opt('-', 'Tanpa dapukan', f.dapukan)}${opt('*PENGURUS', 'Semua pengurus (994 – Mubalegh)', f.dapukan)}${[...new Set(DAPUKAN.concat(all.flatMap(x => dpkList(x.Dapukan))))].map(d => opt(d, d, f.dapukan)).join('')}</select>
          <select class="select" onchange="Pages.jamaah.set('jk',this.value)" aria-label="Jenis kelamin">${opt('ALL', 'Laki-laki & Wanita', f.jk)}${opt('Ikhwan', 'Laki-laki', f.jk)}${opt('Akhwat', 'Wanita', f.jk)}</select>
          <button class="btn btn-light btn-sm" onclick="S.ui.jm={q:'',jenjang:'ALL',kelas:'ALL',dapukan:'ALL',status:'Aktif',jk:'ALL',page:1,per:S.ui.jm.per};Pages.jamaah.render()"><i class="bi bi-arrow-counterclockwise"></i> Reset</button>
        </div>
      </div>

      <div class="card flush section-gap" id="jmTable"></div>`;
    $('#jmSearch').addEventListener('input', debounce(e => { S.ui.jm.q = e.target.value; S.ui.jm.page = 1; Pages.jamaah.table(); }, 180));
    Pages.jamaah.table();
  },
  set(k, v) { S.ui.jm[k] = v; if (k === 'jenjang') S.ui.jm.kelas = 'ALL'; S.ui.jm.page = 1; Pages.jamaah.render(); },
  page(p) { S.ui.jm.page = p; Pages.jamaah.table(); $('#jmTable').scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  table() {
    const rows = Pages.jamaah.filtered(), f = S.ui.jm;
    const pages = Math.max(1, Math.ceil(rows.length / f.per));
    f.page = clamp(f.page, 1, pages);
    const slice = rows.slice((f.page - 1) * f.per, f.page * f.per);
    $('#jmTable').innerHTML = rows.length ? `
      <div class="table-wrap"><table class="table stack">
        <thead><tr><th>Jamaah & ID</th><th>Jenjang</th><th>Kelompok</th><th>Umur & Tgl Lahir</th><th>Kontak & Wali</th><th>Status</th><th class="actions">Aksi</th></tr></thead>
        <tbody>${slice.map(j => {
          const age = D.age(j.Tanggal_Lahir);
          return `<tr>
            <td class="td-main"><div class="cell-person">${avatar(j)}<div class="grow"><div class="row"><span class="nm">${esc(j.Nama_Lengkap)}</span>${jkBadge(j.Jenis_Kelamin)}</div><div class="id">${esc(j.ID_Jamaah)}</div>${j.Dapukan ? `<div class="mt-1 row-wrap" style="gap:4px">${dpkBadges(j.Dapukan)}</div>` : ''}</div></div></td>
            <td data-label="Jenjang">${jjBadge(j.Jenjang)}${j.Jenjang_Manual === 'Ya' ? ' <i class="bi bi-pin-angle faint" title="Jenjang diatur manual"></i>' : ''}${j.Jenjang === 'Caberawit' ? `<div class="mt-1">${j.Kelas ? kelasBadge(j.Kelas) : '<span class="tiny faint">Belum ada kelas</span>'}</div>` : ''}</td>
            <td data-label="Kelompok"><div class="cell-strong">${esc(Store.kelName(j.ID_Kelompok))}</div><div class="cell-sub">${esc((S.idx.kel.get(j.ID_Kelompok) || {}).Desa_Daerah || '')}</div></td>
            <td data-label="Umur"><div class="cell-strong">${age === null ? '–' : age + ' Tahun'}</div><div class="cell-sub">${D.short(j.Tanggal_Lahir)}</div></td>
            <td data-label="Kontak">${j.No_HP_Jamaah ? `<div class="cell-sub mono" title="No. HP jamaah"><i class="bi bi-phone"></i> ${esc(j.No_HP_Jamaah)}</div>` : ''}<div class="cell-strong">${esc(j.Nama_Wali || '–')}</div><div class="cell-sub mono" title="No. HP wali">${esc(j.No_HP || '–')}</div></td>
            <td data-label="Status">${statusBadge(j)}${j.Status_Aktif !== 'Aktif' && (j.Tanggal_Status || j.Keterangan_Status) ? `<div class="tiny muted mt-1">${j.Tanggal_Status ? esc(D.long(j.Tanggal_Status)) : ''}${j.Keterangan_Status ? (j.Tanggal_Status ? ' · ' : '') + esc(j.Keterangan_Status) : ''}</div>` : ''}</td>
            <td class="actions">
              <button class="icon-btn sm" title="Profil & capaian" aria-label="Profil ${attr(j.Nama_Lengkap)}" onclick="Pages.jamaah.profile('${j.ID_Jamaah}')"><i class="bi bi-journal-text"></i></button>
              <button class="icon-btn sm no-guru" title="Ubah" aria-label="Ubah ${attr(j.Nama_Lengkap)}" onclick="Pages.jamaah.form('${j.ID_Jamaah}')"><i class="bi bi-pencil"></i></button>
              <button class="icon-btn sm no-guru" title="Ubah status (aktif, nonaktif, pindah, meninggal dunia)" aria-label="Ubah status ${attr(j.Nama_Lengkap)}" onclick="Pages.jamaah.toggle('${j.ID_Jamaah}')"><i class="bi bi-person-gear"></i></button>
              ${JENJANG_MANDIRI.includes(j.Jenjang) ? `<button class="icon-btn sm no-guru" title="${j.Punya_PIN_Jamaah === 'Ya' ? 'Buat PIN absen mandiri baru' : 'Buat akses absen mandiri'}" aria-label="Akses absen mandiri ${attr(j.Nama_Lengkap)}" onclick="Pages.jamaah.pinMandiri('${j.ID_Jamaah}')"><i class="bi ${j.Punya_PIN_Jamaah === 'Ya' ? 'bi-phone-fill' : 'bi-phone'}" style="color:var(--primary)"></i></button>` : ''}
              <button class="icon-btn sm" title="ID Card (barcode absen)" aria-label="ID Card ${attr(j.Nama_Lengkap)}" onclick="IdCard.preview(['${j.ID_Jamaah}'])"><i class="bi bi-person-vcard"></i></button>
              <button class="icon-btn sm no-guru" title="Hapus permanen" aria-label="Hapus ${attr(j.Nama_Lengkap)}" onclick="Pages.jamaah.remove('${j.ID_Jamaah}')"><i class="bi bi-trash3" style="color:var(--bad)"></i></button>
            </td></tr>`;
        }).join('')}</tbody></table></div>
      <div class="table-foot"><span>Menampilkan ${(f.page - 1) * f.per + 1}–${Math.min(f.page * f.per, rows.length)} dari ${F.num(rows.length)} data
        · Baris per halaman <select class="select sm" style="width:auto;display:inline-block" onchange="S.ui.jm.per=+this.value;S.ui.jm.page=1;Pages.jamaah.table()">${[10, 25, 50, 100].map(n => opt(n, n, f.per)).join('')}</select></span>
        ${UI.pager(rows.length, f.page, f.per, 'Pages.jamaah.page')}</div>`
      : emptyState('bi-person-x', 'Tidak ada jamaah yang cocok dengan filter.');
  },

  form(id) {
    const j = id ? S.idx.jam.get(id) : null;
    const master = Store.allKel();
    const defKel = j ? j.ID_Kelompok : (Store.scopeKel() !== 'ALL' ? Store.scopeKel() : (S.d.kelompok[0] || {}).ID_Kelompok);
    const m = UI.modal({
      title: j ? 'Ubah Data Jamaah' : 'Tambah Jamaah Baru', size: 'lg',
      body: `<form id="jmForm" class="form-grid two" novalidate>
        <div class="span-2 row" style="gap:16px">
          <span id="fotoPrev">${j ? avatar(j, 'lg') : '<span class="avatar lg"><i class="bi bi-person"></i></span>'}</span>
          <label class="btn btn-light btn-sm"><i class="bi bi-camera"></i> ${j && j.Foto_URL ? 'Ganti foto' : 'Unggah foto'}<input type="file" id="fFoto" accept="image/*" hidden></label>
          <span class="tiny muted">Opsional · JPG/PNG, dikompres otomatis</span>
        </div>
        <label class="field span-2"><span class="field-label">Nama lengkap <span class="req">*</span></span><input class="input" name="Nama_Lengkap" maxlength="120" required value="${attr(j ? j.Nama_Lengkap : '')}"></label>
        <label class="field"><span class="field-label">Jenis kelamin <span class="req">*</span></span><select class="select" name="Jenis_Kelamin" required>${opt('', 'Pilih…', j ? j.Jenis_Kelamin : '')}${opt('Ikhwan', 'Laki-laki', j && j.Jenis_Kelamin)}${opt('Akhwat', 'Wanita', j && j.Jenis_Kelamin)}</select></label>
        <label class="field"><span class="field-label">Tempat lahir</span><input class="input" name="Tempat_Lahir" maxlength="60" placeholder="mis. Pontianak" value="${attr(j ? j.Tempat_Lahir || '' : '')}"></label>
        <label class="field"><span class="field-label">Tanggal lahir <span class="req">*</span></span><input class="input" type="date" name="Tanggal_Lahir" required max="${D.today()}" value="${attr(j ? j.Tanggal_Lahir : '')}"></label>
        <div class="field"><span class="field-label">Jenjang</span>
          <div class="row"><span id="jjPreview">${j ? jjBadge(j.Jenjang) : '<span class="muted small">Otomatis dari tanggal lahir</span>'}</span></div>
          <label class="check"><input type="checkbox" id="jjManual" ${j && j.Jenjang_Manual === 'Ya' ? 'checked' : ''}> Atur jenjang manual</label>
          <select class="select" name="Jenjang" id="jjSelect" ${j && j.Jenjang_Manual === 'Ya' ? '' : 'hidden'}>${Store.jj().map(x => opt(x, x, j ? j.Jenjang : '')).join('')}</select></div>
        <label class="field" id="kelasField" ${j && j.Jenjang === 'Caberawit' ? '' : 'hidden'}><span class="field-label">Kelas Caberawit</span><select class="select" name="Kelas">${opt('', '— Belum ditentukan —', j ? j.Kelas : '')}${KELAS.map(x => opt(x, 'Kelas ' + x, j ? j.Kelas : '')).join('')}</select><span class="field-help">Kelas A1–A6 khusus jenjang Caberawit.</span></label>
        <label class="field"><span class="field-label">Kelompok <span class="req">*</span></span>${master ? `<select class="select" name="ID_Kelompok" required>${kelOptions(defKel)}</select>` : `<input class="input" readonly value="${attr(Store.kelName(Store.myKel()))}">`}</label>
        <div class="field span-2"><span class="field-label">Dapukan <span class="tiny muted">(boleh lebih dari satu)</span></span>
          <div class="dpk-pick">${(() => { const cur = dpkList(j ? j.Dapukan : ''), extra = cur.filter(x => !DAPUKAN.includes(x));
            const box = d => `<label class="dpk-opt"><input type="checkbox" name="DPK" value="${attr(d)}" ${cur.includes(d) ? 'checked' : ''}><span>${esc(d)}</span></label>`;
            return `<div class="dpk-grp"><small>Pengurus</small><div>${DAPUKAN_PENGURUS.map(box).join('')}</div></div><div class="dpk-grp"><small>Lainnya</small><div>${DAPUKAN.slice(13).concat(extra).map(box).join('')}</div></div>`; })()}</div>
          <span class="field-help">Menentukan siapa yang masuk daftar absen Pengajian MT/MS dan Pengajian Pengurus.</span></div>
        <label class="field"><span class="field-label">Nama wali / orang tua</span><input class="input" name="Nama_Wali" maxlength="120" placeholder="mis. Bpk. Suryanto, atau 'Mandiri'" value="${attr(j ? j.Nama_Wali : '')}"></label>
        <label class="field"><span class="field-label">No. HP wali / orang tua</span><input class="input" name="No_HP" inputmode="tel" maxlength="16" placeholder="08xxxxxxxxxx" value="${attr(j ? j.No_HP : '')}"></label>
        <label class="field span-2" id="hpJmField" ${j && JENJANG_HP.includes(j.Jenjang) ? '' : 'hidden'}><span class="field-label"><i class="bi bi-phone"></i> No. HP / WhatsApp jamaah</span><input class="input" name="No_HP_Jamaah" inputmode="tel" maxlength="16" placeholder="08xxxxxxxxxx" value="${attr(j ? (j.No_HP_Jamaah || '') : '')}"><span class="field-help">Untuk jenjang Pra Remaja, Remaja, Usia Nikah & Dewasa (nomor pribadi jamaah).</span></label>
        <label class="field span-2"><span class="field-label">Alamat</span><textarea class="textarea" name="Alamat" maxlength="300" rows="2">${esc(j ? j.Alamat : '')}</textarea></label>
        <div id="jmErr" class="form-error span-2" hidden></div>
      </form>`,
      foot: `<button class="btn btn-light" data-close>Batal</button><button class="btn btn-primary" id="jmSave"><i class="bi bi-check2"></i> Simpan</button>`
    });
    const form = $('#jmForm', m.el);
    let fotoData = null;
    const preview = () => {
      const manual = $('#jjManual', m.el).checked;
      $('#jjSelect', m.el).hidden = !manual;
      const jj = manual ? $('#jjSelect', m.el).value : computeJenjang(form.Tanggal_Lahir.value, S.d.settings.usia);
      const a = D.age(form.Tanggal_Lahir.value);
      $('#jjPreview', m.el).innerHTML = jj ? jjBadge(jj) + (a !== null && !isNaN(a) ? ` <span class="tiny muted">${a} tahun</span>` : '') : '<span class="muted small">Otomatis dari tanggal lahir</span>';
      $('#kelasField', m.el).hidden = jj !== 'Caberawit';
      $('#hpJmField', m.el).hidden = !JENJANG_HP.includes(jj);
    };
    form.Tanggal_Lahir.addEventListener('input', preview);
    $('#jjManual', m.el).addEventListener('change', preview);
    $('#jjSelect', m.el).addEventListener('change', preview);
    $('#fFoto', m.el).addEventListener('change', async e => {
      const file = e.target.files[0]; if (!file) return;
      try { fotoData = await UI.compressImage(file); $('#fotoPrev', m.el).innerHTML = `<span class="avatar lg"><img src="${fotoData}" alt=""></span>`; } catch (ex) { UI.toast(ex.message, 'bad'); }
    });
    $('#jmSave', m.el).onclick = () => {
      const fd = Object.fromEntries(new FormData(form).entries());
      const err = $('#jmErr', m.el);
      $$('.invalid', form).forEach(x => x.classList.remove('invalid'));
      const bad = [];
      if (!fd.Nama_Lengkap.trim()) bad.push(['Nama_Lengkap', 'Nama lengkap wajib diisi.']);
      if (!fd.Jenis_Kelamin) bad.push(['Jenis_Kelamin', 'Pilih jenis kelamin.']);
      if (!fd.Tanggal_Lahir || fd.Tanggal_Lahir > D.today()) bad.push(['Tanggal_Lahir', 'Tanggal lahir tidak valid.']);
      if (fd.No_HP && !/^\+?\d{8,15}$/.test(fd.No_HP.replace(/[\s-]/g, ''))) bad.push(['No_HP', 'Nomor HP wali harus 8–15 digit.']);
      if (!$('#hpJmField', m.el).hidden && fd.No_HP_Jamaah && !/^\+?\d{8,15}$/.test(fd.No_HP_Jamaah.replace(/[\s-]/g, ''))) bad.push(['No_HP_Jamaah', 'Nomor HP jamaah harus 8–15 digit.']);
      if (bad.length) { bad.forEach(([n]) => form[n] && form[n].classList.add('invalid')); err.textContent = bad.map(b => b[1]).join(' '); err.hidden = false; form[bad[0][0]].focus(); return; }
      const manual = $('#jjManual', m.el).checked;
      const rec = {
        ID_Jamaah: j ? j.ID_Jamaah : uid('JM'),
        Nama_Lengkap: fd.Nama_Lengkap.trim(), Jenis_Kelamin: fd.Jenis_Kelamin, Tanggal_Lahir: fd.Tanggal_Lahir, Tempat_Lahir: (fd.Tempat_Lahir || '').trim(),
        Jenjang_Manual: manual ? 'Ya' : 'Tidak', Jenjang: manual ? fd.Jenjang : computeJenjang(fd.Tanggal_Lahir, S.d.settings.usia),
        ID_Kelompok: master ? fd.ID_Kelompok : Store.myKel(), Nama_Wali: fd.Nama_Wali.trim(), No_HP: fd.No_HP.replace(/[\s-]/g, ''), Alamat: fd.Alamat.trim()
      };
      rec.No_HP_Jamaah = JENJANG_HP.includes(rec.Jenjang) ? (fd.No_HP_Jamaah || '').replace(/[\s-]/g, '') : '';
      rec.Kelas = rec.Jenjang === 'Caberawit' ? (fd.Kelas || '') : '';
      rec.Dapukan = $$('[name=DPK]:checked', m.el).map(x => x.value).join(', ');
      const dup = S.d.jamaah.find(x => x.ID_Jamaah !== rec.ID_Jamaah && x.Nama_Lengkap.toLowerCase() === rec.Nama_Lengkap.toLowerCase() && x.Tanggal_Lahir === rec.Tanggal_Lahir);
      const go = () => {
        m.close();
        const prev = S.d.jamaah;
        const local = Object.assign({ Status_Aktif: 'Aktif', Foto_URL: j ? j.Foto_URL : '', Tanggal_Dibuat: j ? j.Tanggal_Dibuat : new Date().toISOString().slice(0, 19).replace('T', ' ') }, rec);
        if (fotoData) local.Foto_URL = fotoData; // pratinjau lokal instan
        App.mutate({
          apply: () => Store.upsert('jamaah', local, 'ID_Jamaah'),
          rollback: () => { S.d.jamaah = prev; },
          call: () => API.run('apiSaveJamaah', rec),
          okMsg: j ? 'Data jamaah diperbarui.' : 'Jamaah baru ditambahkan.',
          onSaved: saved => { if (fotoData) saved.Foto_URL = fotoData; Store.upsert('jamaah', saved, 'ID_Jamaah'); },
          after: saved => {
            if (!fotoData) return Router.render();
            S.pending++; UI.sync();
            API.run('apiUploadFoto', saved.ID_Jamaah, fotoData)
              .then(r => { Store.upsert('jamaah', r, 'ID_Jamaah'); Store.index(); Store.persist(); Router.render(); })
              .catch(e => UI.toast('Foto gagal diunggah: ' + e.message, 'bad'))
              .finally(() => { S.pending--; UI.sync(); });
          }
        }).catch(() => {});
      };
      if (dup) UI.confirm(`Sudah ada jamaah <b>${esc(dup.Nama_Lengkap)}</b> dengan tanggal lahir sama (${esc(dup.ID_Jamaah)}, ${esc(Store.kelName(dup.ID_Kelompok))}). Tetap simpan?`, { ok: 'Tetap simpan' }).then(ok => ok && go());
      else go();
    };
  },

  /** Cetak ID Card untuk semua jamaah yang tampil sesuai filter saat ini (hanya status Aktif). */
  async idcards() {
    const list = Pages.jamaah.filtered().filter(j => j.Status_Aktif === 'Aktif');
    if (!list.length) { UI.toast('Tidak ada jamaah aktif pada filter ini.', 'warn'); return; }
    if (list.length > 60 && !(await UI.confirm(`Cetak <b>${list.length}</b> ID Card (${Math.ceil(list.length / 10)} lembar A4)? Saring per jenjang/kelas untuk mencetak sebagian.`, { ok: 'Lanjutkan' }))) return;
    IdCard.preview(list.map(j => j.ID_Jamaah));
  },
  /** Ubah status jamaah: Aktif / Nonaktif / Pindah / Meninggal Dunia (dengan tanggal & keterangan). */
  toggle(id) {
    const j = S.idx.jam.get(id);
    if (!j) return;
    const cur = STATUS_JM[j.Status_Aktif] ? j.Status_Aktif : 'Nonaktif';
    const help = { Aktif: 'Jamaah mengikuti pengajian; tampil di absensi dan rekap.', Nonaktif: 'Berhenti sementara / tidak aktif mengikuti pengajian.',
      Pindah: 'Pindah ke kelompok atau daerah lain. Riwayat tetap tersimpan.', Meninggal: 'Innalillahi wa inna ilaihi raji\'un. Riwayat jamaah tetap tersimpan sebagai arsip.' };
    const m = UI.modal({ title: 'Ubah Status Jamaah', size: 'md',
      body: `<div class="row mb-3" style="gap:10px">${avatar(j)}<div><b>${esc(j.Nama_Lengkap)}</b><div class="tiny muted">${esc(j.ID_Jamaah)} · ${esc(j.Jenjang)} · ${esc(Store.kelName(j.ID_Kelompok))}</div></div></div>
        <form id="stForm" class="form-grid" autocomplete="off">
          <div class="st-opts">${Object.keys(STATUS_JM).map(s => `<label class="st-opt"><input type="radio" name="st" value="${s}" ${s === cur ? 'checked' : ''}><span><i class="bi ${STATUS_JM[s][2]}"></i> <b>${STATUS_JM[s][0]}</b><span class="tiny muted">${help[s]}</span></span></label>`).join('')}</div>
          <div id="stExtra" class="form-grid two">
            <label class="field"><span class="field-label" id="stTglLbl">Tanggal</span><input class="input" type="date" name="Tanggal" max="${D.today()}" value="${attr(cur !== 'Aktif' && j.Tanggal_Status ? j.Tanggal_Status : D.today())}"></label>
            <label class="field"><span class="field-label" id="stKetLbl">Keterangan</span><input class="input" name="Keterangan" maxlength="200" value="${attr(cur !== 'Aktif' ? (j.Keterangan_Status || '') : '')}"></label>
          </div>
          <div id="stErr" class="form-error" hidden></div>
        </form>`,
      foot: `<button class="btn btn-light" data-close>Batal</button><button class="btn btn-primary" id="stGo"><i class="bi bi-check2"></i> Simpan Status</button>` });
    const f = $('#stForm', m.el);
    const upd = () => {
      const s = f.st.value;
      $('#stExtra', m.el).hidden = s === 'Aktif';
      $('#stTglLbl', m.el).textContent = s === 'Pindah' ? 'Tanggal pindah' : s === 'Meninggal' ? 'Tanggal wafat' : 'Sejak tanggal';
      $('#stKetLbl', m.el).textContent = s === 'Pindah' ? 'Pindah ke (kelompok / kota)' : 'Keterangan';
      f.Keterangan.placeholder = s === 'Pindah' ? 'mis. Kelompok Al-Ikhlas, Pontianak' : s === 'Meninggal' ? 'opsional' : 'mis. merantau, sakit lama';
    };
    $$('[name=st]', f).forEach(r => { r.onchange = upd; }); upd();
    $('#stGo', m.el).onclick = () => {
      const to = f.st.value, info = { Tanggal: f.Tanggal.value, Keterangan: f.Keterangan.value.trim() }, e = $('#stErr', m.el);
      if (to !== 'Aktif' && info.Tanggal > D.today()) { e.textContent = 'Tanggal tidak boleh di masa depan.'; e.hidden = false; return; }
      if (to === 'Pindah' && !info.Keterangan) { e.textContent = 'Isi tujuan pindah (kelompok atau kota).'; e.hidden = false; f.Keterangan.focus(); return; }
      m.close();
      if (to === cur && to === 'Aktif') return;
      const prev = S.d.jamaah;
      const patch = { ID_Jamaah: id, Status_Aktif: to, Tanggal_Status: to === 'Aktif' ? '' : (info.Tanggal || D.today()), Keterangan_Status: to === 'Aktif' ? '' : info.Keterangan };
      App.mutate({
        apply: () => Store.upsert('jamaah', patch, 'ID_Jamaah'),
        rollback: () => { S.d.jamaah = prev; },
        call: () => API.run('apiSetJamaahStatus', id, to, info),
        okMsg: `Status ${j.Nama_Lengkap}: ${STATUS_JM[to][0]}.`
      }).catch(() => {});
    };
  },

  async remove(id) {
    const j = S.idx.jam.get(id);
    if (!j) return;
    if (!(await UI.confirm(`Hapus permanen <b>${esc(j.Nama_Lengkap)}</b>? Seluruh riwayat absensi dan capaiannya ikut terhapus dan tidak bisa dikembalikan. Jika hanya berhenti ikut, pindah, atau wafat, gunakan <b>Ubah Status</b> agar riwayatnya tetap tersimpan.`, { ok: 'Hapus Permanen', danger: true }))) return;
    const pj = S.d.jamaah, pa = S.d.absensi, pc = S.d.capaian;
    App.mutate({
      apply: () => { S.d.jamaah = pj.filter(x => x.ID_Jamaah !== id); S.d.absensi = pa.filter(a => a[1] !== id); S.d.capaian = pc.filter(c => c[0] !== id); },
      rollback: () => { S.d.jamaah = pj; S.d.absensi = pa; S.d.capaian = pc; },
      call: () => API.run('apiDeleteJamaah', id),
      okMsg: `${j.Nama_Lengkap} dihapus.`
    }).catch(() => {});
  },

  profile(id) {
    const j = S.idx.jam.get(id);
    if (!j) return;
    const att = Stats.jamAttendance(id), last = Stats.jamAttendance(id, 8);
    const pr = j.Jenjang !== 'Dewasa' ? Stats.jamProgress(j) : null;
    const hist = (S.idx.absJam.get(id) || []).map(r => ({ s: r.s, k: S.idx.keg.get(r.keg) })).filter(r => r.k).sort((a, b) => b.k.Tanggal.localeCompare(a.k.Tanggal)).slice(0, 8);
    const cls = { H: 'b-ok', I: 'b-warn', S: 'b-warn', A: 'b-bad' };
    UI.modal({
      title: 'Profil Jamaah', size: 'lg',
      body: `<div class="row" style="gap:16px;align-items:flex-start">${avatar(j, 'lg')}<div class="grow"><div class="row-wrap"><h3 style="font-size:20px">${esc(j.Nama_Lengkap)}</h3>${jkBadge(j.Jenis_Kelamin)}${jjBadge(j.Jenjang)}${kelasBadge(j.Kelas)}${j.Status_Aktif !== 'Aktif' ? statusBadge(j) : ''}${j.Dapukan ? dpkBadges(j.Dapukan) : ''}</div>
          <div class="meta-row mt-1"><span class="mono">${esc(j.ID_Jamaah)}</span><span><i class="bi bi-people"></i> ${esc(Store.kelName(j.ID_Kelompok))}</span><span><i class="bi bi-cake2"></i> ${j.Tempat_Lahir ? esc(j.Tempat_Lahir) + ', ' : ''}${D.long(j.Tanggal_Lahir)} (${D.age(j.Tanggal_Lahir)} th)</span></div>
          <div class="meta-row mt-1">${j.No_HP_Jamaah ? `<span title="No. HP jamaah"><i class="bi bi-phone"></i> ${waNum(j.No_HP_Jamaah) ? `<a href="${attr(waLink(j.No_HP_Jamaah, "Assalamu'alaikum " + j.Nama_Lengkap + ', '))}" target="_blank" rel="noopener">${esc(j.No_HP_Jamaah)}</a>` : esc(j.No_HP_Jamaah)}</span>` : ''}<span><i class="bi bi-person"></i> ${esc(j.Nama_Wali || '–')}</span><span title="No. HP wali"><i class="bi bi-telephone"></i> ${esc(j.No_HP || '–')}</span><span><i class="bi bi-house"></i> ${esc(j.Alamat || '–')}</span></div></div></div>
        <div class="kv mt-3">
          <div>Kehadiran ${esc(Store.absLabel())}<b class="ok">${att.total ? att.pct + '%' : '–'}</b></div>
          <div>Hadir / sesi<b>${att.h} / ${att.total}</b></div>
          <div>8 sesi terakhir<b>${last.total ? last.pct + '%' : '–'}</b></div>
          ${pr ? `<div>Target tercapai<b class="ok">${pr.done} / ${pr.total} (${pr.pct}%)</b></div>` : '<div>Kurikulum<b>Kajian tematik</b></div>'}
        </div>
        ${last.alpaStreak >= 2 ? `<div class="lock-banner mt-3" style="background:var(--bad-bg);color:var(--bad-text)"><i class="bi bi-exclamation-triangle"></i> Alpa ${last.alpaStreak} sesi berturut-turut — disarankan menghubungi wali.</div>` : ''}
        <div class="card-title mt-4 mb-2" style="font-size:15px">Riwayat Kehadiran Terakhir</div>
        ${hist.length ? `<div class="list">${hist.map(h => `<div class="list-item"><span class="badge ${cls[h.s]}" style="min-width:58px;justify-content:center">${ST_LABEL[h.s]}</span><div class="grow"><div class="cell-strong small">${esc(h.k.Nama_Kegiatan)}</div><div class="cell-sub">${D.day(h.k.Tanggal)}, ${D.short(h.k.Tanggal)} · ${esc(h.k.Waktu_Mulai)}</div></div></div>`).join('')}</div>` : emptyState('bi-calendar', 'Belum ada riwayat kehadiran.')}`,
      foot: `${pr ? `<button class="btn btn-light" onclick="Pages.capaian.rapor('${id}')"><i class="bi bi-printer"></i> Cetak Rapor</button><button class="btn btn-soft" data-close onclick="Pages.capaian.edit('${id}')"><i class="bi bi-award"></i> Update Capaian</button>` : ''}
        <button class="btn btn-primary no-guru" data-close onclick="Pages.jamaah.form('${id}')"><i class="bi bi-pencil"></i> Ubah Data</button>`
    });
  },

  exportXlsx() {
    const rows = Pages.jamaah.filtered().map(j => ({
      'ID Jamaah': j.ID_Jamaah, 'Nama Lengkap': j.Nama_Lengkap, 'Jenis Kelamin': jkLabel(j.Jenis_Kelamin), 'Tempat Lahir': j.Tempat_Lahir || '', 'Tanggal Lahir': j.Tanggal_Lahir, 'Umur': D.age(j.Tanggal_Lahir),
      'Jenjang': j.Jenjang, 'Kelas': j.Kelas || '', 'Dapukan': j.Dapukan || '', 'Kelompok': Store.kelName(j.ID_Kelompok), 'No HP Jamaah': j.No_HP_Jamaah || '', 'Nama Wali': j.Nama_Wali, 'No HP Wali': j.No_HP, 'Alamat': j.Alamat, 'Status': (STATUS_JM[j.Status_Aktif] || [j.Status_Aktif])[0], 'Tanggal Status': j.Tanggal_Status || '', 'Keterangan Status': j.Keterangan_Status || '',
      'Kehadiran (%)': Stats.jamAttendance(j.ID_Jamaah).pct
    }));
    Excel.export('Data_Jamaah_' + Store.scopeLabel().replace(/\W+/g, '_') + '_' + D.today(), [{ name: 'Data Jamaah', rows }]);
  }
};

/* ───────────────────────── LAMPIRAN FILE (materi & target) ───────────────────────── */
const Lampiran = {
  MAKS: 5, MB: 25,
  EXT: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'jpg', 'jpeg', 'png', 'webp', 'mp3', 'm4a', 'mp4'],
  list(v) { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } },
  icon(n) {
    const e = (String(n).match(/\.([a-z0-9]+)$/i) || [])[1] || '';
    return ({ pdf: 'bi-file-earmark-pdf', doc: 'bi-file-earmark-word', docx: 'bi-file-earmark-word', ppt: 'bi-file-earmark-slides', pptx: 'bi-file-earmark-slides', xls: 'bi-file-earmark-excel', xlsx: 'bi-file-earmark-excel',
      jpg: 'bi-file-earmark-image', jpeg: 'bi-file-earmark-image', png: 'bi-file-earmark-image', webp: 'bi-file-earmark-image', mp3: 'bi-file-earmark-music', m4a: 'bi-file-earmark-music', mp4: 'bi-file-earmark-play' })[e.toLowerCase()] || 'bi-file-earmark';
  },
  size(b) { b = Number(b) || 0; return b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; },
  /** Daftar tautan lampiran (untuk semua yang melihat materi/target). */
  chips(v) {
    const l = Lampiran.list(v);
    return l.length ? `<div class="lamp-chips">${l.map(f => `<a class="lamp-chip" href="${attr(f.u)}" target="_blank" rel="noopener" title="Buka ${attr(f.n)}"><i class="bi ${Lampiran.icon(f.n)}"></i><span>${esc(f.n)}</span></a>`).join('')}</div>` : '';
  },
  row(jenis, id) { return jenis === 'materi' ? S.idx.mat.get(id) : S.idx.tgt.get(id); },
  apply(jenis, id, json) {
    if (jenis === 'materi') Store.upsert('materi', { ID_Materi: id, Lampiran: json }, 'ID_Materi');
    else Store.upsert('target', { ID_Target: id, Lampiran: json }, 'ID_Target');
    Store.index(); Store.persist();
  },
  /** Kelola lampiran satu materi/target: lihat, unggah (maks. 5 file @10 MB), hapus. */
  open(jenis, id) {
    const r = Lampiran.row(jenis, id);
    if (!r) return;
    const judul = jenis === 'materi' ? r.Nama_Materi : r.Deskripsi_Target;
    const m = UI.modal({
      title: 'Lampiran ' + (jenis === 'materi' ? 'Materi' : 'Target'), size: 'lg',
      body: `<div class="muted small mb-3"><b>${esc(judul)}</b></div><div id="lampBody"></div>
        <label class="lamp-drop mt-3" id="lampDrop"><i class="bi bi-cloud-arrow-up"></i><div><b>Pilih file untuk diunggah</b><div class="tiny muted">PDF, JPG/PNG, Excel, Word, PowerPoint, MP3/MP4 · maks. ${Lampiran.MB} MB per file · maks. ${Lampiran.MAKS} file</div></div>
          <input type="file" id="lampFile" multiple hidden accept="${Lampiran.EXT.map(e => '.' + e).join(',')}"></label>
        <div id="lampProg" class="mt-2"></div>
        <p class="tiny muted mt-2"><i class="bi bi-google"></i> File disimpan di folder Drive <b>Ayo Ngaji › Bahan Ajar</b> dan bisa dibuka siapa saja yang memiliki tautannya.</p>`,
      foot: '<button class="btn btn-primary" data-close>Selesai</button>'
    });
    const draw = () => {
      const l = Lampiran.list((Lampiran.row(jenis, id) || {}).Lampiran);
      $('#lampBody', m.el).innerHTML = l.length ? `<div class="list">${l.map(f => `<div class="list-item"><i class="bi ${Lampiran.icon(f.n)}" style="font-size:22px;color:var(--primary)"></i>
          <div class="grow"><div class="cell-strong small">${esc(f.n)}</div><div class="cell-sub">${Lampiran.size(f.s)}${f.w ? ' · ' + esc(String(f.w).slice(0, 10)) : ''}</div></div>
          <a class="btn btn-light btn-sm" href="${attr(f.u)}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right"></i> Buka</a>
          <button class="icon-btn sm" aria-label="Hapus lampiran ${attr(f.n)}" data-del="${attr(f.id)}"><i class="bi bi-trash3" style="color:var(--bad)"></i></button></div>`).join('')}</div>`
        : emptyState('bi-paperclip', 'Belum ada file lampiran.');
      $('#lampDrop', m.el).hidden = l.length >= Lampiran.MAKS;
      m.el.querySelectorAll('[data-del]').forEach(b => { b.onclick = () => del(b.dataset.del, b); });
    };
    const del = async (fid, btn) => {
      const f = Lampiran.list(Lampiran.row(jenis, id).Lampiran).find(x => x.id === fid);
      if (!f || !(await UI.confirm(`Hapus lampiran <b>${esc(f.n)}</b>? File dipindahkan ke Sampah Google Drive.`, { ok: 'Hapus', danger: true }))) return;
      UI.busy(btn, true, '');
      try { const res = await API.run('apiHapusLampiran', jenis, id, fid); Lampiran.apply(jenis, id, res.Lampiran); draw(); Router.render(); UI.toast('Lampiran dihapus.', 'ok'); }
      catch (e) { UI.toast(e.message, 'bad'); UI.busy(btn, false); }
    };
    $('#lampFile', m.el).onchange = async e => {
      const files = [...e.target.files]; e.target.value = '';
      const prog = $('#lampProg', m.el);
      for (const file of files) {
        const ada = Lampiran.list(Lampiran.row(jenis, id).Lampiran).length;
        const ext = (file.name.match(/\.([a-z0-9]+)$/i) || [])[1] || '';
        if (ada >= Lampiran.MAKS) { UI.toast(`Maksimal ${Lampiran.MAKS} file. ${file.name} dilewati.`, 'warn'); continue; }
        if (!Lampiran.EXT.includes(ext.toLowerCase())) { UI.toast(`${file.name}: jenis file tidak didukung.`, 'warn'); continue; }
        if (file.size > Lampiran.MB * 1048576) { UI.toast(`${file.name} lebih dari ${Lampiran.MB} MB.`, 'warn'); continue; }
        prog.innerHTML = `<div class="note"><i class="bi bi-arrow-repeat spin-icon"></i><div>Mengunggah <b>${esc(file.name)}</b> (${Lampiran.size(file.size)})…</div></div>`;
        try {
          const data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.onerror = () => rej(new Error('File tidak bisa dibaca.')); fr.readAsDataURL(file); });
          const res = await API.run('apiUploadLampiran', jenis, id, { name: file.name, type: file.type, data });
          Lampiran.apply(jenis, id, res.Lampiran); draw(); Router.render();
          UI.toast(file.name + ' terunggah.', 'ok');
        } catch (err) { UI.toast(file.name + ': ' + err.message, 'bad'); }
      }
      prog.innerHTML = '';
    };
    draw();
  }
};

/* ───────────────────────── DOKUMEN KURIKULUM (buku petunjuk, silabus, dll.) ───────────────────────── */
const Dokumen = {
  /** Panel di halaman Kurikulum: dokumen umum (semua jenjang) + dokumen jenjang aktif. */
  panel(jj) {
    const adm = Store.isAdm();
    const list = (S.d.dokumen || []).filter(d => !d.Jenjang || d.Jenjang === jj);
    if (!list.length && !adm) return '';
    return `<div class="card mb-3 dok-card"><div class="card-head" style="margin-bottom:${list.length ? 12 : 0}px"><div><div class="card-title"><i class="bi bi-book"></i> Dokumen & Buku Petunjuk</div>
        <div class="card-sub">${list.length ? 'Panduan kurikulum yang bisa dibuka semua pengurus & guru.' : 'Unggah buku petunjuk kurikulum, silabus, atau tabel target (PDF, JPG, Excel).'}</div></div>
        ${adm ? `<button class="btn btn-primary btn-sm" onclick="Dokumen.upload('${attr(jj)}')"><i class="bi bi-cloud-arrow-up"></i> Unggah Dokumen</button>` : ''}</div>
      ${list.length ? `<div class="dok-list">${list.map(d => `<div class="dok-item"><i class="bi ${Lampiran.icon(d.Nama_File)}"></i>
          <div class="grow"><a class="cell-strong" href="${attr(d.URL)}" target="_blank" rel="noopener">${esc(d.Judul)}</a><div class="cell-sub">${d.Jenjang ? esc(d.Jenjang) : 'Semua jenjang'} · ${esc(d.Nama_File)} · ${Lampiran.size(d.Ukuran)}</div></div>
          <a class="btn btn-light btn-sm" href="${attr(d.URL)}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right"></i> Buka</a>
          ${adm && (!d.Jenjang || Store.jj().includes(d.Jenjang)) ? `<button class="icon-btn sm" aria-label="Hapus dokumen ${attr(d.Judul)}" onclick="Dokumen.remove('${attr(d.ID_Dokumen)}')"><i class="bi bi-trash3" style="color:var(--bad)"></i></button>` : ''}</div>`).join('')}</div>` : ''}</div>`;
  },
  upload(jj) {
    const m = UI.modal({ title: 'Unggah Dokumen Kurikulum', size: 'md',
      body: `<form id="dokForm" class="form-grid" novalidate>
        <label class="field"><span class="field-label">File <span class="req">*</span></span>
          <label class="lamp-drop"><i class="bi bi-file-earmark-arrow-up"></i><div><b id="dokName">Pilih file</b><div class="tiny muted">PDF, JPG/PNG, Excel, Word, PowerPoint · maks. ${Lampiran.MB} MB</div></div>
          <input type="file" id="dokFile" hidden accept="${Lampiran.EXT.map(e => '.' + e).join(',')}"></label></label>
        <label class="field"><span class="field-label">Judul <span class="req">*</span></span><input class="input" name="Judul" maxlength="150" placeholder="mis. Buku Petunjuk Kurikulum KBM Generus 2025"></label>
        <label class="field"><span class="field-label">Berlaku untuk</span><select class="select" name="Jenjang">${opt('', 'Semua jenjang', '')}${Store.jj().map(j => opt(j, j, '')).join('')}</select><span class="field-help">Pilih "Semua jenjang" untuk buku panduan umum.</span></label>
        <div id="dokProg"></div><div id="dokErr" class="form-error" hidden></div></form>`,
      foot: `<button class="btn btn-light" data-close>Batal</button><button class="btn btn-primary" id="dokGo"><i class="bi bi-cloud-upload"></i> Unggah</button>` });
    const form = $('#dokForm', m.el), err = t => { const e = $('#dokErr', m.el); e.textContent = t || ''; e.hidden = !t; };
    let file = null;
    $('#dokFile', m.el).onchange = e => {
      file = e.target.files[0] || null; err('');
      $('#dokName', m.el).textContent = file ? file.name + ' (' + Lampiran.size(file.size) + ')' : 'Pilih file';
      if (file && !form.Judul.value.trim()) form.Judul.value = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 150);
    };
    $('#dokGo', m.el).onclick = async ev => {
      const judul = form.Judul.value.trim(), ext = file ? ((file.name.match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase() : '';
      if (!file) return err('Pilih file dulu.');
      if (!Lampiran.EXT.includes(ext)) return err('Jenis file tidak didukung.');
      if (file.size > Lampiran.MB * 1048576) return err(`Ukuran file maksimal ${Lampiran.MB} MB. Kecilkan dulu (mis. kompres PDF) lalu unggah lagi.`);
      if (!judul) return err('Judul wajib diisi.');
      const btn = ev.currentTarget; UI.busy(btn, true, 'Mengunggah…'); err('');
      $('#dokProg', m.el).innerHTML = `<div class="note"><i class="bi bi-arrow-repeat spin-icon"></i><div>Mengunggah <b>${esc(file.name)}</b> (${Lampiran.size(file.size)}). File besar bisa memakan waktu 1–3 menit, jangan tutup halaman.</div></div>`;
      try {
        const data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.onerror = () => rej(new Error('File tidak bisa dibaca.')); fr.readAsDataURL(file); });
        const r = await API.run('apiUploadDokumen', { Judul: judul, Jenjang: form.Jenjang.value }, { name: file.name, type: file.type, data });
        S.d.dokumen = [r].concat(S.d.dokumen || []); Store.persist();
        m.close(); Router.render(); UI.toast('Dokumen "' + judul + '" terunggah.', 'ok');
      } catch (x) { $('#dokProg', m.el).innerHTML = ''; err(x.message); UI.busy(btn, false); }
    };
  },
  async remove(id) {
    const d = (S.d.dokumen || []).find(x => x.ID_Dokumen === id); if (!d) return;
    if (!(await UI.confirm(`Hapus dokumen <b>${esc(d.Judul)}</b>? File dipindahkan ke Sampah Google Drive.`, { ok: 'Hapus', danger: true }))) return;
    const prev = S.d.dokumen.slice();
    App.mutate({ apply: () => { S.d.dokumen = S.d.dokumen.filter(x => x.ID_Dokumen !== id); }, rollback: () => { S.d.dokumen = prev; },
      call: () => API.run('apiHapusDokumen', id), okMsg: 'Dokumen dihapus.' }).catch(() => {});
  }
};

/* ───────────────────────── IMPOR KURIKULUM DARI EXCEL ───────────────────────── */
const KurImpor = {
  KOLOM_M: ['Kode', 'Jenjang', 'Kelas', 'Kategori', 'Nama_Materi', 'Deskripsi', 'Urutan', 'Status'],
  KOLOM_T: ['Kode_Materi', 'Jenjang', 'Nama_Materi', 'Deskripsi_Target', 'Indikator', 'Batas_Waktu', 'Status'],
  /** Template berisi kurikulum pusat saat ini (bisa diedit lalu diimpor ulang) atau contoh bila masih kosong. */
  async template(btn) {
    UI.busy(btn, true, 'Menyiapkan…');
    try {
      await Excel.load();
      const mats = S.d.materi.filter(m => m.Pengelola !== 'Ekskul' && JENJANG_TARGET.includes(m.Jenjang))
        .sort((a, b) => JENJANG.indexOf(a.Jenjang) - JENJANG.indexOf(b.Jenjang) || (a.Kelas || '').localeCompare(b.Kelas || '') || (Number(a.Urutan) || 0) - (Number(b.Urutan) || 0));
      let M = mats.map(m => ({ Kode: m.ID_Materi, Jenjang: m.Jenjang, Kelas: m.Kelas || '', Kategori: m.Kategori, Nama_Materi: m.Nama_Materi, Deskripsi: m.Deskripsi || '', Urutan: Number(m.Urutan) || 0, Status: m.Status_Aktif || 'Aktif' }));
      const ids = new Set(mats.map(m => m.ID_Materi));
      let T = S.d.target.filter(t => ids.has(t.ID_Materi)).map(t => { const m = S.idx.mat.get(t.ID_Materi); return { Kode_Materi: t.ID_Materi, Jenjang: t.Jenjang, Nama_Materi: m ? m.Nama_Materi : '', Deskripsi_Target: t.Deskripsi_Target, Indikator: t.Indikator || '', Batas_Waktu: t.Batas_Waktu || '', Status: t.Status_Aktif || 'Aktif' }; });
      if (!M.length) {
        M = [{ Kode: 'M1', Jenjang: 'Caberawit', Kelas: 'A1', Kategori: "Al-Qur'an", Nama_Materi: 'Membaca Iqro 1', Deskripsi: 'Pengenalan huruf hijaiyah', Urutan: 1, Status: 'Aktif' },
          { Kode: 'M2', Jenjang: 'Remaja', Kelas: '', Kategori: 'Hadits', Nama_Materi: 'Hadits Adab Bergaul', Deskripsi: '', Urutan: 1, Status: 'Aktif' }];
        T = [{ Kode_Materi: 'M1', Jenjang: '', Nama_Materi: '', Deskripsi_Target: 'Lancar mengenal huruf alif–ya', Indikator: 'Menyebut 28 huruf tanpa salah', Batas_Waktu: 'Semester 1', Status: 'Aktif' },
          { Kode_Materi: 'M2', Jenjang: '', Nama_Materi: '', Deskripsi_Target: 'Hafal 3 hadits adab', Indikator: 'Setoran hafalan ke guru', Batas_Waktu: 'Semester 2', Status: 'Aktif' }];
      }
      const P = [['PETUNJUK IMPOR KURIKULUM AYO NGAJI'], [''],
        ['Sheet "Materi" — satu baris per materi:'], ['  Kode', 'Kode bebas (mis. M1) untuk materi baru, atau ID materi yang sudah ada (mis. MAT-1A2B3C4D) untuk memperbarui.'],
        ['  Jenjang', 'Balita, PAUD/TK, Caberawit, Pra Remaja, Remaja, atau Usia Nikah (wajib).'], ['  Kelas', 'Khusus Caberawit: A1–A6. Kosongkan = semua kelas.'],
        ['  Kategori', "Wajib, mis. Al-Qur'an, Hadits, Fiqih, Akhlak."], ['  Nama_Materi', 'Wajib.'], ['  Deskripsi, Urutan', 'Opsional.'], ['  Status', 'Aktif atau Nonaktif (kosong = Aktif).'], [''],
        ['Sheet "Target" — satu baris per target pencapaian:'], ['  Kode_Materi', 'Kode materi dari sheet Materi (atau ID materi yang sudah ada).'],
        ['  Jenjang + Nama_Materi', 'Alternatif bila Kode_Materi kosong: materi dicari dari namanya.'], ['  Deskripsi_Target', 'Wajib.'], ['  Indikator, Batas_Waktu', 'Opsional.'], [''],
        ['Catatan:'], ['  • Impor aman diulang: materi/target yang sama diperbarui, tidak digandakan.'], ['  • Bila ada satu baris salah, tidak ada data yang disimpan — perbaiki lalu impor lagi.'],
        ['  • Menghapus baris di file TIDAK menghapus materi di aplikasi. Gunakan Status = Nonaktif atau hapus dari aplikasi.'],
        ['  • Materi Dewasa & ekstrakurikuler tidak diimpor lewat file ini.']];
      const wb = XLSX.utils.book_new();
      const wsM = XLSX.utils.json_to_sheet(M, { header: KurImpor.KOLOM_M }); wsM['!cols'] = [14, 12, 7, 16, 36, 40, 8, 10].map(w => ({ wch: w }));
      const wsT = XLSX.utils.json_to_sheet(T, { header: KurImpor.KOLOM_T }); wsT['!cols'] = [16, 12, 30, 40, 40, 14, 10].map(w => ({ wch: w }));
      const wsP = XLSX.utils.aoa_to_sheet(P); wsP['!cols'] = [{ wch: 26 }, { wch: 100 }];
      XLSX.utils.book_append_sheet(wb, wsM, 'Materi'); XLSX.utils.book_append_sheet(wb, wsT, 'Target'); XLSX.utils.book_append_sheet(wb, wsP, 'Petunjuk');
      XLSX.writeFile(wb, 'Template Kurikulum Ayo Ngaji.xlsx');
      UI.toast(mats.length ? 'Template berisi kurikulum saat ini diunduh. Edit lalu impor kembali.' : 'Template contoh diunduh.', 'ok');
    } catch (e) { UI.toast(e.message, 'bad'); }
    UI.busy(btn, false);
  },
  /** Baca file Excel → {materi, target}. Nama kolom tidak peka huruf besar/kecil & spasi. */
  async parse(file) {
    await Excel.load();
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const norm = v => String(v).trim().toLowerCase().replace(/[\s_]+/g, '');
    const sheet = name => { const n = wb.SheetNames.find(x => norm(x) === norm(name)); return n ? wb.Sheets[n] : null; };
    const rows = (ws, cols) => {
      if (!ws) return [];
      return XLSX.utils.sheet_to_json(ws, { defval: '', raw: false }).map(r => {
        const o = {}; Object.keys(r).forEach(k => { const c = cols.find(x => norm(x) === norm(k)); if (c) o[c] = String(r[k]).trim(); });
        return o;
      }).filter(o => Object.values(o).some(Boolean));
    };
    const materi = rows(sheet('Materi'), KurImpor.KOLOM_M), target = rows(sheet('Target'), KurImpor.KOLOM_T);
    if (!sheet('Materi') && !sheet('Target')) throw new Error('Sheet "Materi" atau "Target" tidak ditemukan. Gunakan template dari tombol Unduh Template.');
    return { materi, target };
  },
  open() {
    let data = null;
    const m = UI.modal({
      title: 'Impor Materi & Target dari Excel', size: 'lg',
      body: `<ol class="steps-list">
          <li><b>Unduh template.</b> Berisi kurikulum pusat saat ini (atau contoh bila masih kosong), sheet <i>Materi</i>, <i>Target</i>, dan <i>Petunjuk</i>.
            <div class="mt-2"><button class="btn btn-light btn-sm" id="kiTpl"><i class="bi bi-download"></i> Unduh Template Excel</button></div></li>
          <li class="mt-3"><b>Isi atau ubah</b> baris materi & target, lalu simpan.</li>
          <li class="mt-3"><b>Pilih file</b> untuk diperiksa sebelum disimpan.
            <label class="lamp-drop mt-2"><i class="bi bi-file-earmark-spreadsheet"></i><div><b id="kiName">Pilih file .xlsx</b><div class="tiny muted">Hanya kurikulum pusat Balita–Usia Nikah</div></div><input type="file" id="kiFile" accept=".xlsx,.xls" hidden></label></li></ol>
        <div id="kiPrev" class="mt-3"></div><div id="kiErr" class="form-error mt-2" style="white-space:pre-line" hidden></div>`,
      foot: '<button class="btn btn-light" data-close>Batal</button><button class="btn btn-primary" id="kiGo" disabled><i class="bi bi-cloud-upload"></i> Impor Sekarang</button>'
    });
    const err = t => { const e = $('#kiErr', m.el); e.textContent = t || ''; e.hidden = !t; };
    $('#kiTpl', m.el).onclick = e => KurImpor.template(e.currentTarget);
    $('#kiFile', m.el).onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      $('#kiName', m.el).textContent = f.name; err(''); data = null; $('#kiGo', m.el).disabled = true;
      $('#kiPrev', m.el).innerHTML = '<div class="note"><i class="bi bi-arrow-repeat spin-icon"></i><div>Membaca file…</div></div>';
      try {
        data = await KurImpor.parse(f);
        const jjOk = v => JENJANG_TARGET.some(j => j.toLowerCase() === String(v).trim().toLowerCase());
        const salah = data.materi.map((r, i) => !jjOk(r.Jenjang) ? `Materi baris ${i + 2}: jenjang "${r.Jenjang}" tidak dikenal.` : !r.Nama_Materi || !r.Kategori ? `Materi baris ${i + 2}: Kategori & Nama_Materi wajib.` : '')
          .concat(data.target.map((r, i) => !r.Deskripsi_Target ? `Target baris ${i + 2}: Deskripsi_Target wajib.` : !r.Kode_Materi && !r.Nama_Materi ? `Target baris ${i + 2}: isi Kode_Materi atau Nama_Materi.` : '')).filter(Boolean);
        const perJ = JENJANG_TARGET.map(j => [j, data.materi.filter(r => String(r.Jenjang).trim().toLowerCase() === j.toLowerCase()).length]).filter(x => x[1]);
        $('#kiPrev', m.el).innerHTML = `<div class="grid-2"><div class="card kpi compact"><div class="kpi-label">Materi di file</div><div class="kpi-value">${data.materi.length}</div><div class="kpi-foot"><span>${perJ.map(([j, n]) => esc(j) + ' ' + n).join(' · ') || '–'}</span></div></div>
          <div class="card kpi compact"><div class="kpi-label">Target di file</div><div class="kpi-value">${data.target.length}</div><div class="kpi-foot"><span>Materi & target yang sudah ada akan diperbarui</span></div></div></div>`;
        if (salah.length) { err('Perbaiki dulu:\n• ' + salah.slice(0, 10).join('\n• ') + (salah.length > 10 ? `\n• …dan ${salah.length - 10} lainnya` : '')); data = null; return; }
        if (!data.materi.length && !data.target.length) { err('File tidak berisi baris data.'); data = null; return; }
        $('#kiGo', m.el).disabled = false;
      } catch (x) { $('#kiPrev', m.el).innerHTML = ''; err(x.message); data = null; }
    };
    $('#kiGo', m.el).onclick = async e => {
      if (!data) return;
      const btn = e.currentTarget; UI.busy(btn, true, 'Mengimpor…'); err('');
      try {
        const r = await API.run('apiImportKurikulum', data);
        r.materi.forEach(x => Store.upsert('materi', x, 'ID_Materi'));
        r.target.forEach(x => Store.upsert('target', x, 'ID_Target'));
        Store.index(); Store.persist(); m.close(); Router.render();
        UI.toast(`Impor selesai: ${r.materiBaru} materi baru, ${r.materiUbah} diperbarui · ${r.targetBaru} target baru, ${r.targetUbah} diperbarui.`, 'ok');
      } catch (x) { err(x.message); UI.busy(btn, false); }
    };
  }
};

/* ───────────────────────── KURIKULUM ───────────────────────── */
Pages.kurikulum = {
  render() {
    if (!Store.jj().includes(S.ui.kur.jenjang)) S.ui.kur.jenjang = Store.jj()[0] || 'Caberawit';
    const jj = S.ui.kur.jenjang, master = Store.isAdm(), dewasa = jj === 'Dewasa', guru = Store.isGuru();
    const kf = S.ui.kur.kelas;
    const kelasOk = m => jj !== 'Caberawit' || kf === 'ALL' || !m.Kelas || m.Kelas === kf;
    const eks = dewasa ? [] : S.d.materi.filter(m => m.Pengelola === 'Ekskul' && m.Jenjang === jj && Store.inScope(m) && kelasOk(m)).sort((a, b) => (Number(a.Urutan) || 0) - (Number(b.Urutan) || 0));
    const canEks = !dewasa && (master || (guru && Store.guruJJ().includes(jj)));
    const mats = S.d.materi.filter(m => m.Pengelola !== 'Ekskul' && m.Jenjang === jj && (!dewasa || Store.inScope(m)) && (jj !== 'Caberawit' || kf === 'ALL' || !m.Kelas || m.Kelas === kf)).sort((a, b) => (a.ID_Kelompok || '').localeCompare(b.ID_Kelompok || '') || (Number(a.Urutan) || 0) - (Number(b.Urutan) || 0));
    const canEdit = dewasa ? !master : master;
    const tgCount = j => S.d.target.filter(t => t.Jenjang === j && t.Status_Aktif !== 'Nonaktif').length;

    const card = m => {
      const tg = S.d.target.filter(t => t.ID_Materi === m.ID_Materi);
      return `<div class="card materi-card ${m.Status_Aktif === 'Nonaktif' ? 'off' : ''}">
        <div class="row"><span class="cur-item code" style="padding:0;border:none">${esc(m.ID_Materi)}</span><span class="badge b-outline">${esc(m.Kategori)}</span>${jj === 'Caberawit' ? (m.Kelas ? kelasBadge(m.Kelas) : '<span class="badge b-mint">Semua kelas</span>') : ''}${m.Status_Aktif === 'Nonaktif' ? '<span class="badge b-bad">Nonaktif</span>' : ''}<span class="spacer"></span>
          ${canEdit ? `<button class="icon-btn sm" aria-label="Lampiran materi" title="Lampiran file" onclick="Lampiran.open('materi','${m.ID_Materi}')"><i class="bi bi-paperclip"></i></button><button class="icon-btn sm" aria-label="Ubah materi" onclick="Pages.kurikulum.materiForm('${m.ID_Materi}')"><i class="bi bi-pencil"></i></button>` : ''}${canEdit || master ? `<button class="icon-btn sm" aria-label="Hapus materi" title="Hapus materi" onclick="Pages.kurikulum.removeMateri('${m.ID_Materi}')"><i class="bi bi-trash3" style="color:var(--bad)"></i></button>` : ''}</div>
        <div class="card-title">${esc(m.Nama_Materi)}</div>
        ${m.Deskripsi ? `<p class="muted small">${esc(m.Deskripsi)}</p>` : ''}
        ${Lampiran.chips(m.Lampiran)}
        ${dewasa ? `<div class="tiny muted"><i class="bi bi-people"></i> ${esc(Store.kelName(m.ID_Kelompok))}</div>` : `
          <div class="row"><span class="field-label small">Target Pencapaian (${tg.length})</span><span class="spacer"></span>${canEdit ? `<button class="btn btn-soft btn-sm" onclick="Pages.kurikulum.targetForm(null,'${m.ID_Materi}')"><i class="bi bi-plus"></i> Target</button>` : ''}</div>
          ${tg.length ? `<ul class="target-list">${tg.map(t => `<li class="${t.Status_Aktif === 'Nonaktif' ? 'faint' : ''}"><i class="bi bi-bullseye"></i><div class="grow"><div class="cell-strong">${esc(t.Deskripsi_Target)}</div><div class="cell-sub">${esc(t.Indikator || '')}${t.Batas_Waktu ? ' · ' + esc(t.Batas_Waktu) : ''}</div>${Lampiran.chips(t.Lampiran)}</div>${canEdit ? `<button class="icon-btn sm" aria-label="Lampiran target" title="Lampiran file" onclick="Lampiran.open('target','${t.ID_Target}')"><i class="bi bi-paperclip"></i></button><button class="icon-btn sm" aria-label="Ubah target" onclick="Pages.kurikulum.targetForm('${t.ID_Target}')"><i class="bi bi-pencil"></i></button>` : ''}</li>`).join('')}</ul>` : '<p class="tiny muted">Belum ada target.</p>'}`}
      </div>`;
    };

    const ekCard = m => `<div class="card materi-card eks-card ${m.Status_Aktif === 'Nonaktif' ? 'off' : ''}">
        <div class="row"><span class="badge b-gold"><i class="bi bi-stars"></i> Ekskul</span><span class="badge b-outline">${esc(m.Kategori)}</span>${jj === 'Caberawit' ? (m.Kelas ? kelasBadge(m.Kelas) : '<span class="badge b-mint">Semua kelas</span>') : ''}${m.Status_Aktif === 'Nonaktif' ? '<span class="badge b-bad">Nonaktif</span>' : ''}<span class="spacer"></span>
          ${Pages.kurikulum.canEks(m) ? `<button class="icon-btn sm" aria-label="Lampiran materi ekstrakurikuler" title="Lampiran file" onclick="Lampiran.open('materi','${m.ID_Materi}')"><i class="bi bi-paperclip"></i></button><button class="icon-btn sm" aria-label="Ubah materi ekstrakurikuler" onclick="Pages.kurikulum.materiForm('${m.ID_Materi}')"><i class="bi bi-pencil"></i></button><button class="icon-btn sm" aria-label="Hapus materi ekstrakurikuler" title="Hapus" onclick="Pages.kurikulum.removeMateri('${m.ID_Materi}')"><i class="bi bi-trash3" style="color:var(--bad)"></i></button>` : ''}</div>
        <div class="card-title">${esc(m.Nama_Materi)}</div>
        ${m.Deskripsi ? `<p class="muted small">${esc(m.Deskripsi)}</p>` : ''}
        ${Lampiran.chips(m.Lampiran)}
        <div class="tiny muted"><i class="bi bi-people"></i> ${m.ID_Kelompok === KEL_SEMUA || !m.ID_Kelompok ? 'Semua kelompok' : esc(Store.kelName(m.ID_Kelompok))}</div>
      </div>`;
    const eksSection = dewasa ? '' : `
      <div class="card-head section-gap" style="padding:0;margin-bottom:12px"><div><div class="card-title"><i class="bi bi-stars"></i> Materi Ekstrakurikuler — ${esc(jj)}</div><div class="card-sub">Ditambahkan Master Admin / Admin PPG (semua kelompok) atau Guru pengajar jenjang ini (kelompoknya). Bisa dipilih saat membuat sesi kegiatan, tanpa target pencapaian.</div></div>
        ${canEks ? `<button class="btn btn-gold btn-sm" onclick="Pages.kurikulum.materiForm(null, true)"><i class="bi bi-plus-lg"></i> Tambah Ekstrakurikuler</button>` : ''}</div>
      ${eks.length ? `<div class="grid-3">${eks.map(ekCard).join('')}</div>` : `<div class="card">${emptyState('bi-stars', 'Belum ada materi ekstrakurikuler untuk jenjang ini.')}</div>`}`;
    $('#page-kurikulum').innerHTML = pageHead('Pembinaan <i class="bi bi-chevron-right"></i> <b>Kurikulum & Materi</b>', 'Kurikulum & Materi',
      `Materi dan target pencapaian ${JENJANG_TARGET.length} jenjang (Balita–Usia Nikah) disusun Master Admin / Admin PPG (seragam semua kelompok). Materi Dewasa disusun Admin Kelompok masing-masing.`,
      (canEdit ? `<button class="btn btn-primary" onclick="Pages.kurikulum.materiForm()"><i class="bi bi-plus-lg"></i> Tambah Materi ${esc(jj)}${jj === 'Caberawit' && kf !== 'ALL' ? ' · Kelas ' + kf : ''}</button>` : '') +
      (canEks ? `<button class="btn btn-gold" onclick="Pages.kurikulum.materiForm(null, true)"><i class="bi bi-stars"></i> Tambah Ekstrakurikuler</button>` : '') +
      (Store.isAdm() ? `<button class="btn btn-light" onclick="KurImpor.open()"><i class="bi bi-file-earmark-arrow-up"></i> Impor Excel</button>` : '')) + `
      <div class="tabs" role="tablist">${Store.jj().map(j => `<button role="tab" aria-selected="${j === jj}" class="${j === jj ? 'active' : ''}" onclick="S.ui.kur.jenjang='${j}';Pages.kurikulum.render()">${esc(j)} <span class="badge ${j === jj ? 'b-ok' : 'b-outline'}">${S.d.materi.filter(m => m.Jenjang === j && (j !== 'Dewasa' || Store.inScope(m))).length}</span></button>`).join('')}</div>
      ${Dokumen.panel(jj)}
      ${jj === 'Caberawit' ? `<div class="chips mb-3" role="tablist" aria-label="Filter kelas materi">
        <button class="chip ${kf === 'ALL' ? 'active' : ''}" onclick="S.ui.kur.kelas='ALL';Pages.kurikulum.render()"><i class="bi bi-mortarboard"></i> Semua Kelas <span class="count">${S.d.materi.filter(m => m.Jenjang === 'Caberawit').length}</span></button>
        ${KELAS.map(k => `<button class="chip ${kf === k ? 'active' : ''}" onclick="S.ui.kur.kelas='${k}';Pages.kurikulum.render()">Kelas ${k} <span class="count">${S.d.materi.filter(m => m.Jenjang === 'Caberawit' && (!m.Kelas || m.Kelas === k)).length}</span></button>`).join('')}</div>` : ''}
      <div class="note ${dewasa ? 'gold' : ''} mb-3"><i class="bi ${dewasa ? 'bi-people' : 'bi-shield-check'}"></i><div>${dewasa
        ? `<b>Jenjang Dewasa</b> memakai kajian tematik mandiri. Materi disusun oleh <b>Admin Kelompok</b> untuk kelompoknya sendiri, <b>tanpa target pencapaian</b>.${master ? ' Anda (Master Admin) dapat melihat dan menghapus materi semua kelompok.' : ''}`
        : `Dikelola <b>Master Admin / Admin PPG (Pusat)</b> · ${mats.length} materi · ${tgCount(jj)} target aktif.${master ? '' : guru ? ' Guru dapat memilih materi ini saat membuat sesi dan mencatat capaiannya.' : ' Admin Kelompok dapat memilih materi ini saat membuat kegiatan.'}`}</div></div>
      ${mats.length ? `<div class="grid-3">${mats.map(card).join('')}</div>` : `<div class="card">${emptyState('bi-journal-x', dewasa && master ? 'Belum ada materi Dewasa dari kelompok.' : 'Belum ada materi untuk jenjang ini.')}</div>`}${eksSection}`;
  },
  /** Boleh ubah/hapus materi ekskul m? */
  canEks(m) {
    if (Store.isAdm()) return m.Jenjang !== 'Dewasa' || Store.isMaster();
    if (!Store.isGuru() || !Store.guruJJ().includes(m.Jenjang)) return false;
    return Store.guruSemua() || String(m.ID_Kelompok) === Store.myKel();
  },

  materiForm(id, ekskul) {
    const m0 = id ? S.idx.mat.get(id) : null;
    const jj = m0 ? m0.Jenjang : S.ui.kur.jenjang;
    const eks = m0 ? m0.Pengelola === 'Ekskul' : !!ekskul;
    const m = UI.modal({
      title: (m0 ? 'Ubah' : 'Tambah') + (eks ? ' Materi Ekstrakurikuler — ' : ' Materi — ') + jj,
      body: `<form id="matForm" class="form-grid two">
        <label class="field"><span class="field-label">${eks ? 'Bidang ekstrakurikuler' : 'Kategori <span class="req">*</span>'}</span><input class="input" name="Kategori" list="katList" maxlength="60" value="${attr(m0 ? m0.Kategori : (eks ? 'Ekstrakurikuler' : ''))}" placeholder="${eks ? 'mis. Tahfidz, Kaligrafi, Pencak Silat, Hadroh' : "mis. Al-Qur'an, Hadits, Fiqih"}"><datalist id="katList">${[...new Set(S.d.materi.map(x => x.Kategori))].map(k => `<option value="${attr(k)}">`).join('')}</datalist></label>
        ${jj === 'Caberawit' ? `<label class="field span-2"><span class="field-label">Kelas</span><select class="select" name="Kelas">${opt('', 'Semua kelas (A1–A6)', m0 ? m0.Kelas : (S.ui.kur.kelas === 'ALL' ? '' : S.ui.kur.kelas))}${KELAS.map(x => opt(x, 'Kelas ' + x, m0 ? m0.Kelas : (S.ui.kur.kelas === 'ALL' ? '' : S.ui.kur.kelas))).join('')}</select><span class="field-help">Pilih satu kelas bila materi hanya diajarkan di kelas itu.</span></label>` : ''}
        <label class="field"><span class="field-label">Urutan / Semester</span><input class="input" type="number" min="0" max="999" name="Urutan" value="${attr(m0 ? m0.Urutan : S.d.materi.filter(x => x.Jenjang === jj).length + 1)}"></label>
        <label class="field span-2"><span class="field-label">Nama materi <span class="req">*</span></span><input class="input" name="Nama_Materi" maxlength="150" value="${attr(m0 ? m0.Nama_Materi : '')}"></label>
        <label class="field span-2"><span class="field-label">Deskripsi</span><textarea class="textarea" name="Deskripsi" maxlength="500">${esc(m0 ? m0.Deskripsi : '')}</textarea></label>
        <label class="field"><span class="field-label">Status</span><select class="select" name="Status_Aktif">${opt('Aktif', 'Aktif', m0 ? m0.Status_Aktif : 'Aktif')}${opt('Nonaktif', 'Nonaktif', m0 && m0.Status_Aktif)}</select></label>
        <div id="matErr" class="form-error span-2" hidden></div></form>`,
      foot: `<button class="btn btn-light" data-close>Batal</button><button class="btn btn-primary" id="matSave"><i class="bi bi-check2"></i> Simpan</button>`
    });
    $('#matSave', m.el).onclick = () => {
      const fd = Object.fromEntries(new FormData($('#matForm', m.el)).entries());
      if ((!eks && !fd.Kategori.trim()) || !fd.Nama_Materi.trim()) { const e = $('#matErr', m.el); e.textContent = eks ? 'Nama materi wajib diisi.' : 'Kategori dan nama materi wajib diisi.'; e.hidden = false; return; }
      if (eks && !fd.Kategori.trim()) fd.Kategori = 'Ekstrakurikuler';
      const rec = Object.assign(eks
        ? { ID_Materi: m0 ? m0.ID_Materi : uid('EKS'), Jenjang: jj, Pengelola: 'Ekskul', ID_Kelompok: m0 ? m0.ID_Kelompok : (Store.isAdm() || Store.guruSemua() ? KEL_SEMUA : Store.myKel()) }
        : { ID_Materi: m0 ? m0.ID_Materi : uid('MAT'), Jenjang: jj, Pengelola: jj === 'Dewasa' ? 'Kelompok' : 'Pusat', ID_Kelompok: jj === 'Dewasa' ? Store.myKel() : '' }, fd, { Kelas: jj === 'Caberawit' ? (fd.Kelas || '') : '' });
      m.close();
      const prev = S.d.materi;
      App.mutate({ apply: () => Store.upsert('materi', rec, 'ID_Materi'), rollback: () => { S.d.materi = prev; }, call: () => API.run('apiSaveMateri', rec), okMsg: 'Materi disimpan.', onSaved: r => Store.upsert('materi', r, 'ID_Materi') }).catch(() => {});
    };
  },

  async removeMateri(id) {
    const m = S.idx.mat.get(id);
    if (!m) return;
    const tIds = new Set(S.d.target.filter(t => t.ID_Materi === id).map(t => t.ID_Target));
    const nKeg = S.d.kegiatan.filter(k => [k.ID_Materi, k.ID_Materi_2, k.ID_Materi_3].includes(id)).length;
    const info = [tIds.size ? `<b>${tIds.size} target</b> beserta capaian jamaahnya ikut terhapus` : '', nKeg ? `<b>${nKeg} sesi kegiatan</b> dilepas dari materi ini` : ''].filter(Boolean).join(', ');
    if (!(await UI.confirm(`Hapus materi <b>${esc(m.Nama_Materi)}</b>${m.Kelas ? ' (Kelas ' + esc(m.Kelas) + ')' : ''}?${info ? ' ' + info + '.' : ''} Tindakan ini tidak bisa dikembalikan. Untuk menyembunyikan saja, ubah status menjadi Nonaktif.`, { ok: 'Hapus Materi', danger: true }))) return;
    const pm = S.d.materi, pt = S.d.target, pc = S.d.capaian, pk = S.d.kegiatan;
    App.mutate({
      apply: () => {
        S.d.materi = pm.filter(x => x.ID_Materi !== id); S.d.target = pt.filter(t => t.ID_Materi !== id);
        S.d.capaian = pc.filter(c => !tIds.has(c[1])); S.d.kegiatan = pk.map(k => { const o = {}; ['ID_Materi', 'ID_Materi_2', 'ID_Materi_3'].forEach(c => { if (k[c] === id) o[c] = ''; }); return Object.keys(o).length ? Object.assign({}, k, o) : k; });
      },
      rollback: () => { S.d.materi = pm; S.d.target = pt; S.d.capaian = pc; S.d.kegiatan = pk; },
      call: () => API.run('apiDeleteMateri', id),
      okMsg: 'Materi dihapus.'
    }).catch(() => {});
  },

  targetForm(id, idMateri) {
    const t0 = id ? S.idx.tgt.get(id) : null;
    const mat = S.idx.mat.get(t0 ? t0.ID_Materi : idMateri);
    const m = UI.modal({
      title: (t0 ? 'Ubah' : 'Tambah') + ' Target Pencapaian',
      body: `<p class="muted small mb-3">Materi: <b>${esc(mat.Nama_Materi)}</b> · ${esc(mat.Jenjang)}</p><form id="tgForm" class="form-grid">
        <label class="field"><span class="field-label">Deskripsi target <span class="req">*</span></span><input class="input" name="Deskripsi_Target" maxlength="200" value="${attr(t0 ? t0.Deskripsi_Target : '')}" placeholder="mis. Hafal 10 surat pendek"></label>
        <label class="field"><span class="field-label">Indikator capaian</span><input class="input" name="Indikator" maxlength="300" value="${attr(t0 ? t0.Indikator : '')}" placeholder="mis. Setoran lancar tanpa melihat"></label>
        <div class="form-grid two"><label class="field"><span class="field-label">Batas waktu / semester</span><input class="input" name="Batas_Waktu" maxlength="60" value="${attr(t0 ? t0.Batas_Waktu : 'Semester Ganjil')}"></label>
        <label class="field"><span class="field-label">Status</span><select class="select" name="Status_Aktif">${opt('Aktif', 'Aktif', t0 ? t0.Status_Aktif : 'Aktif')}${opt('Nonaktif', 'Nonaktif', t0 && t0.Status_Aktif)}</select></label></div>
        <div id="tgErr" class="form-error" hidden></div></form>`,
      foot: `<button class="btn btn-light" data-close>Batal</button><button class="btn btn-primary" id="tgSave"><i class="bi bi-check2"></i> Simpan</button>`
    });
    $('#tgSave', m.el).onclick = () => {
      const fd = Object.fromEntries(new FormData($('#tgForm', m.el)).entries());
      if (!fd.Deskripsi_Target.trim()) { const e = $('#tgErr', m.el); e.textContent = 'Deskripsi target wajib diisi.'; e.hidden = false; return; }
      const rec = Object.assign({ ID_Target: t0 ? t0.ID_Target : uid('TGT'), ID_Materi: mat.ID_Materi, Jenjang: mat.Jenjang }, fd);
      m.close();
      const prev = S.d.target;
      App.mutate({ apply: () => Store.upsert('target', rec, 'ID_Target'), rollback: () => { S.d.target = prev; }, call: () => API.run('apiSaveTarget', rec), okMsg: 'Target disimpan.', onSaved: r => Store.upsert('target', r, 'ID_Target') }).catch(() => {});
    };
  }
};

/* ───────────────────────── KEGIATAN ───────────────────────── */
/* ───────────────────────── JADWAL VIA WHATSAPP ───────────────────────── */
const JadwalWA = {
  /** Sesi admin → bentuk umum untuk teks jadwal. */
  item(k) {
    return { Tanggal: k.Tanggal, Waktu_Mulai: k.Waktu_Mulai, Waktu_Selesai: k.Waktu_Selesai, Nama: k.Nama_Kegiatan, Tempat: k.Tempat || '', Ket: k.Keterangan || '',
      Peserta: isGab(k) ? gabJenis(k)[2] : 'Jenjang ' + k.Jenjang + (k.Kelas ? ' kelas ' + k.Kelas : '') + ' · ' + Store.kelName(k.ID_Kelompok),
      Materi: kegMateri(k).map(x => ({ m: x.mat ? x.mat.Nama_Materi : '', p: x.guru || '', d: x.durasi || 0 })).filter(x => x.m || x.p) };
  },
  /** Teks jadwal untuk WhatsApp (format *tebal* & _miring_ WA). */
  text(items, judul) {
    const by = new Map();
    items.slice().sort((a, b) => (a.Tanggal + a.Waktu_Mulai).localeCompare(b.Tanggal + b.Waktu_Mulai)).forEach(x => { if (!by.has(x.Tanggal)) by.set(x.Tanggal, []); by.get(x.Tanggal).push(x); });
    const out = ['*' + (judul || 'JADWAL PENGAJIAN') + '*', '_' + IdCard.org() + '_', ''];
    by.forEach((list, tg) => {
      out.push('📅 *' + D.dayLong(tg) + '*');
      list.forEach(x => {
        out.push('• ' + x.Waktu_Mulai + '–' + x.Waktu_Selesai + ' WIB — *' + x.Nama + '*');
        if (x.Tempat) out.push('   📍 ' + x.Tempat);
        if (x.Peserta) out.push('   👥 ' + x.Peserta);
        x.Materi.forEach((m, i) => out.push('   📖 ' + (x.Materi.length > 1 ? (i + 1) + '. ' : '') + [m.m, m.p].filter(Boolean).join(' — ') + (m.d ? ' (' + m.d + ' mnt)' : '')));
        if (x.Ket) out.push('   📝 ' + x.Ket);
      });
      out.push('');
    });
    out.push('Mohon hadir tepat waktu. Jazakumullahu khoiro.');
    return out.join('\n');
  },
  url(text) { return WA_BASE + '?text=' + encodeURIComponent(text); },
  /** Jendela kirim jadwal: pilih rentang & jenjang, sunting teks, lalu buka WhatsApp atau salin. */
  open(ids) {
    const single = Array.isArray(ids) && ids.length;
    const today = D.today();
    const ranges = [['7', '7 hari ke depan'], ['hari', 'Hari ini'], ['besok', 'Besok'], ['bulan', 'Sisa bulan ini'], ['30', '30 hari ke depan']];
    const pick = (rg, jj) => {
      const end = rg === 'hari' ? today : rg === 'besok' ? D.addDays(today, 1) : rg === 'bulan' ? D.ym(new Date()) + '-31' : D.addDays(today, rg === '30' ? 30 : 7);
      const start = rg === 'besok' ? D.addDays(today, 1) : today;
      return Store.kegScope().filter(k => k.Tanggal >= start && k.Tanggal <= end && (jj === 'ALL' || (jj === GABUNGAN ? isGab(k) : k.Jenjang === jj)));
    };
    const m = UI.modal({ title: 'Kirim Jadwal via WhatsApp', size: 'lg',
      body: `${single ? '' : `<div class="toolbar" style="padding:0;margin-bottom:12px">
          <label class="field" style="flex:1 1 200px"><span class="field-label tiny muted">Rentang</span><select class="select" id="waRange">${ranges.map(([v, l]) => opt(v, l, '7')).join('')}</select></label>
          <label class="field" style="flex:1 1 200px"><span class="field-label tiny muted">Jenjang</span><select class="select" id="waJJ">${opt('ALL', 'Semua jenjang', 'ALL')}${Store.jj().map(j => opt(j, j, 'ALL')).join('')}${opt(GABUNGAN, 'Pengajian Gabungan', 'ALL')}</select></label></div>`}
        <label class="field"><span class="field-label">Pesan <span class="tiny muted" id="waInfo"></span></span><textarea class="textarea mono" id="waText" rows="14" style="font-size:13px;line-height:1.5"></textarea>
          <span class="field-help">Teks bisa disunting sebelum dikirim. <b>Buka WhatsApp</b> lalu pilih kontak atau grup tujuan.</span></label>`,
      foot: `<button class="btn btn-light" data-close>Tutup</button><button class="btn btn-light" id="waCopy"><i class="bi bi-clipboard"></i> Salin Teks</button><a class="btn btn-primary" id="waGo" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i> Buka WhatsApp</a>` });
    const ta = $('#waText', m.el), go = $('#waGo', m.el);
    const sync = () => { go.href = JadwalWA.url(ta.value); $('#waInfo', m.el).textContent = ta.value.length > 3500 ? '· pesan panjang, sebaiknya gunakan Salin Teks' : ''; };
    const build = () => {
      const list = single ? ids.map(id => S.idx.keg.get(id)).filter(Boolean) : pick($('#waRange', m.el).value, $('#waJJ', m.el).value);
      ta.value = list.length ? JadwalWA.text(list.map(JadwalWA.item)) : 'Belum ada jadwal pengajian pada rentang ini.';
      sync();
    };
    ta.oninput = sync;
    if (!single) { $('#waRange', m.el).onchange = build; $('#waJJ', m.el).onchange = build; }
    $('#waCopy', m.el).onclick = async () => {
      try { await navigator.clipboard.writeText(ta.value); UI.toast('Teks jadwal disalin. Tempel di WhatsApp.', 'ok'); }
      catch (e) { ta.select(); try { document.execCommand('copy'); UI.toast('Teks jadwal disalin.', 'ok'); } catch (x) { UI.toast('Salin manual: tekan lama teks lalu pilih Salin.', 'warn'); } }
    };
    build();
  }
};

Pages.kegiatan = {
  absStatus(k) {
    const m = S.idx.abs.get(k.ID_Kegiatan);
    const n = m ? m.size : 0, h = m ? Array.from(m.values()).filter(v => v.s === 'H').length : 0;
    if (!n && !Store.absKnown(k.Tanggal)) return k.Status_Absensi === 'Terkunci' ? '<span class="badge b-ok"><i class="bi bi-lock-fill"></i> Terkunci</span>' : '<span class="badge b-outline" title="Riwayat lama — buka Absensi untuk melihat">Arsip</span>';
    if (k.Status_Absensi === 'Terkunci') return `<span class="badge b-ok"><i class="bi bi-lock-fill"></i> Terkunci · ${h}/${n}</span>`;
    if (n) return `<span class="badge b-warn"><span class="dot"></span>Tersimpan · ${h}/${n}</span>`;
    return k.Tanggal > D.today() ? '<span class="badge b-outline">Terjadwal</span>' : '<span class="badge b-bad"><span class="dot"></span>Belum diabsen</span>';
  },
  render() {
    const f = S.ui.keg, today = D.today(), q = f.q.trim().toLowerCase();
    const list = Store.kegScope().filter(k =>
      (f.bulan === 'ALL' || String(k.Tanggal).slice(0, 7) === f.bulan) && (f.jenjang === 'ALL' || k.Jenjang === f.jenjang) &&
      (f.status === 'ALL' || (f.status === 'up' ? k.Tanggal >= today : f.status === 'todo' ? (k.Tanggal <= today && Store.absKnown(k.Tanggal) && !S.idx.abs.get(k.ID_Kegiatan)) : k.Status_Absensi === 'Terkunci')) &&
      (!q || (k.Nama_Kegiatan + ' ' + k.Tempat + ' ' + k.Pengajar + ' ' + (k.Kelas || '')).toLowerCase().includes(q)));
    const up = list.filter(k => k.Tanggal >= today).sort((a, b) => (a.Tanggal + a.Waktu_Mulai).localeCompare(b.Tanggal + b.Waktu_Mulai));
    const past = list.filter(k => k.Tanggal < today).sort((a, b) => (b.Tanggal + b.Waktu_Mulai).localeCompare(a.Tanggal + a.Waktu_Mulai));
    const all = Stats.kegMonth(f.bulan === 'ALL' ? D.ym(new Date()) : f.bulan);
    const todo = Store.kegScope().filter(k => k.Tanggal <= today && Store.absKnown(k.Tanggal) && !S.idx.abs.get(k.ID_Kegiatan)).length;

    const row = k => {
      const mat = S.idx.mat.get(k.ID_Materi);
      const isToday = k.Tanggal === today;
      return `<tr>
        <td class="td-main"><div class="cell-strong">${isToday ? '<span class="badge b-primary">Hari Ini</span> ' : ''}${D.day(k.Tanggal)}, ${D.short(k.Tanggal)}</div><div class="cell-sub mono">${esc(k.Waktu_Mulai)} – ${esc(k.Waktu_Selesai)} WIB</div></td>
        <td data-label="Kegiatan"><div class="cell-strong">${esc(k.Nama_Kegiatan)}</div>${(k.Jenjang === 'Dewasa' && kegMateri(k).length > 1) || susunan(k).length ? kegMateri(k).map((x, i) => `<div class="cell-sub"><i class="bi bi-${i + 1}-circle"></i> ${esc(x.mat ? x.mat.Nama_Materi : '–')} · <b>${esc(x.guru || '–')}</b>${x.durasi ? ' · ' + menit(x.durasi) : ''}</div>`).join('') : isGab(k) ? '<div class="cell-sub">Materi belum diisi</div>' : `<div class="cell-sub">${mat ? '<i class="bi bi-book"></i> ' + esc(mat.Nama_Materi) : 'Tanpa materi kurikulum'}</div>`}</td>
        <td data-label="Jenjang">${jjBadge(k.Jenjang)}${isGab(k) ? `<div class="tiny muted mt-1"><i class="bi ${gabJenis(k)[3]}"></i> ${esc(gabJenis(k)[2])}${tambahan(k).length ? ' + ' + tambahan(k).length + ' tambahan' : ''}</div>` : ''}${k.Jenjang === 'Caberawit' ? `<div class="mt-1">${k.Kelas ? kelasBadge(k.Kelas) : '<span class="tiny faint">Semua kelas</span>'}</div>` : ''}</td>
        <td data-label="Kelompok"><div class="cell-strong">${esc(Store.kelName(k.ID_Kelompok))}</div><div class="cell-sub">${esc(k.Tempat || '')}</div></td>
        <td data-label="Pengajar">${esc(kegMateri(k).map(x => x.guru).filter(Boolean).join(', ') || '–')}</td>
        <td data-label="Absensi">${Pages.kegiatan.absStatus(k)}</td>
        <td class="actions"><button class="btn btn-soft btn-sm" onclick="S.ui.abs.kegId='${k.ID_Kegiatan}';Router.go('absensi')"><i class="bi bi-clipboard-check"></i> Absensi</button><button class="icon-btn sm" aria-label="Kirim jadwal sesi ini via WhatsApp" title="Kirim via WA" onclick="JadwalWA.open(['${k.ID_Kegiatan}'])"><i class="bi bi-whatsapp" style="color:#25D366"></i></button>
          ${(isGab(k) ? !Store.canGab() : Store.isPenerobos() || (Store.isGuru() && !Store.guruJJ().includes(k.Jenjang))) ? '' : `<button class="icon-btn sm" aria-label="Ubah kegiatan" onclick="Pages.kegiatan.form('${k.ID_Kegiatan}')"><i class="bi bi-pencil"></i></button><button class="icon-btn sm" aria-label="Hapus sesi" title="Hapus sesi" onclick="Pages.kegiatan.remove('${k.ID_Kegiatan}')"><i class="bi bi-trash3" style="color:var(--bad)"></i></button>`}</td></tr>`;
    };
    const table = (title, rows, icon) => `<div class="card flush section-gap"><div class="card-head" style="padding:18px 20px 0"><div class="card-title"><i class="bi ${icon}"></i> ${title} <span class="badge b-outline">${rows.length}</span></div></div>
      ${rows.length ? `<div class="table-wrap"><table class="table stack"><thead><tr><th>Tanggal & Waktu</th><th>Kegiatan & Materi</th><th>Jenjang</th><th>Kelompok & Tempat</th><th>Pengajar</th><th>Absensi</th><th class="actions">Aksi</th></tr></thead><tbody>${rows.map(row).join('')}</tbody></table></div>` : emptyState('bi-calendar', 'Tidak ada kegiatan.')}</div>`;

    $('#page-kegiatan').innerHTML = pageHead('Pembinaan & Kegiatan <i class="bi bi-chevron-right"></i> <b>Kegiatan & Jadwal</b>', 'Kegiatan & Jadwal Pengajian',
      'Jadwal sesi pengajian per jenjang dan kelompok, lengkap dengan materi yang diajarkan.',
      (Store.canGab() ? `<button class="btn btn-gold" onclick="S.ui.kegGab=true;Pages.kegiatan.form()"><i class="bi bi-people-fill"></i> Pengajian Gabungan</button>` : '') +
      `<button class="btn btn-light" onclick="JadwalWA.open()"><i class="bi bi-whatsapp" style="color:#25D366"></i> Kirim Jadwal via WA</button>${Store.isPenerobos() ? '' : '<button class="btn btn-primary" onclick="Pages.kegiatan.form()"><i class="bi bi-plus-lg"></i> Sesi Baru</button>'}`) + `
      <div class="grid-4">
        <div class="card kpi compact"><div class="kpi-label">Sesi Periode Ini</div><div class="kpi-icon"><i class="bi bi-calendar3"></i></div><div class="kpi-value">${all.length}</div><div class="kpi-foot"><span>${Stats.held(all).length} terlaksana</span><span>${all.length - Stats.held(all).length} terjadwal</span></div></div>
        <div class="card kpi compact"><div class="kpi-label">Jadwal Mendatang</div><div class="kpi-icon"><i class="bi bi-calendar-plus"></i></div><div class="kpi-value">${Store.kegScope().filter(k => k.Tanggal >= today).length}</div><div class="kpi-foot"><span>Mulai hari ini</span></div></div>
        <div class="card kpi compact"><div class="kpi-label">Belum Diabsen</div><div class="kpi-icon ${todo ? 'bad' : ''}"><i class="bi bi-clipboard-x"></i></div><div class="kpi-value">${todo}</div><div class="kpi-foot"><button class="btn btn-light btn-sm" onclick="S.ui.keg.status='todo';S.ui.keg.bulan='ALL';Pages.kegiatan.render()">Tampilkan</button></div></div>
        <div class="card kpi compact"><div class="kpi-label">Kehadiran Periode</div><div class="kpi-icon gold"><i class="bi bi-check2-circle"></i></div><div class="kpi-value">${F.pct(Stats.att(Stats.held(all)).pct)}</div><div class="kpi-foot"><span>${esc(f.bulan === 'ALL' ? D.monthLabel(D.ym(new Date())) : D.monthLabel(f.bulan))}</span></div></div>
      </div>
      <div class="card section-gap"><div class="toolbar">
        <label class="search-input"><i class="bi bi-search"></i><input class="input" id="kgSearch" placeholder="Cari kegiatan, tempat, pengajar…" value="${attr(f.q)}"></label>
        <select class="select" onchange="S.ui.keg.bulan=this.value;Pages.kegiatan.render()" aria-label="Bulan">${opt('ALL', 'Semua Bulan', f.bulan)}${monthOptions(f.bulan)}</select>
        <select class="select" onchange="S.ui.keg.jenjang=this.value;Pages.kegiatan.render()" aria-label="Jenjang">${opt('ALL', 'Semua Jenjang', f.jenjang)}${Store.jjAbs().concat([GABUNGAN]).map(j => opt(j, j, f.jenjang)).join('')}</select>
        <select class="select" onchange="S.ui.keg.status=this.value;Pages.kegiatan.render()" aria-label="Status">${opt('ALL', 'Semua Status', f.status)}${opt('up', 'Mendatang', f.status)}${opt('todo', 'Belum diabsen', f.status)}${opt('lock', 'Terkunci', f.status)}</select>
      </div></div>
      ${up.length || f.status === 'up' ? table('Jadwal Mendatang', up, 'bi-calendar-event') : ''}
      ${f.status !== 'up' ? table('Sesi Terlaksana', past, 'bi-calendar-check') : ''}`;
    $('#kgSearch').addEventListener('input', debounce(e => { S.ui.keg.q = e.target.value; const pos = e.target.selectionStart; Pages.kegiatan.render(); const i = $('#kgSearch'); i.focus(); i.setSelectionRange(pos, pos); }, 250));
  },

  async remove(id) {
    const k = S.idx.keg.get(id);
    if (!k) return;
    if (k.Status_Absensi === 'Terkunci' && !Store.isAdm() && !(isGab(k) && Store.canGab())) { UI.toast('Absensi sesi ini sudah dikunci. Minta Master Admin / Admin PPG membuka kunci sebelum menghapus.', 'warn'); return; }
    const nAbs = (S.idx.abs.get(id) || new Map()).size, inf = S.idx.infKeg.get(id);
    const info = [nAbs ? `<b>${nAbs} data absensi</b>` : !Store.absKnown(k.Tanggal) ? '<b>seluruh data absensi</b>' : '', inf ? `<b>infaq ${F.rp(inf.Jumlah)}</b>` : ''].filter(Boolean).join(' dan ');
    if (!(await UI.confirm(`Hapus sesi <b>${esc(k.Nama_Kegiatan)}</b> (${D.short(k.Tanggal)} ${esc(k.Waktu_Mulai)})?${info ? ' ' + info + ' sesi ini ikut terhapus.' : ''} Tindakan ini tidak bisa dikembalikan.`, { ok: 'Hapus Sesi', danger: true }))) return;
    const pk = S.d.kegiatan, pa = S.d.absensi, pi = S.d.infaq;
    App.mutate({
      apply: () => {
        S.d.kegiatan = pk.filter(x => x.ID_Kegiatan !== id); S.d.absensi = pa.filter(a => a[0] !== id); S.d.infaq = pi.filter(i => i.ID_Kegiatan !== id);
        LS.del('an_draft_' + id); delete S.absDraft[id];
        if (S.ui.abs.kegId === id) S.ui.abs.kegId = null;
      },
      rollback: () => { S.d.kegiatan = pk; S.d.absensi = pa; S.d.infaq = pi; },
      call: () => API.run('apiDeleteKegiatan', id),
      okMsg: 'Sesi pengajian dihapus.'
    }).catch(() => {});
  },

  form(id) {
    const k0 = id ? S.idx.keg.get(id) : null;
    const master = Store.allKel(), pusat = Store.canGab();
    const defKel = k0 ? k0.ID_Kelompok : (Store.scopeKel() !== 'ALL' ? Store.scopeKel() : (S.d.kelompok[0] || {}).ID_Kelompok);
    const m = UI.modal({
      title: k0 ? 'Ubah Sesi Pengajian' : 'Buat Sesi Pengajian', size: 'lg',
      body: `<form id="kgForm" class="form-grid two" novalidate>
        <label class="field"><span class="field-label">Jenjang <span class="req">*</span></span><select class="select" name="Jenjang">${((k0 && isGab(k0)) || Store.isPenerobos() ? [GABUNGAN] : Store.jj().concat(pusat && !k0 ? [GABUNGAN] : [])).map(j => opt(j, j === GABUNGAN ? 'Pengajian Gabungan (pilih jenis)' : j, k0 ? k0.Jenjang : (S.ui.kegGab ? GABUNGAN : 'Caberawit'))).join('')}</select></label>
        <label class="field" id="kgKelField"><span class="field-label">Kelompok <span class="req">*</span></span>${master ? `<select class="select" name="ID_Kelompok">${kelOptions(defKel)}</select>` : `<input class="input" readonly value="${attr(Store.kelName(Store.myKel()))}">`}</label>
        <label class="field span-2" id="kgKelasField" ${(k0 ? k0.Jenjang : 'Caberawit') === 'Caberawit' ? '' : 'hidden'}><span class="field-label">Kelas Caberawit</span><select class="select" name="Kelas">${opt('', 'Semua kelas (A1–A6)', k0 ? k0.Kelas : '')}${KELAS.map(x => opt(x, 'Kelas ' + x, k0 ? k0.Kelas : '')).join('')}</select><span class="field-help">Pilih satu kelas agar daftar absensi hanya berisi jamaah kelas tersebut.</span></label>
        <div class="field span-2" id="kgGabField" hidden><span class="field-label">Nama / jenis pengajian gabungan <span class="req">*</span></span>
          <div class="gab-pick">${GAB_JENIS.map(([v, l, ket, ic]) => `<label class="gab-opt"><input type="radio" name="Jenis_Gabungan" value="${v}" ${(k0 ? (k0.Jenis_Gabungan || 'UMUM') : 'MUDAMUDI') === v ? 'checked' : ''}><span class="gab-ic"><i class="bi ${ic}"></i></span><span class="grow"><b>${esc(l)}</b><small>${esc(ket)}</small></span><span class="gab-n" data-n="${v}"></span></label>`).join('')}</div>
          <span class="field-help">Daftar absen otomatis hanya berisi peserta sesuai jenisnya (jamaah aktif semua kelompok). Tanpa infaq kelompok.</span>
          <div class="pt-box mt-3"><div class="row" style="margin-bottom:6px"><span class="field-label grow" style="margin:0"><i class="bi bi-person-plus"></i> Peserta tambahan <span class="tiny muted">(opsional · di luar kriteria jenis)</span></span><span class="tiny muted" id="kgPtN"></span></div>
            <div class="pt-search"><label class="search-input"><i class="bi bi-search"></i><input class="input" id="kgPtQ" placeholder="Cari nama atau ID jamaah untuk ditambahkan…" autocomplete="off"></label><div class="pt-res" id="kgPtRes" hidden></div></div>
            <div class="pt-chips mt-2" id="kgPtChips"></div></div></div>
        <div class="field span-2" id="kgSusField" hidden><div class="row" style="margin-bottom:6px"><span class="field-label grow" style="margin:0">Materi pengajian, pengajar & durasi <span class="req">*</span></span><span class="tiny" id="kgSusTot"></span></div>
          <div class="sus-head" aria-hidden="true"><span>#</span><span>Materi pengajian</span><span>Pengajar</span><span>Durasi (menit)</span><span></span></div>
          <div id="kgSusRows" class="sus-rows"></div>
          <button type="button" class="btn btn-light btn-sm mt-2" id="kgSusAdd"><i class="bi bi-plus-lg"></i> Tambah Materi</button>
          <span class="field-help">Diisi manual. Urutan materi = urutan penyampaian; total durasi sebaiknya tidak melebihi waktu sesi.</span></div>
        <div class="span-2" id="kgDwsField" hidden><div class="field-label mb-2">Materi pengajian umum (Dewasa) — maks. 3 materi, guru berbeda</div>
          ${[1, 2, 3].map(n => { const sfx = n === 1 ? '' : '_' + n; return `<div class="form-grid two mb-2"><label class="field"><span class="field-label small">Materi ${n}${n === 1 ? ' <span class="req">*</span>' : ''}</span><select class="select" name="DM${n}" data-cur="${attr(k0 ? (k0['ID_Materi' + sfx] || '') : '')}"></select></label>
            <label class="field"><span class="field-label small">Guru materi ${n}${n === 1 ? ' <span class="req">*</span>' : ''}</span><input class="input" name="DP${n}" maxlength="100" list="pjList" value="${attr(k0 && k0.Jenjang === 'Dewasa' ? (k0['Pengajar' + sfx] || '') : '')}" placeholder="Nama guru / ustadz"></label></div>`; }).join('')}
        </div>
        <label class="field span-2" id="kgMatField"><span class="field-label">Materi kurikulum</span><select class="select" name="ID_Materi" id="kgMateri"></select><span class="field-help" id="kgMatHelp"></span></label>
        <label class="field span-2" id="kgNamaField"><span class="field-label">Nama kegiatan <span class="req">*</span></span><input class="input" name="Nama_Kegiatan" maxlength="150" value="${attr(k0 ? k0.Nama_Kegiatan : '')}" placeholder="mis. Halaqah Caberawit Sore — Tahsin Juz 30"></label>
        <label class="field"><span class="field-label">Tanggal <span class="req">*</span></span><input class="input" type="date" name="Tanggal" value="${attr(k0 ? k0.Tanggal : D.today())}"></label>
        <div class="form-grid two"><label class="field"><span class="field-label">Mulai <span class="req">*</span></span><input class="input" type="time" name="Waktu_Mulai" value="${attr(k0 ? k0.Waktu_Mulai : '16:00')}"></label>
          <label class="field"><span class="field-label">Selesai <span class="req">*</span></span><input class="input" type="time" name="Waktu_Selesai" value="${attr(k0 ? k0.Waktu_Selesai : '17:30')}"></label></div>
        <label class="field"><span class="field-label">Tempat</span><input class="input" name="Tempat" maxlength="150" list="tmpList" value="${attr(k0 ? k0.Tempat : '')}"><datalist id="tmpList">${[...new Set(S.d.kegiatan.map(x => x.Tempat).filter(Boolean))].map(x => `<option value="${attr(x)}">`).join('')}</datalist></label>
        <label class="field" id="kgPjField"><span class="field-label">Pengajar</span><input class="input" name="Pengajar" maxlength="100" list="pjList" value="${attr(k0 ? k0.Pengajar : '')}"><datalist id="pjList">${[...new Set(S.d.kegiatan.map(x => x.Pengajar).filter(Boolean))].map(x => `<option value="${attr(x)}">`).join('')}</datalist></label>
        <label class="field span-2"><span class="field-label">Keterangan</span><textarea class="textarea" name="Keterangan" maxlength="500" rows="2">${esc(k0 ? k0.Keterangan : '')}</textarea></label>
        <div id="kgErr" class="form-error span-2" hidden></div></form>`,
      foot: `<button class="btn btn-light" data-close>Batal</button><button class="btn btn-primary" id="kgSave"><i class="bi bi-check2"></i> Simpan Sesi</button>`
    });
    const form = $('#kgForm', m.el);
    let autoName = !k0;
    const fillMateri = () => {
      const jj = form.Jenjang.value, kel = master ? form.ID_Kelompok.value : Store.myKel();
      const kl = jj === 'Caberawit' ? form.Kelas.value : '';
      const mats = S.d.materi.filter(x => x.Jenjang === jj && x.Status_Aktif !== 'Nonaktif' && (jj !== 'Dewasa' || x.ID_Kelompok === kel) && (!kl || !x.Kelas || x.Kelas === kl)
        && (x.Pengelola !== 'Ekskul' || !x.ID_Kelompok || x.ID_Kelompok === KEL_SEMUA || x.ID_Kelompok === kel));
      const pusat = mats.filter(x => x.Pengelola !== 'Ekskul'), eks = mats.filter(x => x.Pengelola === 'Ekskul');
      const og = (label, arr) => arr.length ? `<optgroup label="${attr(label)}">${arr.map(x => opt(x.ID_Materi, `${x.Kategori} · ${x.Nama_Materi}`, k0 ? k0.ID_Materi : '')).join('')}</optgroup>` : '';
      $('#kgMateri', m.el).innerHTML = opt('', '— Tanpa materi kurikulum —', '') + (eks.length ? og('Kurikulum pusat', pusat) + og('Ekstrakurikuler', eks) : pusat.map(x => opt(x.ID_Materi, `${x.Kategori} · ${x.Nama_Materi}`, k0 ? k0.ID_Materi : '')).join(''));
      if (jj === 'Dewasa') [1, 2, 3].forEach(n => { const sel = form['DM' + n]; const cur = sel.value || sel.dataset.cur; sel.innerHTML = opt('', n === 1 ? '— Pilih materi —' : '— Tidak ada —', '') + mats.map(x => opt(x.ID_Materi, `${x.Kategori} · ${x.Nama_Materi}`, cur)).join(''); });
      $('#kgMatHelp', m.el).textContent = jj === 'Dewasa' ? 'Materi Dewasa berasal dari kurikulum kelompok.' : 'Materi dari kurikulum pusat atau ekstrakurikuler.';
    };
    const autoFill = () => {
      if (!autoName) return;
      const mat = S.idx.mat.get(form.Jenjang.value === 'Dewasa' ? form.DM1.value : form.ID_Materi.value);
      const kl = form.Jenjang.value === 'Caberawit' && form.Kelas.value ? ' ' + form.Kelas.value : '';
      if (form.Jenjang.value === GABUNGAN) { const g = GAB_JENIS.find(x => x[0] === (form.Jenis_Gabungan.value || 'UMUM')); form.Nama_Kegiatan.value = g[1]; return; }
      if (form.Jenjang.value === 'Dewasa') { form.Nama_Kegiatan.value = 'Pengajian Umum Dewasa'; return; }
      form.Nama_Kegiatan.value = (form.Jenjang.value === 'Dewasa' ? 'Kajian Dewasa' : 'Halaqah ' + form.Jenjang.value + kl) + (mat ? ' — ' + mat.Nama_Materi : '');
    };
    form.Nama_Kegiatan.addEventListener('input', () => { autoName = false; });
    const toggleKelas = () => {
      const g = form.Jenjang.value === GABUNGAN;
      $('#kgKelasField', m.el).hidden = form.Jenjang.value !== 'Caberawit';
      const dw = form.Jenjang.value === 'Dewasa';
      $('#kgKelField', m.el).hidden = g; $('#kgMatField', m.el).hidden = g || dw; $('#kgGabField', m.el).hidden = !g; $('#kgSusField', m.el).hidden = !g;
      if (g) $('#kgPjField', m.el).hidden = true;
      // nama mengikuti jenis gabungan (kecuali gabungan umum yang boleh diberi nama sendiri)
      $('#kgNamaField', m.el).hidden = g && form.Jenis_Gabungan.value !== 'UMUM';
      $('#kgDwsField', m.el).hidden = !dw; if (!g) $('#kgPjField', m.el).hidden = dw;
    };
    form.Jenjang.addEventListener('change', () => { toggleKelas(); fillMateri(); autoFill(); });
    form.Kelas.addEventListener('change', () => { fillMateri(); autoFill(); });
    if (master) form.ID_Kelompok.addEventListener('change', () => { fillMateri(); autoFill(); });
    form.ID_Materi.addEventListener('change', autoFill);
    form.DM1.addEventListener('change', autoFill);
    // susunan materi manual (gabungan)
    const susRows = $('#kgSusRows', m.el);
    const susTot = () => {
      const tot = $$('.sus-row', susRows).reduce((a, r) => a + (parseInt(r.querySelector('[data-f=d]').value, 10) || 0), 0);
      const ses = durasiSesi({ Waktu_Mulai: form.Waktu_Mulai.value, Waktu_Selesai: form.Waktu_Selesai.value });
      const el = $('#kgSusTot', m.el); el.innerHTML = `Total <b>${menit(tot)}</b> · waktu sesi ${menit(ses)}`;
      el.style.color = tot > ses && ses ? 'var(--bad)' : 'var(--muted)';
      $$('.sus-row', susRows).forEach((r, i) => { r.querySelector('.sus-no').textContent = i + 1; });
    };
    const susAdd = (x = {}) => {
      if ($$('.sus-row', susRows).length >= 8) { UI.toast('Maksimal 8 materi per sesi.', 'warn'); return; }
      const r = document.createElement('div'); r.className = 'sus-row';
      r.innerHTML = `<span class="sus-no"></span><input class="input" data-f="m" maxlength="150" placeholder="mis. Nasehat Kefahaman Agama" aria-label="Materi pengajian" value="${attr(x.m || '')}">
        <input class="input" data-f="p" maxlength="100" list="pjList" placeholder="Nama pengajar / ustadz" aria-label="Pengajar" value="${attr(x.p || '')}">
        <input class="input" data-f="d" type="number" min="5" max="600" step="5" inputmode="numeric" placeholder="30" aria-label="Durasi menit" value="${attr(x.d || '')}">
        <button type="button" class="icon-btn sm" aria-label="Hapus materi"><i class="bi bi-trash3" style="color:var(--bad)"></i></button>`;
      r.querySelector('button').onclick = () => { r.remove(); if (!$$('.sus-row', susRows).length) susAdd(); susTot(); };
      r.querySelector('[data-f=d]').addEventListener('input', susTot);
      susRows.appendChild(r); susTot();
    };
    (susunan(k0).length ? susunan(k0) : [{}]).forEach(x => susAdd(x));
    $('#kgSusAdd', m.el).onclick = () => { susAdd(); const l = $$('.sus-row', susRows).pop(); l && l.querySelector('input').focus(); };
    [form.Waktu_Mulai, form.Waktu_Selesai].forEach(i => i.addEventListener('change', susTot));
    // peserta tambahan manual (gabungan)
    let pt = tambahan(k0);
    const ptDraw = () => {
      const jenis = form.Jenis_Gabungan.value || 'UMUM';
      $('#kgPtChips', m.el).innerHTML = pt.length ? pt.map(id => { const j = S.idx.jam.get(id); return `<span class="pt-chip">${esc(j ? j.Nama_Lengkap : id)}<small>${esc(j ? j.Jenjang + ' · ' + Store.kelName(j.ID_Kelompok) : 'tidak ditemukan')}</small>${j && gabCocok(jenis, j) ? '<small class="pt-dup">sudah termasuk</small>' : ''}<button type="button" aria-label="Hapus ${attr(j ? j.Nama_Lengkap : id)}" data-rm="${attr(id)}">×</button></span>`; }).join('') : '<span class="tiny muted">Belum ada peserta tambahan.</span>';
      $('#kgPtN', m.el).textContent = pt.length ? pt.length + ' ditambahkan' : '';
      $$('[data-rm]', m.el).forEach(b => b.onclick = () => { pt = pt.filter(x => x !== b.dataset.rm); ptDraw(); });
    };
    const ptQ = $('#kgPtQ', m.el), ptRes = $('#kgPtRes', m.el);
    ptQ.addEventListener('input', debounce(() => {
      const q = ptQ.value.trim().toLowerCase(), jenis = form.Jenis_Gabungan.value || 'UMUM';
      if (q.length < 2) { ptRes.hidden = true; return; }
      const hits = S.d.jamaah.filter(j => j.Status_Aktif === 'Aktif' && !pt.includes(j.ID_Jamaah) && (j.Nama_Lengkap + ' ' + j.ID_Jamaah).toLowerCase().includes(q)).slice(0, 8);
      ptRes.innerHTML = hits.length ? hits.map(j => `<button type="button" class="pt-hit" data-add="${attr(j.ID_Jamaah)}"><b>${esc(j.Nama_Lengkap)}</b><span>${esc(j.ID_Jamaah)} · ${esc(j.Jenjang)} · ${esc(Store.kelName(j.ID_Kelompok))}${gabCocok(jenis, j) ? ' · sudah termasuk' : ''}</span></button>`).join('') : '<div class="tiny muted" style="padding:10px">Tidak ditemukan.</div>';
      ptRes.hidden = false;
      $$('[data-add]', ptRes).forEach(b => b.onclick = () => { pt.push(b.dataset.add); ptQ.value = ''; ptRes.hidden = true; ptDraw(); ptQ.focus(); });
    }, 150));
    ptQ.addEventListener('keydown', e => { if (e.key === 'Escape') ptRes.hidden = true; if (e.key === 'Enter') { e.preventDefault(); const f = $('[data-add]', ptRes); if (f) f.click(); } });
    ptDraw();
    $$('[name=Jenis_Gabungan]', m.el).forEach(r => r.addEventListener('change', ptDraw));
    $$('[name=Jenis_Gabungan]', m.el).forEach(r => r.addEventListener('change', () => { if (form.Jenis_Gabungan.value !== 'UMUM') autoName = true; toggleKelas(); autoFill(); }));
    { const aktif = S.d.jamaah.filter(j => j.Status_Aktif === 'Aktif'); $$('.gab-n', m.el).forEach(el => { const n = aktif.filter(j => gabCocok(el.dataset.n, j)).length; el.textContent = n + ' peserta'; }); }
    fillMateri(); toggleKelas(); if (!k0) autoFill();
    S.ui.kegGab = false;

    $('#kgSave', m.el).onclick = () => {
      const fd = Object.fromEntries(new FormData(form).entries());
      const e = $('#kgErr', m.el);
      const bad = !fd.Nama_Kegiatan.trim() ? 'Nama kegiatan wajib diisi.' : !fd.Tanggal ? 'Tanggal wajib diisi.' : (!fd.Waktu_Mulai || !fd.Waktu_Selesai) ? 'Waktu wajib diisi.' : fd.Waktu_Selesai <= fd.Waktu_Mulai ? 'Waktu selesai harus setelah waktu mulai.' : '';
      let dws = null;
      if (!bad && fd.Jenjang === 'Dewasa') {
        dws = [1, 2, 3].map(n => ({ m: fd['DM' + n] || '', p: (fd['DP' + n] || '').trim() })).filter(s => s.m || s.p);
        const gs = dws.map(s => s.p.toLowerCase());
        const err = !dws.length ? 'Isi minimal Materi 1 beserta gurunya.' : dws.some(s => !s.m || !s.p) ? 'Setiap materi yang diisi wajib punya materi dan guru.'
          : new Set(gs).size !== gs.length ? 'Setiap materi harus dibawakan guru yang berbeda.' : new Set(dws.map(s => s.m)).size !== dws.length ? 'Materi yang sama dipilih lebih dari sekali.' : '';
        if (err) { e.textContent = err; e.hidden = false; return; }
      }
      if (bad) { e.textContent = bad; e.hidden = false; return; }
      let sus = null;
      if (fd.Jenjang === GABUNGAN) {
        sus = $$('.sus-row', susRows).map(r => ({ m: r.querySelector('[data-f=m]').value.replace(/\s+/g, ' ').trim(), p: r.querySelector('[data-f=p]').value.replace(/\s+/g, ' ').trim(), d: parseInt(r.querySelector('[data-f=d]').value, 10) || 0 })).filter(x => x.m || x.p || x.d);
        const i = sus.findIndex(x => !x.m || !x.p || x.d < 5 || x.d > 600);
        const err = !sus.length ? 'Isi minimal satu materi pengajian beserta pengajar dan durasinya.' : i >= 0 ? `Materi ${i + 1}: isi nama materi, pengajar, dan durasi (5–600 menit).` : '';
        if (err) { e.textContent = err; e.hidden = false; const r = $$('.sus-row', susRows)[Math.max(0, i)]; r && r.querySelector('input').focus(); return; }
      }
      ['DM1', 'DM2', 'DM3', 'DP1', 'DP2', 'DP3'].forEach(x => delete fd[x]);
      if (dws) { const sl = i => dws[i] || { m: '', p: '' }; Object.assign(fd, { ID_Materi: sl(0).m, Pengajar: sl(0).p, ID_Materi_2: sl(1).m, Pengajar_2: sl(1).p, ID_Materi_3: sl(2).m, Pengajar_3: sl(2).p }); }
      else Object.assign(fd, { ID_Materi_2: '', Pengajar_2: '', ID_Materi_3: '', Pengajar_3: '' });
      const rec = Object.assign({ ID_Kegiatan: k0 ? k0.ID_Kegiatan : uid('KGT'), Status_Absensi: k0 ? k0.Status_Absensi : 'Terbuka' }, fd, { ID_Kelompok: fd.Jenjang === GABUNGAN ? KEL_SEMUA : master ? fd.ID_Kelompok : Store.myKel(), Kelas: fd.Jenjang === 'Caberawit' ? (fd.Kelas || '') : '' });
      if (fd.Jenjang === GABUNGAN) { rec.ID_Materi = ''; rec.Jenis_Gabungan = form.Jenis_Gabungan.value || 'UMUM'; rec.Susunan_Materi = JSON.stringify(sus); rec.Peserta_Tambahan = pt.join(','); rec.Pengajar = [...new Set(sus.map(x => x.p))].join(', ').slice(0, 100); if (rec.Jenis_Gabungan !== 'UMUM') rec.Nama_Kegiatan = gabJenis(rec)[1]; }
      else { rec.Jenis_Gabungan = ''; rec.Susunan_Materi = ''; rec.Peserta_Tambahan = ''; }
      m.close();
      const prev = S.d.kegiatan;
      App.mutate({
        apply: () => Store.upsert('kegiatan', rec, 'ID_Kegiatan'), rollback: () => { S.d.kegiatan = prev; },
        call: () => API.run('apiSaveKegiatan', rec), okMsg: k0 ? 'Sesi diperbarui.' : 'Sesi pengajian dibuat.', onSaved: r => Store.upsert('kegiatan', r, 'ID_Kegiatan')
      }).catch(() => {});
    };
  }
};
/* ───────────────────────── ABSENSI CEPAT ───────────────────────── */
Pages.absensi = {
  pickDefault() {
    const list = Store.kegScope();
    if (!list.length) return null;
    const today = D.today();
    const t = list.filter(k => k.Tanggal === today).sort((a, b) => a.Waktu_Mulai.localeCompare(b.Waktu_Mulai));
    if (t.length) return t[0].ID_Kegiatan;
    const pastOpen = list.filter(k => k.Tanggal < today && k.Status_Absensi !== 'Terkunci').sort((a, b) => b.Tanggal.localeCompare(a.Tanggal));
    if (pastOpen.length) return pastOpen[0].ID_Kegiatan;
    const up = list.filter(k => k.Tanggal > today).sort((a, b) => a.Tanggal.localeCompare(b.Tanggal));
    return (up[0] || list.sort((a, b) => b.Tanggal.localeCompare(a.Tanggal))[0]).ID_Kegiatan;
  },
  roster(k) {
    const m = S.idx.abs.get(k.ID_Kegiatan) || new Map();
    if (isGab(k)) { // gabungan: semua jamaah aktif (admin kelompok hanya melihat jamaahnya)
      const gk = S.ui.abs.gk || 'ALL', gj = S.ui.abs.gj || 'ALL';
      const jenis = k.Jenis_Gabungan || 'UMUM';
      return S.d.jamaah.filter(j => ((j.Status_Aktif === 'Aktif' && gabPeserta(k, j)) || m.has(j.ID_Jamaah)) && (Store.allKel() || j.ID_Kelompok === Store.myKel()))
        .filter(j => (gk === 'ALL' || j.ID_Kelompok === gk) && (gj === 'ALL' || j.Jenjang === gj))
        .sort((a, b) => Store.kelName(a.ID_Kelompok).localeCompare(Store.kelName(b.ID_Kelompok)) || JENJANG.indexOf(a.Jenjang) - JENJANG.indexOf(b.Jenjang) || a.Nama_Lengkap.localeCompare(b.Nama_Lengkap));
    }
    return S.d.jamaah.filter(j => j.ID_Kelompok === k.ID_Kelompok && ((j.Jenjang === k.Jenjang && j.Status_Aktif === 'Aktif' && (!k.Kelas || j.Kelas === k.Kelas)) || m.has(j.ID_Jamaah)))
      .sort((a, b) => a.Nama_Lengkap.localeCompare(b.Nama_Lengkap));
  },
  /** Draf lokal per kegiatan (autosave localStorage) — tidak hilang saat pindah halaman/refresh. */
  /** Draf = data server terbaru (termasuk absen mandiri yang masuk) + perubahan lokal yang belum dikirim. */
  draft(k) {
    const prev = S.absDraft[k.ID_Kegiatan];
    const m = S.idx.abs.get(k.ID_Kegiatan) || new Map();
    const d = {};
    m.forEach((v, jid) => { d[jid] = { s: v.s, c: v.c || '', m: v.m }; });
    if (prev) Object.keys(prev).forEach(jid => { if (prev[jid].dirty) d[jid] = prev[jid]; });
    else { const saved = LS.json('an_draft_' + k.ID_Kegiatan); if (saved) Object.keys(saved).forEach(jid => { d[jid] = Object.assign({ dirty: true }, saved[jid]); }); }
    S.absDraft[k.ID_Kegiatan] = d;
    return d;
  },
  /** Layar penuh berisi kode absen untuk ditayangkan di lokasi (proyektor/HP pengurus). */
  showKode(id) {
    const k = S.idx.keg.get(id);
    UI.modal({ title: 'Kode Absen Mandiri', size: 'lg',
      body: `<div class="center"><div class="muted">${esc(k.Nama_Kegiatan)} · ${esc(D.long(k.Tanggal))} ${esc(k.Waktu_Mulai)}</div>
        <div class="kode-big mono">${esc(k.Kode_Absen)}</div>
        <div class="muted">Buka aplikasi Ayo Ngaji → pilih <b>Jamaah</b> → masuk dengan ID & PIN → masukkan kode di atas.</div>
        <div class="tiny muted mt-2">Absen dibuka 60 menit sebelum mulai sampai 60 menit setelah selesai.</div></div>`,
      foot: '<button class="btn btn-primary" data-close>Tutup</button>' });
  },
  saveDraftLocal(k) {
    const d = S.absDraft[k.ID_Kegiatan], dirty = {};
    Object.keys(d).forEach(j => { if (d[j].dirty) dirty[j] = { s: d[j].s, c: d[j].c }; });
    if (Object.keys(dirty).length) LS.setJson('an_draft_' + k.ID_Kegiatan, dirty); else LS.del('an_draft_' + k.ID_Kegiatan);
  },
  locked(k) { return !Store.isAdm() && !(isGab(k) && Store.isPenerobos()) && k.Status_Absensi === 'Terkunci'; },

  render() {
    const el = $('#page-absensi');
    if (!S.ui.abs.kegId || !S.idx.keg.has(S.ui.abs.kegId) || !Store.inScope(S.idx.keg.get(S.ui.abs.kegId))) S.ui.abs.kegId = Pages.absensi.pickDefault();
    const k = S.idx.keg.get(S.ui.abs.kegId);
    if (k && !Store.absGate(k.Tanggal, () => { if (S.page === 'absensi') Pages.absensi.render(); }, el)) return;
    const head = pageHead('Kegiatan <i class="bi bi-chevron-right"></i> <b>Absensi Cepat</b>', 'Kegiatan Pengajian & Lembar Absensi Cepat',
      'Pencatatan kehadiran jamaah per jenjang & kelompok. Ketuk H/I/S/A — tersimpan sebagai draf di perangkat, lalu kirim sekaligus ke Google Sheets.',
      k ? `<button class="btn btn-light" onclick="Pages.absensi.pickSession()"><i class="bi bi-arrow-left-right"></i> Pilih Sesi Lain</button>
           <button class="btn btn-light" onclick="Pages.laporan.pdf('absensi',{bulan:'${String(k.Tanggal).slice(0, 7)}',Jenjang:'${k.Jenjang}',ID_Kelompok:'${k.ID_Kelompok}'},this)"><i class="bi bi-file-earmark-pdf"></i> Rekap PDF</button>
           <button class="btn btn-primary" onclick="Pages.kegiatan.form()"><i class="bi bi-plus-circle"></i> Sesi Baru</button>` : '',
      '<span class="badge b-ok"><span class="dot"></span>Mode Batch Attendance</span>');
    if (!k) { el.innerHTML = head + `<div class="card">${emptyState('bi-calendar-x', 'Belum ada kegiatan. Buat sesi pengajian terlebih dahulu.')}</div>`; return; }

    const mat = S.idx.mat.get(k.ID_Materi);
    const lockedForMe = Pages.absensi.locked(k);
    const sessions = Store.kegScope().filter(x => Math.abs(D.parse(x.Tanggal) - D.parse(D.today())) < 86400000 * 45).sort((a, b) => (b.Tanggal + b.Waktu_Mulai).localeCompare(a.Tanggal + a.Waktu_Mulai));
    if (!sessions.find(x => x.ID_Kegiatan === k.ID_Kegiatan)) sessions.unshift(k);
    const inf = S.idx.infKeg.get(k.ID_Kegiatan);

    el.innerHTML = head + `
      <div class="card session-card">
        <div class="row-wrap" style="align-items:flex-start;gap:20px">
          <div class="grow" style="min-width:260px">
            <div class="meta-row">${jjBadge(k.Jenjang)}${kelasBadge(k.Kelas)}<span><i class="bi bi-patch-check"></i> ${esc(Store.kelName(k.ID_Kelompok))}</span><span><i class="bi bi-geo-alt"></i> ${esc(k.Tempat || '–')}</span></div>
            <h2 style="font-size:22px;margin:10px 0 4px">${esc(k.Nama_Kegiatan)}</h2>
            ${(k.Jenjang === 'Dewasa' && kegMateri(k).length > 1) || susunan(k).length ? `<div class="small muted">${kegMateri(k).map((x, i) => `<div>Materi ${i + 1}: <b>${esc(x.mat ? x.mat.Nama_Materi : '–')}</b> · Pengajar: <b>${esc(x.guru || '–')}</b>${x.durasi ? ' · <i class="bi bi-hourglass-split"></i> ' + menit(x.durasi) : ''}</div>`).join('')}</div>` : `<div class="small muted">Materi: ${mat ? `<b class="mono" style="color:var(--primary)">${esc(mat.ID_Materi)}</b> ${esc(mat.Nama_Materi)}` : '—'}</div>`}
            <div class="meta-row mt-2"><span><i class="bi bi-calendar-event"></i> <b>${k.Tanggal === D.today() ? 'Hari ini, ' : ''}${D.day(k.Tanggal)}, ${D.long(k.Tanggal)}</b></span><span><i class="bi bi-clock"></i> ${esc(k.Waktu_Mulai)} – ${esc(k.Waktu_Selesai)} WIB</span><span><i class="bi bi-person-video3"></i> Pengajar: <b>${esc(kegMateri(k).map(x => x.guru).filter(Boolean).join(', ') || '–')}</b></span></div>
          </div>
          ${k.Kode_Absen && k.Tanggal === D.today() ? `<div class="card kode-card"><div class="tiny muted mono" style="letter-spacing:.08em">KODE ABSEN MANDIRI</div>
            <div class="kode-val mono">${esc(k.Kode_Absen)}</div><div class="tiny muted">${(() => { const n = [...(S.idx.abs.get(k.ID_Kegiatan) || new Map()).values()].filter(v => v.m).length; return n ? n + ' jamaah absen mandiri' : 'Tampilkan di lokasi pengajian'; })()}</div>
            <button class="btn btn-light btn-sm mt-2" onclick="Pages.absensi.showKode('${k.ID_Kegiatan}')"><i class="bi bi-arrows-fullscreen"></i> Tampilkan Kode</button></div>` : ''}
          <div class="card" style="background:var(--surface-2);box-shadow:none;padding:14px;min-width:260px">
            <div class="tiny muted mono" style="letter-spacing:.08em">PILIH PERGANTIAN SESI</div>
            <select class="select mt-2" aria-label="Pilih sesi" onchange="S.ui.abs.kegId=this.value;S.ui.abs.filter='ALL';S.ui.abs.q='';Pages.absensi.render()">${sessions.map(x => opt(x.ID_Kegiatan, `${D.short(x.Tanggal)} ${x.Waktu_Mulai} · ${x.Jenjang}${x.Kelas ? ' ' + x.Kelas : ''} · ${Store.kelName(x.ID_Kelompok)}`, k.ID_Kegiatan)).join('')}</select>
            <div class="row mt-2 tiny">${k.Status_Absensi === 'Terkunci' ? '<span class="dot dot-ok"></span> Absensi <b>terkunci</b>' : S.idx.abs.get(k.ID_Kegiatan) ? '<span class="dot dot-warn"></span> Tersimpan, belum dikunci' : '<span class="dot"></span> Belum ada absensi'}<span class="spacer"></span><span class="muted">LockService aktif</span></div>
          </div>
        </div>
      </div>
      ${isGab(k) ? `<div class="note gold section-gap"><i class="bi bi-people-fill"></i><div><b>${esc(gabJenis(k)[1])}</b> (pengajian gabungan) — daftar hadir berisi: <b>${esc(gabJenis(k)[2])}</b>${tambahan(k).length ? ` + <b>${tambahan(k).length} peserta tambahan</b>` : ''}. ${Store.allKel() ? 'Gunakan filter kelompok/jenjang untuk mempercepat pengisian; "Tandai Semua Hadir" berlaku untuk daftar yang sedang tampil.' : Store.isGuru() ? `Anda mengabsen peserta dari jenjang yang Anda ajar (${esc(Store.guruJJ().join(', '))}) di ${esc(Store.kelName(Store.myKel()))}. Peserta lain diabsen admin/guru masing-masing.` : `Anda mengabsen peserta dari kelompok <b>${esc(Store.kelName(Store.myKel()))}</b>. Kelompok lain diabsen admin kelompoknya masing-masing.`}${Store.canGab() ? '' : ' Penguncian absensi dilakukan Master Admin / Penerobos Desa.'}</div></div>` : ''}
      ${k.Status_Absensi === 'Terkunci' ? `<div class="lock-banner section-gap"><i class="bi bi-lock-fill"></i><span class="grow">Absensi sesi ini sudah dikunci${lockedForMe ? '. Hubungi Master Admin / Admin PPG bila perlu koreksi.' : '. Sebagai ' + (Store.isSuper() ? 'Admin PPG' : 'Master Admin') + ' Anda tetap bisa mengoreksi atau membuka kunci.'}</span>${Store.isAdm() || (isGab(k) && Store.isPenerobos()) ? '<button class="btn btn-light btn-sm" onclick="Pages.absensi.unlock()"><i class="bi bi-unlock"></i> Buka Kunci</button>' : ''}</div>` : ''}
      <div class="grid-5 section-gap" id="absKpi"></div>
      <div class="card section-gap">
        <div class="toolbar">
          <button class="btn btn-primary" onclick="Scan.open()" ${lockedForMe ? 'disabled' : ''}><i class="bi bi-upc-scan"></i> Scan Kartu</button>
          <button class="btn btn-mint" onclick="Pages.absensi.allHadir()" ${lockedForMe ? 'disabled' : ''}><i class="bi bi-lightning-charge-fill"></i> Tandai Semua Hadir</button>
          <label class="search-input"><i class="bi bi-search"></i><input class="input" id="absSearch" placeholder="Cari nama jamaah di sesi ini…" value="${attr(S.ui.abs.q)}"></label>
          ${isGab(k) ? `${Store.allKel() ? `<select class="select" aria-label="Filter kelompok" onchange="S.ui.abs.gk=this.value;Pages.absensi.refreshParts()">${opt('ALL', 'Semua Kelompok', S.ui.abs.gk || 'ALL')}${S.d.kelompok.map(x => opt(x.ID_Kelompok, x.Nama_Kelompok, S.ui.abs.gk || 'ALL')).join('')}</select>` : ''}
          <select class="select" aria-label="Filter jenjang" onchange="S.ui.abs.gj=this.value;Pages.absensi.refreshParts()">${opt('ALL', 'Semua Jenjang', S.ui.abs.gj || 'ALL')}${Store.jjAbs().map(x => opt(x, x, S.ui.abs.gj || 'ALL')).join('')}</select>` : ''}
          <div class="seg-tabs" id="absTabs"></div>
          <button class="btn btn-primary" id="absSaveTop" onclick="Pages.absensi.save(false, this)" ${lockedForMe ? 'disabled' : ''}><i class="bi bi-floppy"></i> Simpan Massal</button>
        </div>
      </div>
      <div class="card flush section-gap" id="absTable"></div>
      <div class="grid grid-57 section-gap">
        <div class="card" id="absInfaq">${Pages.absensi.infaqCard(k, inf)}</div>
        <div class="card" id="absCommit"></div>
      </div>`;
    $('#absSearch').addEventListener('input', debounce(e => { S.ui.abs.q = e.target.value; Pages.absensi.table(); }, 150));
    Pages.absensi.refreshParts();
  },

  counts(k) {
    const d = Pages.absensi.draft(k), roster = Pages.absensi.roster(k);
    const c = { H: 0, I: 0, S: 0, A: 0, none: 0, dirty: 0, total: roster.length };
    roster.forEach(j => { const v = d[j.ID_Jamaah]; if (v && v.s) c[v.s]++; else c.none++; if (v && v.dirty) c.dirty++; });
    return c;
  },
  refreshParts() {
    const k = S.idx.keg.get(S.ui.abs.kegId);
    const c = Pages.absensi.counts(k), t = c.total || 1;
    const kpi = (lbl, n, cls, icon, color) => `<div class="card kpi-stat"><div class="lbl" style="color:${color}"><span>${lbl}</span><i class="bi ${icon}"></i></div><div class="val" style="color:${color}">${n}<small>${cls}</small></div><div class="progress ${cls === 'Terdaftar' ? 'ink' : ''}" style="--x:1"><span style="width:${cls === 'Terdaftar' ? 100 : pct(n, t)}%;background:${color}"></span></div></div>`;
    $('#absKpi').innerHTML =
      kpi('Total Jamaah', c.total, 'Terdaftar', 'bi-people', 'var(--text)') +
      kpi('Hadir (H)', c.H, F.pct(pct(c.H, t)), 'bi-check-circle', 'var(--primary)') +
      kpi('Izin (I)', c.I, F.pct(pct(c.I, t)), 'bi-calendar-x', '#8A6A00') +
      kpi('Sakit (S)', c.S, F.pct(pct(c.S, t)), 'bi-bandaid', 'var(--gold)') +
      kpi('Alpa (A)', c.A, F.pct(pct(c.A, t)), 'bi-x-circle', 'var(--bad)');
    const f = S.ui.abs.filter;
    $('#absTabs').innerHTML = [['ALL', 'Semua', c.total], ['H', 'Hadir', c.H], ['I', 'Izin', c.I], ['S', 'Sakit', c.S], ['A', 'Alpa', c.A], ['none', 'Belum', c.none]]
      .filter(x => x[0] !== 'none' || x[2]).map(([v, l, n]) => `<button class="${f === v ? 'active' : ''}" onclick="S.ui.abs.filter='${v}';Pages.absensi.refreshParts()">${l} (${n})</button>`).join('');
    Pages.absensi.table();
    Pages.absensi.commitCard(k, c);
  },

  rowHtml(j, k, d, lockedForMe) {
    const v = d[j.ID_Jamaah] || {};
    const age = D.age(j.Tanggal_Lahir);
    // Capaian materi sesi: status target dari materi yang diajarkan
    let cap = '<span class="badge b-outline">—</span>';
    const tg = S.d.target.filter(t => t.ID_Materi === k.ID_Materi);
    if (tg.length) {
      const m = S.idx.cap.get(j.ID_Jamaah) || new Map();
      const st = tg.map(t => (m.get(t.ID_Target) || {}).s || 'Belum');
      cap = st.every(s => s === 'Tercapai') ? '<span class="badge b-mint"><i class="bi bi-check-circle"></i> Tuntas</span>' : st.some(s => s === 'Proses' || s === 'Tercapai') ? '<span class="badge b-gold"><i class="bi bi-hourglass-split"></i> Perlu Pengulangan</span>' : '<span class="badge b-outline"><i class="bi bi-dash-circle"></i> Belum</span>';
    }
    return `<tr class="abs-row ${v.dirty ? 'dirty' : ''}" data-j="${j.ID_Jamaah}">
      <td class="td-main"><div class="cell-person">${avatar(j)}<div class="grow"><div class="row"><span class="nm">${esc(j.Nama_Lengkap)}</span>${jkBadge(j.Jenis_Kelamin)}</div><div class="id">${esc(j.ID_Jamaah)} · ${age} Tahun${j.Kelas ? ' · Kelas ' + esc(j.Kelas) : ''}${v.m && !v.dirty ? (v.s === 'I' ? ` <span class="badge b-gold" title="${attr(v.c || '')}"><i class="bi bi-envelope-paper"></i> Izin via aplikasi</span>` : ' <span class="badge b-mint" title="Absen mandiri oleh jamaah"><i class="bi bi-phone"></i> Mandiri</span>') : ''}</div>${isGab(k) ? `<div class="row mt-1" style="gap:6px">${jjBadge(j.Jenjang)}<span class="tiny muted"><i class="bi bi-people"></i> ${esc(Store.kelName(j.ID_Kelompok))}</span></div>` : ''}</div></div></td>
      <td data-label="Wali & Kontak"><div class="cell-strong small">${esc(j.Nama_Wali || '–')}</div><div class="cell-sub mono">${esc(j.No_HP || '')}</div></td>
      <td data-label="Kehadiran"><div class="hisa" role="radiogroup" aria-label="Kehadiran ${attr(j.Nama_Lengkap)}" ${lockedForMe ? 'aria-disabled="true"' : ''}>${['H', 'I', 'S', 'A'].map(s => `<button role="radio" aria-checked="${v.s === s}" title="${ST_LABEL[s]}" class="${v.s === s ? 'on-' + s : ''}" onclick="Pages.absensi.set('${j.ID_Jamaah}','${s}')">${s}</button>`).join('')}</div></td>
      <td data-label="Catatan"><input class="input sm" style="min-width:160px" maxlength="200" placeholder="Tambah catatan…" value="${attr(v.c || '')}" ${lockedForMe ? 'disabled' : ''} onchange="Pages.absensi.note('${j.ID_Jamaah}',this.value)" aria-label="Catatan ${attr(j.Nama_Lengkap)}"></td>
      <td data-label="Capaian Materi">${cap}</td></tr>`;
  },
  table() {
    const k = S.idx.keg.get(S.ui.abs.kegId), d = Pages.absensi.draft(k), f = S.ui.abs.filter, q = S.ui.abs.q.trim().toLowerCase();
    const lockedForMe = Pages.absensi.locked(k);
    const rows = Pages.absensi.roster(k).filter(j => {
      const s = (d[j.ID_Jamaah] || {}).s;
      return (f === 'ALL' || (f === 'none' ? !s : s === f)) && (!q || j.Nama_Lengkap.toLowerCase().includes(q));
    });
    $('#absTable').innerHTML = rows.length ? `<div class="table-wrap"><table class="table stack">
      <thead><tr><th>Jamaah & Detail</th><th>Wali & Kontak</th><th>Status Kehadiran</th><th>Catatan / Alasan</th><th>Capaian Materi Sesi</th></tr></thead>
      <tbody>${rows.map(j => Pages.absensi.rowHtml(j, k, d, lockedForMe)).join('')}</tbody></table></div>
      <div class="table-foot"><span><i class="bi bi-check-circle" style="color:var(--ok)"></i> Menampilkan ${rows.length} dari ${Pages.absensi.roster(k).length} jamaah pada sesi ini</span><span class="tiny">Draf tersimpan otomatis di perangkat ini</span></div>`
      : emptyState('bi-people', Pages.absensi.roster(k).length ? 'Tidak ada jamaah pada filter ini.' : `Belum ada jamaah aktif jenjang ${k.Jenjang}${k.Kelas ? ' kelas ' + k.Kelas : ''} di ${Store.kelName(k.ID_Kelompok)}.`);
  },
  set(jid, s) {
    const k = S.idx.keg.get(S.ui.abs.kegId);
    if (Pages.absensi.locked(k)) return;
    const d = Pages.absensi.draft(k);
    d[jid] = Object.assign({}, d[jid], { s, dirty: true });
    Pages.absensi.saveDraftLocal(k);
    const f = S.ui.abs.filter;
    if (f !== 'ALL' && f !== s) { Pages.absensi.refreshParts(); return; } // baris keluar dari filter aktif
    // Instan: ganti satu baris + angka KPI saja, tanpa render ulang tabel
    const tr = $(`#absTable tr[data-j="${jid}"]`);
    if (tr) tr.outerHTML = Pages.absensi.rowHtml(S.idx.jam.get(jid), k, d, false);
    Pages.absensi.refreshPartsLight(k, Pages.absensi.counts(k));
  },
  refreshPartsLight(k, c) {
    const t = c.total || 1;
    const vals = $$('#absKpi .val'), bars = $$('#absKpi .progress > span');
    [['H', 1], ['I', 2], ['S', 3], ['A', 4]].forEach(([s, i]) => { if (vals[i]) { vals[i].innerHTML = `${c[s]}<small>${F.pct(pct(c[s], t))}</small>`; bars[i].style.width = pct(c[s], t) + '%'; } });
    const f = S.ui.abs.filter;
    $('#absTabs').innerHTML = [['ALL', 'Semua', c.total], ['H', 'Hadir', c.H], ['I', 'Izin', c.I], ['S', 'Sakit', c.S], ['A', 'Alpa', c.A], ['none', 'Belum', c.none]]
      .filter(x => x[0] !== 'none' || x[2]).map(([v, l, n]) => `<button class="${f === v ? 'active' : ''}" onclick="S.ui.abs.filter='${v}';Pages.absensi.refreshParts()">${l} (${n})</button>`).join('');
    Pages.absensi.commitCard(k, c);
  },
  note(jid, val) {
    const k = S.idx.keg.get(S.ui.abs.kegId), d = Pages.absensi.draft(k);
    d[jid] = Object.assign({}, d[jid], { c: val.trim(), dirty: true });
    Pages.absensi.saveDraftLocal(k);
    Pages.absensi.commitCard(k, Pages.absensi.counts(k));
  },
  allHadir() {
    const k = S.idx.keg.get(S.ui.abs.kegId), d = Pages.absensi.draft(k);
    Pages.absensi.roster(k).forEach(j => { if (!d[j.ID_Jamaah] || d[j.ID_Jamaah].s !== 'H') d[j.ID_Jamaah] = Object.assign({}, d[j.ID_Jamaah], { s: 'H', dirty: true }); });
    Pages.absensi.saveDraftLocal(k);
    S.ui.abs.filter = 'ALL';
    Pages.absensi.refreshParts();
    UI.toast('Semua jamaah ditandai hadir. Koreksi yang tidak hadir, lalu simpan.', 'ok');
  },

  commitCard(k, c) {
    const el = $('#absCommit'); if (!el) return;
    const lockedForMe = Pages.absensi.locked(k);
    el.innerHTML = `<div class="row"><span class="badge ${k.Status_Absensi === 'Terkunci' ? 'b-ok' : 'b-warn'}"><span class="dot"></span>${k.Status_Absensi === 'Terkunci' ? 'SESI TERKUNCI' : c.dirty ? 'ADA PERUBAHAN BELUM DIKIRIM' : 'VERIFIKASI SESI'}</span><span class="spacer"></span><span class="tiny muted mono">${esc(k.ID_Kegiatan)}</span></div>
      <h3 style="font-size:20px;margin:10px 0 6px">Kunci dan Rekam Absensi Sesi</h3>
      <p class="muted small">${c.none ? `<b>${c.none} jamaah</b> belum diisi status kehadirannya. ` : `Semua <b>${c.total} jamaah</b> sudah ditinjau. `}Tombol kirim & kunci menyimpan ke Google Sheets dalam satu proses batch dan mencegah perubahan ganda.</p>
      <div class="kv mt-3"><div>Perubahan draf<b>${c.dirty} baris</b></div><div>Terakhir sinkron<b>${S.lastSync ? D.rel(new Date(S.lastSync).toISOString()) : '–'}</b></div><div>Mekanisme<b class="ok">Apps Script Lock</b></div></div>
      <div class="row-wrap mt-3">
        <button class="btn btn-light" onclick="Pages.absensi.printSheet()"><i class="bi bi-printer"></i> Cetak Lembar Presensi</button>
        <span class="spacer"></span>
        <button class="btn btn-ghost" onclick="Pages.absensi.save(false,this)" ${lockedForMe ? 'disabled' : ''}><i class="bi bi-floppy"></i> Simpan</button>
        ${isGab(k) && !Store.canGab() ? '' : `<button class="btn btn-primary" onclick="Pages.absensi.save(true,this)" ${lockedForMe ? 'disabled' : ''}><i class="bi bi-lock"></i> Kirim & Kunci Absensi</button>`}
      </div>`;
  },

  infaqCard(k, inf) {
    if (isGab(k)) return `<div class="row"><i class="bi bi-cash-stack" style="color:var(--gold);font-size:20px"></i><div class="card-title grow">Infaq Pengajian</div></div><p class="muted small mt-2">Pengajian gabungan tidak dicatat di kas kelompok. Infaq dicatat per sesi kelompok oleh Admin Kelompok.</p>`;
    const isAdmin = Store.canInfaq() && Store.infOk(k);
    return `<div class="row"><i class="bi bi-cash-stack" style="color:var(--gold);font-size:20px"></i><div class="card-title grow">Infaq Pengajian Sesi Ini</div><span class="badge b-gold">Kas Kelompok</span></div>
      <p class="muted small mt-1">Total infaq yang terkumpul pada sesi ini (bukan per jamaah), disinkronkan ke sheet <i>Infaq Kelompok</i>.</p>
      ${isAdmin ? `<label class="field mt-3"><span class="field-label">Nominal masuk (IDR)</span><div class="input-money"><span>Rp</span><input class="input" id="absInfAmt" inputmode="numeric" placeholder="0" value="${inf ? F.num(inf.Jumlah) : ''}" oninput="this.value=this.value.replace(/[^\\d]/g,'').replace(/\\B(?=(\\d{3})+(?!\\d))/g,'.')"></div></label>
        <label class="field mt-2"><span class="field-label">Keterangan</span><input class="input" id="absInfKet" maxlength="200" value="${attr(inf ? inf.Keterangan : 'Infaq kaleng keliling')}"></label>
        <div class="row mt-3"><span class="tiny muted">${inf ? 'Tercatat ' + F.rp(inf.Jumlah) : 'Belum dicatat'}</span><span class="spacer"></span><button class="btn btn-gold btn-sm" onclick="Pages.absensi.saveInfaq()"><i class="bi bi-check2"></i> Simpan Infaq</button></div>`
      : `<div class="kpi-value mt-3" style="color:var(--primary)">${inf ? F.rp(inf.Jumlah) : '<span class="muted" style="font-size:16px">Belum dicatat</span>'}</div><p class="tiny muted mt-2"><i class="bi bi-eye"></i> ${Store.isGuru() ? 'Infaq pengajian ' + esc(k.Jenjang) + ' dicatat oleh Admin Kelompok.' : 'Hanya melihat. Infaq dicatat oleh Admin Kelompok / Guru.'}</p>`}`;
  },
  saveInfaq() {
    const k = S.idx.keg.get(S.ui.abs.kegId);
    const amt = Number(($('#absInfAmt').value || '').replace(/\D/g, ''));
    if (!amt) { UI.toast('Masukkan nominal infaq.', 'warn'); $('#absInfAmt').focus(); return; }
    Pages.infaq.commit({ ID_Infaq: (S.idx.infKeg.get(k.ID_Kegiatan) || {}).ID_Infaq || uid('INF'), ID_Kegiatan: k.ID_Kegiatan, Jumlah: amt, Keterangan: $('#absInfKet').value.trim() });
  },

  async save(kunci, btn, quiet) {
    const k = S.idx.keg.get(S.ui.abs.kegId), d = Pages.absensi.draft(k), c = Pages.absensi.counts(k);
    const items = Pages.absensi.roster(k).filter(j => d[j.ID_Jamaah] && d[j.ID_Jamaah].s).map(j => ({ ID_Jamaah: j.ID_Jamaah, Status: d[j.ID_Jamaah].s, Catatan: d[j.ID_Jamaah].c || '' }));
    if (!items.length) { UI.toast('Belum ada status kehadiran yang diisi.', 'warn'); return; }
    if (kunci && c.none) { UI.toast(`${c.none} jamaah belum diisi. Lengkapi dulu sebelum mengunci.`, 'warn'); S.ui.abs.filter = 'none'; Pages.absensi.refreshParts(); return; }
    if (kunci && !(await UI.confirm(`Kirim ${items.length} data kehadiran dan <b>kunci</b> sesi ini? Setelah dikunci, Admin Kelompok tidak dapat mengubahnya lagi.`, { ok: 'Kirim & Kunci' }))) return;
    if (!kunci && c.none && !quiet && !(await UI.confirm(`${c.none} jamaah belum diisi. Simpan ${items.length} data yang sudah terisi?`, { ok: 'Simpan sebagian' }))) return;

    const prevAbs = S.d.absensi, prevKeg = S.d.kegiatan, prevDraft = JSON.parse(JSON.stringify(d));
    App.mutate({
      apply: () => {
        const set = new Set(items.map(i => i.ID_Jamaah));
        S.d.absensi = prevAbs.filter(a => !(a[0] === k.ID_Kegiatan && set.has(a[1]))).concat(items.map(i => [k.ID_Kegiatan, i.ID_Jamaah, i.Status, i.Catatan]));
        Store.upsert('kegiatan', { ID_Kegiatan: k.ID_Kegiatan, Status_Absensi: kunci ? 'Terkunci' : (k.Status_Absensi === 'Terbuka' ? 'Tersimpan' : k.Status_Absensi) }, 'ID_Kegiatan');
        Object.keys(d).forEach(j => { delete d[j].dirty; });
        LS.del('an_draft_' + k.ID_Kegiatan);
      },
      rollback: () => { S.d.absensi = prevAbs; S.d.kegiatan = prevKeg; S.absDraft[k.ID_Kegiatan] = prevDraft; Pages.absensi.saveDraftLocal(Object.assign({}, k)); },
      call: () => API.run('apiSaveAbsensi', k.ID_Kegiatan, items, !!kunci),
      okMsg: kunci ? `Absensi dikirim & dikunci (${c.H} hadir dari ${items.length}).` : `Absensi disimpan (${c.H} hadir dari ${items.length}).`,
      onSaved: r => Store.upsert('kegiatan', { ID_Kegiatan: k.ID_Kegiatan, Status_Absensi: r.Status_Absensi }, 'ID_Kegiatan'),
      after: () => { if (S.page === 'absensi') Pages.absensi.commitCard(S.idx.keg.get(k.ID_Kegiatan), Pages.absensi.counts(S.idx.keg.get(k.ID_Kegiatan))); }
    }).catch(() => {});
  },
  async unlock() {
    const k = S.idx.keg.get(S.ui.abs.kegId);
    if (!(await UI.confirm('Buka kunci absensi sesi ini agar dapat dikoreksi?', { ok: 'Buka Kunci' }))) return;
    const prev = S.d.kegiatan;
    App.mutate({ apply: () => Store.upsert('kegiatan', { ID_Kegiatan: k.ID_Kegiatan, Status_Absensi: 'Tersimpan' }, 'ID_Kegiatan'), rollback: () => { S.d.kegiatan = prev; }, call: () => API.run('apiUnlockAbsensi', k.ID_Kegiatan), okMsg: 'Kunci absensi dibuka.' }).catch(() => {});
  },
  pickSession() {
    const list = Store.kegScope().sort((a, b) => (b.Tanggal + b.Waktu_Mulai).localeCompare(a.Tanggal + a.Waktu_Mulai)).slice(0, 80);
    const m = UI.modal({
      title: 'Pilih Sesi Pengajian', size: 'lg',
      body: `<div class="list">${list.map(k => `<button class="list-item" style="border:none;border-bottom:1px solid var(--border);background:none;text-align:left;width:100%" data-k="${k.ID_Kegiatan}">
        <div style="min-width:92px"><div class="cell-strong small">${D.short(k.Tanggal)}</div><div class="cell-sub mono">${esc(k.Waktu_Mulai)}</div></div>
        <div class="grow"><div class="cell-strong">${esc(k.Nama_Kegiatan)}</div><div class="cell-sub">${esc(Store.kelName(k.ID_Kelompok))} · ${esc(k.Tempat)}</div></div>${jjBadge(k.Jenjang)} ${Pages.kegiatan.absStatus(k)}</button>`).join('')}</div>`
    });
    m.el.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) { S.ui.abs.kegId = b.dataset.k; S.ui.abs.filter = 'ALL'; m.close(); Pages.absensi.render(); } });
  },
  printSheet() {
    const k = S.idx.keg.get(S.ui.abs.kegId), d = Pages.absensi.draft(k);
    const rows = Pages.absensi.roster(k);
    const w = `<div style="font-family:Inter,Arial;padding:8px"><h3 style="color:#0F6B4F;margin:0">Lembar Presensi — ${esc(k.Nama_Kegiatan)}</h3><p style="color:#52606D;margin:4px 0 12px">${D.long(k.Tanggal)} · ${esc(k.Waktu_Mulai)}–${esc(k.Waktu_Selesai)} · ${esc(Store.kelName(k.ID_Kelompok))} · ${esc(k.Tempat)}</p>
      <table style="width:100%;border-collapse:collapse;font-size:12px"><tr>${['No', 'Nama', 'ID', 'H', 'I', 'S', 'A', 'Paraf'].map(h => `<th style="border:1px solid #ccc;padding:6px;background:#E6F4EE">${h}</th>`).join('')}</tr>
      ${rows.map((j, i) => { const s = (d[j.ID_Jamaah] || {}).s; return `<tr><td style="border:1px solid #ccc;padding:6px">${i + 1}</td><td style="border:1px solid #ccc;padding:6px">${esc(j.Nama_Lengkap)}</td><td style="border:1px solid #ccc;padding:6px">${esc(j.ID_Jamaah)}</td>${['H', 'I', 'S', 'A'].map(x => `<td style="border:1px solid #ccc;padding:6px;text-align:center">${s === x ? '✓' : ''}</td>`).join('')}<td style="border:1px solid #ccc;padding:6px;width:80px"></td></tr>`; }).join('')}</table></div>`;
    const m = UI.modal({ title: 'Lembar Presensi Fisik', size: 'lg', body: `<iframe id="prFrame" style="width:100%;height:60vh;border:1px solid var(--border);border-radius:8px;background:#fff"></iframe>`, foot: `<button class="btn btn-light" data-close>Tutup</button><button class="btn btn-primary" id="prBtn"><i class="bi bi-printer"></i> Cetak</button>` });
    const fr = $('#prFrame', m.el); fr.srcdoc = '<html><body>' + w + '</body></html>';
    $('#prBtn', m.el).onclick = () => fr.contentWindow.print();
  }
};

/* ───────────────────────── CAPAIAN ───────────────────────── */
Pages.capaian = {
  list() {
    const f = S.ui.cap, q = f.q.trim().toLowerCase();
    const jjOk = JENJANG_TARGET.filter(j => Store.jj().includes(j));
    if (!jjOk.includes(f.jenjang) && jjOk.length) f.jenjang = jjOk[0];
    return Store.jamaahScope().filter(j => j.Jenjang === f.jenjang && (f.jenjang !== 'Caberawit' || f.kelas === 'ALL' || j.Kelas === f.kelas) && (!q || (j.Nama_Lengkap + ' ' + j.ID_Jamaah).toLowerCase().includes(q)))
      .map(j => ({ j, p: Stats.jamProgress(j), a: Stats.jamAttendance(j.ID_Jamaah, 5) }))
      .filter(x => f.filter === 'ALL' || (f.filter === 'done' ? x.p.pct === 100 : f.filter === 'help' ? (x.p.pct < 50 || x.a.alpaStreak >= 2) : x.p.pct < 100 && x.p.pct >= 50))
      .sort((a, b) => a.j.Nama_Lengkap.localeCompare(b.j.Nama_Lengkap));
  },
  render() {
    const f = S.ui.cap;
    if (f.jenjang === 'Dewasa') f.jenjang = 'Caberawit';
    { const ok = JENJANG_TARGET.filter(j => Store.jj().includes(j)); if (!ok.includes(f.jenjang) && ok.length) f.jenjang = ok[0]; }
    if (f.jenjang !== 'Caberawit') f.kelas = 'ALL';
    const jams = Store.jamaahScope().filter(j => j.Jenjang === f.jenjang && (f.kelas === 'ALL' || j.Kelas === f.kelas)).map(j => ({ j, p: Stats.jamProgress(j), a: Stats.jamAttendance(j.ID_Jamaah, 5) }));
    const avg = jams.length ? Math.round(sum(jams, x => x.p.pct) / jams.length * 10) / 10 : 0;
    const done = sum(jams, x => x.p.done), proc = sum(jams, x => x.p.proc), total = sum(jams, x => x.p.total);
    const help = jams.filter(x => x.p.pct < 50 || x.a.alpaStreak >= 2).length;
    const lunas = jams.filter(x => x.p.pct === 100).length;
    const mats = S.d.materi.filter(m => m.Jenjang === f.jenjang && m.Status_Aktif !== 'Nonaktif').sort((a, b) => (+a.Urutan || 0) - (+b.Urutan || 0));
    const tgts = (S.idx.tgtByJenjang[f.jenjang] || []).filter(t => { const m = S.idx.mat.get(t.ID_Materi); return f.kelas === 'ALL' || !m || !m.Kelas || m.Kelas === f.kelas; });

    $('#page-capaian').innerHTML = pageHead('Pembinaan <i class="bi bi-chevron-right"></i> <b>Capaian Jamaah</b>', 'Monitoring Kurikulum & Capaian Jamaah',
      `Pemantauan progres target kompetensi kurikulum per jamaah dari ${JENJANG_TARGET.length} jenjang berjenjang. Dewasa tidak memakai target.`,
      `<button class="btn btn-light" onclick="Pages.capaian.exportXlsx()"><i class="bi bi-file-earmark-excel"></i> Unduh Rekap (Excel)</button>${Store.isAdm() ? `<button class="btn btn-primary" onclick="S.ui.kur.jenjang='${f.jenjang}';Router.go('kurikulum')"><i class="bi bi-sliders"></i> Atur Target Kurikulum</button>` : ''}`) + `
      <div class="chips mb-3">${JENJANG_TARGET.filter(j => Store.jj().includes(j)).map(j => { const c = Stats.jenjangCapaian(j); return `<button class="chip ${f.jenjang === j ? 'active' : ''}" onclick="S.ui.cap.jenjang='${j}';S.ui.cap.page=1;Pages.capaian.render()"><i class="bi bi-mortarboard"></i> ${esc(j)} <span class="count">${F.pct(c.pct, 1)}</span></button>`; }).join('')}
        ${Store.jj().includes('Dewasa') ? `<button class="chip" onclick="S.ui.kur.jenjang='Dewasa';Router.go('kurikulum')"><i class="bi bi-people"></i> Dewasa <span class="count">tematik</span></button>` : ''}</div>
      <div class="grid-4">
        <div class="card kpi compact"><div class="kpi-label">Rata-rata Kelulusan</div><div class="kpi-icon"><i class="bi bi-patch-check"></i></div><div class="kpi-value">${F.pct(avg)}</div><div class="kpi-foot" style="align-items:center"><div class="progress dark grow"><span style="width:${avg}%"></span></div><span>${lunas}/${jams.length} tuntas</span></div></div>
        <div class="card kpi compact"><div class="kpi-label">Target Tercapai</div><div class="kpi-icon"><i class="bi bi-check2-all"></i></div><div class="kpi-value">${F.num(done)}<small>indikator</small></div><div class="kpi-foot"><span class="badge b-mint">Lulus evaluasi</span><span>dari ${F.num(total)}</span></div></div>
        <div class="card kpi compact"><div class="kpi-label">Dalam Pembinaan</div><div class="kpi-icon gold"><i class="bi bi-hourglass-split"></i></div><div class="kpi-value">${F.num(proc)}<small>indikator</small></div><div class="kpi-foot"><span class="badge b-gold">Proses pengulangan</span></div></div>
        <div class="card kpi compact"><div class="kpi-label">Perlu Pendampingan</div><div class="kpi-icon bad"><i class="bi bi-exclamation-triangle"></i></div><div class="kpi-value">${help}<small>jamaah</small></div><div class="kpi-foot"><button class="btn btn-light btn-sm" onclick="S.ui.cap.filter='help';Pages.capaian.render()">Tampilkan</button><span>&lt;50% / alpa ≥2</span></div></div>
      </div>
      <div class="grid-side section-gap">
        <div>
          <div class="card mb-3"><div class="row-wrap" style="justify-content:space-between">
            <div><div class="card-title">Daftar Capaian & Penilaian Indikator</div><div class="card-sub">${esc(f.jenjang)} · ${esc(Store.scopeLabel())}</div></div>
            <div class="seg-tabs">${[['ALL', 'Semua'], ['done', 'Tuntas'], ['proc', 'Proses'], ['help', 'Pendampingan']].map(([v, l]) => `<button class="${f.filter === v ? 'active' : ''}" onclick="S.ui.cap.filter='${v}';S.ui.cap.page=1;Pages.capaian.render()">${l}</button>`).join('')}</div>
          </div><div class="toolbar mt-3"><label class="search-input"><i class="bi bi-search"></i><input class="input" id="capSearch" placeholder="Cari jamaah…" value="${attr(f.q)}"></label>
            ${f.jenjang === 'Caberawit' ? `<select class="select" aria-label="Kelas" onchange="S.ui.cap.kelas=this.value;S.ui.cap.page=1;Pages.capaian.render()">${opt('ALL', 'Semua Kelas', f.kelas)}${KELAS.map(x => opt(x, 'Kelas ' + x, f.kelas)).join('')}</select>` : ''}</div></div>
          <div id="capList" class="grid"></div>
        </div>
        <div class="grid" style="align-content:start">
          <div class="card"><span class="badge b-mint"><i class="bi bi-shield-check"></i> Dikelola Master Admin Pusat</span><div class="row mt-2"><div class="card-title grow">Kurikulum Semester Ini</div></div><div class="card-sub mb-3">Jenjang: ${esc(f.jenjang)} · ${tgts.length} target</div>
            ${mats.map(m => { const t = tgts.filter(x => x.ID_Materi === m.ID_Materi); return `<div class="cur-item"><div class="row"><span class="code">${esc(m.ID_Materi)}</span><span class="spacer"></span><span class="tiny muted">${t.length} target</span></div><div class="cell-strong mt-1">${esc(m.Nama_Materi)}</div>${t.length ? `<div class="cell-sub">Target: ${esc(t.map(x => x.Deskripsi_Target).join('; '))}</div>` : ''}</div>`; }).join('') || '<p class="muted small">Belum ada materi.</p>'}
            <button class="btn btn-light btn-sm btn-block mt-3" onclick="S.ui.kur.jenjang='${f.jenjang}';Router.go('kurikulum')"><i class="bi bi-journal-bookmark"></i> Lihat Silabus Lengkap</button></div>
          <div class="card" style="background:var(--gold-soft);border-color:transparent"><div class="row"><i class="bi bi-info-circle-fill" style="color:var(--gold);font-size:20px"></i><div class="card-title">Catatan Jenjang Dewasa</div></div>
            <p class="small mt-2" style="color:var(--gold-text)">Jenjang Dewasa <b>tidak menggunakan target capaian</b> per jamaah. Pembinaan berupa kajian tematik mandiri yang disusun Admin Kelompok.</p>
            <button class="btn btn-light btn-sm mt-3" onclick="S.ui.kur.jenjang='Dewasa';Router.go('kurikulum')">Lihat Kajian Dewasa <i class="bi bi-arrow-right"></i></button></div>
          <div class="card"><div class="card-head"><div class="card-title"><i class="bi bi-clipboard-data"></i> Audit Trail Penilaian</div><span class="badge b-ok">Live</span></div>
            ${(() => { const l = S.d.log.filter(x => x.Aksi === 'UPDATE_CAPAIAN').slice(0, 5); return l.length ? `<ul class="timeline">${l.map(x => { const u = S.d.pengguna.find(p => p.Email === x.Pengguna); return `<li><b>${esc(u ? u.Nama : x.Pengguna)}</b> memperbarui ${esc(x.Keterangan)}<div class="t">${esc(D.rel(x.Waktu))}</div></li>`; }).join('')}</ul>` : '<p class="muted small">Belum ada penilaian tercatat.</p>'; })()}</div>
        </div>
      </div>`;
    $('#capSearch').addEventListener('input', debounce(e => { S.ui.cap.q = e.target.value; S.ui.cap.page = 1; Pages.capaian.cards(); }, 180));
    Pages.capaian.cards();
  },
  page(p) { S.ui.cap.page = p; Pages.capaian.cards(); $('#capList').scrollIntoView({ behavior: 'smooth' }); },
  cards() {
    const items = Pages.capaian.list(), f = S.ui.cap, per = 8;
    const pages = Math.max(1, Math.ceil(items.length / per)); f.page = clamp(f.page, 1, pages);
    const html = items.slice((f.page - 1) * per, f.page * per).map(({ j, p, a }) => {
      const tg = Stats.targetsOf(j);
      const m = S.idx.cap.get(j.ID_Jamaah) || new Map();
      const alert = a.alpaStreak >= 2 || p.pct < 50;
      const chips = tg.map(t => ({ t, s: (m.get(t.ID_Target) || {}).s || 'Belum' }))
        .sort((x, y) => ['Proses', 'Tercapai', 'Belum'].indexOf(x.s) - ['Proses', 'Tercapai', 'Belum'].indexOf(y.s)).slice(0, 4);
      return `<div class="card cap-card ${alert ? 'alert' : ''}">
        <div class="cap-head"><span class="avatar lg">${esc(F.initials(j.Nama_Lengkap))}</span>
          <div class="grow"><div class="row-wrap"><b style="font-size:16px">${esc(j.Nama_Lengkap)}</b><span class="badge b-outline mono">${esc(j.ID_Jamaah)}</span><span class="badge b-mint">${D.age(j.Tanggal_Lahir)} Th · ${esc(jkLabel(j.Jenis_Kelamin))}</span>${kelasBadge(j.Kelas)}${p.pct === 100 ? '<span class="badge b-gold"><i class="bi bi-award-fill"></i> Mumtaz</span>' : ''}${a.alpaStreak >= 2 ? '<span class="badge b-bad"><i class="bi bi-exclamation-circle"></i> Perlu Wali</span>' : ''}</div>
            <div class="cell-sub mt-1">Target: ${esc([...new Set(tg.map(t => (S.idx.mat.get(t.ID_Materi) || {}).Nama_Materi))].join(' · '))}</div></div>
          <div class="cap-pct"><b style="color:${p.pct < 50 ? 'var(--bad)' : p.pct < 75 ? 'var(--gold-text)' : 'var(--primary)'}">${p.pct}%</b><small>(${p.done}/${p.total} tuntas)</small><div class="progress mt-2 ${p.pct < 50 ? 'bad' : p.pct < 75 ? 'gold' : 'dark'}"><span style="width:${p.pct}%"></span></div></div></div>
        <div class="cap-chips">${chips.map(c => `<span class="badge ${c.s === 'Tercapai' ? 'b-ok' : c.s === 'Proses' ? 'b-gold' : 'b-outline'}"><i class="bi ${c.s === 'Tercapai' ? 'bi-check-circle' : c.s === 'Proses' ? 'bi-hourglass-split' : 'bi-circle'}"></i> ${esc(c.t.Deskripsi_Target.length > 48 ? c.t.Deskripsi_Target.slice(0, 46) + '…' : c.t.Deskripsi_Target)}</span>`).join('')}${tg.length > 4 ? `<span class="badge b-outline">+${tg.length - 4} lainnya</span>` : ''}</div>
        ${a.alpaStreak >= 2 ? `<div class="lock-banner" style="background:var(--bad-bg);color:var(--bad-text)"><i class="bi bi-exclamation-triangle"></i> Alpa ${a.alpaStreak} pertemuan terakhir — progres bisa terhenti. Tindak lanjut: hubungi wali (${esc(j.No_HP || 'no. HP belum ada')}).</div>` : ''}
        <div class="cap-actions"><span><i class="bi bi-clock-history"></i> ${p.last ? 'Terakhir dinilai: ' + esc(D.rel(p.last)) : 'Belum pernah dinilai'} · Kehadiran 5 sesi: ${a.total ? a.pct + '%' : '–'}</span>
          <span class="row"><button class="btn btn-light btn-sm" onclick="Pages.capaian.rapor('${j.ID_Jamaah}',this)"><i class="bi bi-printer"></i> Cetak Rapor</button><button class="btn btn-primary btn-sm" onclick="Pages.capaian.edit('${j.ID_Jamaah}')"><i class="bi bi-list-check"></i> Update Status Target</button></span></div>
      </div>`;
    }).join('');
    $('#capList').innerHTML = items.length ? html + `<div class="card table-foot" style="padding:12px 16px"><span><i class="bi bi-cloud-check"></i> Menampilkan ${Math.min(per, items.length - (f.page - 1) * per)} dari ${items.length} jamaah ${esc(f.jenjang)}</span>${UI.pager(items.length, f.page, per, 'Pages.capaian.page')}</div>`
      : `<div class="card">${emptyState('bi-search', 'Tidak ada jamaah pada filter ini.')}</div>`;
  },

  edit(jid) {
    const j = S.idx.jam.get(jid);
    if (!j || j.Jenjang === 'Dewasa') { UI.toast('Jenjang Dewasa tidak memiliki target capaian.', 'warn'); return; }
    const tg = Stats.targetsOf(j);
    const m0 = S.idx.cap.get(jid) || new Map();
    const state = {};
    tg.forEach(t => { const c = m0.get(t.ID_Target) || {}; state[t.ID_Target] = { s: c.s || 'Belum', c: c.c || '' }; });
    const byMat = {};
    tg.forEach(t => (byMat[t.ID_Materi] = byMat[t.ID_Materi] || []).push(t));
    const m = UI.modal({
      title: 'Update Status Target', size: 'lg',
      body: `<div class="row mb-3">${avatar(j)}<div><b>${esc(j.Nama_Lengkap)}</b><div class="cell-sub">${esc(j.ID_Jamaah)} · ${esc(j.Jenjang)} · ${esc(Store.kelName(j.ID_Kelompok))}</div></div><span class="spacer"></span><button class="btn btn-soft btn-sm" id="capAll"><i class="bi bi-check2-all"></i> Semua Tercapai</button></div>
        ${Object.keys(byMat).map(mid => `<div class="card-title mt-3 mb-2" style="font-size:14px"><span class="mono" style="color:var(--primary)">${esc(mid)}</span> · ${esc((S.idx.mat.get(mid) || {}).Nama_Materi)}</div>
          ${byMat[mid].map(t => `<div class="cur-item" data-t="${t.ID_Target}"><div class="row-wrap" style="justify-content:space-between"><div class="grow" style="min-width:200px"><div class="cell-strong">${esc(t.Deskripsi_Target)}</div><div class="cell-sub">${esc(t.Indikator || '')}</div></div>
            <div class="seg-tabs" role="radiogroup">${['Belum', 'Proses', 'Tercapai'].map(s => `<button type="button" data-s="${s}" class="${state[t.ID_Target].s === s ? 'active' : ''}">${s}</button>`).join('')}</div></div>
            <input class="input sm mt-2" maxlength="300" placeholder="Catatan pengajar (opsional)" value="${attr(state[t.ID_Target].c)}"></div>`).join('')}`).join('') || emptyState('bi-bullseye', 'Belum ada target untuk jenjang ini.')}`,
      foot: `<button class="btn btn-light" data-close>Batal</button><button class="btn btn-primary" id="capSave"><i class="bi bi-check2"></i> Simpan Penilaian</button>`
    });
    m.el.addEventListener('click', e => {
      const b = e.target.closest('[data-s]'); if (!b) return;
      const box = b.closest('[data-t]');
      state[box.dataset.t].s = b.dataset.s;
      $$('[data-s]', box).forEach(x => x.classList.toggle('active', x === b));
    });
    $('#capAll', m.el).onclick = () => { $$('[data-t]', m.el).forEach(box => { state[box.dataset.t].s = 'Tercapai'; $$('[data-s]', box).forEach(x => x.classList.toggle('active', x.dataset.s === 'Tercapai')); }); };
    $('#capSave', m.el).onclick = () => {
      $$('[data-t]', m.el).forEach(box => { state[box.dataset.t].c = $('input', box).value.trim(); });
      const items = tg.map(t => ({ ID_Jamaah: jid, ID_Target: t.ID_Target, Status: state[t.ID_Target].s, Catatan: state[t.ID_Target].c }))
        .filter(it => { const o = m0.get(it.ID_Target); return !o ? it.Status !== 'Belum' || it.Catatan : o.s !== it.Status || (o.c || '') !== it.Catatan; });
      m.close();
      if (!items.length) { UI.toast('Tidak ada perubahan.', 'info'); return; }
      const prev = S.d.capaian, now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      App.mutate({
        apply: () => {
          const keys = new Set(items.map(i => i.ID_Target));
          S.d.capaian = prev.filter(c => !(c[0] === jid && keys.has(c[1]))).concat(items.map(i => { const o = m0.get(i.ID_Target) || {}; return [jid, i.ID_Target, i.Status, i.Status === 'Tercapai' ? (o.s === 'Tercapai' ? o.t : D.today()) : '', i.Catatan, now]; }));
        },
        rollback: () => { S.d.capaian = prev; },
        call: () => API.run('apiSaveCapaian', items),
        okMsg: `Capaian ${j.Nama_Lengkap} diperbarui (${items.length} target).`,
        onSaved: rows => { const keys = new Set(rows.map(r => r[1])); S.d.capaian = S.d.capaian.filter(c => !(c[0] === jid && keys.has(c[1]))).concat(rows); }
      }).catch(() => {});
    };
  },
  rapor(jid, btn) { Pages.laporan.pdf('rapor', { ID_Jamaah: jid }, btn); },
  exportXlsx() {
    const tg = S.idx.tgtByJenjang[S.ui.cap.jenjang] || [];
    const rows = Pages.capaian.list().map(({ j, p, a }) => {
      const m = S.idx.cap.get(j.ID_Jamaah) || new Map();
      const r = { 'ID Jamaah': j.ID_Jamaah, 'Nama': j.Nama_Lengkap, 'Kelompok': Store.kelName(j.ID_Kelompok), 'Progres (%)': p.pct, 'Tercapai': p.done, 'Total Target': p.total, 'Kehadiran 5 sesi (%)': a.pct };
      const ok = new Set(Stats.targetsOf(j).map(t => t.ID_Target));
      tg.forEach(t => { r[t.Deskripsi_Target.slice(0, 40)] = ok.has(t.ID_Target) ? ((m.get(t.ID_Target) || {}).s || 'Belum') : '–'; });
      return r;
    });
    Excel.export('Rekap_Capaian_' + S.ui.cap.jenjang.replace(/\s/g, '_') + '_' + D.today(), [{ name: 'Capaian ' + S.ui.cap.jenjang, rows }]);
  }
};

/* ───────────────────────── INFAQ ───────────────────────── */
Pages.infaq = {
  render() {
    const f = S.ui.inf, ym = f.bulan, prev = D.addMonths(ym, -1), master = !Store.canInfaq();
    const list = Stats.infMonth(ym).sort((a, b) => String(b.Tanggal).localeCompare(String(a.Tanggal)));
    const total = sum(list, i => i.Jumlah), totalPrev = sum(Stats.infMonth(prev), i => i.Jumlah);
    const held = Stats.held(Stats.kegMonth(ym)).filter(Store.infOk);
    const noInf = held.filter(k => !S.idx.infKeg.has(k.ID_Kegiatan));
    const perKel = {};
    list.forEach(i => { const p = perKel[i.ID_Kelompok] = perKel[i.ID_Kelompok] || { amt: 0, n: 0 }; p.amt += i.Jumlah; p.n++; });
    const rank = Object.keys(perKel).map(id => ({ id, ...perKel[id] })).sort((a, b) => b.amt - a.amt);
    const perJ = Store.jj().map(j => ({ j, amt: sum(list.filter(i => (S.idx.keg.get(i.ID_Kegiatan) || {}).Jenjang === j), i => i.Jumlah) }));
    const q = f.q.trim().toLowerCase();
    const rows = list.filter(i => { const k = S.idx.keg.get(i.ID_Kegiatan) || {}; return !q || (i.ID_Infaq + ' ' + k.Nama_Kegiatan + ' ' + Store.kelName(i.ID_Kelompok)).toLowerCase().includes(q); });

    $('#page-infaq').innerHTML = pageHead('Keuangan & Laporan <i class="bi bi-chevron-right"></i> <b>Infaq Pengajian</b>', 'Infaq Pengajian & Rekap',
      'Pencatatan infaq masuk per kegiatan pengajian kelompok, tersinkron otomatis ke Google Sheets & Drive.',
      `${Store.isGuru() ? '' : `<button class="btn btn-light" onclick="Pages.laporan.pdf('infaq',{bulan:'${ym}',ID_Kelompok:${Store.allKel() && Store.scopeKel() !== 'ALL' ? `'${Store.scopeKel()}'` : "''"}},this)"><i class="bi bi-file-earmark-pdf"></i> Unduh Rekap PDF</button>`}
       <button class="btn btn-light" onclick="Pages.infaq.exportXlsx()"><i class="bi bi-file-earmark-excel"></i> Ekspor Excel</button>
       ${master ? '' : '<button class="btn btn-primary" onclick="Pages.infaq.form()"><i class="bi bi-plus-circle"></i> Catat Infaq Baru</button>'}`) + `
      <div class="card"><div class="toolbar">
        <label class="field" style="flex:0 1 220px"><span class="field-label tiny muted"><i class="bi bi-calendar3"></i> Periode</span><select class="select" onchange="S.ui.inf.bulan=this.value;Pages.infaq.render()">${monthOptions(ym)}</select></label>
        <label class="field grow"><span class="field-label tiny muted"><i class="bi bi-search"></i> Cari</span><span class="search-input"><i class="bi bi-search"></i><input class="input" id="infSearch" placeholder="Kode infaq atau nama kegiatan…" value="${attr(f.q)}"></span></label>
        <div class="tiny muted" style="align-self:flex-end;padding-bottom:10px"><i class="bi bi-arrow-repeat"></i> ${esc(Store.scopeLabel())} · ${master ? 'Mode lihat (Master Admin)' : 'Dicatat oleh Admin Kelompok'}</div>
      </div></div>
      <div class="grid-4 section-gap">
        <div class="card kpi"><div class="kpi-label">Total Infaq Masuk</div><div class="kpi-icon"><i class="bi bi-wallet2"></i></div><div class="kpi-value">${F.rp(total)}</div><div class="kpi-foot">${trend(total, totalPrev, 'rp')}<span>${F.rp(totalPrev)} (${D.monthShort(prev)})</span></div></div>
        <div class="card kpi"><div class="kpi-label">Rata-rata per Sesi</div><div class="kpi-icon"><i class="bi bi-graph-up"></i></div><div class="kpi-value">${F.rp(list.length ? total / list.length : 0)}</div><div class="kpi-foot" style="align-items:center"><span>${list.length} sesi tercatat</span><div class="progress dark" style="width:40%"><span style="width:${pct(list.length, held.length || 1)}%"></span></div></div></div>
        <div class="card kpi"><div class="kpi-label">${master ? 'Kelompok Terbesar' : 'Sesi Tanpa Catatan'}</div><div class="kpi-icon gold"><i class="bi ${master ? 'bi-trophy' : 'bi-clipboard-x'}"></i></div>
          ${master ? `<div class="cell-strong" style="font-size:18px;color:var(--primary)">${rank[0] ? esc(Store.kelName(rank[0].id)) : '–'}</div><div class="kpi-foot"><span>Akumulasi</span><b>${rank[0] ? F.rp(rank[0].amt) : '–'}</b></div>`
            : `<div class="kpi-value">${noInf.length}<small>sesi</small></div><div class="kpi-foot"><span>Sudah terlaksana bulan ini</span>${noInf.length ? `<button class="btn btn-light btn-sm" onclick="Pages.infaq.form(null,'${noInf[0].ID_Kegiatan}')">Catat</button>` : ''}</div>`}</div>
        <div class="card kpi"><div class="kpi-label">Arsip Rekap PDF</div><div class="kpi-icon"><i class="bi bi-folder-check"></i></div><div class="kpi-value">${S.d.log.filter(l => l.Aksi === 'CETAK_LAPORAN' && /Infaq/.test(l.Keterangan)).length}<small>berkas</small></div><div class="kpi-foot"><span class="mono">/Ayo Ngaji/Laporan</span><span class="trend-up">Auto-sync</span></div></div>
      </div>
      <div class="grid grid-75 section-gap">
        <div class="card"><div class="card-head"><div><div class="card-title">Tren Pemasukan Infaq Bulanan</div><div class="card-sub">6 bulan terakhir · ${esc(Store.scopeLabel())}</div></div><span class="badge b-outline">${esc(D.monthLabel(ym))}</span></div>
          <div class="chart-box"><canvas id="chInf2" role="img" aria-label="Tren infaq bulanan"></canvas></div>
          <div class="kv mt-3">${perJ.map(x => `<div>${esc(x.j)}<b>${F.rpShort(x.amt)}</b></div>`).join('')}</div></div>
        <div class="card"><div class="card-head"><div><div class="card-title">${master ? 'Peringkat Kelompok' : 'Distribusi per Jenjang'}</div><div class="card-sub">Total infaq ${esc(D.monthLabel(ym))}</div></div><i class="bi bi-bar-chart-steps muted"></i></div>
          ${master ? (rank.length ? rank.map((r, i) => `<div class="rank ${i === 0 ? 'first' : ''}"><span class="no">${i + 1}</span><div class="grow"><div class="cell-strong">${esc(Store.kelName(r.id))}</div><div class="cell-sub">${r.n} sesi</div></div><div class="amt">${F.rp(r.amt)}<div class="tiny muted" style="font-weight:500">${F.pct(pct(r.amt, total))}</div></div></div>`).join('') : emptyState('bi-cash', 'Belum ada infaq bulan ini.'))
            : perJ.map(x => `<div class="tbar"><div class="tbar-head"><span>${esc(x.j)}</span><span class="pct">${F.rp(x.amt)}</span></div><div class="progress"><span style="width:${pct(x.amt, total || 1)}%;background:${JJ_COLOR[x.j]}"></span></div></div>`).join('')}
          <div class="note gold mt-3"><i class="bi bi-info-circle"></i><div><b>Ketentuan:</b> infaq dicatat sebagai pemasukan total per sesi pengajian (kaleng infaq), bukan per jamaah. Pengeluaran & saldo kas di luar cakupan versi ini.</div></div></div>
      </div>
      <div class="card flush section-gap"><div class="card-head" style="padding:18px 20px 0"><div><div class="card-title">Riwayat Pemasukan Infaq Sesi Pengajian</div><div class="card-sub">Tersambung dengan sheet "Infaq Kelompok"</div></div></div>
        ${rows.length ? `<div class="table-wrap"><table class="table stack"><thead><tr><th>ID & Tanggal</th><th>Kegiatan & Jenjang</th><th>Kelompok & Lokasi</th><th class="right">Nominal</th><th>Pencatat</th><th class="actions">Aksi</th></tr></thead><tbody>
          ${rows.map(i => { const k = S.idx.keg.get(i.ID_Kegiatan) || {}; const u = S.d.pengguna.find(p => p.Email === i.Dicatat_Oleh); return `<tr>
            <td class="td-main"><div class="mono cell-strong" style="color:var(--primary)">${esc(i.ID_Infaq)}</div><div class="cell-sub">${D.short(i.Tanggal)}</div></td>
            <td data-label="Kegiatan"><div class="cell-strong">${esc(k.Nama_Kegiatan || '–')}</div>${jjBadge(k.Jenjang)}</td>
            <td data-label="Kelompok"><div class="cell-strong">${esc(Store.kelName(i.ID_Kelompok))}</div><div class="cell-sub">${esc(k.Tempat || '')}</div></td>
            <td data-label="Nominal" class="right"><b class="mono" style="font-size:14px">${F.rp(i.Jumlah)}</b></td>
            <td data-label="Pencatat"><div class="cell-strong small">${esc(u ? u.Nama : (i.Dicatat_Oleh || '–'))}</div><div class="cell-sub">${esc(i.Keterangan || '')}</div></td>
            <td class="actions">${master ? '<span class="badge b-ok"><span class="dot"></span>Tercatat</span>' : `<button class="icon-btn sm" aria-label="Ubah" onclick="Pages.infaq.form('${i.ID_Infaq}')"><i class="bi bi-pencil"></i></button><button class="icon-btn sm" aria-label="Hapus" onclick="Pages.infaq.remove('${i.ID_Infaq}')"><i class="bi bi-trash3"></i></button>`}</td></tr>`; }).join('')}
          </tbody></table></div><div class="table-foot"><span><span class="dot dot-ok"></span> ${rows.length} transaksi · Total ${F.rp(sum(rows, i => i.Jumlah))}</span></div>` : emptyState('bi-cash-coin', 'Belum ada infaq pada periode ini.')}</div>`;
    $('#infSearch').addEventListener('input', debounce(e => { S.ui.inf.q = e.target.value; const p = e.target.selectionStart; Pages.infaq.render(); const i = $('#infSearch'); i.focus(); i.setSelectionRange(p, p); }, 250));
    const months = D.months(ym, 6);
    Charts.make('chInf2', {
      type: 'bar',
      data: { labels: months.map(m => D.monthShort(m) + (m === ym ? '*' : '')), datasets: [{ data: months.map(m => sum(Stats.infMonth(m), i => i.Jumlah)), backgroundColor: months.map(m => m === ym ? Charts.css('--primary') : Charts.css('--surface-3')), borderRadius: 8, maxBarThickness: 56 }] },
      options: { scales: { y: { ticks: { callback: v => F.rpShort(v) } }, x: { grid: { display: false } } }, plugins: { tooltip: { callbacks: { label: c => ' ' + F.rp(c.parsed.y) } } } }
    });
  },

  form(id, kegId) {
    const i0 = id ? S.d.infaq.find(x => x.ID_Infaq === id) : null;
    const today = D.today();
    const keg = Store.kegScope().filter(k => k.Tanggal <= today && Store.infOk(k)).sort((a, b) => (b.Tanggal + b.Waktu_Mulai).localeCompare(a.Tanggal + a.Waktu_Mulai)).slice(0, 120);
    const sel = i0 ? i0.ID_Kegiatan : (kegId || (keg.find(k => !S.idx.infKeg.has(k.ID_Kegiatan)) || {}).ID_Kegiatan || '');
    const m = UI.modal({
      title: i0 ? 'Ubah Catatan Infaq' : 'Catat Infaq Pengajian',
      body: `<form id="infForm" class="form-grid">
        <label class="field"><span class="field-label">Sesi pengajian <span class="req">*</span></span><select class="select" name="ID_Kegiatan">${keg.map(k => { const ex = S.idx.infKeg.get(k.ID_Kegiatan); return opt(k.ID_Kegiatan, `${D.short(k.Tanggal)} · ${k.Jenjang} · ${k.Nama_Kegiatan}${ex && (!i0 || ex.ID_Infaq !== i0.ID_Infaq) ? ' (sudah ' + F.rpShort(ex.Jumlah) + ')' : ''}`, sel); }).join('')}</select>
          <span class="field-help">Satu catatan per sesi. Memilih sesi yang sudah tercatat akan memperbarui nominalnya.</span></label>
        <label class="field"><span class="field-label">Nominal masuk (IDR) <span class="req">*</span></span><div class="input-money"><span>Rp</span><input class="input" name="Jumlah" inputmode="numeric" placeholder="0" value="${i0 ? F.num(i0.Jumlah) : ''}"></div></label>
        <label class="field"><span class="field-label">Keterangan / pos infaq</span><input class="input" name="Keterangan" maxlength="200" value="${attr(i0 ? i0.Keterangan : 'Infaq kaleng keliling')}"></label>
        <div id="infErr" class="form-error" hidden></div></form>`,
      foot: `<button class="btn btn-light" data-close>Batal</button><button class="btn btn-gold" id="infSave"><i class="bi bi-check2"></i> Simpan Infaq</button>`
    });
    const amt = $('[name=Jumlah]', m.el);
    amt.addEventListener('input', () => { amt.value = amt.value.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.'); });
    $('#infSave', m.el).onclick = () => {
      const fd = Object.fromEntries(new FormData($('#infForm', m.el)).entries());
      const n = Number(fd.Jumlah.replace(/\D/g, ''));
      if (!fd.ID_Kegiatan || !n) { const e = $('#infErr', m.el); e.textContent = !fd.ID_Kegiatan ? 'Pilih sesi pengajian.' : 'Nominal harus lebih dari 0.'; e.hidden = false; return; }
      m.close();
      const ex = S.idx.infKeg.get(fd.ID_Kegiatan);
      Pages.infaq.commit({ ID_Infaq: i0 ? i0.ID_Infaq : (ex ? ex.ID_Infaq : uid('INF')), ID_Kegiatan: fd.ID_Kegiatan, Jumlah: n, Keterangan: fd.Keterangan.trim() });
    };
  },
  commit(rec) {
    const k = S.idx.keg.get(rec.ID_Kegiatan);
    const local = Object.assign({}, rec, { ID_Kelompok: k.ID_Kelompok, Tanggal: k.Tanggal, Dicatat_Oleh: S.user.Email });
    const prev = S.d.infaq;
    App.mutate({
      apply: () => { S.d.infaq = prev.filter(i => i.ID_Kegiatan !== rec.ID_Kegiatan || i.ID_Infaq === rec.ID_Infaq); Store.upsert('infaq', local, 'ID_Infaq'); },
      rollback: () => { S.d.infaq = prev; },
      call: () => API.run('apiSaveInfaq', rec),
      okMsg: `Infaq ${F.rp(rec.Jumlah)} tercatat.`,
      onSaved: r => { r.Jumlah = Number(r.Jumlah); Store.upsert('infaq', r, 'ID_Infaq'); }
    }).catch(() => {});
  },
  async remove(id) {
    const i = S.d.infaq.find(x => x.ID_Infaq === id);
    if (!(await UI.confirm(`Hapus catatan infaq <b>${F.rp(i.Jumlah)}</b> (${esc(id)})?`, { ok: 'Hapus', danger: true }))) return;
    const prev = S.d.infaq;
    App.mutate({ apply: () => { S.d.infaq = prev.filter(x => x.ID_Infaq !== id); }, rollback: () => { S.d.infaq = prev; }, call: () => API.run('apiDeleteInfaq', id), okMsg: 'Catatan infaq dihapus.' }).catch(() => {});
  },
  exportXlsx() {
    const ym = S.ui.inf.bulan;
    const rows = Stats.infMonth(ym).map(i => { const k = S.idx.keg.get(i.ID_Kegiatan) || {}; return { 'ID Infaq': i.ID_Infaq, 'Tanggal': i.Tanggal, 'Kegiatan': k.Nama_Kegiatan, 'Jenjang': k.Jenjang, 'Kelompok': Store.kelName(i.ID_Kelompok), 'Nominal (Rp)': i.Jumlah, 'Keterangan': i.Keterangan, 'Dicatat Oleh': i.Dicatat_Oleh }; });
    Excel.export('Infaq_' + ym + '_' + Store.scopeLabel().replace(/\W+/g, '_'), [{ name: 'Infaq ' + ym, rows }]);
  }
};

/* ───────────────────────── LAPORAN ───────────────────────── */
Pages.laporan = {
  render() {
    const f = S.ui.lap, master = Store.allKel();
    const jamOpts = Store.jamaahScope().filter(j => j.Jenjang !== 'Dewasa').sort((a, b) => a.Nama_Lengkap.localeCompare(b.Nama_Lengkap));
    const held = Stats.held(Stats.kegMonth(f.bulan));
    $('#page-laporan').innerHTML = pageHead('Keuangan & Laporan <i class="bi bi-chevron-right"></i> <b>Laporan & Rekap</b>', 'Pusat Laporan & Rekapitulasi',
      'Statistik bergrafik dan dokumen resmi yang dibuat otomatis oleh Apps Script. PDF tersimpan di folder Drive "Laporan"; Excel dibuat langsung di perangkat.', '') + `
      <div class="card"><div class="toolbar">
        <label class="field" style="flex:0 1 220px"><span class="field-label tiny muted">Periode</span><select class="select" onchange="S.ui.lap.bulan=this.value;Pages.laporan.render()">${monthOptions(f.bulan)}</select></label>
        <label class="field" style="flex:0 1 200px"><span class="field-label tiny muted">Jenjang</span><select class="select" onchange="S.ui.lap.jenjang=this.value;Pages.laporan.render()">${opt('', 'Semua Jenjang', f.jenjang)}${Store.jj().map(j => opt(j, j, f.jenjang)).join('')}</select></label>
        <div class="tiny muted" style="align-self:flex-end;padding-bottom:10px"><i class="bi bi-people"></i> ${esc(Store.scopeLabel())}${master ? ' · ubah lewat "Kelompok Aktif" di menu' : ''}</div>
      </div></div>
      <div class="grid-2 section-gap">
        <div class="card"><div class="card-head"><div><div class="card-title">Kehadiran per Jenjang</div><div class="card-sub">${esc(D.monthLabel(f.bulan))} · H / I / S / A</div></div></div><div class="chart-box"><canvas id="chLapAtt" role="img" aria-label="Kehadiran per jenjang"></canvas></div></div>
        <div class="card"><div class="card-head"><div><div class="card-title">Progres Target per Jenjang</div><div class="card-sub">Persentase indikator tercapai saat ini</div></div></div><div class="chart-box"><canvas id="chLapCap" role="img" aria-label="Capaian per jenjang"></canvas></div></div>
      </div>
      <div class="grid-3 section-gap">
        <div class="card rep-card"><div class="rep-icon red"><i class="bi bi-file-earmark-pdf"></i></div><div class="card-title">Rekap Absensi Bulanan</div>
          <p class="muted small">Ringkasan H/I/S/A setiap sesi ${esc(D.monthLabel(f.bulan))}${f.jenjang ? ' · ' + esc(f.jenjang) : ''} (${held.length} sesi), lengkap dengan kolom tanda tangan.</p>
          <div class="row mt-2"><button class="btn btn-primary btn-sm grow" onclick="Pages.laporan.pdf('absensi',{bulan:S.ui.lap.bulan,Jenjang:S.ui.lap.jenjang,ID_Kelompok:Pages.laporan.kel()},this)"><i class="bi bi-printer"></i> Pratinjau PDF</button><button class="btn btn-light btn-sm" onclick="Pages.laporan.absXlsx()"><i class="bi bi-file-earmark-excel"></i> Excel</button></div></div>
        <div class="card rep-card"><div class="rep-icon green"><i class="bi bi-award"></i></div><div class="card-title">Rapor Capaian Jamaah</div>
          <p class="muted small">Rapor per jamaah: status setiap target, catatan pengajar, dan persentase kehadiran.</p>
          <select class="select" id="lapJam" aria-label="Pilih jamaah">${jamOpts.map(j => opt(j.ID_Jamaah, `${j.Nama_Lengkap} · ${j.Jenjang}`, f.jamaah)).join('')}</select>
          <button class="btn btn-primary btn-sm" onclick="S.ui.lap.jamaah=$('#lapJam').value;Pages.laporan.pdf('rapor',{ID_Jamaah:$('#lapJam').value},this)" ${jamOpts.length ? '' : 'disabled'}><i class="bi bi-printer"></i> Cetak Rapor PDF</button></div>
        <div class="card rep-card"><div class="rep-icon gold"><i class="bi bi-cash-coin"></i></div><div class="card-title">Rekap Infaq Bulanan</div>
          <p class="muted small">Total infaq ${esc(D.monthLabel(f.bulan))}: <b>${F.rp(sum(Stats.infMonth(f.bulan), i => i.Jumlah))}</b>${master ? ', termasuk ringkasan per kelompok' : ''}.</p>
          <div class="row mt-2"><button class="btn btn-primary btn-sm grow" onclick="Pages.laporan.pdf('infaq',{bulan:S.ui.lap.bulan,ID_Kelompok:Pages.laporan.kel()},this)"><i class="bi bi-printer"></i> Pratinjau PDF</button><button class="btn btn-light btn-sm" onclick="S.ui.inf.bulan=S.ui.lap.bulan;Pages.infaq.exportXlsx()"><i class="bi bi-file-earmark-excel"></i> Excel</button></div></div>
      </div>
      <div class="grid-2 section-gap">
        <div class="card rep-card"><div class="rep-icon green"><i class="bi bi-table"></i></div><div class="card-title">Ekspor Database Jamaah</div><p class="muted small">Seluruh data jamaah ${esc(Store.scopeLabel())} beserta persentase kehadiran.</p>
          <button class="btn btn-light btn-sm" onclick="S.ui.jm={q:'',jenjang:'ALL',kelas:'ALL',dapukan:'ALL',status:'ALL',jk:'ALL',page:1,per:10};Pages.jamaah.exportXlsx()"><i class="bi bi-download"></i> Unduh Excel</button></div>
        <div class="card"><div class="card-head"><div class="card-title"><i class="bi bi-shield-check"></i> Log Aktivitas</div><span class="badge b-outline">${S.d.log.length} terbaru</span></div>
          <div style="max-height:300px;overflow:auto"><ul class="timeline">${S.d.log.slice(0, 25).map(l => `<li><b>${esc((S.d.pengguna.find(p => p.Email === l.Pengguna) || {}).Nama || l.Pengguna)}</b> · ${esc(Pages.dashboard.aksi(l.Aksi))}<br><span class="muted">${esc(l.Keterangan)}</span><div class="t">${esc(l.Waktu)}</div></li>`).join('') || '<p class="muted">Belum ada aktivitas.</p>'}</ul></div></div>
      </div>`;
    const kegs = held.filter(k => !f.jenjang || k.Jenjang === f.jenjang);
    const labels = Store.jj().filter(j => !f.jenjang || j === f.jenjang);
    const by = labels.map(j => Stats.att(kegs.filter(k => k.Jenjang === j)));
    Charts.make('chLapAtt', {
      type: 'bar',
      data: { labels, datasets: [['H', 'Hadir', Charts.css('--primary')], ['I', 'Izin', '#8A6A00'], ['S', 'Sakit', Charts.css('--gold')], ['A', 'Alpa', Charts.css('--bad')]].map(([s, l, c]) => ({ label: l, data: by.map(b => b[s]), backgroundColor: c, borderRadius: 4, maxBarThickness: 38 })) },
      options: { scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true } }, plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } } } }
    });
    const cap = JENJANG_TARGET.map(j => Stats.jenjangCapaian(j).pct);
    Charts.make('chLapCap', {
      type: 'bar', data: { labels: JENJANG_TARGET, datasets: [{ data: cap, backgroundColor: JENJANG_TARGET.map(j => JJ_COLOR[j]), borderRadius: 8, maxBarThickness: 30 }] },
      options: { indexAxis: 'y', scales: { x: { max: 100, ticks: { callback: v => v + '%' } }, y: { grid: { display: false } } }, plugins: { tooltip: { callbacks: { label: c => ' ' + F.pct(c.parsed.x) + ' tercapai' } } } }
    });
  },
  kel() { const k = Store.scopeKel(); return k === 'ALL' ? '' : k; },
  async pdf(type, params, btn) {
    UI.busy(btn, true, 'Membuat PDF…');
    try { const res = await API.run('apiGenerateReport', type, params); UI.pdf(res); }
    catch (e) { UI.toast(e.message, 'bad'); }
    finally { UI.busy(btn, false); }
  },
  absXlsx() {
    const f = S.ui.lap;
    const kegs = Stats.kegMonth(f.bulan).filter(k => !f.jenjang || k.Jenjang === f.jenjang).sort((a, b) => a.Tanggal.localeCompare(b.Tanggal));
    const ring = kegs.map(k => { const a = Stats.att([k]); return { 'Tanggal': k.Tanggal, 'Waktu': k.Waktu_Mulai + '-' + k.Waktu_Selesai, 'Kegiatan': k.Nama_Kegiatan, 'Jenjang': k.Jenjang, 'Kelompok': Store.kelName(k.ID_Kelompok), 'Hadir': a.H, 'Izin': a.I, 'Sakit': a.S, 'Alpa': a.A, '% Hadir': a.pct, 'Status': k.Status_Absensi }; });
    const detail = [];
    kegs.forEach(k => (S.idx.abs.get(k.ID_Kegiatan) || new Map()).forEach((v, jid) => { const j = S.idx.jam.get(jid) || {}; detail.push({ 'Tanggal': k.Tanggal, 'Kegiatan': k.Nama_Kegiatan, 'ID Jamaah': jid, 'Nama': j.Nama_Lengkap, 'Jenjang': k.Jenjang, 'Status': ST_LABEL[v.s], 'Catatan': v.c }); }));
    Excel.export('Absensi_' + f.bulan + '_' + Store.scopeLabel().replace(/\W+/g, '_'), [{ name: 'Ringkasan Sesi', rows: ring }, { name: 'Detail Kehadiran', rows: detail }]);
  }
};

/* ───────────────────────── PENGGUNA (Master) ───────────────────────── */
/* ───────────────────────── JADWAL KHOTBAH JUM'AT ───────────────────────── */
const nextFriday = (from) => { const d = D.parse(from || D.today()); const add = (5 - d.getDay() + 7) % 7; d.setDate(d.getDate() + add); return D.iso(d); };
Pages.jumat = {
  list() {
    const f = S.ui.jmt, t = D.today();
    return S.d.jumat.filter(x => Store.inScope(x) && (f.kel === 'ALL' || x.ID_Kelompok === f.kel) &&
      (f.per === 'next' ? x.Tanggal >= t : f.per === 'past' ? x.Tanggal < t : x.Tanggal.slice(0, 7) === f.per))
      .sort((a, b) => f.per === 'past' ? (b.Tanggal + b.Waktu).localeCompare(a.Tanggal + a.Waktu) : (a.Tanggal + a.Waktu).localeCompare(b.Tanggal + b.Waktu));
  },
  render() {
    const f = S.ui.jmt, rows = Pages.jumat.list(), can = Store.canJumat(), t = D.today();
    const months = D.months(D.ym(new Date()), 6).reverse().concat(D.months(D.ym(new Date(Date.now() + 62 * 864e5)), 2).reverse()).filter((x, i, a) => a.indexOf(x) === i).sort().reverse();
    const nf = nextFriday(t), nx = S.d.jumat.filter(x => Store.inScope(x) && x.Tanggal >= t).sort((a, b) => (a.Tanggal + a.Waktu).localeCompare(b.Tanggal + b.Waktu));
    const card = x => { const today = x.Tanggal === t; return `<div class="card jmt-card ${x.Tanggal < t ? 'past' : ''}">
        <div class="row"><div class="jmt-date"><b>${D.parse(x.Tanggal).getDate()}</b><small>${esc(BULAN[D.parse(x.Tanggal).getMonth()].slice(0, 3))}</small></div>
          <div class="grow"><div class="cell-strong">${esc(D.dayLong(x.Tanggal))} ${today ? '<span class="badge b-ok">Hari ini</span>' : ''}</div><div class="tiny muted"><i class="bi bi-clock"></i> ${esc(x.Waktu)} WIB · <i class="bi bi-geo-alt"></i> ${esc(x.Tempat || Store.kelName(x.ID_Kelompok))}${Store.allKel() ? ' · ' + esc(Store.kelName(x.ID_Kelompok)) : ''}</div></div>
          <button class="icon-btn sm" aria-label="Kirim jadwal Jum'at ini via WhatsApp" title="Kirim via WA" onclick="Pages.jumat.wa(['${x.ID_Jumat}'])"><i class="bi bi-whatsapp" style="color:#25D366"></i></button>
          ${can ? `<button class="icon-btn sm" aria-label="Ubah jadwal" onclick="Pages.jumat.form('${x.ID_Jumat}')"><i class="bi bi-pencil"></i></button><button class="icon-btn sm" aria-label="Hapus jadwal" onclick="Pages.jumat.remove('${x.ID_Jumat}')"><i class="bi bi-trash3" style="color:var(--bad)"></i></button>` : ''}</div>
        <div class="jmt-roles"><div><small><i class="bi bi-mic"></i> Khotib</small><b>${esc(x.Khotib)}</b></div><div><small><i class="bi bi-person-standing"></i> Imam</small><b>${esc(x.Imam)}</b></div><div><small><i class="bi bi-megaphone"></i> Muadzin</small><b>${esc(x.Muadzin)}</b></div></div>
        ${x.Keterangan ? `<div class="tiny muted mt-2"><i class="bi bi-info-circle"></i> ${esc(x.Keterangan)}</div>` : ''}
        ${x.Tanggal <= t ? `<div class="jmt-infaq mt-2"><i class="bi bi-cash-coin"></i><div class="grow"><small>Infaq Jum'atan</small><b>${x.Infaq === '' || x.Infaq === undefined || x.Infaq === null ? '<span class="muted">Belum dicatat</span>' : esc(F.rp(x.Infaq))}</b></div>
          ${Store.canInfaqJumat() ? `<button class="btn btn-soft btn-sm" onclick="Pages.jumat.infaq('${x.ID_Jumat}')"><i class="bi bi-pencil-square"></i> ${x.Infaq === '' || x.Infaq === undefined || x.Infaq === null ? 'Catat' : 'Ubah'}</button>` : ''}</div>` : ''}</div>`; };
    const ymNow = D.ym(new Date()), infBln = S.d.jumat.filter(x => Store.inScope(x) && (f.kel === 'ALL' || x.ID_Kelompok === f.kel) && x.Tanggal.slice(0, 7) === ymNow && x.Infaq !== '' && x.Infaq !== undefined && x.Infaq !== null);
    $('#page-jumat').innerHTML = pageHead('Pembinaan <i class="bi bi-chevron-right"></i> <b>Jadwal Jum\'at</b>', "Jadwal Khotbah Jum'at",
      'Petugas Jum\'at per kelompok: khotib, imam salat, muadzin & waktu — bisa langsung dikirim via WhatsApp.',
      `<button class="btn btn-light" onclick="Pages.jumat.wa()"><i class="bi bi-whatsapp" style="color:#25D366"></i> Kirim via WA</button>${can ? `<button class="btn btn-primary" onclick="Pages.jumat.form()"><i class="bi bi-plus-lg"></i> Tambah Jadwal</button>` : ''}`) + `
      <div class="grid-3 section-gap">
        <div class="card kpi compact"><div class="kpi-label">Jum'at Terdekat</div><div class="kpi-icon"><i class="bi bi-moon-stars"></i></div><div class="kpi-value" style="font-size:20px">${esc(D.dayLong(nf).replace(/^Jumat, /, ''))}</div><div class="kpi-foot"><span>${nx.filter(x => x.Tanggal === nf).length ? nx.filter(x => x.Tanggal === nf).length + ' jadwal terisi' : '<span style="color:var(--warn-text)">Belum ada petugas</span>'}</span></div></div>
        <div class="card kpi compact"><div class="kpi-label">Jadwal Mendatang</div><div class="kpi-icon gold"><i class="bi bi-calendar-week"></i></div><div class="kpi-value">${nx.length}</div><div class="kpi-foot"><span>${nx.length ? 's.d. ' + esc(D.short(nx[nx.length - 1].Tanggal)) : 'Belum ada'}</span></div></div>
        <div class="card kpi compact"><div class="kpi-label">Infaq Jum'at ${esc(D.monthLabel(ymNow))}</div><div class="kpi-icon"><i class="bi bi-cash-coin"></i></div><div class="kpi-value" style="font-size:22px">${esc(F.rp(infBln.reduce((a, x) => a + (Number(x.Infaq) || 0), 0)))}</div><div class="kpi-foot"><span>${infBln.length} Jum'at tercatat</span></div></div>
      </div>
      <div class="card section-gap"><div class="toolbar">
        <select class="select" aria-label="Periode" onchange="S.ui.jmt.per=this.value;Pages.jumat.render()">${opt('next', 'Mendatang', f.per)}${opt('past', 'Sudah lewat', f.per)}<optgroup label="Per bulan">${months.map(m => opt(m, D.monthLabel(m), f.per)).join('')}</optgroup></select>
        ${Store.allKel() ? `<select class="select" aria-label="Kelompok" onchange="S.ui.jmt.kel=this.value;Pages.jumat.render()">${opt('ALL', 'Semua Kelompok', f.kel)}${S.d.kelompok.map(k => opt(k.ID_Kelompok, k.Nama_Kelompok, f.kel)).join('')}</select>` : ''}
        <span class="tiny muted">${rows.length} jadwal</span></div></div>
      ${rows.length ? `<div class="jmt-grid section-gap">${rows.map(card).join('')}</div>` : `<div class="card section-gap">${emptyState('bi-moon-stars', f.per === 'next' ? "Belum ada jadwal Jum'at mendatang." : 'Tidak ada jadwal pada periode ini.')}${can && f.per === 'next' ? `<div class="center mt-3"><button class="btn btn-primary" onclick="Pages.jumat.form()"><i class="bi bi-plus-lg"></i> Tambah Jadwal Jum'at</button></div>` : ''}</div>`}`;
  },
  form(id) {
    const x0 = id ? S.d.jumat.find(x => x.ID_Jumat === id) : null;
    const all = Store.allKel();
    const kel0 = x0 ? x0.ID_Kelompok : (Store.scopeKel() !== 'ALL' ? Store.scopeKel() : (S.d.kelompok[0] || {}).ID_Kelompok);
    const last = S.d.jumat.filter(x => x.ID_Kelompok === kel0).sort((a, b) => b.Tanggal.localeCompare(a.Tanggal))[0];
    const names = [...new Set(S.d.jumat.flatMap(x => [x.Khotib, x.Imam, x.Muadzin]).filter(Boolean))].sort();
    const m = UI.modal({ title: (x0 ? 'Ubah' : 'Tambah') + " Jadwal Jum'at", size: 'md',
      body: `<form id="jmtForm" class="form-grid two" novalidate><datalist id="jmtNames">${names.map(n => `<option value="${attr(n)}">`).join('')}</datalist>
        ${all && !x0 ? `<label class="field span-2"><span class="field-label">Kelompok <span class="req">*</span></span><select class="select" name="ID_Kelompok">${kelOptions(kel0)}</select></label>` : `<label class="field span-2"><span class="field-label">Kelompok</span><input class="input" readonly value="${attr(Store.kelName(kel0))}"></label>`}
        <label class="field"><span class="field-label">Tanggal (Jumat) <span class="req">*</span></span><input class="input" type="date" name="Tanggal" value="${attr(x0 ? x0.Tanggal : nextFriday())}"><span class="field-help" id="jmtHari"></span></label>
        <label class="field"><span class="field-label">Waktu <span class="req">*</span></span><input class="input" type="time" name="Waktu" value="${attr(x0 ? x0.Waktu : (last ? last.Waktu : '11:45'))}"><span class="field-help">Jam azan / mulai khotbah</span></label>
        <label class="field span-2"><span class="field-label">Tempat / masjid</span><input class="input" name="Tempat" maxlength="120" placeholder="mis. Masjid Al-Ikhlas" value="${attr(x0 ? x0.Tempat : (last ? last.Tempat : ''))}"></label>
        <label class="field span-2"><span class="field-label"><i class="bi bi-mic"></i> Khotib <span class="req">*</span></span><input class="input" name="Khotib" list="jmtNames" maxlength="100" value="${attr(x0 ? x0.Khotib : '')}"></label>
        <label class="field"><span class="field-label"><i class="bi bi-person-standing"></i> Imam salat <span class="req">*</span></span><input class="input" name="Imam" list="jmtNames" maxlength="100" value="${attr(x0 ? x0.Imam : '')}">
          <label class="check-row" style="min-height:32px"><input type="checkbox" id="jmtSama" ${x0 && x0.Imam === x0.Khotib ? 'checked' : ''}> <span class="small">Sama dengan khotib</span></label></label>
        <label class="field"><span class="field-label"><i class="bi bi-megaphone"></i> Muadzin <span class="req">*</span></span><input class="input" name="Muadzin" list="jmtNames" maxlength="100" value="${attr(x0 ? x0.Muadzin : '')}"></label>
        <label class="field span-2"><span class="field-label">Keterangan</span><input class="input" name="Keterangan" maxlength="300" placeholder="opsional, mis. tema khotbah" value="${attr(x0 ? x0.Keterangan : '')}"></label>
        <div id="jmtErr" class="form-error span-2" hidden></div></form>`,
      foot: `<button class="btn btn-light" data-close>Batal</button><button class="btn btn-primary" id="jmtSave"><i class="bi bi-check-lg"></i> Simpan</button>` });
    const form = $('#jmtForm', m.el);
    const hari = () => { const v = form.Tanggal.value, ok = v && D.parse(v).getDay() === 5; $('#jmtHari', m.el).innerHTML = !v ? '' : ok ? esc(D.dayLong(v)) : `<span style="color:var(--bad)">${esc(D.dayLong(v))} — bukan hari Jumat</span>`; };
    form.Tanggal.addEventListener('input', hari); hari();
    const sama = () => { if ($('#jmtSama', m.el).checked) { form.Imam.value = form.Khotib.value; form.Imam.readOnly = true; } else form.Imam.readOnly = false; };
    $('#jmtSama', m.el).onchange = sama; form.Khotib.addEventListener('input', sama); sama();
    $('#jmtSave', m.el).onclick = () => {
      sama();
      const fd = Object.fromEntries(new FormData(form).entries()), e = $('#jmtErr', m.el);
      const bad = !fd.Tanggal ? 'Tanggal wajib diisi.' : D.parse(fd.Tanggal).getDay() !== 5 ? 'Tanggal harus hari Jumat.' : !fd.Waktu ? 'Waktu wajib diisi.'
        : !fd.Khotib.trim() || !fd.Imam.trim() || !fd.Muadzin.trim() ? 'Khotib, imam, dan muadzin wajib diisi.' : '';
      if (bad) { e.textContent = bad; e.hidden = false; return; }
      const rec = { ID_Jumat: x0 ? x0.ID_Jumat : uid('JMT'), ID_Kelompok: x0 ? x0.ID_Kelompok : (all ? fd.ID_Kelompok : Store.myKel()), Tanggal: fd.Tanggal, Waktu: fd.Waktu,
        Tempat: fd.Tempat.trim(), Khotib: fd.Khotib.trim(), Imam: fd.Imam.trim(), Muadzin: fd.Muadzin.trim(), Keterangan: fd.Keterangan.trim() };
      const prev = S.d.jumat.slice();
      m.close();
      App.mutate({
        apply: () => { S.d.jumat = S.d.jumat.filter(x => x.ID_Jumat !== rec.ID_Jumat).concat([rec]); },
        rollback: () => { S.d.jumat = prev; },
        call: () => API.run('apiSaveJumat', rec),
        onSaved: r => { S.d.jumat = S.d.jumat.filter(x => x.ID_Jumat !== rec.ID_Jumat).concat([r]); },
        okMsg: "Jadwal Jum'at " + D.short(rec.Tanggal) + ' disimpan.'
      }).catch(() => {});
    };
  },
  /** Catat infaq Jum'atan (Penerobos Kelompok / Admin Kelompok). */
  infaq(id) {
    const x = S.d.jumat.find(r => r.ID_Jumat === id); if (!x) return;
    const ada = x.Infaq !== '' && x.Infaq !== undefined && x.Infaq !== null;
    const m = UI.modal({ title: "Infaq Jum'atan", size: 'sm',
      body: `<div class="muted small mb-3">${esc(D.dayLong(x.Tanggal))} · ${esc(x.Tempat || Store.kelName(x.ID_Kelompok))}</div>
        <label class="field"><span class="field-label">Jumlah infaq (IDR) <span class="req">*</span></span><div class="input-money"><span>Rp</span><input class="input" id="jiAmt" inputmode="numeric" placeholder="0" value="${ada ? F.num(x.Infaq) : ''}" oninput="this.value=this.value.replace(/[^\\d]/g,'').replace(/\\B(?=(\\d{3})+(?!\\d))/g,'.')"></div></label>
        <div id="jiErr" class="form-error mt-2" hidden></div>`,
      foot: `${ada ? '<button class="btn btn-light" id="jiDel" style="margin-right:auto"><i class="bi bi-trash3"></i> Hapus</button>' : ''}<button class="btn btn-light" data-close>Batal</button><button class="btn btn-primary" id="jiSave"><i class="bi bi-check-lg"></i> Simpan</button>` });
    setTimeout(() => { const i = $('#jiAmt', m.el); if (i) i.focus(); }, 50);
    const save = val => {
      const prev = { Infaq: x.Infaq, Infaq_Oleh: x.Infaq_Oleh };
      m.close();
      App.mutate({
        apply: () => { x.Infaq = val; },
        rollback: () => { Object.assign(x, prev); },
        call: () => API.run('apiSaveInfaqJumat', id, val),
        onSaved: r => { Object.assign(x, r, { Infaq: r.Infaq === '' ? '' : Number(r.Infaq) || 0 }); },
        okMsg: val === '' ? "Catatan infaq Jum'at dihapus." : "Infaq Jum'at " + D.short(x.Tanggal) + ' tersimpan: ' + F.rp(val) + '.'
      }).catch(() => {});
    };
    $('#jiSave', m.el).onclick = () => {
      const v = $('#jiAmt', m.el).value.replace(/[^\d]/g, '');
      if (!v) { const e = $('#jiErr', m.el); e.textContent = 'Isi jumlah infaq (boleh 0).'; e.hidden = false; return; }
      save(Number(v));
    };
    const del = $('#jiDel', m.el); if (del) del.onclick = () => save('');
  },
  remove(id) {
    const x = S.d.jumat.find(r => r.ID_Jumat === id); if (!x) return;
    UI.confirm(`Hapus jadwal Jum'at <b>${esc(D.dayLong(x.Tanggal))}</b> (khotib ${esc(x.Khotib)})?`, { title: "Hapus Jadwal Jum'at", ok: 'Hapus' }).then(y => {
      if (!y) return;
      const prev = S.d.jumat.slice();
      App.mutate({ apply: () => { S.d.jumat = S.d.jumat.filter(r => r.ID_Jumat !== id); }, rollback: () => { S.d.jumat = prev; }, call: () => API.run('apiDeleteJumat', id), okMsg: "Jadwal Jum'at dihapus." }).catch(() => {});
    });
  },
  text(list) {
    const by = new Map();
    list.slice().sort((a, b) => (a.ID_Kelompok + a.Tanggal + a.Waktu).localeCompare(b.ID_Kelompok + b.Tanggal + b.Waktu)).forEach(x => { if (!by.has(x.ID_Kelompok)) by.set(x.ID_Kelompok, []); by.get(x.ID_Kelompok).push(x); });
    const out = ["*JADWAL KHOTBAH JUM'AT*", ''];
    by.forEach((arr, kel) => {
      out.push('🏠 *Kelompok ' + Store.kelName(kel) + '*');
      arr.sort((a, b) => (a.Tanggal + a.Waktu).localeCompare(b.Tanggal + b.Waktu)).forEach(x => {
        out.push('📅 *' + D.dayLong(x.Tanggal) + '* · ' + x.Waktu + ' WIB');
        if (x.Tempat) out.push('   🕌 ' + x.Tempat);
        out.push('   🎤 Khotib: ' + x.Khotib, '   🧎 Imam: ' + x.Imam, '   📢 Muadzin: ' + x.Muadzin);
        if (x.Keterangan) out.push('   📝 ' + x.Keterangan);
        out.push('');
      });
    });
    out.push('Mohon petugas hadir lebih awal. Jazakumullahu khoiro.');
    return out.join('\n');
  },
  /** Kirim jadwal via WhatsApp (satu jadwal, atau pilih rentang). */
  wa(ids) {
    const single = Array.isArray(ids) && ids.length, t = D.today();
    const pick = rg => S.d.jumat.filter(x => Store.inScope(x) && (S.ui.jmt.kel === 'ALL' || x.ID_Kelompok === S.ui.jmt.kel) && x.Tanggal >= t &&
      (rg === 'next' ? x.Tanggal === nextFriday(t) : rg === 'bulan' ? x.Tanggal.slice(0, 7) === D.ym(new Date()) : rg === '4' ? x.Tanggal <= D.addDays(t, 28) : true));
    const m = UI.modal({ title: "Kirim Jadwal Jum'at via WhatsApp", size: 'lg',
      body: `${single ? '' : `<label class="field" style="max-width:280px;margin-bottom:12px"><span class="field-label tiny muted">Rentang</span><select class="select" id="jwRange">${opt('next', "Jum'at terdekat", 'next')}${opt('4', '4 pekan ke depan', 'next')}${opt('bulan', 'Bulan ini', 'next')}${opt('all', 'Semua mendatang', 'next')}</select></label>`}
        <label class="field"><span class="field-label">Pesan</span><textarea class="textarea mono" id="jwText" rows="13" style="font-size:13px;line-height:1.5"></textarea><span class="field-help">Teks bisa disunting. <b>Buka WhatsApp</b> lalu pilih kontak atau grup.</span></label>`,
      foot: `<button class="btn btn-light" data-close>Tutup</button><button class="btn btn-light" id="jwCopy"><i class="bi bi-clipboard"></i> Salin Teks</button><a class="btn btn-primary" id="jwGo" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i> Buka WhatsApp</a>` });
    const ta = $('#jwText', m.el), go = $('#jwGo', m.el);
    const sync = () => { go.href = JadwalWA.url(ta.value); };
    const build = () => { const list = single ? S.d.jumat.filter(x => ids.includes(x.ID_Jumat)) : pick($('#jwRange', m.el).value); ta.value = list.length ? Pages.jumat.text(list) : "Belum ada jadwal Jum'at pada rentang ini."; sync(); };
    ta.oninput = sync; if (!single) $('#jwRange', m.el).onchange = build;
    $('#jwCopy', m.el).onclick = async () => { try { await navigator.clipboard.writeText(ta.value); UI.toast('Teks disalin. Tempel di WhatsApp.', 'ok'); } catch (e) { ta.select(); try { document.execCommand('copy'); UI.toast('Teks disalin.', 'ok'); } catch (x) { UI.toast('Salin manual: tekan lama teks lalu pilih Salin.', 'warn'); } } };
    build();
  }
};

Pages.pengguna = {
  render() {
    const us = S.d.pengguna, q = S.ui.usr.q.trim().toLowerCase();
    const rows = us.filter(u => !q || (u.Nama + ' ' + u.Email + ' ' + Store.kelName(u.ID_Kelompok)).toLowerCase().includes(q)).sort((a, b) => a.Peran.localeCompare(b.Peran) || a.Nama.localeCompare(b.Nama));
    const nM = us.filter(u => u.Peran === 'Master Admin').length, nS = us.filter(u => u.Peran === 'Admin PPG' || u.Peran === 'Super Admin').length, nG = us.filter(u => u.Peran === 'Guru').length, nA = us.filter(u => u.Peran === 'Admin Kelompok').length, off = us.filter(u => u.Status_Aktif !== 'Aktif').length;
    $('#page-pengguna').innerHTML = pageHead('Sistem <i class="bi bi-chevron-right"></i> <b>Kelola Pengguna & Hak Akses</b>', 'Kelola Pengguna & Hak Akses (RBAC)',
      'Akun pengelola dengan pembagian wewenang berdasarkan peran dan kelompok. Pembatasan diverifikasi di server, bukan hanya disembunyikan di tampilan.',
      `<button class="btn btn-primary" onclick="Pages.pengguna.form()"><i class="bi bi-person-plus"></i> Tambah Pengguna</button>`) + `
      <div class="grid-4">
        <div class="card kpi compact"><div class="kpi-label">Total Pengguna</div><div class="kpi-icon"><i class="bi bi-people"></i></div><div class="kpi-value">${us.length}<small>akun</small></div><div class="kpi-foot"><span><span class="dot dot-ok"></span> ${us.length - off} aktif</span><span>${off} nonaktif</span></div></div>
        <div class="card kpi compact accent-gold"><div class="kpi-label">Master Admin</div><div class="kpi-icon gold"><i class="bi bi-shield-lock"></i></div><div class="kpi-value">${nM}<small>akun</small></div><div class="kpi-foot"><span>Akses penuh lintas kelompok</span>${nS ? `<span>+ ${nS} Super Admin</span>` : ''}</div></div>
        <div class="card kpi compact accent-top"><div class="kpi-label">Admin Kelompok</div><div class="kpi-icon"><i class="bi bi-person-badge"></i></div><div class="kpi-value">${nA}<small>akun</small></div><div class="kpi-foot"><span>Tersebar di ${new Set(us.filter(u => u.Peran === 'Admin Kelompok' && u.ID_Kelompok).map(u => u.ID_Kelompok)).size} kelompok</span>${nG ? `<span>+ ${nG} Guru</span>` : ''}</div></div>
        <div class="card kpi compact"><div class="kpi-label">Kelompok Tanpa Admin</div><div class="kpi-icon warn"><i class="bi bi-exclamation-diamond"></i></div><div class="kpi-value">${S.d.kelompok.filter(k => k.Status_Aktif !== 'Nonaktif' && !us.some(u => u.Peran === 'Admin Kelompok' && u.ID_Kelompok === k.ID_Kelompok && u.Status_Aktif === 'Aktif')).length}</div><div class="kpi-foot"><span>Perlu ditugaskan</span></div></div>
      </div>
      <div class="card section-gap"><div class="card-head"><div><div class="card-title"><i class="bi bi-diagram-3"></i> Matriks Hak Akses</div><div class="card-sub">Batas izin ditentukan oleh peran dan kelompok yang terikat</div></div><span class="badge b-outline">Diverifikasi di server</span></div>
        <div class="grid-2">
          <div class="card" style="box-shadow:none;background:var(--surface-2)"><div class="row"><span class="badge b-gold"><i class="bi bi-shield-lock"></i> Master Admin (Pusat)</span><span class="spacer"></span><span class="tiny muted">Tingkat 1</span></div>
            <ul class="target-list mt-3"><li><i class="bi bi-check-circle"></i>Kelola jamaah, kegiatan, absensi & capaian semua kelompok</li><li><i class="bi bi-check-circle"></i>Susun kurikulum & target ${JENJANG_TARGET.length} jenjang (Balita–Usia Nikah)</li><li><i class="bi bi-check-circle"></i>Kelola pengguna, kelompok, pengaturan, log audit</li><li><i class="bi bi-eye"></i>Lihat saja: materi Dewasa & rekap infaq semua kelompok</li></ul></div>
          <div class="card" style="box-shadow:none;background:var(--surface-2)"><div class="row"><span class="badge b-dark"><i class="bi bi-shield-check"></i> Admin PPG (Generus)</span><span class="spacer"></span><span class="tiny muted">Tingkat 2</span></div>
            <ul class="target-list mt-3"><li><i class="bi bi-check-circle"></i>Seperti Master Admin untuk jenjang Balita–Usia Nikah semua kelompok</li><li><i class="bi bi-check-circle"></i>Susun kurikulum & target, kelola kelompok, pengaturan, buka kunci absensi</li><li><i class="bi bi-eye"></i>Lihat saja: rekap infaq</li><li style="color:var(--bad-text)"><i class="bi bi-x-circle" style="color:var(--bad)"></i>Tidak bisa mengelola pengguna, membersihkan data, melihat jenjang Dewasa & pengajian gabungan</li></ul></div>
          <div class="card" style="box-shadow:none;background:var(--surface-2)"><div class="row"><span class="badge b-primary"><i class="bi bi-person-badge"></i> Admin Kelompok</span><span class="spacer"></span><span class="tiny muted">Tingkat 3</span></div>
            <ul class="target-list mt-3"><li><i class="bi bi-check-circle"></i>Kelola jamaah, kegiatan, absensi & capaian kelompok sendiri</li><li><i class="bi bi-check-circle"></i>Susun materi pengajian Dewasa kelompoknya</li><li><i class="bi bi-check-circle"></i>Catat & ubah infaq pengajian kelompoknya</li><li style="color:var(--bad-text)"><i class="bi bi-x-circle" style="color:var(--bad)"></i>Tidak bisa melihat data kelompok lain, kurikulum pusat, akun & pengaturan</li></ul></div>
          <div class="card" style="box-shadow:none;background:var(--surface-2)"><div class="row"><span class="badge b-primary"><i class="bi bi-mortarboard"></i> Guru Pengajar</span><span class="spacer"></span><span class="tiny muted">Tingkat 4</span></div>
            <ul class="target-list mt-3"><li><i class="bi bi-check-circle"></i>Kegiatan & capaian jenjang yang diajar (Balita–Usia Nikah)</li><li><i class="bi bi-check-circle"></i>Absensi semua pengajian kelompoknya (termasuk Dewasa)</li><li><i class="bi bi-check-circle"></i>Catat infaq pengajian Balita–Usia Nikah</li><li><i class="bi bi-check-circle"></i>Tambah materi ekstrakurikuler & tulis buku penghubung</li><li><i class="bi bi-eye"></i>Lihat saja: data jamaah & kurikulum pusat</li><li style="color:var(--bad-text)"><i class="bi bi-x-circle" style="color:var(--bad)"></i>Tidak bisa mengubah data jamaah, PIN, laporan, akun & pengaturan</li></ul></div>
          <div class="card" style="box-shadow:none;background:var(--surface-2)"><div class="row"><span class="badge b-gold"><i class="bi bi-signpost-2"></i> Penerobos Desa</span><span class="spacer"></span><span class="tiny muted">Pengajian gabungan</span></div>
            <ul class="target-list mt-3"><li><i class="bi bi-check-circle"></i>Buat, ubah, hapus & kirim jadwal pengajian gabungan</li><li><i class="bi bi-check-circle"></i>Absen & kunci absensi semua peserta gabungan (semua kelompok)</li><li><i class="bi bi-check-circle"></i>Rekap pengajian gabungan</li><li style="color:var(--bad-text)"><i class="bi bi-x-circle" style="color:var(--bad)"></i>Tidak mengelola sesi kelompok, data jamaah, kurikulum, infaq, akun & pengaturan</li></ul></div>
          <div class="card" style="box-shadow:none;background:var(--surface-2)"><div class="row"><span class="badge b-gold"><i class="bi bi-signpost"></i> Penerobos Kelompok</span><span class="spacer"></span><span class="tiny muted">1 kelompok</span></div>
            <ul class="target-list mt-3"><li><i class="bi bi-check-circle"></i>Buat, ubah, hapus & kirim jadwal pengajian kelompoknya</li><li><i class="bi bi-check-circle"></i>Absensi pengajian kelompok (termasuk peserta gabungan dari kelompoknya)</li><li><i class="bi bi-check-circle"></i>Jadwal Khotbah Jum'at (khotib, imam, muadzin, waktu) + kirim via WA</li><li style="color:var(--bad-text)"><i class="bi bi-x-circle" style="color:var(--bad)"></i>Tidak mengubah data jamaah, kurikulum, capaian, infaq, akun & pengaturan</li></ul></div>
        </div></div>
      <div class="card flush section-gap"><div style="padding:16px 20px"><label class="search-input"><i class="bi bi-search"></i><input class="input" id="usrSearch" placeholder="Cari nama, email, atau kelompok…" value="${attr(S.ui.usr.q)}"></label></div>
        <div class="table-wrap"><table class="table stack"><thead><tr><th>Pengguna & Akun</th><th>Peran</th><th>Cakupan Akses</th><th>Terakhir Masuk</th><th>Status</th><th class="actions">Aksi</th></tr></thead><tbody>
        ${rows.map(u => `<tr><td class="td-main"><div class="cell-person"><span class="avatar ${u.Peran === 'Master Admin' || u.Peran === 'Guru' ? 'gold' : ''}">${esc(F.initials(u.Nama))}</span><div><div class="nm">${esc(u.Nama)}${u.Email === S.user.Email ? ' <span class="badge b-outline">Anda</span>' : ''}</div><div class="cell-sub"><i class="bi bi-envelope"></i> ${esc(u.Email)}</div></div></div></td>
          <td data-label="Peran"><span class="badge ${u.Peran === 'Master Admin' ? 'b-gold' : u.Peran === 'Admin PPG' ? 'b-dark' : u.Peran === 'Guru' ? 'b-primary' : u.Peran === 'Penerobos Desa' || u.Peran === 'Penerobos Kelompok' ? 'b-gold' : 'b-mint'}">${esc(u.Peran)}</span></td>
          <td data-label="Cakupan">${u.Peran === 'Master Admin' ? '<b>Semua Kelompok</b>' : u.Peran === 'Admin PPG' ? '<b>Semua Kelompok</b><div class="cell-sub">Generus (tanpa Dewasa & gabungan)</div>' : u.Peran === 'Penerobos Desa' ? '<b>Semua Kelompok</b><div class="cell-sub">Pengajian gabungan desa</div>' : u.Peran === 'Guru' ? `<b>${u.ID_Kelompok === KEL_SEMUA ? 'Semua Kelompok' : esc(Store.kelName(u.ID_Kelompok))}</b><div class="cell-sub">Mengajar: ${esc(String(u.Jenjang_Ajar || '–').split(',').join(', '))}</div>` : `<b>${esc(Store.kelName(u.ID_Kelompok))}</b><div class="cell-sub">${esc((S.idx.kel.get(u.ID_Kelompok) || {}).Desa_Daerah || '')}</div>`}</td>
          <td data-label="Terakhir">${u.Terakhir_Login ? esc(D.rel(u.Terakhir_Login)) : '<span class="faint">Belum pernah</span>'}</td>
          <td data-label="Status">${u.Status_Aktif === 'Aktif' ? '<span class="badge b-ok"><span class="dot"></span>Aktif</span>' : '<span class="badge b-bad"><span class="dot"></span>Nonaktif</span>'}</td>
          <td class="actions"><button class="icon-btn sm" aria-label="Ubah ${attr(u.Nama)}" onclick="Pages.pengguna.form('${attr(u.Email)}')"><i class="bi bi-pencil"></i></button>${u.Email === S.user.Email ? '' : `<button class="icon-btn sm" title="Hapus akun" aria-label="Hapus ${attr(u.Nama)}" onclick="Pages.pengguna.remove('${attr(u.Email)}')"><i class="bi bi-trash3" style="color:var(--bad)"></i></button>`}</td></tr>`).join('')}
        ${rows.length ? '' : `<tr><td colspan="6">${emptyState('bi-person-x', 'Tidak ada pengguna yang cocok.')}</td></tr>`}
        </tbody></table></div></div>`;
    $('#usrSearch').addEventListener('input', debounce(e => { S.ui.usr.q = e.target.value; const p = e.target.selectionStart; Pages.pengguna.render(); const i = $('#usrSearch'); i.focus(); i.setSelectionRange(p, p); }, 250));
  },
  async remove(email) {
    const u = S.d.pengguna.find(x => x.Email === email);
    if (!u || u.Email === S.user.Email) return;
    if (!(await UI.confirm(`Hapus akun <b>${esc(u.Nama)}</b> (${esc(u.Email)})? Pengguna ini tidak bisa masuk lagi dan sesinya langsung berakhir. Data jamaah dan kegiatan tidak terpengaruh. Jika hanya ingin menutup akses sementara, ubah status menjadi Nonaktif.`, { ok: 'Hapus Akun', danger: true }))) return;
    const prev = S.d.pengguna;
    App.mutate({
      apply: () => { S.d.pengguna = prev.filter(x => x.Email !== email); },
      rollback: () => { S.d.pengguna = prev; },
      call: () => API.run('apiDeletePengguna', email),
      okMsg: 'Akun pengguna dihapus.'
    }).catch(() => {});
  },

  form(email) {
    const u0 = email ? S.d.pengguna.find(u => u.Email === email) : null;
    const self = u0 && u0.Email === S.user.Email;
    const m = UI.modal({
      title: u0 ? 'Ubah Pengguna' : 'Tambah Pengguna Baru', size: 'lg',
      body: `<form id="usrForm" class="form-grid two" autocomplete="off">
        <label class="field"><span class="field-label">Email <span class="req">*</span></span><input class="input" type="email" name="Email" value="${attr(u0 ? u0.Email : '')}" ${u0 ? 'readonly' : ''} placeholder="nama@contoh.id"></label>
        <label class="field"><span class="field-label">Nama lengkap & gelar <span class="req">*</span></span><input class="input" name="Nama" maxlength="100" value="${attr(u0 ? u0.Nama : '')}" placeholder="mis. Ust. Muhammad Ilham"></label>
        <div class="field span-2"><span class="field-label">Peran <span class="req">*</span></span><div class="grid-2" style="gap:10px">
          ${[['Master Admin', 'bi-shield-lock', 'Wewenang penuh semua kelompok.'], ['Admin PPG', 'bi-shield-check', 'Seperti Master Admin untuk Balita–Usia Nikah semua kelompok; tanpa kelola pengguna, Dewasa & pengajian gabungan.'], ['Admin Kelompok', 'bi-person-badge', 'Kelola jamaah, absensi & infaq kelompoknya.'], ['Guru', 'bi-mortarboard', 'Guru pengajar Balita–Usia Nikah: kegiatan, capaian & materi ekstrakurikuler; absensi semua pengajian kelompok & infaq generus.'], ['Penerobos Desa', 'bi-signpost-2', 'Buat jadwal pengajian gabungan, absen semua pesertanya & lihat rekapnya.'], ['Penerobos Kelompok', 'bi-signpost', "Jadwal & absensi pengajian kelompoknya, serta jadwal Khotbah Jum'at."]].map(([p, ic, d]) => `<label class="card" style="box-shadow:none;cursor:pointer;padding:14px;${self && p !== 'Master Admin' ? 'opacity:.5;pointer-events:none' : ''}"><span class="row"><input type="radio" name="Peran" value="${p}" ${(u0 ? u0.Peran : 'Admin Kelompok') === p ? 'checked' : ''} style="accent-color:var(--primary)"><b><i class="bi ${ic}"></i> ${p}</b></span><span class="tiny muted">${d}</span></label>`).join('')}</div></div>
        <label class="field" id="usrKelF"><span class="field-label">Kelompok yang ditugaskan <span class="req">*</span></span><select class="select" name="ID_Kelompok"><option value="${KEL_SEMUA}" id="usrKelAll" ${u0 && u0.ID_Kelompok === KEL_SEMUA ? 'selected' : ''}>Semua Kelompok (khusus Guru)</option>${kelOptions(u0 ? u0.ID_Kelompok : '')}</select></label>
        <div class="field span-2" id="usrJjF"><span class="field-label">Jenjang yang diajar <span class="req">*</span></span><div class="chips">${JENJANG_TARGET.map(j => `<label class="chip" style="cursor:pointer"><input type="checkbox" name="JJA" value="${attr(j)}" ${u0 && String(u0.Jenjang_Ajar || '').split(',').includes(j) ? 'checked' : ''}> ${esc(j)}</label>`).join('')}</div><span class="field-help">Guru hanya melihat dan mengelola kegiatan, absensi, capaian, buku penghubung, serta materi ekstrakurikuler untuk jenjang yang dicentang.</span></div>
        <label class="field"><span class="field-label">Status akun</span><select class="select" name="Status_Aktif" ${self ? 'disabled' : ''}>${opt('Aktif', 'Aktif', u0 ? u0.Status_Aktif : 'Aktif')}${opt('Nonaktif', 'Nonaktif', u0 && u0.Status_Aktif)}</select></label>
        <label class="field span-2"><span class="field-label">${u0 ? 'Reset kata sandi (kosongkan jika tidak diubah)' : 'Kata sandi awal <span class="req">*</span>'}</span>
          <span class="row"><input class="input" name="Password" type="text" minlength="8" maxlength="64" placeholder="Minimal 8 karakter" autocomplete="new-password"><button type="button" class="btn btn-light btn-sm" id="genPw"><i class="bi bi-magic"></i> Buat</button></span>
          <span class="field-help">Sampaikan kata sandi ke pengguna secara pribadi. Pengguna dapat menggantinya lewat menu profil.</span></label>
        <div id="usrErr" class="form-error span-2" hidden></div></form>`,
      foot: `<button class="btn btn-light" data-close>Batal</button><button class="btn btn-primary" id="usrSave"><i class="bi bi-send"></i> Simpan Pengguna</button>`
    });
    const form = $('#usrForm', m.el);
    const syncKel = () => {
      const p = form.Peran.value, guru = p === 'Guru';
      $('#usrKelF', m.el).style.display = p === 'Admin Kelompok' || p === 'Penerobos Kelompok' || guru ? '' : 'none';
      $('#usrJjF', m.el).style.display = guru ? '' : 'none';
      const all = $('#usrKelAll', m.el); all.hidden = !guru; all.disabled = !guru;
      if (!guru && form.ID_Kelompok.value === KEL_SEMUA) form.ID_Kelompok.selectedIndex = 1;
    };
    $$('[name=Peran]', m.el).forEach(r => r.addEventListener('change', syncKel)); syncKel();
    $('#genPw', m.el).onclick = () => { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; form.Password.value = Array.from(crypto.getRandomValues(new Uint8Array(10))).map(b => c[b % c.length]).join(''); };
    $('#usrSave', m.el).onclick = async () => {
      const fd = Object.fromEntries(new FormData(form).entries());
      if (self) fd.Status_Aktif = 'Aktif';
      delete fd.JJA;
      fd.Jenjang_Ajar = fd.Peran === 'Guru' ? $$('[name=JJA]:checked', m.el).map(x => x.value).join(',') : '';
      const e = $('#usrErr', m.el);
      if (fd.Peran === 'Guru' && !fd.Jenjang_Ajar) { e.textContent = 'Pilih minimal satu jenjang yang diajar Guru.'; e.hidden = false; return; }
      const bad = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fd.Email || '') ? 'Email tidak valid.' : !fd.Nama.trim() ? 'Nama wajib diisi.' : (!u0 && (fd.Password || '').length < 8) ? 'Kata sandi awal minimal 8 karakter.' : (fd.Password && fd.Password.length < 8) ? 'Kata sandi minimal 8 karakter.' : (fd.Peran === 'Admin Kelompok' && !fd.ID_Kelompok) ? 'Pilih kelompok.' : '';
      if (bad) { e.textContent = bad; e.hidden = false; return; }
      const btn = $('#usrSave', m.el);
      UI.busy(btn, true, 'Menyimpan…');
      // Akun & sandi: tunggu konfirmasi server (bukan optimistic) agar tidak salah info login
      try {
        const r = await API.run('apiSavePengguna', fd, !u0);
        Store.upsert('pengguna', r, 'Email'); Store.index(); Store.persist();
        m.close(); Router.render();
        UI.toast(u0 ? 'Pengguna diperbarui.' : 'Pengguna ditambahkan. Sampaikan email & kata sandi ke yang bersangkutan.', 'ok');
      } catch (ex) { e.textContent = ex.message; e.hidden = false; UI.busy(btn, false); }
    };
  }
};

/* ───────────────────────── PERSENTASE KEHADIRAN ───────────────────────── */
const KAT_HADIR = [[85, 'Sangat Baik', 'b-ok'], [70, 'Baik', 'b-mint'], [50, 'Perlu Perhatian', 'b-warn'], [0, 'Kurang', 'b-bad']];
const katHadir = p => KAT_HADIR.find(k => p >= k[0]);
Pages.kehadiran = {
  /** Rentang tanggal dari pilihan periode. */
  range(per) {
    const t = D.today(), ym = D.ym(new Date());
    if (per === 'bulan') return [ym + '-01', t, D.monthLabel(ym)];
    if (per === '3') return [D.addMonths(ym, -2) + '-01', t, '3 bulan terakhir'];
    if (per === '6') return [D.addMonths(ym, -5) + '-01', t, '6 bulan terakhir'];
    if (per === '12') return [D.addMonths(ym, -11) + '-01', t, '12 bulan terakhir'];
    if (/^\d{4}-\d{2}$/.test(per)) return [per + '-01', per + '-31', D.monthLabel(per)];
    return ['0000-00-00', t, 'Semua waktu'];
  },
  /** Hitung H/I/S/A per jamaah & per jenjang dari catatan absensi pada periode (sesi yang sudah berlangsung). */
  compute() {
    const f = S.ui.khd, [a, b] = Pages.kehadiran.range(f.per), t = D.today();
    const kegOk = new Set(Store.kegScope().filter(k => k.Tanggal >= a && k.Tanggal <= b && k.Tanggal <= t).map(k => k.ID_Kegiatan));
    const jams = Store.jamaahScope(true, true).filter(j => (f.status === 'ALL' || j.Status_Aktif === f.status));
    const per = new Map(jams.map(j => [j.ID_Jamaah, { j, H: 0, I: 0, S: 0, A: 0, n: 0 }]));
    S.idx.abs.forEach((m, kid) => { if (!kegOk.has(kid)) return; m.forEach((v, jid) => { const r = per.get(jid); if (r && r[v.s] !== undefined) { r[v.s]++; r.n++; } }); });
    per.forEach(r => { r.pct = r.n ? r.H / r.n * 100 : null; });
    const jj = Store.jjAbs().map(name => {
      const rs = [...per.values()].filter(r => r.j.Jenjang === name);
      const c = { name, H: 0, I: 0, S: 0, A: 0, n: 0, jamaah: rs.length, aktif: rs.filter(r => r.n).length };
      rs.forEach(r => ['H', 'I', 'S', 'A', 'n'].forEach(s => { c[s] += r[s]; }));
      c.pct = c.n ? c.H / c.n * 100 : null;
      const ps = rs.filter(r => r.n).map(r => r.pct);
      c.perlu = ps.filter(p => p < 70).length;
      return c;
    });
    return { per, jj, sesi: kegOk.size };
  },
  rows(per) {
    const f = S.ui.khd, q = f.q.trim().toLowerCase();
    let rs = [...per.values()].filter(r => (f.jenjang === 'ALL' || r.j.Jenjang === f.jenjang) && (f.jenjang !== 'Caberawit' || f.kelas === 'ALL' || r.j.Kelas === f.kelas) &&
      (!q || (r.j.Nama_Lengkap + ' ' + r.j.ID_Jamaah).toLowerCase().includes(q)) && (f.only === 'ALL' || (f.only === 'perlu' ? r.n && r.pct < 70 : f.only === 'kosong' ? !r.n : r.n)));
    const pv = r => (r.n ? r.pct : -1);
    const sorts = { pct_asc: (x, y) => pv(x) - pv(y) || x.j.Nama_Lengkap.localeCompare(y.j.Nama_Lengkap), pct_desc: (x, y) => pv(y) - pv(x) || x.j.Nama_Lengkap.localeCompare(y.j.Nama_Lengkap),
      nama: (x, y) => x.j.Nama_Lengkap.localeCompare(y.j.Nama_Lengkap), jenjang: (x, y) => JENJANG.indexOf(x.j.Jenjang) - JENJANG.indexOf(y.j.Jenjang) || x.j.Nama_Lengkap.localeCompare(y.j.Nama_Lengkap) };
    return rs.sort(sorts[f.sort] || sorts.jenjang);
  },
  tabs() {
    if (Store.isPenerobos() || Store.isSuper()) return '';
    const md = S.ui.khd.mode;
    return `<div class="tabs" role="tablist" style="margin-bottom:16px"><button role="tab" aria-selected="${md !== 'gab'}" class="${md !== 'gab' ? 'active' : ''}" onclick="S.ui.khd.mode='jenjang';Pages.kehadiran.render()"><i class="bi bi-layers"></i> Per Jenjang & Jamaah</button>
      <button role="tab" aria-selected="${md === 'gab'}" class="${md === 'gab' ? 'active' : ''}" onclick="S.ui.khd.mode='gab';Pages.kehadiran.render()"><i class="bi bi-people-fill"></i> Rekap Pengajian Gabungan</button></div>`;
  },
  render() {
    const [awal] = Pages.kehadiran.range(S.ui.khd.per);
    if (!Store.absGate(awal, () => { if (S.page === 'kehadiran') Pages.kehadiran.render(); }, $('#page-kehadiran'))) return;
    if ((S.ui.khd.mode === 'gab' && !Store.isSuper()) || Store.isPenerobos()) return Pages.kehadiran.renderGab();
    const f = S.ui.khd, [, , label] = Pages.kehadiran.range(f.per);
    const { per, jj, sesi } = Pages.kehadiran.compute();
    const tot = jj.reduce((o, c) => { ['H', 'I', 'S', 'A', 'n'].forEach(s => { o[s] += c[s]; }); return o; }, { H: 0, I: 0, S: 0, A: 0, n: 0 });
    const shown = jj.filter(c => c.jamaah);
    const rows = Pages.kehadiran.rows(per);
    const pp = 15, pages = Math.max(1, Math.ceil(rows.length / pp));
    if (f.page > pages) f.page = pages;
    const months = D.months(D.ym(new Date()), 12).reverse();
    const bar = (p, c) => `<div class="progress" style="height:8px"><span style="width:${p == null ? 0 : p.toFixed(1)}%;background:${c || 'var(--primary)'}"></span></div>`;
    const P = p => (p == null ? '–' : p.toFixed(1).replace('.', ',') + '%');

    $('#page-kehadiran').innerHTML = pageHead('Keuangan & Laporan <i class="bi bi-chevron-right"></i> <b>Persentase Kehadiran</b>', 'Persentase Kehadiran',
      `Persentase hadir per jenjang dan per jamaah — ${esc(Store.scopeLabel())}. Dihitung dari catatan absensi: Hadir ÷ (Hadir + Izin + Sakit + Alpa).`,
      `<button class="btn btn-light" onclick="Pages.kehadiran.exportXlsx()"><i class="bi bi-file-earmark-spreadsheet"></i> Ekspor Excel</button>`) + Pages.kehadiran.tabs() + `
      <div class="card"><div class="toolbar">
        <label class="field" style="flex:0 1 220px"><span class="field-label tiny muted">Periode</span><select class="select" onchange="Pages.kehadiran.set('per',this.value)">
          ${[['bulan', 'Bulan ini'], ['3', '3 bulan terakhir'], ['6', '6 bulan terakhir'], ['12', '12 bulan terakhir'], ['all', 'Semua waktu']].map(([v, l]) => opt(v, l, f.per)).join('')}
          <optgroup label="Per bulan">${months.map(m => opt(m, D.monthLabel(m), f.per)).join('')}</optgroup></select></label>
        <label class="field" style="flex:0 1 180px"><span class="field-label tiny muted">Status jamaah</span><select class="select" onchange="Pages.kehadiran.set('status',this.value)">${opt('Aktif', 'Aktif', f.status)}${opt('ALL', 'Semua', f.status)}</select></label>
        <div class="tiny muted" style="align-self:flex-end;padding-bottom:10px"><i class="bi bi-calendar-check"></i> ${esc(label)} · ${sesi} sesi berlangsung · ${F.num(tot.n)} catatan</div>
      </div></div>
      <div class="grid-4 section-gap">
        <div class="card kpi compact"><div class="kpi-label">Kehadiran Keseluruhan</div><div class="kpi-icon"><i class="bi bi-percent"></i></div><div class="kpi-value">${P(tot.n ? tot.H / tot.n * 100 : null)}</div>${bar(tot.n ? tot.H / tot.n * 100 : null)}<div class="kpi-foot mt-1"><span>${F.num(tot.H)} hadir dari ${F.num(tot.n)} catatan</span></div></div>
        <div class="card kpi compact"><div class="kpi-label">Izin · Sakit · Alpa</div><div class="kpi-icon gold"><i class="bi bi-clipboard-pulse"></i></div><div class="kpi-value" style="font-size:22px">${F.num(tot.I)} · ${F.num(tot.S)} · ${F.num(tot.A)}</div><div class="kpi-foot"><span>Alpa ${P(tot.n ? tot.A / tot.n * 100 : null)} dari catatan</span></div></div>
        <div class="card kpi compact"><div class="kpi-label">Jenjang Tertinggi</div><div class="kpi-icon"><i class="bi bi-trophy"></i></div>${(() => { const s = shown.filter(c => c.n).sort((x, y) => y.pct - x.pct)[0]; return s ? `<div class="kpi-value" style="font-size:20px">${esc(s.name)}</div><div class="kpi-foot"><span>${P(s.pct)} hadir</span></div>` : '<div class="kpi-value">–</div>'; })()}</div>
        <div class="card kpi compact accent-gold"><div class="kpi-label">Perlu Perhatian</div><div class="kpi-icon warn"><i class="bi bi-exclamation-triangle"></i></div><div class="kpi-value">${F.num(shown.reduce((s, c) => s + c.perlu, 0))}<small>jamaah</small></div><div class="kpi-foot"><span>Kehadiran di bawah 70%</span></div></div>
      </div>
      <div class="grid-75 section-gap">
        <div class="card"><div class="card-head"><div><div class="card-title"><i class="bi bi-layers"></i> Per Jenjang</div><div class="card-sub">${esc(label)} · klik jenjang untuk menyaring daftar jamaah</div></div></div>
          <div class="khd-jj">${shown.map(c => { const k = c.n ? katHadir(c.pct) : null; return `<button class="khd-jj-row ${f.jenjang === c.name ? 'active' : ''}" onclick="Pages.kehadiran.set('jenjang','${f.jenjang === c.name ? 'ALL' : c.name}')">
            <span class="khd-jj-name">${jjBadge(c.name)}</span>
            <span class="grow">${bar(c.pct, JJ_COLOR[c.name])}<span class="tiny muted">H ${c.H} · I ${c.I} · S ${c.S} · A ${c.A} · ${c.aktif}/${c.jamaah} jamaah tercatat${c.perlu ? ` · <b style="color:var(--warn-text)">${c.perlu} perlu perhatian</b>` : ''}</span></span>
            <span class="khd-pct"><b>${P(c.pct)}</b>${k ? `<span class="badge ${k[2]}">${k[1]}</span>` : '<span class="tiny faint">belum ada data</span>'}</span></button>`; }).join('') || emptyState('bi-people', 'Belum ada jamaah.')}</div></div>
        <div class="card"><div class="card-head"><div class="card-title"><i class="bi bi-bar-chart"></i> Perbandingan</div></div><div class="chart-box" style="height:${Math.max(220, shown.length * 44)}px"><canvas id="chKhd" aria-label="Grafik persentase kehadiran per jenjang"></canvas></div>
          <div class="tiny muted mt-2">Kategori: ≥85% Sangat Baik · ≥70% Baik · ≥50% Perlu Perhatian · &lt;50% Kurang</div></div>
      </div>
      <div class="card flush section-gap"><div style="padding:18px 20px 0"><div class="card-head"><div><div class="card-title"><i class="bi bi-person-lines-fill"></i> Per Jamaah</div><div class="card-sub">${rows.length} jamaah${f.jenjang !== 'ALL' ? ' · ' + esc(f.jenjang) : ''}</div></div></div>
        <div class="chips mt-2"><button class="chip ${f.jenjang === 'ALL' ? 'active' : ''}" onclick="Pages.kehadiran.set('jenjang','ALL')">Semua Jenjang</button>${shown.map(c => `<button class="chip ${f.jenjang === c.name ? 'active' : ''}" onclick="Pages.kehadiran.set('jenjang','${c.name}')"><span class="dot" style="background:${JJ_COLOR[c.name]}"></span> ${esc(c.name)}</button>`).join('')}</div>
        <div class="toolbar mt-3"><label class="search-input"><i class="bi bi-search"></i><input class="input" id="khdSearch" placeholder="Cari nama atau ID jamaah…" value="${attr(f.q)}"></label>
          ${f.jenjang === 'Caberawit' ? `<select class="select" aria-label="Kelas" onchange="Pages.kehadiran.set('kelas',this.value)">${opt('ALL', 'Semua Kelas', f.kelas)}${KELAS.map(k => opt(k, 'Kelas ' + k, f.kelas)).join('')}</select>` : ''}
          <select class="select" aria-label="Saring" onchange="Pages.kehadiran.set('only',this.value)">${opt('ALL', 'Semua jamaah', f.only)}${opt('ada', 'Ada catatan', f.only)}${opt('perlu', 'Di bawah 70%', f.only)}${opt('kosong', 'Belum ada catatan', f.only)}</select>
          <select class="select" aria-label="Urutkan" onchange="Pages.kehadiran.set('sort',this.value)">${opt('jenjang', 'Urut: Jenjang', f.sort)}${opt('pct_desc', 'Urut: % tertinggi', f.sort)}${opt('pct_asc', 'Urut: % terendah', f.sort)}${opt('nama', 'Urut: Nama', f.sort)}</select></div></div>
        ${rows.length ? `<div class="table-wrap mt-3"><table class="table stack"><thead><tr><th>Jamaah</th><th>Jenjang</th><th class="num">H</th><th class="num">I</th><th class="num">S</th><th class="num">A</th><th style="min-width:200px">Persentase Hadir</th><th>Kategori</th></tr></thead><tbody>
          ${rows.slice((f.page - 1) * pp, f.page * pp).map(r => { const k = r.n ? katHadir(r.pct) : null; return `<tr>
            <td class="td-main"><div class="cell-person">${avatar(r.j)}<div><div class="cell-strong">${esc(r.j.Nama_Lengkap)}</div><div class="cell-sub mono">${esc(r.j.ID_Jamaah)}${Store.allKel() ? ' · ' + esc(Store.kelName(r.j.ID_Kelompok)) : ''}</div></div></div></td>
            <td data-label="Jenjang">${jjBadge(r.j.Jenjang)}${kelasBadge(r.j.Kelas)}</td>
            <td data-label="Hadir" class="num">${r.H}</td><td data-label="Izin" class="num">${r.I}</td><td data-label="Sakit" class="num">${r.S}</td><td data-label="Alpa" class="num">${r.A ? `<b style="color:var(--bad)">${r.A}</b>` : 0}</td>
            <td data-label="Persentase"><div class="row" style="gap:10px"><div class="grow">${bar(r.pct, r.n && r.pct < 50 ? 'var(--bad)' : r.n && r.pct < 70 ? 'var(--gold)' : '')}</div><b class="mono" style="min-width:56px;text-align:right">${P(r.pct)}</b></div><div class="tiny muted">${r.n ? r.H + ' dari ' + r.n + ' sesi tercatat' : 'Belum ada catatan pada periode ini'}</div></td>
            <td data-label="Kategori">${k ? `<span class="badge ${k[2]}">${k[1]}</span>` : '<span class="tiny faint">–</span>'}</td></tr>`; }).join('')}
        </tbody></table></div><div style="padding:0 20px 16px">${pages > 1 ? `<div class="row mt-3"><span class="tiny muted">Halaman ${f.page} dari ${pages}</span><span class="spacer"></span>
          <button class="btn btn-light btn-sm" ${f.page <= 1 ? 'disabled' : ''} onclick="S.ui.khd.page--;Pages.kehadiran.render()"><i class="bi bi-chevron-left"></i></button>
          <button class="btn btn-light btn-sm" ${f.page >= pages ? 'disabled' : ''} onclick="S.ui.khd.page++;Pages.kehadiran.render()"><i class="bi bi-chevron-right"></i></button></div>` : ''}</div>`
        : `<div style="padding:0 20px 20px">${emptyState('bi-person-x', 'Tidak ada jamaah yang cocok dengan filter.')}</div>`}
      </div>`;
    $('#khdSearch').addEventListener('input', debounce(e => { S.ui.khd.q = e.target.value; S.ui.khd.page = 1; const p = e.target.selectionStart; Pages.kehadiran.render(); const i = $('#khdSearch'); i.focus(); i.setSelectionRange(p, p); }, 250));
    Charts.make('chKhd', {
      type: 'bar',
      data: { labels: shown.map(c => c.name), datasets: [{ label: '% Hadir', data: shown.map(c => c.pct == null ? 0 : +c.pct.toFixed(1)), backgroundColor: shown.map(c => JJ_COLOR[c.name]), borderRadius: 6, maxBarThickness: 26 }] },
      options: { indexAxis: 'y', scales: { x: { min: 0, max: 100, ticks: { callback: v => v + '%' } }, y: { grid: { display: false } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + c.raw + '% hadir' } } } }
    });
  },
  set(k, v) { S.ui.khd[k] = v; if (k === 'jenjang') S.ui.khd.kelas = 'ALL'; S.ui.khd.page = 1; Pages.kehadiran.render(); },
  setG(k, v) { S.ui.khdg[k] = v; if (k !== 'page') S.ui.khdg.page = 1; Pages.kehadiran.render(); },

  /** Rekap absensi pengajian gabungan: per jenis, per sesi, per jamaah peserta. */
  computeGab() {
    const f = S.ui.khd, g = S.ui.khdg, [a, b] = Pages.kehadiran.range(f.per), t = D.today();
    const own = Store.allKel() ? null : Store.myKel();
    const aktif = S.d.jamaah.filter(j => j.Status_Aktif === 'Aktif');
    const sesiAll = S.d.kegiatan.filter(k => isGab(k) && k.Tanggal >= a && k.Tanggal <= b && k.Tanggal <= t)
      .sort((x, y) => (y.Tanggal + y.Waktu_Mulai).localeCompare(x.Tanggal + x.Waktu_Mulai));
    const inKel = j => (!own || j.ID_Kelompok === own) && (g.kel === 'ALL' || j.ID_Kelompok === g.kel);
    const per = new Map(), sesi = [];
    sesiAll.forEach(k => {
      const jenis = k.Jenis_Gabungan || 'UMUM', m = S.idx.abs.get(k.ID_Kegiatan) || new Map();
      const peserta = S.d.jamaah.filter(j => inKel(j) && ((j.Status_Aktif === 'Aktif' && gabPeserta(k, j)) || m.has(j.ID_Jamaah)));
      const c = { k, jenis, peserta: peserta.length, H: 0, I: 0, S: 0, A: 0, n: 0 };
      peserta.forEach(j => {
        const v = m.get(j.ID_Jamaah);
        if (g.jenis === 'ALL' || g.jenis === jenis) {
          let r = per.get(j.ID_Jamaah); if (!r) per.set(j.ID_Jamaah, r = { j, H: 0, I: 0, S: 0, A: 0, n: 0, wajib: 0 });
          r.wajib++; if (v && r[v.s] !== undefined) { r[v.s]++; r.n++; }
        }
        if (v && c[v.s] !== undefined) { c[v.s]++; c.n++; }
      });
      c.belum = c.peserta - c.n; c.pct = c.n ? c.H / c.n * 100 : null;
      sesi.push(c);
    });
    per.forEach(r => { r.pct = r.n ? r.H / r.n * 100 : null; r.kosong = r.wajib - r.n; });
    const jenisSum = GAB_JENIS.map(([v, l, ket, ic]) => {
      const ss = sesi.filter(c => c.jenis === v), o = { v, l, ket, ic, sesi: ss.length, H: 0, I: 0, S: 0, A: 0, n: 0, peserta: aktif.filter(j => inKel(j) && gabCocok(v, j)).length };
      ss.forEach(c => ['H', 'I', 'S', 'A', 'n'].forEach(x => { o[x] += c[x]; }));
      o.pct = o.n ? o.H / o.n * 100 : null; o.avg = ss.length ? o.H / ss.length : null;
      return o;
    });
    return { sesi: sesi.filter(c => g.jenis === 'ALL' || c.jenis === g.jenis), per, jenisSum };
  },
  gabRows(per) {
    const g = S.ui.khdg, q = g.q.trim().toLowerCase();
    const pv = r => (r.n ? r.pct : -1);
    const sorts = { pct_asc: (x, y) => pv(x) - pv(y) || x.j.Nama_Lengkap.localeCompare(y.j.Nama_Lengkap), pct_desc: (x, y) => pv(y) - pv(x) || x.j.Nama_Lengkap.localeCompare(y.j.Nama_Lengkap),
      nama: (x, y) => x.j.Nama_Lengkap.localeCompare(y.j.Nama_Lengkap), kel: (x, y) => Store.kelName(x.j.ID_Kelompok).localeCompare(Store.kelName(y.j.ID_Kelompok)) || x.j.Nama_Lengkap.localeCompare(y.j.Nama_Lengkap) };
    return [...per.values()].filter(r => (!q || (r.j.Nama_Lengkap + ' ' + r.j.ID_Jamaah + ' ' + (r.j.Dapukan || '')).toLowerCase().includes(q)) &&
      (g.only === 'ALL' || (g.only === 'perlu' ? r.n && r.pct < 70 : g.only === 'alpa' ? r.A > 0 : r.kosong > 0))).sort(sorts[g.sort] || sorts.pct_asc);
  },
  renderGab() {
    const f = S.ui.khd, g = S.ui.khdg, [, , label] = Pages.kehadiran.range(f.per);
    const { sesi, per, jenisSum } = Pages.kehadiran.computeGab();
    const rows = Pages.kehadiran.gabRows(per);
    const pp = 15, pages = Math.max(1, Math.ceil(rows.length / pp));
    if (g.page > pages) g.page = pages;
    const months = D.months(D.ym(new Date()), 12).reverse();
    const bar = (p, c) => `<div class="progress" style="height:8px"><span style="width:${p == null ? 0 : p.toFixed(1)}%;background:${c || 'var(--primary)'}"></span></div>`;
    const P = p => (p == null ? '–' : p.toFixed(1).replace('.', ',') + '%');
    const tot = sesi.reduce((o, c) => { ['H', 'I', 'S', 'A', 'n', 'peserta', 'belum'].forEach(x => { o[x] += c[x]; }); return o; }, { H: 0, I: 0, S: 0, A: 0, n: 0, peserta: 0, belum: 0 });
    const jl = g.jenis === 'ALL' ? 'Semua jenis' : gabJenis({ Jenis_Gabungan: g.jenis })[1];
    $('#page-kehadiran').innerHTML = pageHead('Keuangan & Laporan <i class="bi bi-chevron-right"></i> <b>Persentase Kehadiran</b>', 'Rekap Pengajian Gabungan',
      `Rekap absen Pengajian Muda-mudi Desa, MT/MS, Ibu-ibu & Keputrian, Pengurus, dan Gabungan umum — ${esc(Store.allKel() ? 'semua kelompok' : Store.kelName(Store.myKel()))}.`,
      `<button class="btn btn-light" onclick="Pages.kehadiran.exportGab()"><i class="bi bi-file-earmark-spreadsheet"></i> Ekspor Excel</button><button class="btn btn-light" onclick="Pages.kehadiran.printGab()"><i class="bi bi-printer"></i> Cetak</button>`) + Pages.kehadiran.tabs() + `
      <div class="card"><div class="toolbar">
        <label class="field" style="flex:0 1 220px"><span class="field-label tiny muted">Periode</span><select class="select" onchange="Pages.kehadiran.set('per',this.value)">
          ${[['bulan', 'Bulan ini'], ['3', '3 bulan terakhir'], ['6', '6 bulan terakhir'], ['12', '12 bulan terakhir'], ['all', 'Semua waktu']].map(([v, l]) => opt(v, l, f.per)).join('')}
          <optgroup label="Per bulan">${months.map(m => opt(m, D.monthLabel(m), f.per)).join('')}</optgroup></select></label>
        <label class="field" style="flex:0 1 260px"><span class="field-label tiny muted">Jenis pengajian</span><select class="select" onchange="Pages.kehadiran.setG('jenis',this.value)">${opt('ALL', 'Semua jenis', g.jenis)}${GAB_JENIS.map(x => opt(x[0], x[1], g.jenis)).join('')}</select></label>
        ${Store.allKel() ? `<label class="field" style="flex:0 1 220px"><span class="field-label tiny muted">Kelompok</span><select class="select" onchange="Pages.kehadiran.setG('kel',this.value)">${opt('ALL', 'Semua Kelompok', g.kel)}${S.d.kelompok.map(k => opt(k.ID_Kelompok, k.Nama_Kelompok, g.kel)).join('')}</select></label>` : ''}
        <div class="tiny muted" style="align-self:flex-end;padding-bottom:10px"><i class="bi bi-calendar-check"></i> ${esc(label)} · ${sesi.length} sesi · ${F.num(tot.n)} catatan</div>
      </div></div>
      <div class="gab-sum section-gap">${jenisSum.map(o => `<button class="card gab-card ${g.jenis === o.v ? 'active' : ''}" onclick="Pages.kehadiran.setG('jenis','${g.jenis === o.v ? 'ALL' : o.v}')">
          <div class="row"><span class="gab-ic"><i class="bi ${o.ic}"></i></span><b class="grow">${esc(o.l)}</b></div>
          <div class="kpi-value" style="font-size:24px;margin-top:8px">${P(o.pct)}</div>${bar(o.pct)}
          <div class="tiny muted mt-2">${o.sesi} sesi · rata-rata ${o.avg == null ? '–' : o.avg.toFixed(1).replace('.', ',')} hadir/sesi · ${o.peserta} peserta</div></button>`).join('')}</div>
      <div class="grid-4 section-gap">
        <div class="card kpi compact"><div class="kpi-label">Kehadiran ${esc(jl)}</div><div class="kpi-icon"><i class="bi bi-percent"></i></div><div class="kpi-value">${P(tot.n ? tot.H / tot.n * 100 : null)}</div>${bar(tot.n ? tot.H / tot.n * 100 : null)}</div>
        <div class="card kpi compact"><div class="kpi-label">Hadir · Izin · Sakit · Alpa</div><div class="kpi-icon gold"><i class="bi bi-clipboard-pulse"></i></div><div class="kpi-value" style="font-size:22px">${F.num(tot.H)} · ${F.num(tot.I)} · ${F.num(tot.S)} · ${F.num(tot.A)}</div></div>
        <div class="card kpi compact"><div class="kpi-label">Rata-rata Hadir / Sesi</div><div class="kpi-icon"><i class="bi bi-people"></i></div><div class="kpi-value">${sesi.length ? (tot.H / sesi.length).toFixed(1).replace('.', ',') : '–'}<small>orang</small></div></div>
        <div class="card kpi compact accent-gold"><div class="kpi-label">Belum Dicatat</div><div class="kpi-icon warn"><i class="bi bi-hourglass-split"></i></div><div class="kpi-value">${F.num(tot.belum)}<small>dari ${F.num(tot.peserta)}</small></div></div>
      </div>
      <div class="card flush section-gap"><div style="padding:18px 20px 0"><div class="card-head"><div><div class="card-title"><i class="bi bi-calendar-week"></i> Per Sesi</div><div class="card-sub">${esc(jl)} · ${esc(label)} · klik baris untuk membuka absensinya</div></div></div></div>
        ${sesi.length ? `<div class="table-wrap"><table class="table stack"><thead><tr><th>Tanggal</th><th>Pengajian</th><th class="num">Peserta</th><th class="num">H</th><th class="num">I</th><th class="num">S</th><th class="num">A</th><th class="num">Belum</th><th style="min-width:170px">% Hadir</th></tr></thead><tbody>
          ${sesi.map(c => `<tr class="clickable" onclick="S.ui.abs.kegId='${c.k.ID_Kegiatan}';S.ui.abs.gk='ALL';S.ui.abs.gj='ALL';Router.go('absensi')">
            <td data-label="Tanggal"><div class="cell-strong">${esc(D.short(c.k.Tanggal))}</div><div class="cell-sub">${esc(c.k.Waktu_Mulai)}–${esc(c.k.Waktu_Selesai)}</div></td>
            <td class="td-main"><div class="cell-strong">${esc(c.k.Nama_Kegiatan)}</div><div class="cell-sub"><i class="bi ${gabJenis(c.k)[3]}"></i> ${esc(gabJenis(c.k)[1])}${c.k.Tempat ? ' · ' + esc(c.k.Tempat) : ''}</div>${susunan(c.k).map((x, i) => `<div class="cell-sub">${i + 1}. ${esc(x.m)} · <b>${esc(x.p)}</b> · ${menit(x.d)}</div>`).join('')}</td>
            <td data-label="Peserta" class="num">${c.peserta}</td><td data-label="Hadir" class="num"><b>${c.H}</b></td><td data-label="Izin" class="num">${c.I}</td><td data-label="Sakit" class="num">${c.S}</td><td data-label="Alpa" class="num">${c.A ? `<b style="color:var(--bad)">${c.A}</b>` : 0}</td><td data-label="Belum" class="num">${c.belum ? `<span style="color:var(--warn-text)">${c.belum}</span>` : 0}</td>
            <td data-label="% Hadir"><div class="row" style="gap:10px"><div class="grow">${bar(c.pct)}</div><b class="mono" style="min-width:56px;text-align:right">${P(c.pct)}</b></div></td></tr>`).join('')}
          </tbody></table></div>` : `<div style="padding:0 20px 20px">${emptyState('bi-calendar-x', 'Belum ada sesi pengajian gabungan yang berlangsung pada periode ini.')}</div>`}
      </div>
      <div class="card flush section-gap"><div style="padding:18px 20px 0"><div class="card-head"><div><div class="card-title"><i class="bi bi-person-lines-fill"></i> Per Jamaah Peserta</div><div class="card-sub">${rows.length} jamaah · ${esc(jl)} · % hadir = Hadir ÷ (H + I + S + A)</div></div></div>
        <div class="toolbar mt-2"><label class="search-input"><i class="bi bi-search"></i><input class="input" id="khdgSearch" placeholder="Cari nama, ID, atau dapukan…" value="${attr(g.q)}"></label>
          <select class="select" aria-label="Saring" onchange="Pages.kehadiran.setG('only',this.value)">${opt('ALL', 'Semua peserta', g.only)}${opt('perlu', 'Di bawah 70%', g.only)}${opt('alpa', 'Pernah alpa', g.only)}${opt('belum', 'Ada sesi belum dicatat', g.only)}</select>
          <select class="select" aria-label="Urutkan" onchange="Pages.kehadiran.setG('sort',this.value)">${opt('pct_asc', 'Urut: % terendah', g.sort)}${opt('pct_desc', 'Urut: % tertinggi', g.sort)}${opt('nama', 'Urut: Nama', g.sort)}${opt('kel', 'Urut: Kelompok', g.sort)}</select></div></div>
        ${rows.length ? `<div class="table-wrap mt-3"><table class="table stack"><thead><tr><th>Jamaah</th><th>Jenjang / Dapukan</th><th class="num">Sesi</th><th class="num">H</th><th class="num">I</th><th class="num">S</th><th class="num">A</th><th class="num">Belum</th><th style="min-width:180px">% Hadir</th><th>Kategori</th></tr></thead><tbody>
          ${rows.slice((g.page - 1) * pp, g.page * pp).map(r => { const k = r.n ? katHadir(r.pct) : null; return `<tr>
            <td class="td-main"><div class="cell-person">${avatar(r.j)}<div><div class="cell-strong">${esc(r.j.Nama_Lengkap)}</div><div class="cell-sub mono">${esc(r.j.ID_Jamaah)} · ${esc(Store.kelName(r.j.ID_Kelompok))}</div></div></div></td>
            <td data-label="Jenjang">${jjBadge(r.j.Jenjang)}${jkBadge(r.j.Jenis_Kelamin)}${r.j.Dapukan ? `<div class="mt-1 row-wrap" style="gap:4px">${dpkBadges(r.j.Dapukan)}</div>` : ''}</td>
            <td data-label="Sesi" class="num">${r.wajib}</td><td data-label="Hadir" class="num"><b>${r.H}</b></td><td data-label="Izin" class="num">${r.I}</td><td data-label="Sakit" class="num">${r.S}</td><td data-label="Alpa" class="num">${r.A ? `<b style="color:var(--bad)">${r.A}</b>` : 0}</td><td data-label="Belum" class="num">${r.kosong || 0}</td>
            <td data-label="Persentase"><div class="row" style="gap:10px"><div class="grow">${bar(r.pct, r.n && r.pct < 50 ? 'var(--bad)' : r.n && r.pct < 70 ? 'var(--gold)' : '')}</div><b class="mono" style="min-width:56px;text-align:right">${P(r.pct)}</b></div></td>
            <td data-label="Kategori">${k ? `<span class="badge ${k[2]}">${k[1]}</span>` : '<span class="tiny faint">–</span>'}</td></tr>`; }).join('')}
        </tbody></table></div><div style="padding:0 20px 16px">${pages > 1 ? `<div class="row mt-3"><span class="tiny muted">Halaman ${g.page} dari ${pages}</span><span class="spacer"></span>
          <button class="btn btn-light btn-sm" ${g.page <= 1 ? 'disabled' : ''} onclick="Pages.kehadiran.setG('page',${g.page - 1})"><i class="bi bi-chevron-left"></i></button>
          <button class="btn btn-light btn-sm" ${g.page >= pages ? 'disabled' : ''} onclick="Pages.kehadiran.setG('page',${g.page + 1})"><i class="bi bi-chevron-right"></i></button></div>` : ''}</div>`
        : `<div style="padding:0 20px 20px">${emptyState('bi-person-x', 'Belum ada peserta pada sesi gabungan periode ini.')}</div>`}
      </div>`;
    $('#khdgSearch').addEventListener('input', debounce(e => { S.ui.khdg.q = e.target.value; S.ui.khdg.page = 1; const p = e.target.selectionStart; Pages.kehadiran.render(); const i = $('#khdgSearch'); i.focus(); i.setSelectionRange(p, p); }, 250));
  },
  gabSheets() {
    const { sesi, per, jenisSum } = Pages.kehadiran.computeGab();
    const r1 = n => (n == null ? '' : Math.round(n * 10) / 10);
    return {
      a: jenisSum.map(o => ({ 'Jenis Pengajian': o.l, 'Peserta': o.ket, 'Jumlah Peserta Aktif': o.peserta, 'Sesi': o.sesi, 'Hadir': o.H, 'Izin': o.I, 'Sakit': o.S, 'Alpa': o.A, '% Hadir': r1(o.pct), 'Rata-rata Hadir/Sesi': r1(o.avg) })),
      b: sesi.map(c => ({ 'Tanggal': c.k.Tanggal, 'Waktu': c.k.Waktu_Mulai + '–' + c.k.Waktu_Selesai, 'Pengajian': c.k.Nama_Kegiatan, 'Jenis': gabJenis(c.k)[1], 'Tempat': c.k.Tempat || '', 'Materi · Pengajar · Durasi': susunan(c.k).map((x, i) => (i + 1) + '. ' + x.m + ' — ' + x.p + ' (' + x.d + ' mnt)').join('; '), 'Peserta': c.peserta, 'Hadir': c.H, 'Izin': c.I, 'Sakit': c.S, 'Alpa': c.A, 'Belum Dicatat': c.belum, '% Hadir': r1(c.pct) })),
      c: Pages.kehadiran.gabRows(per).map(r => ({ 'ID Jamaah': r.j.ID_Jamaah, 'Nama': r.j.Nama_Lengkap, 'L/P': jkLabel(r.j.Jenis_Kelamin), 'Jenjang': r.j.Jenjang, 'Dapukan': r.j.Dapukan || '', 'Kelompok': Store.kelName(r.j.ID_Kelompok),
        'Sesi': r.wajib, 'Hadir': r.H, 'Izin': r.I, 'Sakit': r.S, 'Alpa': r.A, 'Belum Dicatat': r.kosong, '% Hadir': r1(r.pct), 'Kategori': r.n ? katHadir(r.pct)[1] : '' }))
    };
  },
  exportGab() {
    const [, , label] = Pages.kehadiran.range(S.ui.khd.per), x = Pages.kehadiran.gabSheets();
    Excel.export('Rekap_Pengajian_Gabungan_' + label.replace(/\W+/g, '_') + '_' + D.today(), [{ name: 'Per Jenis', rows: x.a }, { name: 'Per Sesi', rows: x.b }, { name: 'Per Jamaah', rows: x.c }]);
  },
  /** Cetak rekap (jendela cetak browser; bisa disimpan sebagai PDF). */
  printGab() {
    const [, , label] = Pages.kehadiran.range(S.ui.khd.per), x = Pages.kehadiran.gabSheets(), g = S.ui.khdg;
    const tbl = (title, rows) => rows.length ? `<h3>${esc(title)}</h3><table class="rk"><thead><tr>${Object.keys(rows[0]).map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${Object.values(r).map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '';
    let pa = $('#printArea');
    if (!pa) { pa = document.createElement('div'); pa.id = 'printArea'; document.body.appendChild(pa); }
    pa.innerHTML = `<div class="rk-doc"><h2>Rekap Absensi Pengajian Gabungan</h2><p>${esc(IdCard.org())} · ${esc(label)} · ${esc(g.jenis === 'ALL' ? 'Semua jenis' : gabJenis({ Jenis_Gabungan: g.jenis })[1])}${g.kel !== 'ALL' ? ' · ' + esc(Store.kelName(g.kel)) : ''} · dicetak ${esc(D.long(D.today()))}</p>
      ${tbl('Ringkasan per jenis', x.a)}${tbl('Per sesi', x.b)}${tbl('Per jamaah peserta', x.c.map(r => { const o = Object.assign({}, r); delete o['ID Jamaah']; return o; }))}</div>`;
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { try { window.print(); } catch (e) { UI.toast('Browser tidak mengizinkan cetak dari halaman ini.', 'warn'); } setTimeout(done, 1500); }, 300);
  },
  exportXlsx() {
    const { per, jj } = Pages.kehadiran.compute(), [, , label] = Pages.kehadiran.range(S.ui.khd.per);
    const r1 = n => (n == null ? '' : Math.round(n * 10) / 10);
    const a = jj.filter(c => c.jamaah).map(c => ({ 'Jenjang': c.name, 'Jumlah Jamaah': c.jamaah, 'Jamaah Tercatat': c.aktif, 'Hadir': c.H, 'Izin': c.I, 'Sakit': c.S, 'Alpa': c.A, 'Total Catatan': c.n, '% Hadir': r1(c.pct), 'Kategori': c.n ? katHadir(c.pct)[1] : '', 'Jamaah < 70%': c.perlu }));
    const b = Pages.kehadiran.rows(per).map(r => ({ 'ID Jamaah': r.j.ID_Jamaah, 'Nama': r.j.Nama_Lengkap, 'Jenjang': r.j.Jenjang, 'Kelas': r.j.Kelas || '', 'Kelompok': Store.kelName(r.j.ID_Kelompok),
      'Hadir': r.H, 'Izin': r.I, 'Sakit': r.S, 'Alpa': r.A, 'Total Catatan': r.n, '% Hadir': r1(r.pct), 'Kategori': r.n ? katHadir(r.pct)[1] : '' }));
    Excel.export('Persentase_Kehadiran_' + label.replace(/\W+/g, '_') + '_' + D.today(), [{ name: 'Per Jenjang', rows: a }, { name: 'Per Jamaah', rows: b }]);
  }
};

/* ───────────────────────── BUKU PENGHUBUNG (Admin) ───────────────────────── */
const JENJANG_BUKU = ['PAUD/TK', 'Caberawit', 'Pra Remaja', 'Remaja', 'Usia Nikah'];
const KATEGORI_BUKU = ['Perkembangan', 'Akhlak & Adab', 'Hafalan & Bacaan', 'Kehadiran', 'Pengumuman', 'Lainnya'];
const KAT_ICON = { 'Perkembangan': 'bi-graph-up', 'Akhlak & Adab': 'bi-heart', 'Hafalan & Bacaan': 'bi-book', 'Kehadiran': 'bi-calendar-check', 'Pengumuman': 'bi-megaphone', 'Lainnya': 'bi-chat-left-text' };
/** Nomor HP → format wa.me (62…). */
const waNum = hp => { let n = String(hp || '').replace(/[^\d]/g, ''); if (n.startsWith('0')) n = '62' + n.slice(1); return n.length >= 9 ? n : ''; };
// Catatan: tautan wa.me disusun tanpa dua garis miring berurutan di template literal (warisan versi Apps Script).
const WA_BASE = 'https:' + '/' + '/wa.me/';
const waLink = (hp, text) => { const n = waNum(hp); return n ? WA_BASE + n + '?text=' + encodeURIComponent(text) : ''; };
const multiline = t => esc(t).replace(/\n/g, '<br>');

Pages.buku = {
  eligible() {
    const f = S.ui.buku, q = f.q.trim().toLowerCase();
    return Store.jamaahScope().filter(j => JENJANG_BUKU.includes(j.Jenjang) && j.Status_Aktif === 'Aktif' &&
      (f.jenjang === 'ALL' || j.Jenjang === f.jenjang) && (f.jenjang !== 'Caberawit' || f.kelas === 'ALL' || j.Kelas === f.kelas) &&
      (!q || (j.Nama_Lengkap + ' ' + j.ID_Jamaah + ' ' + (j.Nama_Wali || '')).toLowerCase().includes(q)))
      .sort((a, b) => JENJANG.indexOf(a.Jenjang) - JENJANG.indexOf(b.Jenjang) || String(a.Kelas || '').localeCompare(String(b.Kelas || '')) || a.Nama_Lengkap.localeCompare(b.Nama_Lengkap));
  },
  notes(id) { return (S.idx.bukuJam.get(id) || []).slice().sort((a, b) => String(b.Tanggal + b.Dibuat_Pada).localeCompare(String(a.Tanggal + a.Dibuat_Pada))); },
  isNewReply(b) { return b.Tanggapan_Wali && b.Waktu_Tanggapan && (Date.now() - new Date(String(b.Waktu_Tanggapan).replace(' ', 'T')).getTime()) < 7 * 864e5; },

  render() {
    const f = S.ui.buku;
    const list = Pages.buku.eligible();
    if (f.sel && !list.some(j => j.ID_Jamaah === f.sel)) f.sel = null;
    if (!f.sel && list.length && window.innerWidth >= 1024) f.sel = list[0].ID_Jamaah;
    const scopeIds = new Set(Store.jamaahScope().map(j => j.ID_Jamaah));
    const all = S.d.buku.filter(b => scopeIds.has(b.ID_Jamaah));
    const ym = D.ym(new Date());
    const nMonth = all.filter(b => String(b.Tanggal).slice(0, 7) === ym).length;
    const unread = all.filter(b => !b.Dibaca_Wali).length;
    const replies = all.filter(Pages.buku.isNewReply).length;
    const elig = Store.jamaahScope().filter(j => JENJANG_BUKU.includes(j.Jenjang) && j.Status_Aktif === 'Aktif');
    const withPin = elig.filter(j => j.Punya_PIN === 'Ya').length;

    $('#page-buku').innerHTML = pageHead('Pembinaan <i class="bi bi-chevron-right"></i> <b>Buku Penghubung</b>', 'Buku Penghubung Orang Tua / Wali',
      `Catatan perkembangan jamaah PAUD/TK sampai Usia Nikah untuk orang tua/wali — ${esc(Store.scopeLabel())}. Wali membaca & membalas lewat menu Masuk sebagai Wali.`,
      `<button class="btn btn-primary" onclick="Pages.buku.bulkForm()"><i class="bi bi-send-plus"></i> Catatan Massal</button>`) + `
      <div class="grid-4">
        <div class="card kpi compact"><div class="kpi-label">Catatan Bulan Ini</div><div class="kpi-icon"><i class="bi bi-journal-text"></i></div><div class="kpi-value">${F.num(nMonth)}</div><div class="kpi-foot"><span>${F.num(all.length)} total catatan</span></div></div>
        <div class="card kpi compact"><div class="kpi-label">Belum Dibaca Wali</div><div class="kpi-icon ${unread ? 'warn' : ''}"><i class="bi bi-envelope"></i></div><div class="kpi-value">${F.num(unread)}</div><div class="kpi-foot"><span>Terbaca saat wali membuka aplikasi</span></div></div>
        <div class="card kpi compact accent-gold"><div class="kpi-label">Tanggapan Wali</div><div class="kpi-icon gold"><i class="bi bi-reply"></i></div><div class="kpi-value">${F.num(replies)}</div><div class="kpi-foot"><span>7 hari terakhir</span></div></div>
        <div class="card kpi compact"><div class="kpi-label">Wali Punya Akses</div><div class="kpi-icon"><i class="bi bi-key"></i></div><div class="kpi-value">${withPin}<small>/ ${elig.length}</small></div><div class="kpi-foot"><span>PIN wali sudah dibuat</span></div></div>
      </div>
      <div class="card section-gap"><div class="chips">
        <button class="chip ${f.jenjang === 'ALL' ? 'active' : ''}" onclick="Pages.buku.set('jenjang','ALL')">Semua Jenjang</button>
        ${JENJANG_BUKU.map(j => `<button class="chip ${f.jenjang === j ? 'active' : ''}" onclick="Pages.buku.set('jenjang','${j}')"><span class="dot" style="background:${JJ_COLOR[j]}"></span> ${esc(j)}</button>`).join('')}</div>
        <div class="toolbar mt-3"><label class="search-input"><i class="bi bi-search"></i><input class="input" id="bkSearch" placeholder="Cari jamaah atau nama wali…" value="${attr(f.q)}"></label>
          ${f.jenjang === 'Caberawit' ? `<select class="select" aria-label="Kelas" onchange="Pages.buku.set('kelas',this.value)">${opt('ALL', 'Semua Kelas', f.kelas)}${KELAS.map(k => opt(k, 'Kelas ' + k, f.kelas)).join('')}</select>` : ''}</div></div>
      ${list.length ? `<div class="grid grid-57 section-gap" id="bkGrid" style="align-items:start">
        <div class="card flush bk-side"><div class="bk-list">${list.map(j => Pages.buku.item(j)).join('')}</div></div>
        <div id="bkDetail">${f.sel ? Pages.buku.detail(f.sel) : `<div class="card">${emptyState('bi-hand-index', 'Pilih jamaah untuk melihat & menulis catatan.')}</div>`}</div>
      </div>` : `<div class="card section-gap">${emptyState('bi-journal-x', elig.length ? 'Tidak ada jamaah yang cocok dengan filter.' : 'Belum ada jamaah PAUD/TK sampai Usia Nikah.')}</div>`}`;
    $('#bkSearch').addEventListener('input', debounce(e => { S.ui.buku.q = e.target.value; const p = e.target.selectionStart; Pages.buku.render(); const i = $('#bkSearch'); i.focus(); i.setSelectionRange(p, p); }, 250));
    if (f.sel && window.innerWidth < 1024 && f.scroll) { f.scroll = false; setTimeout(() => { const d = $('#bkDetail'); if (d) d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 30); }
  },
  item(j) {
    const ns = Pages.buku.notes(j.ID_Jamaah), last = ns[0];
    const un = ns.filter(b => !b.Dibaca_Wali).length, rep = ns.filter(Pages.buku.isNewReply).length;
    return `<button class="bk-item ${S.ui.buku.sel === j.ID_Jamaah ? 'active' : ''}" onclick="S.ui.buku.sel='${j.ID_Jamaah}';S.ui.buku.scroll=true;Pages.buku.render()">
      ${avatar(j)}<span class="grow" style="min-width:0"><span class="row" style="gap:6px"><b class="ellipsis">${esc(j.Nama_Lengkap)}</b>${rep ? '<span class="badge b-gold"><i class="bi bi-reply"></i> Balasan</span>' : ''}</span>
      <span class="row tiny muted" style="gap:6px;margin-top:2px">${jjBadge(j.Jenjang)}${kelasBadge(j.Kelas)}<span>${ns.length} catatan${un ? ` · <b style="color:var(--warn-text)">${un} belum dibaca</b>` : ''}</span></span>
      ${last ? `<span class="tiny faint ellipsis" style="display:block;margin-top:2px">${esc(D.short(last.Tanggal))} · ${esc(String(last.Isi).slice(0, 70))}</span>` : ''}</span>
      ${j.Punya_PIN === 'Ya' ? '<i class="bi bi-key-fill" title="Wali punya akses" style="color:var(--primary)"></i>' : '<i class="bi bi-key faint" title="PIN wali belum dibuat"></i>'}</button>`;
  },
  detail(id) {
    const j = S.idx.jam.get(id);
    if (!j) return '';
    const ns = Pages.buku.notes(id);
    const today = D.today();
    return `<div class="card">
      <div class="row" style="gap:12px;align-items:flex-start">${avatar(j, 'lg')}<div class="grow"><div class="card-title">${esc(j.Nama_Lengkap)}</div>
        <div class="row-wrap mt-1" style="gap:6px">${jjBadge(j.Jenjang)}${kelasBadge(j.Kelas)}<span class="tiny muted mono">${esc(j.ID_Jamaah)}</span></div>
        <div class="small muted mt-1"><i class="bi bi-person"></i> Wali: <b>${esc(j.Nama_Wali || '–')}</b> · <i class="bi bi-telephone"></i> ${esc(j.No_HP || '–')}</div></div></div>
      <div class="row-wrap mt-3">
        <button class="btn btn-light btn-sm no-guru" onclick="Pages.buku.pin('${j.ID_Jamaah}')"><i class="bi bi-key"></i> ${j.Punya_PIN === 'Ya' ? 'Buat PIN Baru' : 'Buat Akses Wali'}</button>
        ${waNum(j.No_HP) ? `<a class="btn btn-light btn-sm" target="_blank" rel="noopener" href="${attr(waLink(j.No_HP, `Assalamu'alaikum ${j.Nama_Wali || 'Bapak/Ibu'}, `))}"><i class="bi bi-whatsapp"></i> Chat Wali</a>` : '<span class="tiny faint">No. HP wali belum diisi</span>'}
      </div>
      <form id="bkForm" class="form-grid two mt-3" onsubmit="event.preventDefault();Pages.buku.save('${j.ID_Jamaah}')">
        <label class="field"><span class="field-label">Kategori</span><select class="select" name="Kategori">${KATEGORI_BUKU.map(k => opt(k, k, 'Perkembangan')).join('')}</select></label>
        <label class="field"><span class="field-label">Tanggal</span><input class="input" type="date" name="Tanggal" value="${today}" max="${today}"></label>
        <label class="field span-2"><span class="field-label">Catatan untuk orang tua / wali</span><textarea class="input" name="Isi" rows="3" maxlength="2000" placeholder="mis. Alhamdulillah ananda sudah lancar membaca Iqro 3. Mohon dibantu muraja'ah di rumah 10 menit setiap hari."></textarea></label>
        <div class="span-2 row"><span class="tiny muted">Wali melihat catatan ini saat masuk sebagai wali.</span><span class="spacer"></span><button class="btn btn-primary btn-sm" type="submit"><i class="bi bi-send"></i> Kirim Catatan</button></div>
      </form></div>
      <div class="card section-gap"><div class="card-head"><div class="card-title"><i class="bi bi-journal-richtext"></i> Riwayat Catatan <span class="badge b-outline">${ns.length}</span></div></div>
        ${ns.length ? `<div class="bk-timeline">${ns.map(b => Pages.buku.note(b, j)).join('')}</div>` : emptyState('bi-journal', 'Belum ada catatan untuk jamaah ini.')}</div>`;
  },
  note(b, j) {
    const tmp = String(b.ID_Catatan).startsWith('tmp-');
    const wa = waLink(j.No_HP, `Assalamu'alaikum ${j.Nama_Wali || 'Bapak/Ibu'},\n\nBuku Penghubung *${j.Nama_Lengkap}* (${D.long(b.Tanggal)}) — ${b.Kategori}:\n${b.Isi}\n\nSilakan buka aplikasi Ayo Ngaji${S.d.settings.appUrl ? ' (' + S.d.settings.appUrl + ')' : ''} → Masuk sebagai Wali (ID Jamaah: ${j.ID_Jamaah}) untuk membaca & membalas.\n\n— ${b.Penulis || 'Pengurus'}`);
    return `<div class="bk-note">
      <div class="row" style="gap:8px"><span class="badge b-mint"><i class="bi ${KAT_ICON[b.Kategori] || 'bi-chat-left-text'}"></i> ${esc(b.Kategori)}</span><span class="tiny muted">${esc(D.long(b.Tanggal))} · ${esc(b.Penulis || '')}</span><span class="spacer"></span>
        ${tmp ? '<span class="tiny muted"><i class="bi bi-arrow-repeat spin-icon"></i> Mengirim…</span>' : b.Dibaca_Wali ? `<span class="badge b-ok" title="Dibaca ${attr(b.Dibaca_Wali)}"><i class="bi bi-check2-all"></i> Dibaca wali</span>` : '<span class="badge b-warn"><i class="bi bi-check2"></i> Belum dibaca</span>'}</div>
      <div class="bk-isi">${multiline(b.Isi)}</div>
      ${b.Tanggapan_Wali ? `<div class="bk-reply"><div class="tiny muted mb-1"><i class="bi bi-reply-fill"></i> Tanggapan ${esc(j.Nama_Wali || 'wali')} · ${esc(D.rel(b.Waktu_Tanggapan))}</div>${multiline(b.Tanggapan_Wali)}</div>` : ''}
      ${tmp ? '' : `<div class="row mt-2" style="gap:6px">${wa ? `<a class="btn btn-soft btn-sm" target="_blank" rel="noopener" href="${attr(wa)}"><i class="bi bi-whatsapp"></i> Kirim via WhatsApp</a>` : ''}<span class="spacer"></span>
        <button class="icon-btn sm" aria-label="Hapus catatan" title="Hapus catatan" onclick="Pages.buku.remove('${b.ID_Catatan}')"><i class="bi bi-trash3" style="color:var(--bad)"></i></button></div>`}
    </div>`;
  },
  set(k, v) { S.ui.buku[k] = v; if (k === 'jenjang') S.ui.buku.kelas = 'ALL'; Pages.buku.render(); },

  /** Kirim catatan (1 jamaah atau banyak) secara optimistic. */
  send(ids, rec, msg) {
    const prev = S.d.buku;
    const temps = ids.map((id, i) => { const j = S.idx.jam.get(id); return Object.assign({ ID_Catatan: 'tmp-' + Date.now() + '-' + i, ID_Jamaah: id, ID_Kelompok: j.ID_Kelompok, Penulis: S.user.Nama, Dibaca_Wali: '', Tanggapan_Wali: '', Waktu_Tanggapan: '', Dibuat_Pada: D.today() + ' 23:59:59' }, rec); });
    return App.mutate({
      apply: () => { S.d.buku = prev.concat(temps); },
      rollback: () => { S.d.buku = prev; },
      call: () => API.run('apiSaveCatatan', Object.assign({ ID_Jamaah: ids }, rec)),
      onSaved: rows => { const t = new Set(temps.map(x => x.ID_Catatan)); S.d.buku = S.d.buku.filter(b => !t.has(b.ID_Catatan)).concat(rows); },
      after: () => { if (S.page === 'buku') Pages.buku.render(); },
      okMsg: msg
    }).catch(() => {});
  },
  save(id) {
    const f = $('#bkForm'), fd = Object.fromEntries(new FormData(f).entries());
    if (!fd.Isi.trim()) { UI.toast('Tulis isi catatan terlebih dahulu.', 'warn'); f.Isi.focus(); return; }
    Pages.buku.send([id], { Kategori: fd.Kategori, Tanggal: fd.Tanggal || D.today(), Isi: fd.Isi.trim() }, 'Catatan dikirim ke buku penghubung.');
  },
  async remove(idc) {
    const b = S.d.buku.find(x => x.ID_Catatan === idc);
    if (!b || !(await UI.confirm(`Hapus catatan tanggal <b>${esc(D.long(b.Tanggal))}</b>?${b.Tanggapan_Wali ? ' Tanggapan wali ikut terhapus.' : ''}`, { ok: 'Hapus', danger: true }))) return;
    const prev = S.d.buku;
    App.mutate({ apply: () => { S.d.buku = prev.filter(x => x.ID_Catatan !== idc); }, rollback: () => { S.d.buku = prev; }, call: () => API.run('apiDeleteCatatan', idc), okMsg: 'Catatan dihapus.' }).catch(() => {});
  },
  async pin(id) {
    const j = S.idx.jam.get(id);
    if (j.Punya_PIN === 'Ya' && !(await UI.confirm(`Buat PIN baru untuk wali <b>${esc(j.Nama_Lengkap)}</b>? PIN lama langsung tidak berlaku dan wali yang sedang masuk akan keluar otomatis.`, { ok: 'Buat PIN Baru' }))) return;
    let r;
    try { UI.toast('Membuat PIN…', 'info'); r = await API.run('apiResetPinWali', id); }
    catch (e) { UI.toast(e.message, 'bad'); return; }
    Store.upsert('jamaah', { ID_Jamaah: id, Punya_PIN: 'Ya' }, 'ID_Jamaah'); Store.index(); Store.persist();
    if (S.page === 'buku') Pages.buku.render();
    const text = `Assalamu'alaikum ${j.Nama_Wali || 'Bapak/Ibu'},\n\nBerikut akses Buku Penghubung Ayo Ngaji untuk ananda *${j.Nama_Lengkap}*:\n• ID Jamaah: *${j.ID_Jamaah}*\n• PIN: *${r.PIN}*\n\nBuka aplikasi Ayo Ngaji${S.d.settings.appUrl ? ' (' + S.d.settings.appUrl + ')' : ''}, pilih *Orang Tua / Wali*, lalu masukkan ID & PIN di atas. Mohon PIN tidak dibagikan ke orang lain.`;
    const wa = waLink(j.No_HP, text);
    const m = UI.modal({
      title: 'Akses Orang Tua / Wali', size: 'md',
      body: `<p class="muted small">Sampaikan ID & PIN ini kepada wali <b>${esc(j.Nama_Lengkap)}</b>. PIN hanya ditampilkan <b>sekali</b>; jika hilang, buat PIN baru.</p>
        <div class="pin-box mt-3"><div><div class="tiny muted">ID JAMAAH</div><div class="mono pin-val">${esc(j.ID_Jamaah)}</div></div><div><div class="tiny muted">PIN</div><div class="mono pin-val">${esc(r.PIN)}</div></div></div>`,
      foot: `<button class="btn btn-light" id="pinCopy"><i class="bi bi-copy"></i> Salin Pesan</button>${wa ? `<a class="btn btn-primary" target="_blank" rel="noopener" href="${attr(wa)}"><i class="bi bi-whatsapp"></i> Kirim via WhatsApp</a>` : '<button class="btn btn-primary" data-close>Selesai</button>'}`
    });
    $('#pinCopy', m.el).onclick = async () => { try { await navigator.clipboard.writeText(text); UI.toast('Pesan disalin.', 'ok'); } catch (e) { UI.toast('Tidak bisa menyalin otomatis. Salin manual ID & PIN di atas.', 'warn'); } };
  },
  bulkForm() {
    const f = S.ui.buku;
    const m = UI.modal({
      title: 'Catatan Massal ke Orang Tua / Wali', size: 'lg',
      body: `<form id="bkBulk" class="form-grid two">
        <label class="field"><span class="field-label">Jenjang</span><select class="select" name="Jenjang">${JENJANG_BUKU.map(j => opt(j, j, f.jenjang === 'ALL' ? 'Caberawit' : f.jenjang)).join('')}</select></label>
        <label class="field" id="bbKelas"><span class="field-label">Kelas</span><select class="select" name="Kelas">${opt('ALL', 'Semua Kelas', f.kelas)}${KELAS.map(k => opt(k, 'Kelas ' + k, f.kelas)).join('')}</select></label>
        <label class="field"><span class="field-label">Kategori</span><select class="select" name="Kategori">${KATEGORI_BUKU.map(k => opt(k, k, 'Pengumuman')).join('')}</select></label>
        <label class="field"><span class="field-label">Tanggal</span><input class="input" type="date" name="Tanggal" value="${D.today()}" max="${D.today()}"></label>
        <label class="field span-2"><span class="field-label">Isi catatan</span><textarea class="input" name="Isi" rows="4" maxlength="2000" placeholder="mis. Pekan depan pengajian libur karena ujian sekolah. Mohon ananda tetap muraja'ah di rumah."></textarea></label>
        <div class="span-2"><div class="row"><span class="field-label">Penerima</span><span class="spacer"></span><label class="tiny"><input type="checkbox" id="bbAll" checked> Pilih semua</label></div><div id="bbList" class="bb-list mt-2"></div></div>
        <div id="bbErr" class="form-error span-2" hidden></div></form>`,
      foot: `<button class="btn btn-light" data-close>Batal</button><button class="btn btn-primary" id="bbGo"><i class="bi bi-send"></i> Kirim</button>`
    });
    const form = $('#bkBulk', m.el);
    const fill = () => {
      const jj = form.Jenjang.value, kl = form.Kelas.value;
      $('#bbKelas', m.el).hidden = jj !== 'Caberawit';
      const rec = Store.jamaahScope().filter(j => j.Jenjang === jj && j.Status_Aktif === 'Aktif' && (jj !== 'Caberawit' || kl === 'ALL' || j.Kelas === kl)).sort((a, b) => a.Nama_Lengkap.localeCompare(b.Nama_Lengkap));
      $('#bbList', m.el).innerHTML = rec.length ? rec.map(j => `<label class="bb-item"><input type="checkbox" name="r" value="${j.ID_Jamaah}" checked> <span>${esc(j.Nama_Lengkap)}${j.Kelas ? ' · ' + esc(j.Kelas) : ''}${Store.allKel() ? ` <span class="tiny faint">${esc(Store.kelName(j.ID_Kelompok))}</span>` : ''}</span></label>`).join('') : '<div class="muted small">Tidak ada jamaah aktif.</div>';
      $('#bbAll', m.el).checked = true;
    };
    form.Jenjang.onchange = fill; form.Kelas.onchange = fill; fill();
    $('#bbAll', m.el).onchange = e => $$('[name=r]', m.el).forEach(c => { c.checked = e.target.checked; });
    $('#bbGo', m.el).onclick = () => {
      const ids = $$('[name=r]:checked', m.el).map(c => c.value), isi = form.Isi.value.trim(), e = $('#bbErr', m.el);
      if (!ids.length) { e.textContent = 'Pilih minimal satu penerima.'; e.hidden = false; return; }
      if (!isi) { e.textContent = 'Tulis isi catatan.'; e.hidden = false; return; }
      m.close();
      Pages.buku.send(ids, { Kategori: form.Kategori.value, Tanggal: form.Tanggal.value || D.today(), Isi: isi }, `Catatan dikirim ke ${ids.length} wali.`);
    };
  }
};

/* ───────────────────────── BARCODE (Code 128-B) & ID CARD ───────────────────────── */
/** Pembuat barcode Code 128 set B tanpa pustaka luar (dibaca scanner USB/Bluetooth & kamera). */
const Barcode = {
  P: ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
    '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
    '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
    '114131', '311141', '411131', '211412', '211214', '211232'],
  /** Lebar modul bar/spasi bergantian, diawali bar. */
  widths(text) {
    const s = String(text);
    const codes = [104];
    for (const ch of s) { const c = ch.charCodeAt(0); if (c < 32 || c > 126) throw new Error('Karakter tidak didukung barcode: ' + ch); codes.push(c - 32); }
    const chk = codes.reduce((sum, v, i) => sum + v * (i || 1), 0) % 103;
    codes.push(chk);
    return codes.map(c => Barcode.P[c]).join('') + '2331112';
  },
  svg(text, h = 46) {
    const w = Barcode.widths(text);
    const quiet = 10, total = [...w].reduce((a, b) => a + +b, 0) + quiet * 2;
    let x = quiet, bars = '';
    [...w].forEach((d, i) => { const n = +d; if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${n}" height="${h}"/>`; x += n; });
    return `<svg class="bc" viewBox="0 0 ${total} ${h}" preserveAspectRatio="none" role="img" aria-label="Barcode ${attr(text)}"><rect width="${total}" height="${h}" fill="#fff"/><g fill="#000">${bars}</g></svg>`;
  }
};

const IdCard = {
  /** Pilihan cetak: orientasi kartu generus (L = lanskap, P = potret) & sertakan bagian belakang. */
  opt: { orient: 'L', back: true },
  loadOpt() { const o = LS.json('an_idc_opt'); if (o) { IdCard.opt.orient = o.orient === 'P' ? 'P' : 'L'; IdCard.opt.back = o.back !== false; } },
  saveOpt() { LS.setJson('an_idc_opt', IdCard.opt); },
  /** Jenjang Dewasa selalu lanskap; Balita–Usia Nikah mengikuti pilihan. */
  orient(j) { return j.Jenjang === 'Dewasa' ? 'L' : IdCard.opt.orient; },
  org() { return (S.d && S.d.settings && (S.d.settings.namaOrganisasi || S.d.settings.org)) || 'Ayo Ngaji'; },
  /** Jenjang Balita–Usia Nikah = KARTU GENERUS; Dewasa = KARTU JAMAAH. */
  title(j) { return j.Jenjang === 'Dewasa' ? 'KARTU JAMAAH' : 'KARTU GENERUS'; },
  /** Data yang tercetak di kartu: Nama, Tempat/Tgl lahir, Kelompok, Alamat (+ jenjang di pita atas). */
  fields(j) {
    const ttl = [j.Tempat_Lahir, j.Tanggal_Lahir ? D.short(j.Tanggal_Lahir) : ''].filter(Boolean).join(', ') || '–';
    return { tag: j.Jenjang + (j.Kelas ? ' · ' + j.Kelas : ''), rows: [['Nama', j.Nama_Lengkap], ['Tempat/Tgl Lahir', ttl], ['Kelompok', Store.kelName(j.ID_Kelompok)], ['Alamat', j.Alamat || '–']] };
  },
  /** Ketentuan di bagian belakang kartu. */
  rules() {
    return ['Kartu identitas resmi, tidak boleh dipindahtangankan.', 'Bawa & tunjukkan kartu (scan barcode) setiap pengajian.',
      'Kartu hilang atau rusak? Segera lapor ke pengurus kelompok.', 'Menemukan kartu ini? Mohon kembalikan ke pengurus kelompok tertera.'];
  },
  kel(j) { return S.idx.kel.get(String(j.ID_Kelompok)) || {}; },
  logoHtml(cls) { return `<span class="${cls} ${Logo.get() ? 'has-img' : ''}">${Logo.html()}</span>`; },
  fotoHtml(j) {
    const ini = esc(F.initials(j.Nama_Lengkap));
    return j.Foto_URL ? `<img src="${attr(j.Foto_URL)}" alt="" referrerpolicy="no-referrer" onerror="this.parentNode.textContent='${ini}'">` : ini;
  },

  // ── Tampilan HTML (pratinjau & cetak) ──
  html(j, side) { return side === 'back' ? IdCard.backHtml(j) : IdCard.orient(j) === 'P' ? IdCard.frontP(j) : IdCard.frontL(j); },
  frontL(j) {
    const f = IdCard.fields(j);
    return `<div class="idc"><div class="idc-top">${IdCard.logoHtml('idc-logo')}<span class="grow"><b>${esc(IdCard.org())}</b><small>${IdCard.title(j)}</small></span><span class="idc-jj">${esc(f.tag)}</span></div>
      <div class="idc-body"><div class="idc-foto">${IdCard.fotoHtml(j)}</div><table class="idc-tbl">${f.rows.map(([l, v], i) => `<tr><th>${l}</th><td>:</td><td><div class="${i === 0 ? 'idc-nama' : i === 3 ? 'idc-alamat' : 'idc-1'}">${esc(v)}</div></td></tr>`).join('')}</table></div>
      <div class="idc-bc">${Barcode.svg(j.ID_Jamaah)}<div class="idc-id">${esc(j.ID_Jamaah)}</div></div></div>`;
  },
  frontP(j) {
    const f = IdCard.fields(j);
    return `<div class="idc p"><div class="idc-top">${IdCard.logoHtml('idc-logo')}<span class="grow"><b>${esc(IdCard.org())}</b><small>${IdCard.title(j)}</small></span></div>
      <div class="idc-pbody"><div class="idc-foto">${IdCard.fotoHtml(j)}</div><div class="idc-pnama">${esc(j.Nama_Lengkap)}</div><span class="idc-pjj">${esc(f.tag)}</span>
        <table class="idc-tbl">${f.rows.slice(1).map(([l, v], i) => `<tr><th>${l === 'Tempat/Tgl Lahir' ? 'TTL' : l}</th><td>:</td><td><div class="${i === 1 ? 'idc-1' : 'idc-2'}">${esc(v)}</div></td></tr>`).join('')}</table></div>
      <div class="idc-bc">${Barcode.svg(j.ID_Jamaah)}<div class="idc-id">${esc(j.ID_Jamaah)}</div></div></div>`;
  },
  backHtml(j) {
    const k = IdCard.kel(j), p = IdCard.orient(j) === 'P';
    return `<div class="idc idc-back ${p ? 'p' : ''}">
      <div class="idcb-head">${IdCard.logoHtml('idcb-logo')}<div class="idcb-org"><b>${esc(IdCard.org())}</b><small>${IdCard.title(j)}</small></div></div>
      <div class="idcb-rule"></div>
      <div class="idcb-h">Ketentuan Kartu</div>
      <ol class="idcb-list">${IdCard.rules().map(r => `<li>${esc(r)}</li>`).join('')}</ol>
      <div class="idcb-foot"><div class="idcb-kel"><small>Kelompok</small><b>${esc(k.Nama_Kelompok || Store.kelName(j.ID_Kelompok))}</b>${k.Desa_Daerah ? `<span>${esc(k.Desa_Daerah)}</span>` : ''}</div>
        <div class="idcb-ttd"><small>Pengurus Kelompok</small><i></i><b>${esc(k.Nama_Pengurus || '........................')}</b></div></div>
    </div>`;
  },

  // ── Kanvas 300 dpi untuk unduh JPG ──
  async kit(W, H) {
    const PX = 1012 / 85.6, mm = v => v * PX;
    const c = document.createElement('canvas'); c.width = Math.round(mm(W)); c.height = Math.round(mm(H));
    const x = c.getContext('2d');
    try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) { /* abaikan */ }
    const FONT = "'Plus Jakarta Sans', Inter, 'Segoe UI', Arial, sans-serif", MONO = "'JetBrains Mono', Consolas, 'Courier New', monospace";
    const rr = (X, Y, w, h, R) => { x.beginPath(); x.moveTo(X + R, Y); x.arcTo(X + w, Y, X + w, Y + h, R); x.arcTo(X + w, Y + h, X, Y + h, R); x.arcTo(X, Y + h, X, Y, R); x.arcTo(X, Y, X + w, Y, R); x.closePath(); };
    const wrap = (t, font, max, vw) => {
      x.font = font; const words = String(t).split(/\s+/), out = []; let cur = '';
      words.forEach(w => { const tt = cur ? cur + ' ' + w : w; if (x.measureText(tt).width <= vw) cur = tt; else { if (cur) out.push(cur); cur = w; } });
      if (cur) out.push(cur);
      if (out.length > max) { out.length = max; while (x.measureText(out[max - 1] + '…').width > vw && out[max - 1].length) out[max - 1] = out[max - 1].slice(0, -1); out[max - 1] += '…'; }
      return out.map(l => { while (x.measureText(l).width > vw && l.length > 1) l = l.slice(0, -2) + '…'; return l; });
    };
    const logo = async (X, Y, S, onDark) => {
      const lg = Logo.get();
      if (lg) {
        try {
          const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = lg; });
          x.fillStyle = '#FFFFFF'; rr(X, Y, S, S, S * 0.23); x.fill();
          const box = S * 0.9, sc = Math.min(box / im.width, box / im.height), w = im.width * sc, h = im.height * sc;
          x.save(); rr(X, Y, S, S, S * 0.23); x.clip(); x.drawImage(im, X + (S - w) / 2, Y + (S - h) / 2, w, h); x.restore();
          return;
        } catch (e) { /* pakai ikon bawaan */ }
      }
      x.fillStyle = onDark ? 'rgba(255,255,255,0.18)' : '#0F6B4F'; rr(X, Y, S, S, S * 0.23); x.fill();
      x.fillStyle = '#FFFFFF'; const bw = S * 0.29, bh = S * 0.57, gy = Y + S * 0.215;
      rr(X + S * 0.185, gy, bw, bh, S * 0.05); x.fill(); rr(X + S * 0.525, gy, bw, bh, S * 0.05); x.fill();
    };
    const barcode = (id, top, h, side) => {
      const wd = Barcode.widths(id), mods = [...wd].reduce((a, b) => a + +b, 0);
      const area = c.width - mm(side * 2), m = Math.max(2, Math.floor(area / (mods + 20)));
      let bx = Math.round((c.width - m * mods) / 2);
      x.fillStyle = '#000000';
      [...wd].forEach((d, i) => { const w = +d * m; if (i % 2 === 0) x.fillRect(bx, Math.round(mm(top)), w, Math.round(mm(h))); bx += w; });
      c.dataset.module = m;
    };
    const frame = () => { x.strokeStyle = '#CFE3D9'; x.lineWidth = mm(0.3); rr(mm(0.15), mm(0.15), c.width - mm(0.3), c.height - mm(0.3), mm(3.1)); x.stroke(); };
    x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, c.width, c.height);
    return { c, x, mm, rr, wrap, logo, barcode, frame, FONT, MONO };
  },
  /** Foto dari server lain bisa "mengunci" kanvas; diuji dulu agar JPG tetap bisa dibuat (fallback inisial). */
  async foto(j) {
    if (!j.Foto_URL) return null;
    try {
      const img = await new Promise((res, rej) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.referrerPolicy = 'no-referrer'; im.onload = () => res(im); im.onerror = rej; im.src = j.Foto_URL; setTimeout(rej, 6000); });
      const t = document.createElement('canvas'); t.width = t.height = 2; t.getContext('2d').drawImage(img, 0, 0, 2, 2); t.toDataURL();
      return img;
    } catch (e) { return null; }
  },
  async canvas(j, side) {
    const p = IdCard.orient(j) === 'P';
    if (side === 'back') return IdCard.canvasBack(j, p);
    return p ? IdCard.canvasP(j) : IdCard.canvasL(j);
  },
  async drawFoto(K, j, fx, fy, fw, fh) {
    const { x, mm, rr, FONT } = K;
    x.fillStyle = '#E6F4EE'; rr(fx, fy, fw, fh, mm(1.5)); x.fill();
    const img = await IdCard.foto(j);
    if (img) {
      x.save(); rr(fx, fy, fw, fh, mm(1.5)); x.clip();
      const sc = Math.max(fw / img.width, fh / img.height), w = img.width * sc, h = img.height * sc;
      x.drawImage(img, fx + (fw - w) / 2, fy + (fh - h) / 2, w, h); x.restore();
    } else { x.fillStyle = '#0F6B4F'; x.font = `700 ${fw * 0.33}px ${FONT}`; x.textAlign = 'center'; x.fillText(F.initials(j.Nama_Lengkap), fx + fw / 2, fy + fh / 2 + fw * 0.12); x.textAlign = 'left'; }
    x.strokeStyle = '#CFE3D9'; x.lineWidth = mm(0.3); rr(fx, fy, fw, fh, mm(1.5)); x.stroke();
  },
  async canvasL(j) {
    const K = await IdCard.kit(85.6, 54), { c, x, mm, rr, wrap, FONT, MONO } = K;
    x.save(); rr(0, 0, c.width, c.height, mm(3.2)); x.clip();
    x.strokeStyle = 'rgba(15,107,79,0.06)'; x.lineWidth = mm(3); x.beginPath(); x.arc(c.width + mm(5), mm(21), mm(13.5), 0, Math.PI * 2); x.stroke();
    const g = x.createLinearGradient(0, 0, c.width, 0); g.addColorStop(0, '#0F6B4F'); g.addColorStop(1, '#1E9E6A');
    x.fillStyle = g; x.fillRect(0, 0, c.width, mm(10.2));
    x.fillStyle = '#C9A227'; x.fillRect(0, mm(10.2), c.width, mm(0.8));
    await K.logo(mm(3), mm(2.1), mm(6), true);
    x.textBaseline = 'alphabetic'; x.fillStyle = '#FFFFFF';
    x.font = `800 ${mm(3.2)}px ${FONT}`; x.fillText(IdCard.org(), mm(10.6), mm(5.3));
    x.font = `600 ${mm(2.05)}px ${FONT}`; x.globalAlpha = 0.85; x.fillText(IdCard.title(j).split('').join(' '), mm(10.6), mm(8.3)); x.globalAlpha = 1;
    await IdCard.drawFoto(K, j, mm(3), mm(13.2), mm(15), mm(18));
    const fd = IdCard.fields(j), ix = mm(21), lw = mm(19.5), vx = ix + lw + mm(1.6), vw = c.width - vx - mm(3);
    let y = mm(15.9);
    fd.rows.forEach(([lab, val], i) => {
      const font = i === 0 ? `800 ${mm(2.9)}px ${FONT}` : `500 ${mm(2.35)}px ${FONT}`;
      const lines = wrap(val, font, i === 0 || i === 3 ? 2 : 1, vw);
      x.font = `600 ${mm(2.15)}px ${FONT}`; x.fillStyle = '#5B7268'; x.fillText(lab, ix, y); x.fillText(':', ix + lw, y);
      x.font = font; x.fillStyle = i === 0 ? '#10231B' : '#2E4239';
      lines.forEach((l, k) => { x.fillText(l, vx, y + k * mm(i === 0 ? 3.4 : 2.9)); });
      y += lines.length * mm(i === 0 ? 3.4 : 2.9) + mm(1.1);
    });
    x.font = `700 ${mm(2.2)}px ${FONT}`; const tw = x.measureText(fd.tag).width + mm(3.2);
    x.fillStyle = 'rgba(255,255,255,0.18)'; rr(c.width - mm(3) - tw, mm(3.1), tw, mm(4.2), mm(2.1)); x.fill();
    x.fillStyle = '#FFFFFF'; x.textAlign = 'center'; x.fillText(fd.tag, c.width - mm(3) - tw / 2, mm(5.95)); x.textAlign = 'left';
    K.barcode(j.ID_Jamaah, 39.3, 9, 3);
    x.font = `500 ${mm(2.4)}px ${MONO}`; x.textAlign = 'center'; x.fillStyle = '#10231B';
    x.fillText(String(j.ID_Jamaah).split('').join(' '), c.width / 2, mm(51.7)); x.textAlign = 'left';
    x.restore(); K.frame();
    return c;
  },
  async canvasP(j) {
    const K = await IdCard.kit(54, 85.6), { c, x, mm, rr, wrap, FONT, MONO } = K;
    const W = c.width, cx = W / 2;
    x.save(); rr(0, 0, W, c.height, mm(3.2)); x.clip();
    x.strokeStyle = 'rgba(15,107,79,0.06)'; x.lineWidth = mm(3); x.beginPath(); x.arc(W + mm(4), mm(40), mm(14), 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.arc(-mm(6), mm(58), mm(11), 0, Math.PI * 2); x.stroke();
    const g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#0F6B4F'); g.addColorStop(1, '#1E9E6A');
    x.fillStyle = g; x.fillRect(0, 0, W, mm(12.6));
    x.fillStyle = '#C9A227'; x.fillRect(0, mm(12.6), W, mm(0.8));
    await K.logo(mm(3), mm(3), mm(6.6), true);
    x.fillStyle = '#FFFFFF'; x.font = `800 ${mm(3.1)}px ${FONT}`;
    x.fillText(wrap(IdCard.org(), x.font, 1, W - mm(14))[0], mm(11.4), mm(6.6));
    x.font = `600 ${mm(1.9)}px ${FONT}`; x.globalAlpha = 0.85; x.fillText(IdCard.title(j).split('').join(' '), mm(11.4), mm(9.9)); x.globalAlpha = 1;
    const fw = mm(20), fh = mm(24);
    await IdCard.drawFoto(K, j, cx - fw / 2, mm(16.2), fw, fh);
    // nama (tengah, 2 baris)
    const nf = `800 ${mm(3)}px ${FONT}`, nl = wrap(j.Nama_Lengkap, nf, 2, W - mm(6));
    x.font = nf; x.fillStyle = '#10231B'; x.textAlign = 'center';
    let y = mm(44.6); nl.forEach(l => { x.fillText(l, cx, y); y += mm(3.5); });
    // pita jenjang
    const fd = IdCard.fields(j);
    x.font = `700 ${mm(2.05)}px ${FONT}`; const tw = x.measureText(fd.tag).width + mm(3.6);
    x.fillStyle = '#E6F4EE'; rr(cx - tw / 2, y - mm(2.2), tw, mm(3.8), mm(1.9)); x.fill();
    x.fillStyle = '#0F6B4F'; x.fillText(fd.tag, cx, y + mm(0.35)); x.textAlign = 'left';
    y += mm(5.6);
    // TTL, Kelompok, Alamat
    const ix = mm(3.4), lw = mm(12.6), vx = ix + lw + mm(1.4), vw = W - vx - mm(3);
    const lim = mm(68.6);
    fd.rows.slice(1).forEach(([lab, val], i) => {
      if (y > lim) return;
      const font = `500 ${mm(2.15)}px ${FONT}`;
      let lines = wrap(val, font, i === 1 ? 1 : 2, vw);
      while (lines.length > 1 && y + (lines.length - 1) * mm(2.7) > lim) lines = wrap(val, font, lines.length - 1, vw);
      x.font = `600 ${mm(1.95)}px ${FONT}`; x.fillStyle = '#5B7268'; x.fillText(lab === 'Tempat/Tgl Lahir' ? 'TTL' : lab, ix, y); x.fillText(':', ix + lw, y);
      x.font = font; x.fillStyle = '#2E4239';
      lines.forEach((l, k) => x.fillText(l, vx, y + k * mm(2.7)));
      y += lines.length * mm(2.7) + mm(0.9);
    });
    K.barcode(j.ID_Jamaah, 71.2, 8.2, 2.6);
    x.font = `500 ${mm(2.2)}px ${MONO}`; x.textAlign = 'center'; x.fillStyle = '#10231B';
    x.fillText(String(j.ID_Jamaah).split('').join(' '), cx, mm(82.6)); x.textAlign = 'left';
    x.restore(); K.frame();
    return c;
  },
  async canvasBack(j, p) {
    const W0 = p ? 54 : 85.6, H0 = p ? 85.6 : 54;
    const K = await IdCard.kit(W0, H0), { c, x, mm, rr, wrap, FONT } = K;
    const W = c.width, H = c.height;
    x.save(); rr(0, 0, W, H, mm(3.2)); x.clip();
    const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#0B5A42'); g.addColorStop(1, '#16875A');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(255,255,255,0.07)'; x.lineWidth = mm(3);
    x.beginPath(); x.arc(W + mm(2), -mm(2), mm(p ? 16 : 18), 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.arc(-mm(4), H + mm(3), mm(p ? 13 : 12), 0, Math.PI * 2); x.stroke();
    x.fillStyle = '#C9A227'; x.fillRect(0, H - mm(1.2), W, mm(1.2));
    const k = IdCard.kel(j), side = mm(p ? 3.6 : 4.2);
    let y;
    if (p) {
      const S = mm(13); await K.logo(W / 2 - S / 2, mm(5), S, true);
      x.textAlign = 'center'; x.fillStyle = '#FFFFFF'; x.font = `800 ${mm(3.3)}px ${FONT}`;
      x.fillText(wrap(IdCard.org(), x.font, 1, W - side * 2)[0], W / 2, mm(23.2));
      x.font = `700 ${mm(1.95)}px ${FONT}`; x.fillStyle = '#E9C95A'; x.fillText(IdCard.title(j).split('').join(' '), W / 2, mm(26.8));
      x.textAlign = 'left'; y = mm(29.4);
    } else {
      const S = mm(10.5); await K.logo(side, mm(4.2), S, true);
      x.fillStyle = '#FFFFFF'; x.font = `800 ${mm(3.6)}px ${FONT}`; x.fillText(IdCard.org(), side + S + mm(3), mm(9));
      x.font = `700 ${mm(2.05)}px ${FONT}`; x.fillStyle = '#E9C95A'; x.fillText(IdCard.title(j).split('').join(' '), side + S + mm(3), mm(12.6));
      y = mm(16.6);
    }
    x.fillStyle = 'rgba(233,201,90,0.55)'; x.fillRect(side, y, W - side * 2, mm(0.35));
    y += mm(p ? 4.6 : 4.2);
    x.fillStyle = '#E9C95A'; x.font = `800 ${mm(2.05)}px ${FONT}`; x.fillText('KETENTUAN KARTU', side, y);
    y += mm(p ? 3.6 : 3.4);
    const rf = `500 ${mm(p ? 1.95 : 2.05)}px ${FONT}`, lh = mm(p ? 2.55 : 2.7), nx = side + mm(3.2), vw = W - nx - side;
    IdCard.rules().forEach((r, i) => {
      const lines = wrap(r, rf, 3, vw);
      x.font = `800 ${mm(p ? 1.95 : 2.05)}px ${FONT}`; x.fillStyle = '#E9C95A'; x.fillText((i + 1) + '.', side, y);
      x.font = rf; x.fillStyle = 'rgba(255,255,255,0.93)';
      lines.forEach((l, n) => x.fillText(l, nx, y + n * lh));
      y += lines.length * lh + mm(p ? 1.1 : 0.7);
    });
    // kaki: kelompok & pengurus
    const fy = H - mm(p ? 15.4 : 11.4);
    x.fillStyle = 'rgba(255,255,255,0.12)'; rr(side, fy - mm(1.6), W - side * 2, mm(p ? 12.4 : 9.4), mm(1.6)); x.fill();
    const colW = (W - side * 2) / 2, kx = side + mm(2), tx = side + colW + mm(1);
    const kelName = k.Nama_Kelompok || Store.kelName(j.ID_Kelompok);
    x.font = `600 ${mm(1.7)}px ${FONT}`; x.fillStyle = 'rgba(255,255,255,0.7)'; x.fillText('KELOMPOK', kx, fy + mm(1.4)); x.fillText('PENGURUS KELOMPOK', tx, fy + mm(1.4));
    x.font = `800 ${mm(2.2)}px ${FONT}`; x.fillStyle = '#FFFFFF';
    const kl = wrap(kelName, x.font, p ? 2 : 1, colW - mm(3));
    kl.forEach((l, n) => x.fillText(l, kx, fy + mm(4.2) + n * mm(2.6)));
    if (k.Desa_Daerah) { x.font = `500 ${mm(1.8)}px ${FONT}`; x.fillStyle = 'rgba(255,255,255,0.8)'; x.fillText(wrap(k.Desa_Daerah, x.font, 1, colW - mm(3))[0], kx, fy + mm(4.2) + kl.length * mm(2.6) + mm(0.2)); }
    x.fillStyle = 'rgba(255,255,255,0.55)'; x.fillRect(tx, fy + mm(p ? 7.2 : 4.6), colW - mm(3), mm(0.25));
    x.font = `700 ${mm(1.95)}px ${FONT}`; x.fillStyle = '#FFFFFF';
    x.fillText(wrap(k.Nama_Pengurus || '', x.font, 1, colW - mm(3))[0] || '', tx, fy + mm(p ? 9.6 : 6.9));
    x.restore();
    x.strokeStyle = '#0B5A42'; x.lineWidth = mm(0.3); rr(mm(0.15), mm(0.15), W - mm(0.3), H - mm(0.3), mm(3.1)); x.stroke();
    return c;
  },

  fileName(j, side) { return ('IDCard_' + j.ID_Jamaah + '_' + j.Nama_Lengkap + (side === 'back' ? '_belakang' : '')).replace(/[^\w\-]+/g, '_').slice(0, 90) + '.jpg'; },
  /** Unduh satu sisi kartu sebagai JPG. Bila browser memblokir unduhan dari dalam aplikasi, gambar ditampilkan untuk disimpan manual. */
  async jpg(id, silent, side) {
    const j = S.idx.jam.get(id);
    if (!j) return;
    const c = await IdCard.canvas(j, side);
    const url = c.toDataURL('image/jpeg', 0.95);
    try {
      const a = document.createElement('a'); a.href = url; a.download = IdCard.fileName(j, side); document.body.appendChild(a); a.click(); a.remove();
      if (!silent) UI.toast('ID Card ' + j.Nama_Lengkap + (side === 'back' ? ' (belakang)' : '') + ' diunduh (JPG).', 'ok');
    } catch (e) { IdCard.showJpg(j, url, side); }
    return url;
  },
  showJpg(j, url, side) {
    UI.modal({ title: 'ID Card (JPG)', size: 'md', body: `<p class="muted small">Jika unduhan tidak berjalan: tekan lama gambar (HP) atau klik kanan → <b>Simpan gambar</b>.</p><img src="${url}" alt="ID Card ${attr(j.Nama_Lengkap)}" style="width:100%;border-radius:10px;border:1px solid var(--border)">`,
      foot: `<a class="btn btn-primary" href="${url}" download="${attr(IdCard.fileName(j, side))}"><i class="bi bi-download"></i> Unduh JPG</a>` });
  },
  async jpgAll(ids, btn) {
    const sides = IdCard.opt.back ? ['front', 'back'] : ['front'];
    const n = ids.length * sides.length;
    if (n > 1 && !(await UI.confirm(`Unduh <b>${n}</b> file JPG${sides.length > 1 ? ' (depan & belakang)' : ''}? Browser mungkin meminta izin <i>unduh banyak file</i> — pilih Izinkan.`, { ok: 'Unduh' }))) return;
    UI.busy(btn, true, 'Membuat JPG…');
    try {
      let i = 0;
      for (const id of ids) for (const sd of sides) { i++; btn.innerHTML = `<i class="bi bi-hourglass-split"></i> ${i}/${n}`; await IdCard.jpg(id, true, sd); await new Promise(r => setTimeout(r, 350)); }
      UI.toast(n + ' file ID Card diunduh (JPG).', 'ok');
    } catch (e) { UI.toast('Gagal membuat JPG: ' + e.message, 'bad'); } finally { UI.busy(btn, false); }
  },
  /** Pratinjau + cetak (A4; lanskap 10 kartu/lembar, potret 9 kartu/lembar; ukuran KTP 85,6 × 54 mm). */
  preview(ids) {
    IdCard.loadOpt();
    const list = ids.map(id => S.idx.jam.get(id)).filter(Boolean);
    if (!list.length) { UI.toast('Tidak ada jamaah untuk dicetak.', 'warn'); return; }
    const anyGen = list.some(j => j.Jenjang !== 'Dewasa'), anyDws = list.some(j => j.Jenjang === 'Dewasa');
    const m = UI.modal({ title: `ID Card (${list.length})`, size: 'lg',
      body: `<div class="idc-opts">
          ${anyGen ? `<div><span class="field-label small">Orientasi kartu generus</span><div class="seg-tabs" id="idcOrient" role="tablist">
            <button type="button" data-o="L" class="${IdCard.opt.orient === 'L' ? 'active' : ''}"><i class="bi bi-credit-card-2-front"></i> Lanskap</button>
            <button type="button" data-o="P" class="${IdCard.opt.orient === 'P' ? 'active' : ''}"><i class="bi bi-person-badge"></i> Potret</button></div></div>` : ''}
          <label class="check-row"><input type="checkbox" id="idcBack" ${IdCard.opt.back ? 'checked' : ''}> <span>Sertakan bagian belakang <span class="tiny muted">(cetak & JPG)</span></span></label>
        </div>
        <p class="muted small" id="idcInfo"></p>
        <div class="idc-grid" id="idcGrid"></div>${list.length > 30 ? `<p class="tiny muted mt-2">Pratinjau 30 kartu pertama; semua ${list.length} kartu ikut dicetak.</p>` : ''}`,
      foot: `<button class="btn btn-light" data-close>Tutup</button><button class="btn btn-light" id="idcJpg"><i class="bi bi-file-earmark-image"></i> ${list.length > 1 ? 'Unduh Semua JPG' : 'Unduh JPG'}</button><button class="btn btn-primary" id="idcPrint"><i class="bi bi-printer"></i> Cetak / Simpan PDF</button>` });
    const draw = () => {
      const back = IdCard.opt.back;
      const nL = list.filter(j => IdCard.orient(j) === 'L').length, nP = list.length - nL;
      const sheets = Math.ceil(nL / 10) + Math.ceil(nP / 9);
      $('#idcInfo', m.el).innerHTML = `Ukuran KTP 85,6 × 54 mm · ${sheets} lembar A4${back ? ` + ${sheets} lembar belakang` : ''}.${anyGen && anyDws ? ' Kartu jenjang Dewasa tetap lanskap.' : ''}${back ? ' Untuk cetak bolak-balik pilih <b>Dua sisi · balik di tepi panjang</b>.' : ''}`;
      $('#idcGrid', m.el).className = 'idc-grid' + (IdCard.opt.orient === 'P' && anyGen ? ' has-p' : '');
      $('#idcGrid', m.el).innerHTML = list.slice(0, 30).map(j => `<div class="idc-item"><div class="idc-pair ${IdCard.orient(j) === 'P' ? 'p' : ''}">${IdCard.html(j)}${back ? IdCard.html(j, 'back') : ''}</div>
        <div class="row" style="gap:6px;justify-content:center"><button class="btn btn-light btn-sm" onclick="IdCard.jpg('${j.ID_Jamaah}')"><i class="bi bi-file-earmark-image"></i> Depan JPG</button>${back ? `<button class="btn btn-light btn-sm" onclick="IdCard.jpg('${j.ID_Jamaah}', false, 'back')"><i class="bi bi-file-earmark-image"></i> Belakang JPG</button>` : ''}</div></div>`).join('');
    };
    draw();
    $$('#idcOrient button', m.el).forEach(b => b.onclick = () => { IdCard.opt.orient = b.dataset.o; IdCard.saveOpt(); $$('#idcOrient button', m.el).forEach(x => x.classList.toggle('active', x === b)); draw(); });
    $('#idcBack', m.el).onchange = e => { IdCard.opt.back = e.target.checked; IdCard.saveOpt(); draw(); };
    $('#idcPrint', m.el).onclick = () => IdCard.print(list);
    $('#idcJpg', m.el).onclick = e => IdCard.jpgAll(list.map(j => j.ID_Jamaah), e.currentTarget);
  },
  /** Susun lembar A4. Lembar belakang dicerminkan per baris agar pas saat cetak bolak-balik (balik di tepi panjang). */
  sheets(list) {
    const out = [];
    [['L', 2, 10], ['P', 3, 9]].forEach(([o, cols, per]) => {
      const arr = list.filter(j => IdCard.orient(j) === o);
      for (let i = 0; i < arr.length; i += per) {
        const page = arr.slice(i, i + per);
        out.push({ o, side: 'front', cells: page });
        if (IdCard.opt.back) {
          const cells = [];
          for (let r = 0; r < page.length; r += cols) { const row = page.slice(r, r + cols); while (row.length < cols) row.push(null); cells.push(...row.reverse()); }
          out.push({ o, side: 'back', cells });
        }
      }
    });
    return out;
  },
  print(list) {
    let pa = $('#printArea');
    if (!pa) { pa = document.createElement('div'); pa.id = 'printArea'; document.body.appendChild(pa); }
    pa.innerHTML = IdCard.sheets(list).map(s => `<div class="idc-sheet ${s.o === 'P' ? 'p' : ''}">${s.cells.map(j => j ? IdCard.html(j, s.side) : '<div class="idc-blank"></div>').join('')}</div>`).join('');
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { try { window.print(); } catch (e) { UI.toast('Browser tidak mengizinkan cetak dari halaman ini. Buka aplikasi langsung (bukan di dalam blog) lalu coba lagi.', 'warn'); } setTimeout(done, 1500); }, 300);
  }
};

/* Scan kartu di halaman Absensi: scanner USB/Bluetooth (mengetik + Enter), kamera, atau ketik ID manual. */
const Scan = {
  last: {},
  open() {
    const k = S.idx.keg.get(S.ui.abs.kegId);
    if (!k) return;
    if (Pages.absensi.locked(k)) { UI.toast('Absensi sesi ini terkunci.', 'warn'); return; }
    Scan.log = [];
    const m = UI.modal({ title: 'Scan Kartu Jamaah', size: 'md',
      body: `<div class="muted small mb-2">${esc(k.Nama_Kegiatan)} · ${esc(D.long(k.Tanggal))}</div>
        <div id="scanFlash" class="scan-flash" aria-live="polite"><i class="bi bi-upc-scan"></i> Siap memindai…</div>
        <form id="scanForm" class="row mt-3" style="gap:8px" autocomplete="off"><input class="input mono grow" id="scanInput" placeholder="Arahkan scanner ke barcode, atau ketik ID lalu Enter" aria-label="ID Jamaah dari barcode">
          <button class="btn btn-primary" type="submit"><i class="bi bi-check2"></i></button></form>
        <div class="row mt-3" style="gap:8px"><button class="btn btn-light btn-sm" id="camBtn" type="button"><i class="bi bi-camera"></i> Pakai Kamera</button><span class="tiny muted" id="camInfo"></span></div>
        <div class="scan-cam" id="camBox" hidden><video id="camVideo" playsinline muted></video><div class="scan-aim"></div></div>
        <div class="mt-3"><div class="tiny muted mb-1">Terpindai sesi ini <b id="scanCount">0</b> · tersimpan sebagai draf sampai Anda menekan Simpan</div><ul class="scan-log" id="scanLog"></ul></div>`,
      foot: `<button class="btn btn-light" data-close>Tutup</button><button class="btn btn-primary" id="scanSave"><i class="bi bi-floppy"></i> Simpan Absensi</button>`,
      onClose: () => Scan.stopCam() });
    const inp = $('#scanInput', m.el);
    $('#scanForm', m.el).onsubmit = e => { e.preventDefault(); const v = inp.value; inp.value = ''; Scan.handle(v); inp.focus(); };
    $('#camBtn', m.el).onclick = () => Scan.cam ? Scan.stopCam() : Scan.startCam();
    $('#scanSave', m.el).onclick = () => { m.close(); Pages.absensi.save(false, $('#absSaveTop'), true); }; // scan: wajar bila baru sebagian yang hadir
    setTimeout(() => inp.focus(), 50);
    Scan.modal = m;
  },
  handle(raw) {
    const id = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!id) return;
    const now = Date.now();
    if (Scan.last[id] && now - Scan.last[id] < 2500) return; // abaikan pindaian ganda beruntun (kamera)
    Scan.last[id] = now;
    const k = S.idx.keg.get(S.ui.abs.kegId), j = S.idx.jam.get(id);
    const show = (cls, html) => { const f = $('#scanFlash'); if (f) { f.className = 'scan-flash ' + cls; f.innerHTML = html; } };
    if (!j) { Scan.beep(false); show('bad', `<i class="bi bi-x-circle"></i> ID <b>${esc(id)}</b> tidak dikenal.`); return; }
    const inRoster = Pages.absensi.roster(k).some(x => x.ID_Jamaah === id);
    if (!inRoster) {
      const why = j.Status_Aktif !== 'Aktif' ? 'status ' + (STATUS_JM[j.Status_Aktif] || [j.Status_Aktif])[0] : isGab(k) && !gabPeserta(k, j) ? 'peserta ' + gabJenis(k)[1] + ': ' + gabJenis(k)[2].toLowerCase() : j.ID_Kelompok !== k.ID_Kelompok && !isGab(k) ? 'beda kelompok (' + Store.kelName(j.ID_Kelompok) + ')' : j.Jenjang !== k.Jenjang && !isGab(k) ? 'jenjang ' + j.Jenjang : k.Kelas && j.Kelas !== k.Kelas ? 'kelas ' + (j.Kelas || '-') : 'tidak termasuk sesi ini';
      Scan.beep(false); show('warn', `<i class="bi bi-exclamation-triangle"></i> <b>${esc(j.Nama_Lengkap)}</b> bukan peserta sesi ini — ${esc(why)}.`); return;
    }
    const d = Pages.absensi.draft(k), already = d[id] && d[id].s === 'H';
    if (!already) Pages.absensi.set(id, 'H');
    Scan.beep(true);
    show('ok', `${avatar(j)} <span><b>${esc(j.Nama_Lengkap)}</b><br><span class="tiny">${already ? 'Sudah tercatat hadir' : 'Hadir ✓'} · ${esc(j.Jenjang)}${j.Kelas ? ' ' + esc(j.Kelas) : ''}</span></span>`);
    if (!already) {
      Scan.log.unshift({ id, nama: j.Nama_Lengkap, t: new Date().toTimeString().slice(0, 5) });
      const ul = $('#scanLog'); if (ul) ul.innerHTML = Scan.log.slice(0, 30).map(x => `<li><span class="mono tiny muted">${x.t}</span> ${esc(x.nama)} <span class="tiny muted mono">${esc(x.id)}</span></li>`).join('');
      const c = $('#scanCount'); if (c) c.textContent = Scan.log.length;
    }
  },
  beep(ok) {
    try {
      const A = Scan.ac || (Scan.ac = new (window.AudioContext || window.webkitAudioContext)());
      const o = A.createOscillator(), g = A.createGain();
      o.frequency.value = ok ? 1046 : 220; o.type = ok ? 'sine' : 'square'; g.gain.value = 0.08;
      o.connect(g); g.connect(A.destination); o.start(); o.stop(A.currentTime + (ok ? 0.12 : 0.3));
    } catch (e) { /* tanpa suara */ }
    if (navigator.vibrate) navigator.vibrate(ok ? 60 : [80, 60, 80]);
  },
  async startCam() {
    const info = $('#camInfo'), box = $('#camBox'), v = $('#camVideo');
    info.textContent = 'Membuka kamera…';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      Scan.cam = stream; v.srcObject = stream; box.hidden = false; await v.play();
      $('#camBtn').innerHTML = '<i class="bi bi-camera-video-off"></i> Matikan Kamera';
      let det = null;
      if ('BarcodeDetector' in window) { try { det = new window.BarcodeDetector({ formats: ['code_128', 'qr_code'] }); } catch (e) { det = null; } }
      if (det) {
        info.textContent = 'Arahkan barcode ke kotak.';
        const loop = async () => { if (!Scan.cam) return; try { const r = await det.detect(v); if (r && r[0]) Scan.handle(r[0].rawValue); } catch (e) { /* lanjut */ } Scan.timer = setTimeout(loop, 250); };
        loop();
      } else {
        info.textContent = 'Memuat pembaca barcode…';
        await Scan.loadZXing();
        const reader = new window.ZXing.BrowserMultiFormatReader();
        Scan.zx = reader;
        stream.getTracks().forEach(t => t.stop());
        reader.decodeFromVideoDevice(undefined, v, res => { if (res) Scan.handle(res.getText()); });
        info.textContent = 'Arahkan barcode ke kotak.';
      }
    } catch (e) {
      Scan.stopCam();
      info.textContent = e && e.name === 'NotAllowedError' ? 'Izin kamera ditolak atau tidak tersedia di halaman ini. Gunakan scanner barcode atau ketik ID.' : 'Kamera tidak bisa dipakai di sini (' + (e.message || e.name || 'galat') + '). Gunakan scanner barcode atau ketik ID.';
    }
  },
  loadZXing() {
    if (window.ZXing) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https:' + '/' + '/cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
      s.onload = res; s.onerror = () => rej(new Error('pembaca barcode gagal dimuat'));
      document.head.appendChild(s);
    });
  },
  stopCam() {
    clearTimeout(Scan.timer);
    if (Scan.zx) { try { Scan.zx.reset(); } catch (e) { /* abaikan */ } Scan.zx = null; }
    if (Scan.cam) { Scan.cam.getTracks().forEach(t => t.stop()); Scan.cam = null; }
    const box = $('#camBox'); if (box) box.hidden = true;
    const b = $('#camBtn'); if (b) b.innerHTML = '<i class="bi bi-camera"></i> Pakai Kamera';
  }
};

/* ───────────────────────── ABSEN MANDIRI JAMAAH ───────────────────────── */
const JENJANG_MANDIRI = ['Caberawit', 'Pra Remaja', 'Remaja', 'Usia Nikah', 'Dewasa'];
/** Modal PIN (dipakai untuk akses wali & absen mandiri). PIN hanya tampil sekali. */
function pinModal(o) {
  const wa = waLink(o.hp, o.text);
  const m = UI.modal({
    title: o.title, size: 'md',
    body: `<p class="muted small">${o.intro} PIN hanya ditampilkan <b>sekali</b>; jika hilang, buat PIN baru.</p>
      <div class="pin-box mt-3"><div><div class="tiny muted">ID JAMAAH</div><div class="mono pin-val">${esc(o.id)}</div></div><div><div class="tiny muted">PIN</div><div class="mono pin-val">${esc(o.pin)}</div></div></div>`,
    foot: `<button class="btn btn-light" id="pinCopy"><i class="bi bi-copy"></i> Salin Pesan</button>${wa ? `<a class="btn btn-primary" target="_blank" rel="noopener" href="${attr(wa)}"><i class="bi bi-whatsapp"></i> Kirim via WhatsApp</a>` : '<button class="btn btn-primary" data-close>Selesai</button>'}`
  });
  $('#pinCopy', m.el).onclick = async () => { try { await navigator.clipboard.writeText(o.text); UI.toast('Pesan disalin.', 'ok'); } catch (e) { UI.toast('Tidak bisa menyalin otomatis. Salin manual ID & PIN di atas.', 'warn'); } };
}

Pages.jamaah.pinMandiri = async function (id) {
  const j = S.idx.jam.get(id);
  if (!j) return;
  if (!JENJANG_MANDIRI.includes(j.Jenjang)) { UI.toast('Absen mandiri untuk jenjang Caberawit sampai Dewasa.', 'warn'); return; }
  if (j.Punya_PIN_Jamaah === 'Ya' && !(await UI.confirm(`Buat PIN absen baru untuk <b>${esc(j.Nama_Lengkap)}</b>? PIN lama langsung tidak berlaku.`, { ok: 'Buat PIN Baru' }))) return;
  let r;
  try { UI.toast('Membuat PIN…', 'info'); r = await API.run('apiResetPinJamaah', id); } catch (e) { UI.toast(e.message, 'bad'); return; }
  Store.upsert('jamaah', { ID_Jamaah: id, Punya_PIN_Jamaah: 'Ya' }, 'ID_Jamaah'); Store.index(); Store.persist();
  if (S.page === 'jamaah') Pages.jamaah.render();
  const url = S.d.settings.appUrl ? ' (' + S.d.settings.appUrl + ')' : '';
  pinModal({ title: 'Akses Absen Mandiri', id: j.ID_Jamaah, pin: r.PIN, hp: j.No_HP_Jamaah || j.No_HP,
    intro: `Sampaikan ID & PIN ini kepada <b>${esc(j.Nama_Lengkap)}</b>. Akun ini hanya untuk absen hadir saat pengajian berlangsung.`,
    text: `Assalamu'alaikum ${j.Nama_Lengkap},\n\nBerikut akses Absen Mandiri Ayo Ngaji:\n• ID Jamaah: *${j.ID_Jamaah}*\n• PIN: *${r.PIN}*\n\nSaat pengajian, buka aplikasi Ayo Ngaji${url}, pilih *Jamaah*, masuk dengan ID & PIN di atas, lalu masukkan *kode absen* yang ditampilkan pengurus di lokasi. Mohon PIN tidak dibagikan ke orang lain.` });
};

const JamaahApp = {
  init(token) {
    S.jtoken = token;
    const snap = LS.json('an_jm_snap');
    $('#splash').classList.add('hide'); $('#loginView').hidden = true; $('#appView').hidden = true; $('#waliView').hidden = false;
    if (snap) { S.jd = snap; JamaahApp.render(); }
    else $('#waliView').innerHTML = `<div class="wali-wrap"><div class="card">${emptyState('bi-hourglass-split', 'Memuat jadwal pengajian…')}</div></div>`;
    JamaahApp.refresh();
    if (!JamaahApp._t) JamaahApp._t = setInterval(() => { if (S.jtoken && document.visibilityState === 'visible') JamaahApp.refresh(); }, 60000);
  },
  async refresh() {
    try { const d = await API.call('apiJamaahData', S.jtoken); S.jd = d; LS.setJson('an_jm_snap', d); JamaahApp.render(); }
    catch (e) { if (e.code === 'AUTH') { UI.toast(e.message, 'warn'); JamaahApp.logout(true); } else if (!S.jd) $('#waliView').innerHTML = `<div class="wali-wrap"><div class="card">${emptyState('bi-wifi-off', e.message)}</div></div>`; }
  },
  async login(e) {
    e.preventDefault();
    const id = $('#jmId').value.trim().toUpperCase(), pin = $('#jmPin').value.replace(/\D/g, ''), err = $('#jmError');
    err.hidden = true;
    if (!id || pin.length !== 6) { err.textContent = 'Isi ID Jamaah dan PIN 6 angka.'; err.hidden = false; return; }
    const btn = $('#jmBtn'); UI.busy(btn, true, 'Memeriksa…');
    try {
      const r = await API.call('apiJamaahLogin', id, pin);
      LS.set('an_jm', r.token); LS.set('an_jm_id', id); LS.setJson('an_jm_snap', r.data);
      $('#jmPin').value = '';
      JamaahApp.init(r.token);
    } catch (ex) { err.textContent = ex.message; err.hidden = false; } finally { UI.busy(btn, false); }
  },
  logout(silent) {
    const t = S.jtoken; S.jtoken = null; S.jd = null;
    LS.del('an_jm'); LS.del('an_jm_snap');
    if (t && !silent) API.call('apiJamaahLogout', t).catch(() => {});
    $('#waliView').hidden = true; $('#waliView').innerHTML = '';
    App.showLogin(); App.loginMode('jamaah');
  },
  render() {
    const d = S.jd, a = d.jamaah;
    const izinBox = x => x.Status === 'I' ? `<div class="jm-izin"><i class="bi bi-envelope-paper"></i><div class="grow"><b>Izin tercatat</b>${x.Alasan ? `<div class="small">Alasan: ${esc(x.Alasan)}</div>` : ''}</div></div>` : '';
    const canIzin = x => x.Status !== 'H' && (!x.Status || x.Status === 'I') && x.State !== 'tutup' && x.State !== 'terkunci' && !x.Terkunci;
    const izinBtn = x => canIzin(x) ? `<button class="btn btn-light btn-block mt-2" type="button" onclick="JamaahApp.izin('${x.ID_Kegiatan}')"><i class="bi bi-envelope-paper"></i> ${x.Status === 'I' ? 'Ubah Alasan Izin' : 'Ajukan Izin (Tidak Hadir)'}</button>` : '';
    const card = s => {
      const done = s.Status === 'H';
      const st = done ? `<div class="jm-done"><i class="bi bi-check-circle-fill"></i> Hadir tercatat${s.Waktu_Absen ? ' · ' + esc(String(s.Waktu_Absen).slice(11, 16)) : ''}${s.Mandiri ? '' : ' (oleh pengurus)'}</div>`
        : s.State === 'buka' ? `<form class="jm-form" onsubmit="event.preventDefault();JamaahApp.absen('${s.ID_Kegiatan}',this)"><label class="field"><span class="field-label">Kode absen dari pengurus</span>
            <input class="input mono jm-kode" name="kode" inputmode="numeric" maxlength="4" placeholder="••••" autocomplete="off" aria-label="Kode absen"></label>
            <button class="btn btn-primary btn-block" type="submit"><i class="bi bi-fingerprint"></i> Absen Hadir</button></form>`
        : s.State === 'belum' ? `<div class="note mt-2"><i class="bi bi-clock"></i><div>Absen dibuka pukul <b>${esc(s.Buka)}</b>.</div></div>`
        : s.State === 'terkunci' ? `<div class="note gold mt-2"><i class="bi bi-lock"></i><div>Absensi sesi ini sudah dikunci pengurus.${s.Status ? ' Status Anda: <b>' + esc(ST_LABEL[s.Status] || s.Status) + '</b>.' : ''}</div></div>`
        : `<div class="note gold mt-2"><i class="bi bi-clock-history"></i><div>Waktu absen sudah ditutup (pukul ${esc(s.Tutup)}).${s.Status ? ' Status Anda: <b>' + esc(ST_LABEL[s.Status] || s.Status) + '</b>.' : ' Hubungi pengurus bila Anda hadir.'}</div></div>`;
      return `<div class="card mb-3 ${done ? 'jm-ok' : ''}"><div class="row" style="gap:8px">${s.Gabungan ? '<span class="badge b-gold"><i class="bi bi-people-fill"></i> Gabungan</span>' : jjBadge(a.Jenjang)}<span class="spacer"></span><span class="tiny muted"><i class="bi bi-clock"></i> ${esc(s.Waktu_Mulai)}–${esc(s.Waktu_Selesai)}</span></div>
        <h3 class="mt-2" style="margin-bottom:2px">${esc(s.Nama_Kegiatan)}</h3><div class="tiny muted"><i class="bi bi-geo-alt"></i> ${esc(s.Tempat || '–')}</div>${(s.Susunan || []).length ? `<ol class="jm-sus">${s.Susunan.map(x => `<li><b>${esc(x.m || '–')}</b>${x.p || x.d ? `<span>${esc(x.p || '')}${x.p && x.d ? ' · ' : ''}${x.d ? menit(x.d) : ''}</span>` : ''}</li>`).join('')}</ol>` : ''}${izinBox(s)}${st}${izinBtn(s)}</div>`;
    };
    $('#waliView').innerHTML = `<div class="wali-top"><div class="wali-wrap row"><div class="brand-mark app-logo ${Logo.get() ? 'has-img' : ''}">${Logo.html()}</div><div class="grow"><b>Ayo Ngaji</b><div class="tiny muted">Jadwal &amp; Absen Jamaah</div></div>
        <button class="icon-btn" aria-label="Ganti tema" onclick="UI.theme(document.documentElement.dataset.theme==='dark'?'light':'dark')"><i class="bi bi-circle-half"></i></button>
        <button class="btn btn-light btn-sm" onclick="JamaahApp.logout()"><i class="bi bi-box-arrow-right"></i> Keluar</button></div></div>
      <div class="wali-wrap">
        <div class="card wali-child"><div class="row" style="gap:14px">${avatar(a, 'lg')}<div class="grow"><div class="tiny muted">Assalamu'alaikum,</div><h2 style="margin:0">${esc(a.Nama_Lengkap)}</h2>
          <div class="row-wrap mt-1" style="gap:6px">${jjBadge(a.Jenjang)}${kelasBadge(a.Kelas)}<span class="tiny muted"><i class="bi bi-geo-alt"></i> ${esc(a.Kelompok)}</span></div></div></div></div>
        <div class="row mt-3 mb-2"><b><i class="bi bi-calendar-check"></i> Pengajian Hari Ini</b><span class="spacer"></span><span class="tiny muted">${esc(D.long(D.today()))}</span></div>
        ${d.hariIni.length ? d.hariIni.map(card).join('') : `<div class="card mb-3">${emptyState('bi-calendar-x', 'Tidak ada pengajian untuk Anda hari ini.')}</div>`}
        <div class="row mt-4 mb-2" id="jmJadwal"><b class="grow"><i class="bi bi-calendar-week"></i> Jadwal Pengajian <span class="badge b-outline">${d.mendatang.length}</span></b>${d.mendatang.length ? `<a class="btn btn-light btn-sm" target="_blank" rel="noopener" href="${attr(JamaahApp.waUrl())}"><i class="bi bi-whatsapp" style="color:#25D366"></i> Bagikan</a>` : ''}</div>
        ${d.mendatang.length ? (() => {
          const show = JamaahApp.all ? d.mendatang : d.mendatang.slice(0, 6), by = new Map();
          show.forEach(x => { if (!by.has(x.Tanggal)) by.set(x.Tanggal, []); by.get(x.Tanggal).push(x); });
          return [...by].map(([tg, list]) => `<div class="jm-day"><div class="jm-day-h"><b>${esc(D.dayLong(tg))}</b><span class="tiny muted">${(() => { const n = Math.round((D.parse(tg) - D.parse(D.today())) / 864e5); return n === 1 ? 'Besok' : n + ' hari lagi'; })()}</span></div>
            ${list.map(x => `<div class="card jm-sched mb-2"><div class="row" style="gap:8px">${x.Gabungan ? '<span class="badge b-gold"><i class="bi bi-people-fill"></i> Gabungan</span>' : jjBadge(a.Jenjang)}<span class="spacer"></span><span class="tiny muted"><i class="bi bi-clock"></i> ${esc(x.Waktu_Mulai)}–${esc(x.Waktu_Selesai || '')}</span></div>
              <div class="cell-strong mt-1">${esc(x.Nama_Kegiatan)}</div><div class="tiny muted"><i class="bi bi-geo-alt"></i> ${esc(x.Tempat || '–')}</div>
              ${(x.Susunan || []).length ? `<ol class="jm-sus">${x.Susunan.map(m => `<li><b>${esc(m.m || '–')}</b>${m.p || m.d ? `<span>${esc(m.p || '')}${m.p && m.d ? ' · ' : ''}${m.d ? menit(m.d) : ''}</span>` : ''}</li>`).join('')}</ol>` : ''}
              ${x.Keterangan ? `<div class="tiny muted mt-1"><i class="bi bi-info-circle"></i> ${esc(x.Keterangan)}</div>` : ''}
              ${x.Status === 'I' ? `<div class="tiny mt-2" style="color:var(--warn-text)"><i class="bi bi-envelope-paper"></i> Izin${x.Alasan ? ': ' + esc(x.Alasan) : ''}</div>` : x.Status ? `<div class="tiny mt-2 muted">Status: ${esc(ST_LABEL[x.Status] || x.Status)}</div>` : ''}
              ${x.ID_Kegiatan && canIzin(x) ? `<div class="mt-2"><button class="btn btn-light btn-sm" onclick="JamaahApp.izin('${x.ID_Kegiatan}')"><i class="bi bi-envelope-paper"></i> ${x.Status === 'I' ? 'Ubah Alasan Izin' : 'Ajukan Izin'}</button></div>` : ''}</div>`).join('')}</div>`).join('')
            + (d.mendatang.length > 6 ? `<button class="btn btn-light btn-block mt-2" onclick="JamaahApp.all=!JamaahApp.all;JamaahApp.render()"><i class="bi bi-chevron-${JamaahApp.all ? 'up' : 'down'}"></i> ${JamaahApp.all ? 'Tampilkan lebih sedikit' : 'Lihat semua jadwal (' + d.mendatang.length + ')'}</button>` : '');
        })() : `<div class="card">${emptyState('bi-calendar-x', 'Belum ada jadwal pengajian untuk Anda dalam 60 hari ke depan.')}</div>`}
        <p class="tiny muted center mt-3">Akun jamaah: lihat jadwal, absen kehadiran & izin · diperbarui ${esc(D.rel(d.serverTime))}</p>
      </div>`;
  },
  /** Teks jadwal (hari ini + mendatang) untuk dibagikan jamaah via WhatsApp. */
  waUrl() {
    const d = S.jd, t = D.today();
    const items = d.hariIni.map(x => Object.assign({ Tanggal: t }, x)).concat(d.mendatang).slice(0, 15).map(x => ({ Tanggal: x.Tanggal, Waktu_Mulai: x.Waktu_Mulai, Waktu_Selesai: x.Waktu_Selesai || '', Nama: x.Nama_Kegiatan, Tempat: x.Tempat || '', Ket: x.Keterangan || '', Peserta: '', Materi: x.Susunan || [] }));
    return JadwalWA.url(JadwalWA.text(items, 'JADWAL PENGAJIAN ' + d.jamaah.Kelompok.toUpperCase()));
  },
  /** Ajukan izin tidak hadir — alasan wajib (min. 5 karakter). */
  izin(id) {
    const s = S.jd.hariIni.find(x => x.ID_Kegiatan === id) || S.jd.mendatang.find(x => x.ID_Kegiatan === id);
    if (!s) return;
    const quick = ['Sakit', 'Ada keperluan keluarga', 'Kegiatan sekolah / kuliah', 'Bekerja', 'Sedang bepergian ke luar kota'];
    const m = UI.modal({ title: 'Ajukan Izin', size: 'md',
      body: `<p class="small" style="margin-top:0"><b>${esc(s.Nama_Kegiatan)}</b><br><span class="muted">${esc(D.long(s.Tanggal || D.today()))} · ${esc(s.Waktu_Mulai)}</span></p>
        <label class="field"><span class="field-label">Alasan izin <span class="req">*</span></span><textarea class="textarea" id="izAlasan" rows="3" maxlength="200" placeholder="Tuliskan alasan Anda tidak dapat hadir">${esc(s.Alasan || '')}</textarea>
          <span class="field-help"><span id="izCount">0</span>/200 · minimal 5 karakter. Alasan dikirim ke pengurus kelompok.</span></label>
        <div class="chips mt-2">${quick.map(q => `<button type="button" class="chip" data-q="${attr(q)}">${esc(q)}</button>`).join('')}</div>
        <div id="izErr" class="form-error mt-2" hidden></div>`,
      foot: `<button class="btn btn-light" data-close>Batal</button><button class="btn btn-primary" id="izSave"><i class="bi bi-send"></i> Kirim Izin</button>` });
    const ta = $('#izAlasan', m.el), cnt = () => { $('#izCount', m.el).textContent = ta.value.trim().length; };
    ta.oninput = cnt; cnt(); setTimeout(() => ta.focus(), 50);
    $$('[data-q]', m.el).forEach(b => b.onclick = () => { ta.value = b.dataset.q + (ta.value.trim() && !quick.includes(ta.value.trim()) ? ' — ' + ta.value.trim() : ''); cnt(); ta.focus(); });
    $('#izSave', m.el).onclick = async () => {
      const why = ta.value.replace(/\s+/g, ' ').trim(), e = $('#izErr', m.el);
      if (why.length < 5) { e.textContent = 'Alasan izin wajib diisi (minimal 5 karakter).'; e.hidden = false; ta.focus(); return; }
      const btn = $('#izSave', m.el); UI.busy(btn, true, 'Mengirim…');
      try {
        const r = await API.call('apiJamaahIzin', S.jtoken, id, why);
        Object.assign(s, { Status: 'I', Alasan: r.Alasan, Mandiri: true, Waktu_Absen: r.Waktu_Absen });
        LS.setJson('an_jm_snap', S.jd); m.close(); JamaahApp.render();
        UI.toast('Izin Anda terkirim ke pengurus.', 'ok');
      } catch (ex) { UI.busy(btn, false); e.textContent = ex.message; e.hidden = false; if (ex.code === 'AUTH') { m.close(); JamaahApp.logout(true); } }
    };
  },
  async absen(id, form) {
    const kode = form.kode.value.replace(/\D/g, '');
    if (kode.length !== 4) { UI.toast('Masukkan 4 angka kode absen.', 'warn'); form.kode.focus(); return; }
    const btn = form.querySelector('button'); UI.busy(btn, true, 'Mencatat…');
    try {
      const r = await API.call('apiJamaahAbsen', S.jtoken, id, kode);
      const s = S.jd.hariIni.find(x => x.ID_Kegiatan === id); Object.assign(s, { Status: 'H', Mandiri: true, Waktu_Absen: r.Waktu_Absen, Alasan: '' });
      LS.setJson('an_jm_snap', S.jd); JamaahApp.render();
      UI.toast('Alhamdulillah, kehadiran Anda tercatat.', 'ok');
    } catch (e) { UI.busy(btn, false); UI.toast(e.message, 'bad'); if (e.code === 'AUTH') JamaahApp.logout(true); }
  }
};

/* ───────────────────────── PORTAL ORANG TUA / WALI ───────────────────────── */
const Wali = {
  tab: 'buku',
  init(token) {
    S.wtoken = token;
    const snap = LS.json('an_wali_snap');
    $('#splash').classList.add('hide'); $('#loginView').hidden = true; $('#appView').hidden = true; $('#waliView').hidden = false;
    if (snap) { S.wd = snap; Wali.render(); }
    else $('#waliView').innerHTML = `<div class="wali-wrap"><div class="card">${emptyState('bi-hourglass-split', 'Memuat data ananda…')}</div></div>`;
    Wali.refresh();
    if (!Wali._t) Wali._t = setInterval(() => { if (S.wtoken && document.visibilityState === 'visible' && !$('#waliView').hidden) Wali.refresh(); }, 60000);
  },
  async refresh() {
    try { const d = await API.call('apiWaliData', S.wtoken); S.wd = d; LS.setJson('an_wali_snap', d); Wali.render(); }
    catch (e) { if (e.code === 'AUTH') { UI.toast(e.message, 'warn'); Wali.logout(true); } else if (!S.wd) $('#waliView').innerHTML = `<div class="wali-wrap"><div class="card">${emptyState('bi-wifi-off', e.message)}</div></div>`; }
  },
  async login(e) {
    e.preventDefault();
    const id = $('#waliId').value.trim().toUpperCase(), pin = $('#waliPin').value.replace(/\D/g, ''), err = $('#waliError');
    err.hidden = true;
    if (!id || pin.length !== 6) { err.textContent = 'Isi ID Jamaah dan PIN 6 angka.'; err.hidden = false; return; }
    const btn = $('#waliBtn'); UI.busy(btn, true, 'Memeriksa…');
    try {
      const r = await API.call('apiWaliLogin', id, pin);
      LS.set('an_wali', r.token); LS.set('an_wali_id', id); LS.setJson('an_wali_snap', r.data);
      $('#waliPin').value = '';
      Wali.init(r.token);
      UI.toast(`Assalamu'alaikum, wali ${r.data.anak.Nama_Lengkap}.`, 'ok');
    } catch (ex) { err.textContent = ex.message; err.hidden = false; } finally { UI.busy(btn, false); }
  },
  logout(silent) {
    const t = S.wtoken; S.wtoken = null; S.wd = null;
    LS.del('an_wali'); LS.del('an_wali_snap');
    if (t && !silent) API.call('apiWaliLogout', t).catch(() => {});
    $('#waliView').hidden = true; $('#waliView').innerHTML = '';
    App.showLogin(); App.loginMode('wali');
  },
  render() {
    const d = S.wd, a = d.anak, t = Wali.tab;
    const H = d.hadir.filter(x => x.Status === 'H').length, tot = d.hadir.length;
    const done = d.capaian.filter(c => c.Status === 'Tercapai').length;
    const unreplied = d.buku.filter(b => !b.Tanggapan_Wali).length;
    $('#waliView').innerHTML = `<div class="wali-top"><div class="wali-wrap row"><div class="brand-mark app-logo ${Logo.get() ? 'has-img' : ''}">${Logo.html()}</div><div class="grow"><b>Ayo Ngaji</b><div class="tiny muted">Buku Penghubung Orang Tua / Wali</div></div>
        <button class="icon-btn" aria-label="Ganti tema" onclick="UI.theme(document.documentElement.dataset.theme==='dark'?'light':'dark')"><i class="bi bi-circle-half"></i></button>
        <button class="btn btn-light btn-sm" onclick="Wali.logout()"><i class="bi bi-box-arrow-right"></i> Keluar</button></div></div>
      <div class="wali-wrap">
        <div class="card wali-child"><div class="row" style="gap:14px">${avatar(a, 'lg')}<div class="grow"><div class="tiny muted">Ananda</div><h2 style="margin:0">${esc(a.Nama_Lengkap)}</h2>
          <div class="row-wrap mt-1" style="gap:6px">${jjBadge(a.Jenjang)}${kelasBadge(a.Kelas)}<span class="tiny muted"><i class="bi bi-geo-alt"></i> ${esc(a.Kelompok)}</span></div></div></div>
          <div class="grid-3 mt-3 wali-stats"><div><div class="tiny muted">Catatan</div><b>${d.buku.length}</b></div><div><div class="tiny muted">Kehadiran 6 bln</div><b>${tot ? pct(H, tot).toFixed(0) + '%' : '–'}</b></div><div><div class="tiny muted">Target tercapai</div><b>${d.capaian.length ? done + '/' + d.capaian.length : '–'}</b></div></div></div>
        <div class="seg-tabs mt-3 wali-tabs" role="tablist">${[['buku', 'bi-journal-richtext', 'Buku Penghubung'], ['hadir', 'bi-calendar-check', 'Kehadiran'], ['capaian', 'bi-award', 'Capaian']].map(([k, i, l]) => `<button role="tab" aria-selected="${t === k}" class="${t === k ? 'active' : ''}" onclick="Wali.tab='${k}';Wali.render()"><i class="bi ${i}"></i> ${l}</button>`).join('')}</div>
        <div class="mt-3">${t === 'buku' ? Wali.buku(d, unreplied) : t === 'hadir' ? Wali.hadir(d) : Wali.capaian(d)}</div>
        <p class="tiny muted center mt-3">Data diperbarui otomatis · ${esc(D.rel(d.serverTime))}</p>
      </div>`;
  },
  buku(d) {
    if (!d.buku.length) return `<div class="card">${emptyState('bi-journal', 'Belum ada catatan dari pengajar.')}</div>`;
    return d.buku.map(b => `<div class="card bk-note wali-note mb-3">
      <div class="row" style="gap:8px"><span class="badge b-mint"><i class="bi ${KAT_ICON[b.Kategori] || 'bi-chat-left-text'}"></i> ${esc(b.Kategori)}</span><span class="spacer"></span><span class="tiny muted">${esc(D.long(b.Tanggal))}</span></div>
      <div class="bk-isi">${multiline(b.Isi)}</div><div class="tiny muted">— ${esc(b.Penulis || 'Pengajar')}</div>
      ${b.Tanggapan_Wali ? `<div class="bk-reply mt-2"><div class="tiny muted mb-1"><i class="bi bi-reply-fill"></i> Tanggapan Anda · ${esc(D.rel(b.Waktu_Tanggapan))}</div>${multiline(b.Tanggapan_Wali)}</div>
        <button class="btn btn-light btn-sm mt-2" onclick="Wali.edit('${b.ID_Catatan}')"><i class="bi bi-pencil"></i> Ubah tanggapan</button>`
        : `<form class="mt-2" onsubmit="event.preventDefault();Wali.reply('${b.ID_Catatan}',this)"><textarea class="input" name="t" rows="2" maxlength="1000" placeholder="Tulis tanggapan untuk pengajar…" aria-label="Tanggapan"></textarea>
          <div class="row mt-2"><span class="spacer"></span><button class="btn btn-primary btn-sm" type="submit"><i class="bi bi-send"></i> Kirim Tanggapan</button></div></form>`}
    </div>`).join('');
  },
  hadir(d) {
    const c = s => d.hadir.filter(x => x.Status === s).length, tot = d.hadir.length;
    const lab = { H: ['Hadir', 'b-ok'], I: ['Izin', 'b-mint'], S: ['Sakit', 'b-warn'], A: ['Alpa', 'b-bad'] };
    return `<div class="card"><div class="grid-4 wali-stats">${['H', 'I', 'S', 'A'].map(s => `<div><div class="tiny muted">${lab[s][0]}</div><b>${c(s)}</b></div>`).join('')}</div>
      <div class="progress mt-3"><span style="width:${pct(c('H'), tot)}%"></span></div><div class="tiny muted mt-1">${tot ? pct(c('H'), tot).toFixed(1) + '% hadir dari ' + tot + ' sesi (6 bulan terakhir)' : 'Belum ada catatan kehadiran.'}</div></div>
      ${tot ? `<div class="card flush mt-3">${d.hadir.map(x => `<div class="wali-row"><div class="grow"><b>${esc(x.Kegiatan)}</b><div class="tiny muted">${esc(D.long(x.Tanggal))}${x.Catatan ? ' · ' + esc(x.Catatan) : ''}</div></div><span class="badge ${lab[x.Status] ? lab[x.Status][1] : 'b-outline'}">${esc(lab[x.Status] ? lab[x.Status][0] : x.Status)}</span></div>`).join('')}</div>` : ''}`;
  },
  capaian(d) {
    if (!d.capaian.length) return `<div class="card">${emptyState('bi-award', 'Belum ada target kurikulum untuk jenjang ini.')}</div>`;
    const done = d.capaian.filter(c => c.Status === 'Tercapai').length;
    const b = { Tercapai: 'b-ok', Proses: 'b-warn', Belum: 'b-outline' };
    return `<div class="card"><div class="row"><b>Progres target kurikulum</b><span class="spacer"></span><b>${pct(done, d.capaian.length).toFixed(0)}%</b></div><div class="progress mt-2"><span style="width:${pct(done, d.capaian.length)}%"></span></div></div>
      <div class="card flush mt-3">${d.capaian.map(c => `<div class="wali-row"><div class="grow"><b>${esc(c.Target)}</b><div class="tiny muted">${esc(c.Materi)}</div></div><span class="badge ${b[c.Status] || 'b-outline'}">${esc(c.Status)}</span></div>`).join('')}</div>`;
  },
  async reply(id, form) {
    const t = form.t.value.trim();
    if (!t) { UI.toast('Tulis tanggapan terlebih dahulu.', 'warn'); return; }
    const b = S.wd.buku.find(x => x.ID_Catatan === id), prev = Object.assign({}, b);
    Object.assign(b, { Tanggapan_Wali: t, Waktu_Tanggapan: D.today() + ' ' + new Date().toTimeString().slice(0, 8) });
    Wali.render(); UI.toast('Tanggapan terkirim.', 'ok');
    try { const r = await API.call('apiWaliTanggapan', S.wtoken, id, t); Object.assign(b, r); LS.setJson('an_wali_snap', S.wd); }
    catch (e) { Object.assign(b, prev); Wali.render(); UI.toast('Gagal mengirim: ' + e.message, 'bad'); if (e.code === 'AUTH') Wali.logout(true); }
  },
  edit(id) {
    const b = S.wd.buku.find(x => x.ID_Catatan === id);
    const m = UI.modal({ title: 'Ubah Tanggapan', body: `<form id="wEdit"><textarea class="input" name="t" rows="4" maxlength="1000">${esc(b.Tanggapan_Wali)}</textarea></form>`,
      foot: `<button class="btn btn-light" data-close>Batal</button><button class="btn btn-primary" id="wEditGo"><i class="bi bi-send"></i> Simpan</button>` });
    $('#wEditGo', m.el).onclick = () => { const f = $('#wEdit', m.el); m.close(); Wali.reply(id, f); };
  }
};

/* ───────────────────────── PENGATURAN (Master) ───────────────────────── */
Pages.pengaturan = {
  render() {
    const st = S.d.settings, usia = st.usia;
    const jam = S.d.jamaah.filter(j => j.Status_Aktif === 'Aktif');
    $('#page-pengaturan').innerHTML = pageHead('Sistem <i class="bi bi-chevron-right"></i> <b>Pengaturan & Konfigurasi</b>', 'Pengaturan Sistem & Konfigurasi Jenjang',
      `Rentang usia otomatis ${JENJANG.length} jenjang, data kelompok binaan, koneksi Google Workspace, dan mitigasi kuota Apps Script.`, '') + `
      <div class="grid-4">
        <div class="card kpi compact"><div class="kpi-label">Koneksi Sheets</div><div class="kpi-icon"><i class="bi bi-table"></i></div><div class="cell-strong" style="font-size:17px">Tersambung</div><div class="kpi-foot">${st.spreadsheetUrl ? `<a href="${attr(st.spreadsheetUrl)}" target="_blank" rel="noopener">Buka Spreadsheet <i class="bi bi-box-arrow-up-right"></i></a>` : '<span>–</span>'}</div></div>
        <div class="card kpi compact"><div class="kpi-label">Folder Drive</div><div class="kpi-icon"><i class="bi bi-folder2-open"></i></div><div class="cell-strong" style="font-size:17px">Ayo Ngaji</div><div class="kpi-foot">${st.folderUrl ? `<a href="${attr(st.folderUrl)}" target="_blank" rel="noopener">Buka Folder <i class="bi bi-box-arrow-up-right"></i></a>` : '<span>–</span>'}</div></div>
        <div class="card kpi compact"><div class="kpi-label">Kategorisasi Usia</div><div class="kpi-icon gold"><i class="bi bi-diagram-2"></i></div><div class="kpi-value">${JENJANG.length}<small>jenjang</small></div><div class="kpi-foot"><span>${F.num(jam.length)} jamaah aktif</span><span>${jam.filter(j => j.Jenjang_Manual === 'Ya').length} manual</span></div></div>
        <div class="card kpi compact"><div class="kpi-label">Kelompok Binaan</div><div class="kpi-icon"><i class="bi bi-houses"></i></div><div class="kpi-value">${S.d.kelompok.filter(k => k.Status_Aktif !== 'Nonaktif').length}</div><div class="kpi-foot"><span>${S.d.kelompok.length} total terdaftar</span></div></div>
      </div>
      <div class="card section-gap"><div class="card-head"><div><div class="card-title"><i class="bi bi-image"></i> Logo Aplikasi</div><div class="card-sub">Tampil di halaman masuk, menu samping, portal jamaah & wali, dan ID Card. Gambar otomatis dikecilkan (maks. 256 px).</div></div></div>
        <div class="row" style="gap:18px;flex-wrap:wrap">
          <div class="logo-prev" id="logoPrev">${Logo.html()}</div>
          <div class="grow" style="min-width:220px">
            <div class="row" style="gap:8px;flex-wrap:wrap">
              <label class="btn btn-primary" style="cursor:pointer"><i class="bi bi-upload"></i> Unggah Logo Baru<input type="file" id="logoFile" accept="image/png,image/jpeg,image/webp" hidden></label>
              ${Logo.get() ? '<button class="btn btn-light" id="logoReset"><i class="bi bi-arrow-counterclockwise"></i> Kembalikan Logo Bawaan</button>' : ''}
            </div>
            <div class="field-help mt-2">Saran: gambar persegi, latar polos/transparan (PNG), minimal 256×256 px.</div>
          </div>
        </div></div>
      <div class="card section-gap"><div class="card-head"><div><div class="card-title"><i class="bi bi-person-lines-fill"></i> Penentuan Otomatis Jenjang Berdasarkan Usia</div><div class="card-sub">Saat jamaah ditambah atau tanggal lahirnya diubah, jenjang dihitung otomatis dari usia (dalam tahun).</div></div></div>
        <div class="usia-grid" id="usiaGrid">${JENJANG.map((j, i) => {
          const n = jam.filter(x => x.Jenjang === j).length, last = i === JENJANG.length - 1;
          return `<div class="usia-card ${j === 'Usia Nikah' ? 'gold' : j === 'Dewasa' ? 'ink' : ''}"><div class="row"><span class="tiny muted mono">JENJANG ${i + 1}</span><span class="spacer"></span><span class="badge b-outline">${esc(JJ_SUB[j])}</span></div>
            <div class="card-title">${esc(j)}</div>
            <div class="usia-inputs"><label class="field"><span class="tiny muted">Min (th)</span><input class="input sm" type="number" min="0" max="120" data-j="${j}" data-k="0" value="${attr(usia[j][0])}"></label><span class="muted" style="padding-bottom:8px">s/d</span>
              <label class="field"><span class="tiny muted">Maks (th)</span><input class="input sm" type="number" min="0" max="120" data-j="${j}" data-k="1" value="${attr(usia[j][1])}" ${last ? 'placeholder="∞"' : ''}></label></div>
            <div class="row tiny"><span class="muted">Kurikulum:</span><b style="color:var(--primary)">${j === 'Dewasa' ? 'Otonomi Kelompok' : 'Baku Pusat (Rapor)'}</b></div>
            <div class="row tiny"><span class="muted">Terpetakan:</span><b>${n} (${F.pct(pct(n, jam.length))})</b></div>
            <div class="progress ${j === 'Usia Nikah' ? 'gold' : 'dark'}"><span style="width:${pct(n, jam.length)}%"></span></div></div>`;
        }).join('')}</div>
        <div id="usiaErr" class="form-error mt-3" hidden></div>
        <div class="row-wrap mt-3"><span class="tiny muted"><i class="bi bi-info-circle"></i> Rentang tidak boleh tumpang tindih. Kosongkan "Maks" Dewasa untuk tanpa batas atas. Jenjang yang diatur manual tidak ikut dihitung ulang.</span><span class="spacer"></span>
          <button class="btn btn-light" onclick="Pages.pengaturan.recalc(this)"><i class="bi bi-arrow-repeat"></i> Hitung Ulang Jenjang Semua</button>
          <button class="btn btn-primary" onclick="Pages.pengaturan.saveUsia(this)"><i class="bi bi-check2-circle"></i> Simpan Rentang Usia</button></div></div>
      ${Store.isMaster() ? `<div class="card section-gap" style="border-color:var(--bad)"><div class="card-head"><div><div class="card-title"><i class="bi bi-eraser"></i> Bersihkan Data</div><div class="card-sub">Hapus data contoh agar aplikasi mulai dari kosong. Kelompok, akun pengguna, dan pengaturan tidak ikut terhapus.</div></div>
        <button class="btn btn-danger btn-sm" onclick="Pages.pengaturan.clearData()"><i class="bi bi-eraser"></i> Hapus Data Contoh…</button></div></div>` : ''}
      <div class="grid-2 section-gap">
        <div class="card flush"><div class="card-head" style="padding:18px 20px 0"><div><div class="card-title"><i class="bi bi-houses"></i> Kelompok Binaan</div><div class="card-sub">Data kelompok untuk pembagian akses dan laporan</div></div><button class="btn btn-primary btn-sm" onclick="Pages.pengaturan.kelForm()"><i class="bi bi-plus"></i> Kelompok</button></div>
          <div class="table-wrap"><table class="table stack"><thead><tr><th>Kelompok</th><th>Pengurus</th><th>Jamaah</th><th>Status</th><th class="actions"></th></tr></thead><tbody>
          ${S.d.kelompok.map(k => `<tr><td class="td-main"><div class="cell-strong">${esc(k.Nama_Kelompok)}</div><div class="cell-sub">${esc(k.Desa_Daerah)} · <span class="mono">${esc(k.ID_Kelompok)}</span></div></td><td data-label="Pengurus"><div class="cell-strong">${esc(k.Nama_Pengurus || '–')}</div>${k.No_HP_Pengurus ? `<div class="cell-sub mono">${waLink(k.No_HP_Pengurus, '') ? `<a href="${attr(waLink(k.No_HP_Pengurus, "Assalamu'alaikum " + (k.Nama_Pengurus || '')))}" target="_blank" rel="noopener" title="Hubungi via WhatsApp"><i class="bi bi-whatsapp"></i> ${esc(k.No_HP_Pengurus)}</a>` : esc(k.No_HP_Pengurus)}</div>` : ''}</td><td data-label="Jamaah">${S.d.jamaah.filter(j => j.ID_Kelompok === k.ID_Kelompok && j.Status_Aktif === 'Aktif').length}</td>
            <td data-label="Status">${k.Status_Aktif === 'Nonaktif' ? '<span class="badge b-bad">Nonaktif</span>' : '<span class="badge b-ok">Aktif</span>'}</td><td class="actions"><button class="icon-btn sm" aria-label="Ubah kelompok" onclick="Pages.pengaturan.kelForm('${k.ID_Kelompok}')"><i class="bi bi-pencil"></i></button><button class="icon-btn sm" aria-label="Hapus kelompok ${attr(k.Nama_Kelompok)}" title="Hapus kelompok" onclick="Pages.pengaturan.kelDelete('${k.ID_Kelompok}')"><i class="bi bi-trash3" style="color:var(--bad)"></i></button></td></tr>`).join('')}</tbody></table></div></div>
        <div class="card"><div class="card-head"><div><div class="card-title"><i class="bi bi-cpu"></i> Integrasi Apps Script & Mitigasi Kuota</div><div class="card-sub">Arsitektur untuk menjaga aplikasi cepat & aman dari batas eksekusi</div></div></div>
          <ul class="target-list">
            <li><i class="bi bi-lightning-charge"></i><div><b>Batch read/write</b> — satu getValues/setValues per sheet; absensi satu kelas = 1 panggilan.</div></li>
            <li><i class="bi bi-hdd-stack"></i><div><b>CacheService ber-chunk</b> — tabel dicache 30 menit dan dihapus otomatis setiap ada perubahan.</div></li>
            <li><i class="bi bi-lock"></i><div><b>LockService</b> — dua admin menyimpan bersamaan tidak saling menimpa.</div></li>
            <li><i class="bi bi-phone"></i><div><b>Optimistic UI + snapshot lokal</b> — layar berubah seketika; data dibuka instan saat aplikasi dibuka ulang.</div></li>
            <li><i class="bi bi-key"></i><div><b>Script Properties</b> — ID spreadsheet, folder & salt kata sandi tidak ada di kode.</div></li>
          </ul>
          <div class="row-wrap mt-3"><button class="btn btn-light btn-sm" onclick="Pages.pengaturan.clearCache(this)"><i class="bi bi-trash3"></i> Bersihkan Cache Server</button><button class="btn btn-light btn-sm" onclick="App.refresh()"><i class="bi bi-arrow-clockwise"></i> Muat Ulang Data</button></div>
          <div class="note mt-3"><i class="bi bi-envelope"></i><div><b>Pengingat jadwal via email</b> (opsional): jalankan fungsi <span class="mono">pasangTriggerPengingat()</span> sekali di editor Apps Script. Admin Kelompok akan menerima email jadwal besok setiap pukul 18.00 WIB.</div></div></div>
      </div>`;
    Pages.pengaturan.bindLogo();
  },
  bindLogo() {
    const inp = $('#logoFile'); if (!inp) return;
    const save = (url, okMsg) => {
      const prev = Logo.get();
      App.mutate({
        apply: () => { S.d.settings.logo = url; Logo.set(url); },
        rollback: () => { S.d.settings.logo = prev; Logo.set(prev); },
        call: () => API.run('apiSaveLogo', url),
        okMsg
      }).catch(() => {});
    };
    inp.onchange = async () => {
      const f = inp.files && inp.files[0]; inp.value = '';
      if (!f) return;
      try { const url = await Logo.compress(f); save(url, 'Logo aplikasi diganti.'); }
      catch (e) { UI.toast(e.message, 'bad'); }
    };
    const rs = $('#logoReset');
    if (rs) rs.onclick = () => UI.confirm('Logo unggahan akan dihapus dan diganti ikon bawaan Ayo Ngaji.', { title: 'Kembalikan logo bawaan?', ok: 'Kembalikan' }).then(y => { if (y) save('', 'Logo dikembalikan ke bawaan.'); });
  },
  readUsia() {
    const usia = {};
    JENJANG.forEach(j => { usia[j] = [0, 0].map((_, k) => { const v = $(`#usiaGrid input[data-j="${j}"][data-k="${k}"]`).value; return v === '' ? '' : Number(v); }); });
    return usia;
  },
  saveUsia(btn) {
    const usia = Pages.pengaturan.readUsia(), err = $('#usiaErr');
    let prevMax = -1, bad = '';
    JENJANG.forEach((j, i) => {
      const [a, b] = usia[j];
      if (bad) return;
      if (a === '' || (b === '' && i < JENJANG.length - 1)) bad = `Lengkapi rentang ${j}.`;
      else if (b !== '' && b < a) bad = `Usia maksimum ${j} lebih kecil dari minimum.`;
      else if (a <= prevMax) bad = `Rentang ${j} tumpang tindih dengan jenjang sebelumnya.`;
      prevMax = b === '' ? 999 : b;
    });
    if (bad) { err.textContent = bad; err.hidden = false; return; }
    err.hidden = true;
    const prev = S.d.settings;
    App.mutate({
      apply: () => { S.d.settings = Object.assign({}, prev, { usia }); },
      rollback: () => { S.d.settings = prev; },
      call: () => API.run('apiSaveSettings', { usia }),
      okMsg: 'Rentang usia disimpan. Klik "Hitung Ulang" untuk menerapkan ke jamaah yang ada.',
      onSaved: s => { S.d.settings = Object.assign({}, prev, s, { spreadsheetUrl: prev.spreadsheetUrl, folderUrl: prev.folderUrl }); }
    }).catch(() => {});
  },
  async recalc(btn) {
    if (!(await UI.confirm('Hitung ulang jenjang semua jamaah (kecuali yang diatur manual) berdasarkan usia hari ini?', { ok: 'Hitung Ulang' }))) return;
    UI.busy(btn, true, 'Menghitung…');
    try { const r = await API.run('apiRecalcJenjang'); UI.toast(`${r.changed} jamaah berpindah jenjang.`, 'ok'); await App.refresh(true); }
    catch (e) { UI.toast(e.message, 'bad'); } finally { UI.busy(btn, false); }
  },
  clearData() {
    const cnt = { jamaah: S.d.jamaah.length, kegiatan: S.d.kegiatan.length, kurikulum: S.d.materi.length };
    const m = UI.modal({
      title: 'Hapus Data Contoh', size: 'md',
      body: `<div class="note gold mb-3"><i class="bi bi-exclamation-triangle"></i><div>Penghapusan <b>permanen</b> dan tidak bisa dikembalikan. Sebaiknya salin spreadsheet dulu bila ragu.</div></div>
        <form id="clrForm" class="form-grid" autocomplete="off">
          ${[['jamaah', 'Data jamaah', `${cnt.jamaah} jamaah beserta seluruh absensi dan capaiannya`], ['kegiatan', 'Kegiatan & jadwal', `${cnt.kegiatan} sesi beserta absensi dan infaqnya`], ['kurikulum', 'Kurikulum & target', `${cnt.kurikulum} materi beserta target dan capaiannya`]].map(([k, t, d]) => `<label class="card" style="box-shadow:none;cursor:pointer;padding:12px 14px;display:flex;gap:12px;align-items:flex-start"><input type="checkbox" name="sc" value="${k}" style="margin-top:4px"><span><b>${t}</b><br><span class="muted small">${d}</span></span></label>`).join('')}
          <label class="field"><span class="field-label">Ketik <b>HAPUS</b> untuk mengonfirmasi</span><input class="input" name="ok" placeholder="HAPUS" autocomplete="off"></label>
          <div id="clrErr" class="form-error" hidden></div>
        </form>`,
      foot: `<button class="btn btn-light" data-close>Batal</button><button class="btn btn-danger" id="clrGo"><i class="bi bi-eraser"></i> Hapus Sekarang</button>`
    });
    $('#clrGo', m.el).onclick = async () => {
      const f = $('#clrForm', m.el), e = $('#clrErr', m.el);
      const sc = $$('[name=sc]:checked', f).map(x => x.value);
      if (!sc.length) { e.textContent = 'Pilih data yang akan dibersihkan.'; e.hidden = false; return; }
      if (f.ok.value.trim().toUpperCase() !== 'HAPUS') { e.textContent = 'Ketik HAPUS untuk mengonfirmasi.'; e.hidden = false; return; }
      const btn = $('#clrGo', m.el);
      UI.busy(btn, true, 'Menghapus…');
      try { await API.run('apiClearData', sc, f.ok.value); m.close(); await App.refresh(true); UI.toast('Data dibersihkan.', 'ok'); Router.render(); }
      catch (ex) { e.textContent = ex.message; e.hidden = false; UI.busy(btn, false); }
    };
  },
  async clearCache(btn) {
    UI.busy(btn, true, 'Membersihkan…');
    try { await API.run('apiClearCache'); UI.toast('Cache server dibersihkan.', 'ok'); await App.refresh(true); }
    catch (e) { UI.toast(e.message, 'bad'); } finally { UI.busy(btn, false); }
  },
  /** Hapus kelompok (Master Admin). Kelompok yang masih punya jamaah/akun ditolak. */
  kelDelete(id) {
    const k = S.idx.kel.get(id); if (!k) return;
    const has = r => String(r.ID_Kelompok) === id;
    const nJam = S.d.jamaah.filter(has).length, nUsr = (S.d.pengguna || []).filter(has).length;
    if (nJam || nUsr) { UI.toast(`Kelompok ${k.Nama_Kelompok} masih punya ${[nJam ? nJam + ' jamaah' : '', nUsr ? nUsr + ' akun admin/guru' : ''].filter(Boolean).join(' dan ')}. Pindahkan atau hapus dulu.`, 'warn'); return; }
    UI.confirm(`Hapus kelompok <b>${esc(k.Nama_Kelompok)}</b>? Sesi, absensi, dan infaq kelompok ini ikut terhapus.`, { title: 'Hapus Kelompok', ok: 'Hapus' }).then(y => {
      if (!y) return;
      const prev = { kel: S.d.kelompok, keg: S.d.kegiatan, inf: S.d.infaq };
      App.mutate({
        apply: () => { S.d.kelompok = S.d.kelompok.filter(x => x.ID_Kelompok !== id); S.d.kegiatan = S.d.kegiatan.filter(x => !has(x)); S.d.infaq = S.d.infaq.filter(x => !has(x)); if (S.ui.kel === id) S.ui.kel = 'ALL'; },
        rollback: () => { S.d.kelompok = prev.kel; S.d.kegiatan = prev.keg; S.d.infaq = prev.inf; },
        call: () => API.run('apiDeleteKelompok', id), okMsg: 'Kelompok ' + k.Nama_Kelompok + ' dihapus.', after: () => Router.buildKelSwitch()
      }).catch(() => {});
    });
  },
  kelForm(id) {
    const k0 = id ? S.idx.kel.get(id) : null;
    const m = UI.modal({
      title: k0 ? 'Ubah Kelompok' : 'Tambah Kelompok',
      body: `<form id="kelForm" class="form-grid">
        <label class="field"><span class="field-label">Nama kelompok <span class="req">*</span></span><input class="input" name="Nama_Kelompok" maxlength="80" value="${attr(k0 ? k0.Nama_Kelompok : '')}"></label>
        <label class="field"><span class="field-label">Desa / Daerah / Wilayah</span><input class="input" name="Desa_Daerah" maxlength="80" value="${attr(k0 ? k0.Desa_Daerah : '')}"></label>
        <label class="field"><span class="field-label">Nama pengurus</span><input class="input" name="Nama_Pengurus" maxlength="80" value="${attr(k0 ? k0.Nama_Pengurus : '')}"></label>
        <label class="field"><span class="field-label">No. HP pengurus</span><input class="input mono" name="No_HP_Pengurus" type="tel" inputmode="tel" maxlength="18" placeholder="mis. 081234567890" value="${attr(k0 ? (k0.No_HP_Pengurus || '') : '')}"><span class="field-help">Opsional · bisa langsung dihubungi via WhatsApp dari daftar kelompok.</span></label>
        <label class="field"><span class="field-label">Status</span><select class="select" name="Status_Aktif">${opt('Aktif', 'Aktif', k0 ? k0.Status_Aktif : 'Aktif')}${opt('Nonaktif', 'Nonaktif', k0 && k0.Status_Aktif)}</select></label>
        <div id="kelErr" class="form-error" hidden></div></form>`,
      foot: `<button class="btn btn-light" data-close>Batal</button><button class="btn btn-primary" id="kelSave"><i class="bi bi-check2"></i> Simpan</button>`
    });
    $('#kelSave', m.el).onclick = () => {
      const fd = Object.fromEntries(new FormData($('#kelForm', m.el)).entries());
      const e = $('#kelErr', m.el);
      if (!fd.Nama_Kelompok.trim()) { e.textContent = 'Nama kelompok wajib diisi.'; e.hidden = false; return; }
      fd.No_HP_Pengurus = (fd.No_HP_Pengurus || '').replace(/[\s-]/g, '');
      if (fd.No_HP_Pengurus && !/^\+?\d{8,15}$/.test(fd.No_HP_Pengurus)) { e.textContent = 'Nomor HP pengurus harus 8–15 digit.'; e.hidden = false; return; }
      const rec = Object.assign({ ID_Kelompok: k0 ? k0.ID_Kelompok : uid('KLP') }, fd);
      m.close();
      const prev = S.d.kelompok;
      App.mutate({ apply: () => Store.upsert('kelompok', rec, 'ID_Kelompok'), rollback: () => { S.d.kelompok = prev; }, call: () => API.run('apiSaveKelompok', rec), okMsg: 'Kelompok disimpan.', after: () => Router.buildKelSwitch() }).catch(() => {});
    };
  }
};

/* ───────────────────────── AKUN ───────────────────────── */
Pages.akun = {
  changePassword() {
    $('#userDropdown').hidden = true;
    const m = UI.modal({
      title: 'Ganti Kata Sandi', size: 'sm',
      body: `<form id="pwForm" class="form-grid" autocomplete="off">
        <label class="field"><span class="field-label">Kata sandi lama</span><input class="input" type="password" name="old" autocomplete="current-password"></label>
        <label class="field"><span class="field-label">Kata sandi baru</span><input class="input" type="password" name="n1" minlength="8" autocomplete="new-password"><span class="field-help">Minimal 8 karakter.</span></label>
        <label class="field"><span class="field-label">Ulangi kata sandi baru</span><input class="input" type="password" name="n2" autocomplete="new-password"></label>
        <div id="pwErr" class="form-error" hidden></div></form>`,
      foot: `<button class="btn btn-light" data-close>Batal</button><button class="btn btn-primary" id="pwSave">Simpan</button>`
    });
    $('#pwSave', m.el).onclick = async () => {
      const f = $('#pwForm', m.el), e = $('#pwErr', m.el);
      const bad = !f.old.value ? 'Isi kata sandi lama.' : f.n1.value.length < 8 ? 'Kata sandi baru minimal 8 karakter.' : f.n1.value !== f.n2.value ? 'Konfirmasi kata sandi tidak sama.' : '';
      if (bad) { e.textContent = bad; e.hidden = false; return; }
      const b = $('#pwSave', m.el);
      UI.busy(b, true, 'Menyimpan…');
      try { await API.run('apiChangePassword', f.old.value, f.n1.value); m.close(); UI.toast('Kata sandi berhasil diganti.', 'ok'); }
      catch (ex) { e.textContent = ex.message; e.hidden = false; UI.busy(b, false); }
    };
  }
};

// Mulai aplikasi: skrip ini berada di akhir <body> sehingga elemen sudah tersedia —
// langsung jalan tanpa menunggu CDN apa pun (grafik/ikon/font dimuat di latar).
App.boot();