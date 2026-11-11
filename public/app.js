/* Todo - tampilan kalender, vanilla JS.
   - Semua data lewat /api/* (REST, JSON).
   - due_at disimpan UTC oleh server; browser menampilkan waktu lokal.
   - Semua tugas dimuat sekali; filter kategori dan pengelompokan per tanggal
     dilakukan di browser.
   - Tugas dengan jam 00:00 lokal dianggap "seharian" (tanpa jam) dan baru
     terlambat setelah harinya lewat.
*/

'use strict';

// ============================================================
// FITUR   : Pengaturan cincin progres, konfeti, dan quick add
// FUNGSI  : Kumpulan semua angka dan pilihan yang mungkin ingin diubah.
// ALUR    : Dibaca setupRing(), updateRing(), launchConfetti(),
//           parseQuickAdd(), dan blok pemicu konfeti di toggleTask();
//           fungsi-fungsi itu tidak menulis angka sendiri.
// UBAH DI SINI: Ubah nilai di sini, simpan, lalu muat ulang halaman.
// ============================================================
const CONFIG = {
  CONFETTI_COUNT: 40,            // [UBAH] jumlah potongan konfeti sekali picu
  CONFETTI_COLORS: ['#2747f0', '#121110', '#f2b134', '#e5484d', '#2ea66f'], // [UBAH] daftar warna potongan
  CONFETTI_MIN_MS: 1800,         // [UBAH] durasi jatuh tercepat (ms)
  CONFETTI_MAX_MS: 3200,         // [UBAH] durasi jatuh terlama (ms)
  CONFETTI_MIN_TASKS: 1,         // [UBAH] konfeti baru muncul kalau tugas hari itu minimal sekian
  RING_RADIUS: 18,               // [UBAH] jari-jari cincin di dalam viewBox SVG

  QUICK_ADD_ENABLED: true,       // [UBAH] false mematikan pengenalan tanggal/jam di kolom judul
  DEFAULT_TIMES: {               // [UBAH] jam bawaan untuk kata pagi/siang/sore/malam ("HH:MM")
    pagi: '08:00',
    siang: '12:00',
    sore: '16:00',
    malam: '19:00',
  },
  WEEKDAY_WORDS: {               // [UBAH] kata hari ke angka (0=Minggu .. 6=Sabtu); tambah kata = tambah baris; "minggu" khusus "hari minggu"
    senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, sabtu: 6, minggu: 0,
  },
  MONTH_WORDS: {                 // [UBAH] kata bulan ke angka (0=Januari .. 11=Desember); hanya dikenali didahului angka
    januari: 0, februari: 1, maret: 2, april: 3, mei: 4, juni: 5,
    juli: 6, agustus: 7, september: 8, oktober: 9, november: 10, desember: 11,
    jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6,
    agu: 7, agt: 7, sep: 8, okt: 9, nov: 10, des: 11,
  },

  QUICK_ADD_CATEGORY: true,      // [UBAH] false mematikan pengenalan kategori lewat hashtag
  CATEGORY_TAG_CHAR: '#',        // [UBAH] karakter penanda kategori di judul (mis. '@')

  SEARCH_MAX_RESULTS: 10,         // [UBAH] jumlah hasil pencarian maksimal yang ditampilkan

  CONFETTI_MAX_DELAY_MS: 400,    // [UBAH] jeda awal terlama sebelum potongan jatuh (ms)
  CONFETTI_DRIFT: 90,            // [UBAH] geser menyamping maksimum saat jatuh (px)
  CONFETTI_SPINS: 3,             // [UBAH] jumlah putaran maksimum saat jatuh (putaran penuh)
  CONFETTI_MIN_SIZE: 6,          // [UBAH] sisi potongan terkecil (px)
  CONFETTI_MAX_SIZE: 11,         // [UBAH] sisi potongan terbesar (px)
  CONFETTI_THIN: 0.3,            // [UBAH] peluang potongan jadi persegi panjang tipis (0-1)
  RING_STROKE: 4,                // [UBAH] ketebalan garis cincin di dalam viewBox SVG
};

const $ = (id) => document.getElementById(id);

const els = {
  catList: $('catList'),
  catItems: $('catItems'),
  uncatFilter: $('uncatFilter'),
  catForm: $('catForm'),
  catInput: $('catInput'),
  pageTitle: $('pageTitle'),
  summary: $('summary'),
  prevMonth: $('prevMonth'),
  nextMonth: $('nextMonth'),
  todayBtn: $('todayBtn'),
  calWeek: $('calWeek'),
  calGrid: $('calGrid'),
  dayTitle: $('dayTitle'),
  daySub: $('daySub'),
  searchInput: $('searchInput'),
  searchResults: $('searchResults'),
  taskForm: $('taskForm'),
  taskInput: $('taskInput'),
  taskTime: $('taskTime'),
  taskCategory: $('taskCategory'),
  quickPreview: $('quickPreview'),
  quickPreviewText: $('quickPreviewText'),
  quickNote: $('quickNote'),
  quickIgnoreBtn: $('quickIgnoreBtn'),
  status: $('status'),
  taskList: $('taskList'),
  empty: $('empty'),
  emptyTitle: $('emptyTitle'),
  toastWrap: $('toastWrap'),
  taskTemplate: $('taskTemplate'),
  ring: $('dayRing'),
  ringTrack: $('ringTrack'),
  ringBar: $('ringBar'),
  ringText: $('ringText'),
  confettiLayer: $('confettiLayer'),
};

const today = new Date();

const state = {
  categories: [],
  tasks: [],
  currentCat: 'all',
  viewYear: today.getFullYear(),
  viewMonth: today.getMonth(), // 0-11
  selected: dateKey(today),    // 'YYYY-MM-DD'
  dragId: null,                // id tugas yang sedang diseret
  quickIgnore: false,          // true = hasil parser diabaikan untuk teks saat ini
  timeAuto: false,             // true = isi #taskTime berasal dari parser, bukan ketikan
  catAuto: false,              // true = isi #taskCategory berasal dari parser (hashtag)
  catBefore: '',               // nilai #taskCategory sebelum diisi otomatis parser
};

/* ---------------- Tanggal ---------------- */

function pad(n) { return String(n).padStart(2, '0'); }

function dateKey(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function keyToDate(key, hh = 0, mm = 0) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function hasTime(d) { return d.getHours() !== 0 || d.getMinutes() !== 0; }

function taskKey(task) {
  return task.due_at ? dateKey(new Date(task.due_at)) : null;
}

function isOverdue(task) {
  if (!task.due_at || task.is_done) return false;
  const d = new Date(task.due_at);
  const end = hasTime(d) ? d.getTime() : startOfDay(d) + 86400000;
  return end <= Date.now();
}

function formatTime(d) {
  return pad(d.getHours()) + '.' + pad(d.getMinutes());
}

const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

/* ---------------- API ---------------- */

async function api(path, options = {}) {
  const opts = { headers: {}, ...options };
  if (opts.body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  let res;
  try {
    res = await fetch(path, opts);
  } catch {
    throw new Error('Server tidak bisa dihubungi. Pastikan npm start masih berjalan.');
  }
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    const err = new Error((data && data.error) || 'Terjadi kesalahan (HTTP ' + res.status + ').');
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ---------------- Status & toast ---------------- */

function setStatus(text, kind, onRetry) {
  els.status.className = 'status' + (kind ? ' is-' + kind : '');
  els.status.textContent = text || '';
  if (kind === 'error' && onRetry) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Coba lagi';
    btn.addEventListener('click', onRetry);
    els.status.append(btn);
  }
}

function clearStatus() {
  els.status.className = 'status';
  els.status.textContent = '';
}

function showToast(title, body, ms = 4000) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  const b = document.createElement('b');
  b.textContent = title;
  const s = document.createElement('span');
  s.textContent = body || '';
  toast.append(b, s);
  els.toastWrap.append(toast);
  setTimeout(() => {
    toast.classList.add('is-out');
    setTimeout(() => toast.remove(), 260);
  }, ms);
}

/* ---------------- Data turunan ---------------- */

function filteredTasks() {
  if (state.currentCat === 'all') return state.tasks;
  // 'uncat' adalah filter khusus untuk tugas dengan category_id NULL.
  if (state.currentCat === 'uncat') return state.tasks.filter((t) => t.category_id == null);
  return state.tasks.filter((t) => String(t.category_id) === String(state.currentCat));
}

function groupByDay(tasks) {
  const map = new Map();
  for (const t of tasks) {
    const key = taskKey(t);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(t);
  }
  return map;
}

function sortDay(a, b) {
  if (!!a.is_done !== !!b.is_done) return a.is_done ? 1 : -1;
  if (a.due_at && b.due_at) return new Date(a.due_at) - new Date(b.due_at);
  return new Date(b.created_at) - new Date(a.created_at);
}

/* ---------------- Render: sidebar ---------------- */

function renderCategories() {
  els.catItems.innerHTML = '';
  for (const cat of state.categories) {
    // Pembungkus perlu karena tombol kategori tidak boleh berisi tombol lain.
    const item = document.createElement('div');
    item.className = 'cat-item';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cat' + (String(state.currentCat) === String(cat.id) ? ' is-active' : '');
    btn.dataset.cat = String(cat.id);

    const name = document.createElement('span');
    name.className = 'cat-name';
    name.textContent = cat.name;

    const count = document.createElement('span');
    count.className = 'cat-count';
    count.dataset.count = String(cat.id);

    const actions = document.createElement('div');
    actions.className = 'cat-actions';

    const rename = document.createElement('button');
    rename.type = 'button';
    rename.className = 'cat-act';
    rename.setAttribute('aria-label', 'Ubah nama kategori ' + cat.name);
    rename.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M11.5 2.5l2 2L5 13H3v-2z"/></svg>';

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'cat-act cat-act-del';
    del.setAttribute('aria-label', 'Hapus kategori ' + cat.name);
    del.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 4.5h10M6 4.5V3h4v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5M6.5 7v4M9.5 7v4"/></svg><span class="del-label">Hapus?</span>';

    actions.append(rename, del);
    btn.append(name, count);
    item.append(btn, actions);

    btn.addEventListener('click', () => selectCategory(String(cat.id)));
    rename.addEventListener('click', () => startRename(cat, item));
    del.addEventListener('click', () => onDeleteCategory(cat, item, del));
    els.catItems.append(item);
  }
  els.catList.querySelector('[data-cat="all"]').classList.toggle('is-active', state.currentCat === 'all');
  renderCounts();
  renderCategorySelect();
}

// Ubah nama kategori langsung di sidebar (Enter simpan, Escape/blur batal).
function startRename(cat, item) {
  if (item.classList.contains('is-editing')) return;

  const btn = item.querySelector('.cat');
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'cat-rename';
  input.value = cat.name;
  input.maxLength = 100;
  input.setAttribute('aria-label', 'Nama kategori baru');

  item.classList.add('is-editing');
  btn.hidden = true;
  item.insertBefore(input, btn);
  input.focus();
  input.select();

  let settled = false;

  const cancel = () => {
    if (settled) return;
    settled = true;
    renderCategories();
  };

  const commit = async () => {
    if (settled) return;
    const name = input.value.trim();
    if (!name) {
      setStatus('Nama kategori wajib diisi.', 'error');
      input.focus();
      return;
    }
    if (name.length > 100) {
      setStatus('Nama kategori maksimal 100 karakter.', 'error');
      input.focus();
      return;
    }
    if (name === cat.name) {
      settled = true;
      renderCategories();
      return;
    }

    settled = true;
    try {
      const updated = await api('/api/categories/' + cat.id, { method: 'PATCH', body: { name } });
      Object.assign(cat, updated);
      clearStatus();
      renderCategories();
      renderAll();
    } catch (err) {
      settled = false;
      setStatus(err.message, 'error');
      input.focus();
    }
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  });
  input.addEventListener('blur', cancel);
}

// Hapus kategori dengan konfirmasi dua klik, sama seperti hapus tugas.
async function onDeleteCategory(cat, item, btn) {
  if (!item.classList.contains('is-confirm')) {
    item.classList.add('is-confirm');
    btn.setAttribute('aria-label', 'Klik lagi untuk menghapus kategori');
    clearTimeout(item._confirm);
    item._confirm = setTimeout(() => {
      item.classList.remove('is-confirm');
      btn.setAttribute('aria-label', 'Hapus kategori ' + cat.name);
    }, 3000);
    return;
  }

  clearTimeout(item._confirm);
  try {
    await api('/api/categories/' + cat.id, { method: 'DELETE' });
    state.categories = state.categories.filter((c) => String(c.id) !== String(cat.id));
    // Database sudah ON DELETE SET NULL; samakan juga state browser tanpa reload.
    for (const t of state.tasks) {
      if (String(t.category_id) === String(cat.id)) t.category_id = null;
    }
    if (String(state.currentCat) === String(cat.id)) state.currentCat = 'all';
    renderCategories();
    renderAll();
    showToast('Kategori dihapus', cat.name, 3000);
  } catch (err) {
    item.classList.remove('is-confirm');
    setStatus(err.message, 'error');
  }
}

function renderCategorySelect() {
  const keep = els.taskCategory.value;
  els.taskCategory.innerHTML = '';
  const none = document.createElement('option');
  none.value = '';
  none.textContent = 'Tanpa kategori';
  els.taskCategory.append(none);
  for (const cat of state.categories) {
    const opt = document.createElement('option');
    opt.value = String(cat.id);
    opt.textContent = cat.name;
    els.taskCategory.append(opt);
  }
  els.taskCategory.value = state.currentCat !== 'all' ? String(state.currentCat) : keep;
}

function renderCounts() {
  const counts = {};
  let open = 0;
  for (const t of state.tasks) {
    if (t.is_done) continue;
    open++;
    // Tugas tanpa kategori dihitung di kunci 'uncat'.
    const key = t.category_id == null ? 'uncat' : String(t.category_id);
    counts[key] = (counts[key] || 0) + 1;
  }
  for (const el of document.querySelectorAll('.cat-count')) {
    const key = el.dataset.count;
    const n = key === 'all' ? open : counts[key] || 0;
    el.textContent = n ? String(n) : '';
  }
  // Item filter ini hanya muncul kalau ada minimal satu tugas tanpa kategori.
  els.uncatFilter.hidden = !state.tasks.some((t) => t.category_id == null);
  els.uncatFilter.classList.toggle('is-active', state.currentCat === 'uncat');
}

/* ---------------- Render: kalender ---------------- */

function renderWeekdays() {
  els.calWeek.replaceChildren(
    ...WEEKDAYS.map((d) => {
      const s = document.createElement('span');
      s.textContent = d;
      return s;
    })
  );
}

function renderHead() {
  const first = new Date(state.viewYear, state.viewMonth, 1);
  const month = first.toLocaleDateString('id-ID', { month: 'long' });
  els.pageTitle.innerHTML = '';
  const t = document.createElement('span');
  t.className = 't';
  t.append(month);
  const yr = document.createElement('span');
  yr.className = 'yr';
  yr.textContent = String(state.viewYear);
  t.append(yr);
  els.pageTitle.append(t);
  document.title = month + ' ' + state.viewYear + ' - Todo';
}

function renderSummary() {
  const prefix = state.viewYear + '-' + pad(state.viewMonth + 1) + '-';
  const inMonth = filteredTasks().filter((t) => {
    const k = taskKey(t);
    return k && k.startsWith(prefix);
  });
  const late = inMonth.filter(isOverdue).length;
  els.summary.textContent = '';
  if (inMonth.length === 0) {
    els.summary.textContent = 'Belum ada tugas bulan ini.';
    return;
  }
  els.summary.append(inMonth.length + ' tugas bulan ini');
  if (late) {
    els.summary.append(', ');
    const b = document.createElement('b');
    b.textContent = late + ' terlambat';
    els.summary.append(b);
  }
  els.summary.append('.');
}

function renderCalendar() {
  const byDay = groupByDay(filteredTasks());
  const first = new Date(state.viewYear, state.viewMonth, 1);
  const offset = (first.getDay() + 6) % 7; // minggu mulai Senin
  const daysInMonth = new Date(state.viewYear, state.viewMonth + 1, 0).getDate();
  const rows = Math.ceil((offset + daysInMonth) / 7);
  const todayKey = dateKey(new Date());
  const frag = document.createDocumentFragment();

  for (let i = 0; i < rows * 7; i++) {
    const d = new Date(state.viewYear, state.viewMonth, 1 - offset + i);
    const key = dateKey(d);
    const list = (byDay.get(key) || []).slice().sort(sortDay);

    // .day berupa div (bukan button) supaya chip di dalamnya bisa diseret di Firefox.
    const day = document.createElement('div');
    day.className = 'day';
    day.dataset.key = key;
    day.setAttribute('role', 'button');
    day.tabIndex = 0;
    if (d.getMonth() !== state.viewMonth) day.classList.add('is-other');
    if (key === todayKey) day.classList.add('is-today');
    if (key === state.selected) day.classList.add('is-selected');
    const label = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long' });
    day.setAttribute('aria-label', label + (list.length ? ', ' + list.length + ' tugas' : ''));

    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = String(d.getDate());
    day.append(num);

    if (list.length) {
      const chips = document.createElement('div');
      chips.className = 'chips';
      for (const t of list.slice(0, 3)) {
        const c = document.createElement('span');
        c.className = 'chip' + (t.is_done ? ' is-done' : isOverdue(t) ? ' is-late' : '');
        c.textContent = t.title;
        // Chip juga menjadi sumber drag, dengan id tugas di data-id.
        c.draggable = true;
        c.dataset.id = String(t.id);
        chips.append(c);
      }
      if (list.length > 3) {
        const more = document.createElement('span');
        more.className = 'more';
        more.textContent = '+' + (list.length - 3) + ' lagi';
        chips.append(more);
      }
      day.append(chips);

      const dots = document.createElement('div');
      dots.className = 'dots';
      for (const t of list.slice(0, 4)) {
        const dot = document.createElement('span');
        dot.className = 'dot' + (t.is_done ? ' is-done' : isOverdue(t) ? ' is-late' : '');
        dots.append(dot);
      }
      day.append(dots);
    }

    day.addEventListener('click', () => selectDay(key));
    day.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectDay(key);
      }
    });
    frag.append(day);
  }
  els.calGrid.replaceChildren(frag);
}

/* ---------------- Render: panel hari ---------------- */

function selectedTasks() {
  const all = filteredTasks();
  return all.filter((t) => taskKey(t) === state.selected).sort(sortDay);
}

// ============================================================
// FITUR   : Cincin progres di panel hari
// FUNGSI  : Menyetel geometri cincin (viewBox, jari-jari, ketebalan)
//           sekali saat halaman dibuka.
// ALUR    : Dipanggil sekali di bagian "Mulai"; tanpa ini cincin tidak
//           punya ukuran dan keliling busurnya kosong.
// UBAH DI SINI: RING_RADIUS dan RING_STROKE di CONFIG mengubah ukuran
//               cincin; warnanya tetap diatur style.css.
// ============================================================
function setupRing() {
  const size = 2 * CONFIG.RING_RADIUS + CONFIG.RING_STROKE;
  const center = size / 2;
  const circumference = 2 * Math.PI * CONFIG.RING_RADIUS;

  els.ring.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
  els.ring.setAttribute('width', String(size));
  els.ring.setAttribute('height', String(size));

  for (const c of [els.ringTrack, els.ringBar]) {
    c.setAttribute('cx', String(center));
    c.setAttribute('cy', String(center));
    c.setAttribute('r', String(CONFIG.RING_RADIUS));
    c.setAttribute('stroke-width', String(CONFIG.RING_STROKE));
  }

  // Busur mengisi mulai dari pukul 12, searah jarum jam.
  els.ringBar.setAttribute('transform', 'rotate(-90 ' + center + ' ' + center + ')');
  // Awal: busur kosong (offset = keliling penuh) supaya pengisian
  // pertama terlihat sebagai transisi, bukan lompatan.
  els.ringBar.setAttribute('stroke-dasharray', String(circumference));
  els.ringBar.setAttribute('stroke-dashoffset', String(circumference));

  els.ringText.setAttribute('x', String(center));
  els.ringText.setAttribute('y', String(center));
}

// ============================================================
// FITUR   : Cincin progres di panel hari
// FUNGSI  : Mengisi busur, teks tengah, dan label aksesibilitas cincin
//           sesuai tugas selesai pada hari yang sedang dipilih.
// ALUR    : Dipanggil dari renderPanel() dan langsung dari toggleTask()
//           (juga saat rollback di blok catch), jadi cincin berubah
//           seketika tanpa menunggu renderPanel yang tertunda 450 ms.
// UBAH DI SINI: Format teks "3/5" dan kata "Beres" ada di sini; ukuran
//               lewat CONFIG, warna lewat style.css.
// ============================================================
function updateRing() {
  const list = selectedTasks();
  const total = list.length;
  const done = list.filter((t) => t.is_done).length;

  // Tanpa tugas: cincin tidak ada artinya, disembunyikan.
  if (total === 0) {
    // Catatan: elemen SVG TIDAK punya properti .hidden (itu hanya milik elemen
    // HTML), jadi atribut hidden harus diatur lewat setAttribute/removeAttribute.
    els.ring.setAttribute('hidden', '');
    return;
  }

  // offset = keliling x bagian yang BELUM selesai; makin banyak selesai,
  // makin kecil offsetnya sehingga busur yang terlihat makin panjang.
  const circumference = 2 * Math.PI * CONFIG.RING_RADIUS;
  els.ringBar.style.strokeDasharray = String(circumference);
  els.ringBar.style.strokeDashoffset = String((circumference * (total - done)) / total);
  els.ringText.textContent = done === total ? 'Beres' : done + '/' + total;
  els.ring.setAttribute('aria-label', done + ' dari ' + total + ' tugas selesai');
  els.ring.removeAttribute('hidden');
}

function renderPanel() {
  const list = selectedTasks();
  const open = list.filter((t) => !t.is_done).length;

  const d = keyToDate(state.selected);
  els.dayTitle.textContent = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });

  if (list.length === 0) els.daySub.textContent = 'Belum ada tugas.';
  else if (open === 0) els.daySub.textContent = 'Semua beres.';
  else els.daySub.textContent = open + ' belum selesai.';

  // Cincin progres ikut terisi ulang setiap panel hari digambar.
  updateRing();

  els.taskList.replaceChildren(...list.map(buildRow));
  els.empty.hidden = list.length !== 0;
  els.emptyTitle.textContent = 'Tidak ada tugas di tanggal ini.';
}

function buildRow(task) {
  const row = els.taskTemplate.content.firstElementChild.cloneNode(true);
  row.dataset.id = String(task.id);
  row.draggable = true;
  row.classList.toggle('is-done', !!task.is_done);

  const check = row.querySelector('.check');
  check.setAttribute('aria-pressed', String(!!task.is_done));
  check.setAttribute('aria-label', task.is_done ? 'Tandai belum selesai' : 'Tandai selesai');

  row.querySelector('.task-title').textContent = task.title;

  const meta = row.querySelector('.task-meta');
  const cat = state.categories.find((c) => String(c.id) === String(task.category_id));
  if (cat && state.currentCat === 'all') {
    const span = document.createElement('span');
    span.textContent = cat.name;
    meta.append(span);
  }
  if (task.due_at) {
    const d = new Date(task.due_at);
    const span = document.createElement('span');
    span.className = 'meta-due' + (isOverdue(task) ? ' is-overdue' : '');
    span.append(hasTime(d) ? formatTime(d) : 'Seharian');
    meta.append(span);
  }

  check.addEventListener('click', () => toggleTask(task.id, row));
  const del = row.querySelector('.del');
  del.addEventListener('click', () => onDelete(task.id, row, del));
  return row;
}

function renderAll() {
  renderHead();
  renderSummary();
  renderCalendar();
  renderPanel();
  renderCounts();
}

/* ---------------- Navigasi ---------------- */

function changeMonth(delta) {
  const d = new Date(state.viewYear, state.viewMonth + delta, 1);
  state.viewYear = d.getFullYear();
  state.viewMonth = d.getMonth();
  renderAll();
}

function selectDay(key) {
  state.selected = key;
  const d = keyToDate(key);
  if (d.getFullYear() !== state.viewYear || d.getMonth() !== state.viewMonth) {
    state.viewYear = d.getFullYear();
    state.viewMonth = d.getMonth();
    renderAll();
  } else {
    renderCalendar();
    renderPanel();
  }
}

function selectCategory(cat) {
  if (state.currentCat === cat) return;
  state.currentCat = cat;
  renderCategories();
  renderSummary();
  renderCalendar();
  renderPanel();
}

async function addCategory(name) {
  const cat = await api('/api/categories', { method: 'POST', body: { name } });
  state.categories.push(cat);
  state.currentCat = String(cat.id);
  renderCategories();
  renderSummary();
  renderCalendar();
  renderPanel();
  showToast('Kategori ditambahkan', cat.name, 3000);
}

/* ---------------- Konfeti ---------------- */

// ============================================================
// FITUR   : Konfeti saat semua tugas satu hari selesai
// FUNGSI  : Membuat potongan konfeti berjatuhan di seluruh layar dan
//           menghapus tiap potongan setelah animasinya selesai.
// ALUR    : Dipanggil dari toggleTask() saat centangan membuat semua
//           tugas hari terpilih selesai; potongan span ditambahkan ke
//           #confettiLayer dan dihapus lewat event animationend.
// UBAH DI SINI: Jumlah, warna, durasi, dan ukuran lewat CONFIG di atas;
//               gerakan jatuhnya lewat keyframes confetti-fall di style.css.
// ============================================================
function launchConfetti() {
  // Kalau pengguna mematikan animasi (prefers-reduced-motion), potongan
  // akan menempel diam di layar, jadi jangan buat elemen apa pun.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  for (let i = 0; i < CONFIG.CONFETTI_COUNT; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti';

    // Ukuran: umumnya persegi kecil, sesekali persegi panjang tipis.
    const side = CONFIG.CONFETTI_MIN_SIZE + Math.random() * (CONFIG.CONFETTI_MAX_SIZE - CONFIG.CONFETTI_MIN_SIZE);
    const thin = Math.random() < CONFIG.CONFETTI_THIN;
    piece.style.setProperty('--w', (thin ? side * 2 : side).toFixed(1) + 'px');
    piece.style.setProperty('--h', (thin ? side * 0.35 : side).toFixed(1) + 'px');

    // Warna, posisi awal, arah geser, putaran, durasi, dan jeda diacak
    // lewat custom property, lalu dipakai oleh keyframes di style.css.
    piece.style.setProperty('--c', CONFIG.CONFETTI_COLORS[Math.floor(Math.random() * CONFIG.CONFETTI_COLORS.length)]);
    piece.style.setProperty('--x', (Math.random() * 100).toFixed(1) + 'vw');
    piece.style.setProperty('--dx', ((Math.random() * 2 - 1) * CONFIG.CONFETTI_DRIFT).toFixed(0) + 'px');
    piece.style.setProperty('--rot', ((Math.random() < 0.5 ? -1 : 1) * Math.ceil(Math.random() * CONFIG.CONFETTI_SPINS) * 360).toFixed(0) + 'deg');
    piece.style.setProperty('--dur', (CONFIG.CONFETTI_MIN_MS + Math.random() * (CONFIG.CONFETTI_MAX_MS - CONFIG.CONFETTI_MIN_MS)).toFixed(0) + 'ms');
    piece.style.setProperty('--delay', (Math.random() * CONFIG.CONFETTI_MAX_DELAY_MS).toFixed(0) + 'ms');

    // Potongan menghapus dirinya sendiri supaya DOM tidak menumpuk.
    piece.addEventListener('animationend', () => piece.remove());
    els.confettiLayer.append(piece);
  }
}

/* ---------------- Tulis tugas dengan bahasa biasa (quick add) ---------------- */

// ============================================================
// FITUR   : Tulis tugas dengan bahasa biasa
// FUNGSI  : Pola regex untuk kata tanggal dan jam, dibangun dari kamus
//           di CONFIG (WEEKDAY_WORDS, MONTH_WORDS, DEFAULT_TIMES).
// ALUR    : Dipakai parseQuickAdd(); menambah kata baru cukup menambah
//           baris di CONFIG, bukan di sini.
// UBAH DI SINI: Urutan kamus diurut panjang-kata supaya "desember"
//           tidak terpotong jadi "des"; hanya lewat CONFIG.
// ============================================================
const QUICK_DAY_WORDS = Object.keys(CONFIG.WEEKDAY_WORDS)
  .filter((w) => w !== 'minggu') // "minggu" hanya sah sebagai "hari minggu"
  .sort((a, b) => b.length - a.length)
  .join('|');
const QUICK_MONTH_WORDS = Object.keys(CONFIG.MONTH_WORDS)
  .sort((a, b) => b.length - a.length)
  .join('|');
const QUICK_TIME_WORDS = Object.keys(CONFIG.DEFAULT_TIMES).join('|');

const RE_RELATIVE = /\b(hari\s+ini|besok|lusa)\b/i;
const RE_NEXT_WEEK = /\bminggu\s+depan\b/i;
const RE_IN_DAYS = /\b(\d{1,2})\s+hari\s+lagi\b/i;
const RE_SUNDAY = /\bhari\s+minggu\b/i;
const RE_DAY_NAME = new RegExp('\\b(hari\\s+)?(' + QUICK_DAY_WORDS + ')\\b', 'i');
const RE_DATE_N = /\b(?:tanggal|tgl)\s*(\d{1,2})\b/i;
const RE_MONTH_DAY = new RegExp('\\b(\\d{1,2})\\s+(' + QUICK_MONTH_WORDS + ')\\b', 'i');
const RE_TIME = new RegExp('\\b(?:jam|pukul)\\s*(\\d{1,2})(?:[.:](\\d{2}))?(?:\\s*(' + QUICK_TIME_WORDS + '))?\\b', 'i');
const RE_TIME_WORD = new RegExp('\\b(' + QUICK_TIME_WORDS + ')\\b', 'gi');

let quickTimer = null; // timer debounce event input kolom judul

// ============================================================
// FITUR   : Tulis tugas dengan bahasa biasa
// FUNGSI  : Menggeser tanggal sebanyak n hari dari acuan.
// ALUR    : Dipakai parseQuickAdd() untuk "besok", "lusa", "N hari
//           lagi", dan "minggu depan".
// UBAH DI SINI: Tidak ada; semuanya aritmetika tanggal.
// ============================================================
function addDays(now, n) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
}

// ============================================================
// FITUR   : Tulis tugas dengan bahasa biasa
// FUNGSI  : Mencari kemunculan nama hari TERDEKAT setelah acuan
//           (hari ini tidak dihitung, "rabu" saat Rabu = minggu depan).
// ALUR    : Dipakai parseQuickAdd() untuk "senin" .. "hari minggu".
// UBAH DI SINI: Kamus nama hari ada di WEEKDAY_WORDS di CONFIG.
// ============================================================
function nextWeekday(now, target) {
  let ahead = (target - now.getDay() + 7) % 7;
  if (ahead === 0) ahead = 7;
  return addDays(now, ahead);
}

// ============================================================
// FITUR   : Tulis tugas dengan bahasa biasa
// FUNGSI  : Mengubah "tanggal N" menjadi tanggal nyata: N bulan ini,
//           atau bulan depan kalau tanggalnya sudah lewat.
// ALUR    : Dipakai parseQuickAdd(); N yang melebihi jumlah hari bulan
//           dipindah ke bulan depan dan dijepit ke hari terakhirnya.
// UBAH DI SINI: Tidak ada; aturan lewat/kurang hari ada di sini.
// ============================================================
function dateOfMonthN(now, n) {
  const y = now.getFullYear();
  const daysIn = (m) => new Date(y, m + 1, 0).getDate();
  let month = now.getMonth();
  let day = n;
  if (n < now.getDate() || n > daysIn(month)) {
    month += 1;
    day = Math.min(n, daysIn(month));
  }
  return new Date(y, month, day);
}

// ============================================================
// FITUR   : Tulis tugas dengan bahasa biasa
// FUNGSI  : Mengubah "N namabulan" menjadi tanggal: tahun ini, atau
//           tahun depan kalau tanggalnya sudah lewat.
// ALUR    : Dipakai parseQuickAdd() untuk "20 desember", "5 mei".
// UBAH DI SINI: Kamus bulan ada di MONTH_WORDS di CONFIG.
// ============================================================
function monthDay(now, day, month) {
  const y = now.getFullYear();
  const d = new Date(y, month, Math.min(day, new Date(y, month + 1, 0).getDate()));
  if (startOfDay(d) < startOfDay(now)) {
    return new Date(y + 1, month, Math.min(day, new Date(y + 1, month + 1, 0).getDate()));
  }
  return d;
}

// ============================================================
// FITUR   : Tulis tugas dengan bahasa biasa
// FUNGSI  : Memotong rentang kata yang dikenali dari teks lalu
//           merapikan spasi sebagai judul.
// ALUR    : Dipakai parseQuickAdd(); rentang di luar urutan atau
//           bertumpuk dilewati.
// UBAH DI SINI: Tidak ada; hanya pembersihan spasi.
// ============================================================
function cutRanges(text, ranges) {
  let out = '';
  let last = 0;
  for (const [s, e] of ranges.slice().sort((a, b) => a[0] - b[0])) {
    if (s < last) continue;
    out += text.slice(last, s);
    last = e;
  }
  return (out + text.slice(last)).replace(/\s+/g, ' ').trim();
}

// Rentang [mulai, akhir) bertumpuk dengan salah satu rentang lain?
function rangeOverlaps(s, e, ranges) {
  return ranges.some(([a, b]) => s < b && e > a);
}

// ============================================================
// FITUR   : Pilih kategori lewat hashtag di kolom judul
// FUNGSI  : Mengamankan satu karakter agar tidak diartikan sebagai
//           kode pola regex (mis. "." atau "*").
// ALUR    : Dipakai tagRegex() saat membangun pola tag dari
//           CONFIG.CATEGORY_TAG_CHAR.
// UBAH DI SINI: Tidak ada; daftar karakter khusus regex ada di sini.
// ============================================================
function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================
// FITUR   : Pilih kategori lewat hashtag di kolom judul
// FUNGSI  : Membangun pola tag (penanda + kata tanpa spasi) dari
//           CONFIG.CATEGORY_TAG_CHAR, tanpa menulis '#' secara langsung.
// ALUR    : Dipakai LANGKAH 0 di parseQuickAdd(); null kalau penanda
//           kosong sehingga fitur tag mati.
// UBAH DI SINI: Karakter penanda ada di CATEGORY_TAG_CHAR di CONFIG.
// ============================================================
function tagRegex() {
  const ch = String(CONFIG.CATEGORY_TAG_CHAR || '');
  if (!ch) return null;
  return new RegExp(escapeRe(ch) + '(\\S+)', 'g');
}

// ============================================================
// FITUR   : Pilih kategori lewat hashtag di kolom judul
// FUNGSI  : Menyeragamkan teks (huruf kecil, spasi jadi tanda hubung)
//           supaya "#Kegiatan Hari ini" dan "#kegiatan-hari-ini" sama.
// ALUR    : Dipakai matchCategoryTag() untuk nama kategori dan isi tag.
// UBAH DI SINI: Tidak ada; aturan penyeragaman ada di sini.
// ============================================================
function normalizeTag(s) {
  return String(s).toLowerCase().trim().replace(/\s+/g, '-');
}

// ============================================================
// FITUR   : Pilih kategori lewat hashtag di kolom judul
// FUNGSI  : Mencari kategori untuk satu tag: cocok persis dipakai,
//           awalan hanya kalau tepat satu kategori yang cocok.
// ALUR    : Dipakai LANGKAH 0 di parseQuickAdd(); mengembalikan objek
//           kategorinya, atau null kalau tidak ada / ambigu.
// UBAH DI SINI: Aturan pencocokan (persis dulu, awalan tunggal) di sini.
// ============================================================
function matchCategoryTag(tag, categories) {
  const norm = normalizeTag(tag);
  if (!norm) return null;
  let prefixHit = null;
  for (const cat of categories) {
    const cname = normalizeTag(cat.name);
    if (!cname) continue;
    if (cname === norm) return cat;            // persis: langsung menang
    if (cname.startsWith(norm)) {
      prefixHit = prefixHit ? 'ambiguous' : cat; // kedua kandidat = ambigu
    }
  }
  return prefixHit === 'ambiguous' ? null : prefixHit;
}

// ============================================================
// FITUR   : Pilih kategori lewat hashtag di kolom judul
// FUNGSI  : Mengganti teks di dalam rentang yang sudah dikenali
//           (tag) dengan spasi, panjang teks tetap sama.
// ALUR    : Dipakai parseQuickAdd() setelah LANGKAH 0 supaya kata di
//           dalam tag tidak terbaca lagi sebagai tanggal/jam; posisi
//           karakter tetap sejajar dengan teks asli.
// UBAH DI SINI: Tidak ada; hanya mengganti karakter menjadi spasi.
// ============================================================
function maskRanges(text, ranges) {
  const chars = text.split('');
  for (const [s, e] of ranges) {
    for (let i = s; i < e && i < chars.length; i++) chars[i] = ' ';
  }
  return chars.join('');
}

// ============================================================
// FITUR   : Tulis tugas dengan bahasa biasa + kategori hashtag
// FUNGSI  : Mengenali kategori (#tag), kata tanggal, dan jam di dalam
//           kalimat, membuangnya dari judul, dan mengembalikan hasilnya.
// ALUR    : Dipanggil runQuickAdd() saat mengetik dan addTask() saat
//           submit; hasilnya { title, dateKey, hh, mm, categoryId,
//           unknownTag }, murni tanpa DOM.
// UBAH DI SINI: Kosakata ada di CONFIG (WEEKDAY_WORDS, MONTH_WORDS,
//           DEFAULT_TIMES, CATEGORY_TAG_CHAR); urutan pengenalan ada
//           di LANGKAH 0-2 (kategori dulu, lalu tanggal, lalu jam).
// ============================================================
function parseQuickAdd(text, now, categories) {
  const raw = String(text);
  const trimmed = raw.trim();
  const result = { title: trimmed, dateKey: null, hh: null, mm: null, categoryId: null, unknownTag: null };
  if (!trimmed) return result;

  // Rentang [mulai, akhir) teks yang dibuang dari judul.
  const ranges = [];
  let m;
  let date = null;

  // ---- LANGKAH 0: kategori (hashtag), diproses lebih dulu supaya
  // "#besok" tidak sempat dibaca sebagai tanggal oleh LANGKAH 1 ----
  const reTag = CONFIG.QUICK_ADD_CATEGORY ? tagRegex() : null;
  if (reTag && categories && categories.length) {
    let tag;
    while ((tag = reTag.exec(raw))) {
      const [s, e] = [tag.index, tag.index + tag[0].length];
      if (rangeOverlaps(s, e, ranges)) continue;
      const cat = matchCategoryTag(tag[1], categories);
      if (cat) {
        // Tag cocok: yang pertama menang; semua tag yang cocok
        // dibuang dari judul beserta tanda penandanya.
        if (result.categoryId == null) result.categoryId = cat.id;
        ranges.push([s, e]);
      } else {
        // Tag tak dikenal atau ambigu: dibiarkan di judul,
        // teksnya dicatat di unknownTag untuk pratinjau.
        result.unknownTag = tag[1];
      }
    }
  }

  // Kata di dalam tag yang sudah cocok diganti spasi supaya LANGKAH 1
  // dan 2 tidak membacanya lagi; posisi karakter tetap sejajar dengan
  // teks asli, jadi rentang hasil pencocokan tetap sah.
  const scan = maskRanges(raw, ranges);

  // ---- LANGKAH 1: tanggal (dicocokkan berurutan, yang pertama menang) ----
  if ((m = RE_RELATIVE.exec(scan))) {
    // "hari ini" / "besok" / "lusa" = geser 0/1/2 hari dari acuan.
    const word = m[1].toLowerCase().replace(/\s+/g, ' ');
    date = addDays(now, word === 'hari ini' ? 0 : word === 'besok' ? 1 : 2);
  } else if ((m = RE_NEXT_WEEK.exec(scan))) {
    // "minggu depan" = hari ini + 7 hari, bukan hari Minggu berikutnya.
    date = addDays(now, 7);
  } else if ((m = RE_IN_DAYS.exec(scan))) {
    // "N hari lagi" = geser N hari.
    date = addDays(now, Number(m[1]));
  } else if ((m = RE_SUNDAY.exec(scan))) {
    // Minggu hanya dienali sebagai "hari minggu" (kata "minggu"
    // sendirian bukan nama hari, mis. "minggu depan" sudah di atas).
    date = nextWeekday(now, CONFIG.WEEKDAY_WORDS.minggu);
  } else if ((m = RE_DAY_NAME.exec(scan))) {
    // Nama hari: kemunculan terdekat SETELAH hari ini.
    date = nextWeekday(now, CONFIG.WEEKDAY_WORDS[m[2].toLowerCase()]);
  } else if ((m = RE_DATE_N.exec(scan))) {
    // "tanggal N" / "tgl N": bulan ini, atau bulan depan kalau lewat.
    date = dateOfMonthN(now, Number(m[1]));
  } else if ((m = RE_MONTH_DAY.exec(scan))) {
    // "N namabulan" (mis. "20 desember"): hanya kalau didahului angka,
    // supaya kata "mei" biasa tidak ikut dikenali.
    date = monthDay(now, Number(m[1]), CONFIG.MONTH_WORDS[m[2].toLowerCase()]);
  }
  // Kecocokan tanggal yang menabrak rentang tag (mis. lewat spasi hasil
  // penyamaran) dibatalkan: hashtag selalu menang.
  if (date && rangeOverlaps(m.index, m.index + m[0].length, ranges)) date = null;
  if (date) ranges.push([m.index, m.index + m[0].length]);

  // ---- LANGKAH 2: jam ----
  let time = null;
  m = RE_TIME.exec(scan);
  // "jam" harus diikuti angka, jadi "Beli jam tangan" tidak lolos.
  if (m && !rangeOverlaps(m.index, m.index + m[0].length, ranges)) {
    const h = Number(m[1]);
    const mins = m[2] ? Number(m[2]) : 0;
    if (h <= 23 && mins <= 59) {
      let hh = h;
      const word = m[3] ? m[3].toLowerCase() : null;
      // Keterangan menggeser jam ke arah siang/malam; di luar rentangnya
      // angka dipakai apa adanya.
      if (word === 'sore' && hh >= 1 && hh <= 6) hh += 12;
      if (word === 'malam') {
        if (hh >= 6 && hh <= 11) hh += 12;
        else if (hh === 12) hh = 0;
      }
      time = { hh, mm: mins };
      ranges.push([m.index, m.index + m[0].length]);
    }
  }

  // Kata waktu sendirian ("besok pagi") hanya dihitung kalau ada kata
  // tanggal di kalimat yang sama, dan tidak menimpa jam eksplisit.
  if (!time && date) {
    RE_TIME_WORD.lastIndex = 0;
    while ((m = RE_TIME_WORD.exec(scan))) {
      const [s, e] = [m.index, m.index + m[0].length];
      if (rangeOverlaps(s, e, ranges)) continue;
      const [hh, mm] = CONFIG.DEFAULT_TIMES[m[1].toLowerCase()].split(':').map(Number);
      if (!time) time = { hh, mm };
      ranges.push([s, e]);
    }
  }

  // ---- LANGKAH 3: bersihkan judul ----
  const title = cutRanges(raw, ranges);
  // Judul habis terbuang (mis. teksnya cuma "#belanja" atau "besok"):
  // kembalikan teks asli dan anggap tidak ada tanggal, jam, maupun
  // kategori yang valid.
  if (!title) {
    return { title: trimmed, dateKey: null, hh: null, mm: null, categoryId: null, unknownTag: null };
  }

  result.title = title;
  if (date) result.dateKey = dateKey(date);
  if (time) {
    result.hh = time.hh;
    result.mm = time.mm;
  }
  return result;
}

// ============================================================
// FITUR   : Tulis tugas dengan bahasa biasa
// FUNGSI  : Membaca teks kolom judul, mengisi kolom jam dan kategori
//           otomatis, dan memperbarui pratinjau hasil parser.
// ALUR    : Dipanggil lewat debounce 150 ms dari event input di
//           #taskInput; kolom hanya dikosongkan/dikembalikan kalau
//           isinya memang hasil otomatis (state.timeAuto/catAuto),
//           ketikan dan pilihan manual pengguna dibiarkan.
// UBAH DI SINI: Jeda debounce di pemanggilnya; QUICK_ADD_ENABLED dan
//           QUICK_ADD_CATEGORY di CONFIG mematikan bagiannya.
// ============================================================
function runQuickAdd() {
  if (!CONFIG.QUICK_ADD_ENABLED) return;
  const parsed = parseQuickAdd(els.taskInput.value, new Date(), state.categories);

  if (parsed.hh != null) {
    els.taskTime.value = pad(parsed.hh) + ':' + pad(parsed.mm);
    state.timeAuto = true;
  } else if (state.timeAuto) {
    els.taskTime.value = '';
    state.timeAuto = false;
  }

  // ============================================================
  // FITUR   : Pilih kategori lewat hashtag di kolom judul
  // FUNGSI  : Mengisi #taskCategory otomatis dari hashtag yang dikenali
  //           dan mengembalikannya begitu tag hilang dari teks.
  // ALUR    : Nilai lama disimpan SEKALI di state.catBefore saat pertama
  //           kali diisi otomatis; pengembalian hanya kalau isi kolom
  //           masih hasil otomatis (state.catAuto).
  // UBAH DI SINI: QUICK_ADD_CATEGORY di CONFIG mematikan blok ini
  //           lewat parser (categoryId selalu null).
  // ============================================================
  if (parsed.categoryId != null) {
    if (!state.catAuto) state.catBefore = els.taskCategory.value;
    els.taskCategory.value = String(parsed.categoryId);
    state.catAuto = true;
  } else if (state.catAuto) {
    els.taskCategory.value = state.catBefore;
    state.catAuto = false;
  }

  renderQuickPreview(parsed);
}

// ============================================================
// FITUR   : Tulis tugas dengan bahasa biasa
// FUNGSI  : Menampilkan (atau menyembunyikan) pratinjau tanggal, jam,
//           dan kategori yang dikenali dari teks, termasuk tanda
//           "sudah lewat" dan catatan tag yang tidak ditemukan.
// ALUR    : Dipanggil runQuickAdd(); pratinjau disembunyikan kalau tidak
//           ada hasil, fitur dimatikan, atau hasil diabaikan lewat
//           tombol x.
// UBAH DI SINI: Teks "sudah lewat" dan tampilan kategori/tag ada
//           di sini dan di style.css.
// ============================================================
function renderQuickPreview(parsed) {
  const nothingKnown = !parsed.dateKey && parsed.hh == null
    && parsed.categoryId == null && !parsed.unknownTag;
  if (!CONFIG.QUICK_ADD_ENABLED || state.quickIgnore || nothingKnown) {
    els.quickPreviewText.textContent = '';
    els.quickNote.textContent = '';
    els.quickPreview.hidden = true;
    return;
  }

  // Tanggal dipakai kalau ada; kalau hanya jam, patokan tanggalnya
  // adalah tanggal yang sedang dipilih di kalender.
  const when = keyToDate(parsed.dateKey || state.selected, parsed.hh != null ? parsed.hh : 0, parsed.mm != null ? parsed.mm : 0);

  const parts = [];
  if (parsed.dateKey) {
    parts.push(when.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' }));
  }
  if (parsed.hh != null) parts.push(formatTime(when));
  // Kategori yang dikenali ikut ditampilkan, mis. "kategori Belanja".
  const cat = parsed.categoryId != null
    ? state.categories.find((c) => String(c.id) === String(parsed.categoryId))
    : null;
  if (cat) parts.push('kategori ' + cat.name);
  let text = parts.join(', ');

  // Waktu yang sudah lewat ditandai, mis. "jam 3 pagi" untuk hari ini
  // padahal sekarang sudah jam 7.
  const late = parsed.hh != null && when.getTime() <= Date.now();
  if (late) text += ' - sudah lewat';

  els.quickPreviewText.textContent = text;
  // Tag yang tidak cocok kategori mana pun ditulis kecil di bawahnya.
  els.quickNote.textContent = parsed.unknownTag
    ? 'Kategori ' + CONFIG.CATEGORY_TAG_CHAR + parsed.unknownTag + ' tidak ditemukan'
    : '';
  els.quickPreview.classList.toggle('is-late', late);
  els.quickPreview.hidden = false;
}

/* ---------------- Pencarian tugas ---------------- */

// ============================================================
// FITUR   : Pencarian tugas
// FUNGSI  : Mencari tugas yang judulnya mengandung kata kunci (tidak
//           peka huruf besar/kecil) di semua tanggal dan kategori,
//           lalu mengurutkannya dari tanggal terdekat.
// ALUR    : Dipanggil renderSearchResults() dengan isi kolom cari;
//           mengembalikan array tugas, kosong kalau kata kunci kosong.
// UBAH DI SINI: Batas jumlah hasil ada di SEARCH_MAX_RESULTS di CONFIG.
// ============================================================
function searchTasks(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  return state.tasks
    .filter((t) => t.due_at && t.title.toLowerCase().includes(q))
    .sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
}

// ============================================================
// FITUR   : Pencarian tugas
// FUNGSI  : Mengisi elemen dengan teks judul dan menyorot bagian yang
//           cocok dengan kata kunci memakai elemen <mark>.
// ALUR    : Dipanggil renderSearchResults() untuk judul tiap hasil;
//           semua node dibuat lewat createTextNode/createElement,
//           bukan innerHTML, supaya judul seperti "<b>x</b>" hanya
//           tampil sebagai teks biasa.
// UBAH DI SINI: Tidak ada; gaya sorotan lewat mark di style.css.
// ============================================================
function fillHighlighted(el, text, query) {
  el.textContent = '';
  const q = String(query || '').trim().toLowerCase();
  const str = String(text);
  if (!q) {
    el.append(document.createTextNode(str));
    return;
  }
  const lower = str.toLowerCase();
  let last = 0;
  let idx = lower.indexOf(q);
  while (idx !== -1) {
    if (idx > last) el.append(document.createTextNode(str.slice(last, idx)));
    const mark = document.createElement('mark');
    mark.textContent = str.slice(idx, idx + q.length);
    el.append(mark);
    last = idx + q.length;
    idx = lower.indexOf(q, last);
  }
  if (last < str.length) el.append(document.createTextNode(str.slice(last)));
}

// ============================================================
// FITUR   : Pencarian tugas
// FUNGSI  : Menyembunyikan daftar hasil pencarian dan mengosongkan
//           isinya.
// ALUR    : Dipanggil event Escape, klik di luar .search, klik hasil,
//           dan saat kolom cari kosong.
// UBAH DI SINI: Tidak ada.
// ============================================================
function closeSearch() {
  els.searchResults.hidden = true;
  els.searchResults.textContent = '';
}

// ============================================================
// FITUR   : Pencarian tugas
// FUNGSI  : Menggambar daftar hasil pencarian di bawah kolom cari.
// ALUR    : Dipanggil event input dan focus #searchInput; tiap hasil
//           adalah tombol dua baris (judul + tanggal/jam/kategori)
//           yang saat diklik memindahkan kalender ke tanggalnya.
// UBAH DI SINI: Teks "Tidak ada tugas yang cocok." dan "+N hasil
//           lagi." ada di sini; jumlah hasil lewat CONFIG.
// ============================================================
function renderSearchResults() {
  const query = els.searchInput.value;
  if (!query.trim()) {
    closeSearch();
    return;
  }
  const results = searchTasks(query);
  const max = CONFIG.SEARCH_MAX_RESULTS;

  els.searchResults.textContent = '';
  if (!results.length) {
    const p = document.createElement('p');
    p.className = 'search-empty';
    p.textContent = 'Tidak ada tugas yang cocok.';
    els.searchResults.append(p);
    els.searchResults.hidden = false;
    return;
  }

  for (const task of results.slice(0, max)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'search-item' + (task.is_done ? ' is-done' : '');

    // Baris judul; bagian yang cocok dibungkus <mark> tanpa innerHTML.
    const titleEl = document.createElement('span');
    titleEl.className = 'search-title';
    fillHighlighted(titleEl, task.title, query);
    btn.append(titleEl);

    // Baris kecil: "Hari, tanggal bulan - jam - nama kategori".
    const d = new Date(task.due_at);
    const meta = [d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })];
    meta.push(hasTime(d) ? formatTime(d) : 'Seharian');
    const cat = task.category_id != null
      ? state.categories.find((c) => String(c.id) === String(task.category_id))
      : null;
    if (cat) meta.push(cat.name);
    const metaEl = document.createElement('span');
    metaEl.className = 'search-meta';
    metaEl.textContent = meta.join(' - ');
    btn.append(metaEl);

    btn.addEventListener('click', () => {
      // Filter kategori yang aktif bisa menyembunyikan tugas ini;
      // kalau begitu kembali ke "Semua" supaya tugasnya terlihat.
      const taskCat = task.category_id == null ? 'uncat' : String(task.category_id);
      if (state.currentCat !== 'all' && state.currentCat !== taskCat) selectCategory('all');
      const key = taskKey(task);
      if (key) selectDay(key);
      els.searchInput.value = '';
      closeSearch();
    });
    els.searchResults.append(btn);
  }

  if (results.length > max) {
    const more = document.createElement('p');
    more.className = 'search-more';
    more.textContent = '+' + (results.length - max) + ' hasil lagi. Perjelas kata kuncinya.';
    els.searchResults.append(more);
  }
  els.searchResults.hidden = false;
}

/* ---------------- Aksi tugas ---------------- */

async function addTask() {
  const raw = els.taskInput.value.trim();

  // ============================================================
  // FITUR   : Tulis tugas dengan bahasa biasa
  // FUNGSI  : Membaca ulang teks saat submit, lalu memilih judul,
  //           tanggal, jam, dan kategori dari hasil parser yang segar.
  // ALUR    : Kalau parser menemukan tanggal (dan tidak diabaikan),
  //           tanggal itulah yang dipakai untuk due_at; kalau tidak,
  //           perilaku lama berlaku (tanggal yang sedang dipilih).
  // UBAH DI SINI: QUICK_ADD_ENABLED di CONFIG mematikan penguraian
  //           ini sehingga perilaku lama kembali sepenuhnya.
  // ============================================================
  const parsed = CONFIG.QUICK_ADD_ENABLED && !state.quickIgnore ? parseQuickAdd(raw, new Date(), state.categories) : null;
  const title = (parsed ? parsed.title : raw).trim();
  if (!title) {
    setStatus('Judul tugas wajib diisi.', 'error');
    els.taskInput.focus();
    return;
  }

  // Jam dari parser dipakai kalau kolom jam kosong atau isinya memang
  // hasil otomatis; ketikan manual pengguna selalu menang.
  // Jam sekarang tetap wajib: tugas selalu punya tanggal dan waktu.
  let hh;
  let mm;
  if (parsed && parsed.hh != null && (state.timeAuto || !els.taskTime.value)) {
    hh = parsed.hh;
    mm = parsed.mm;
  } else {
    if (!els.taskTime.value) {
      setStatus('Jam tugas wajib diisi.', 'error');
      els.taskTime.focus();
      return;
    }
    [hh, mm] = els.taskTime.value.split(':').map(Number);
  }

  const dueKey = parsed && parsed.dateKey ? parsed.dateKey : state.selected;

  // ============================================================
  // FITUR   : Pilih kategori lewat hashtag di kolom judul
  // FUNGSI  : Memilih kategori tugas baru: hasil parser dipakai kalau
  //           ada dan kolom kategori masih otomatis atau kosong;
  //           pilihan manual pengguna selalu menang.
  // ALUR    : Menentukan category_id untuk body POST /api/tasks
  //           di bawah; tanpa kategori, field tidak dikirim.
  // UBAH DI SINI: Urutan prioritas parser vs kolom ada di sini.
  // ============================================================
  let categoryId = null;
  if (parsed && parsed.categoryId != null && (state.catAuto || !els.taskCategory.value)) {
    categoryId = Number(parsed.categoryId);
  } else if (els.taskCategory.value) {
    categoryId = Number(els.taskCategory.value);
  }

  const body = { title };
  if (categoryId != null) body.category_id = categoryId;
  body.due_at = keyToDate(dueKey, hh, mm).toISOString();

  setStatus('Menyimpan...', 'loading');
  try {
    const created = await api('/api/tasks', { method: 'POST', body });
    state.tasks.push(created);
    els.taskInput.value = '';
    els.taskTime.value = '';
    state.timeAuto = false;
    state.quickIgnore = false;
    state.catAuto = false;
    state.catBefore = '';
    els.quickPreview.hidden = true;
    clearStatus();
    // Filter kategori yang sedang aktif bisa menyembunyikan tugas baru
    // (kategorinya berbeda atau tanpa kategori); kalau begitu kembali
    // ke "Semua" supaya tugas barunya langsung terlihat.
    if (state.currentCat !== 'all'
      && String(created.category_id == null ? '' : created.category_id) !== String(state.currentCat)) {
      selectCategory('all');
    }
    // Kalender melompat ke tanggal tugas yang baru dibuat.
    selectDay(dueKey);
    renderSummary();
    renderCounts();
    const row = els.taskList.querySelector('.task[data-id="' + created.id + '"]');
    if (row) row.classList.add('is-new');
    const d = keyToDate(dueKey, hh, mm);
    showToast('Dijadwalkan', d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' }) + ' pukul ' + formatTime(d), 4000);
    els.taskInput.focus();
  } catch (err) {
    setStatus(err.message, 'error');
  }
}

async function toggleTask(id, row) {
  const task = state.tasks.find((t) => String(t.id) === String(id));
  if (!task) return;
  const next = task.is_done ? 0 : 1;

  // ============================================================
  // FITUR   : Konfeti saat semua tugas satu hari selesai
  // FUNGSI  : Mencatat keadaan hari terpilih SEBELUM centangan ini,
  //           sebagai syarat picuan konfeti.
  // ALUR    : Dipakai blok pemicu di bawah setelah PATCH berhasil.
  // UBAH DI SINI: Tidak ada; ambang minimal ada di CONFETTI_MIN_TASKS.
  // ============================================================
  const before = selectedTasks();
  const totalBefore = before.length;
  const doneBefore = before.filter((t) => t.is_done).length;

  // Centang langsung berubah; baris pindah urutan setelah animasi.
  task.is_done = next;
  row.classList.toggle('is-done', !!next);
  row.querySelector('.check').setAttribute('aria-pressed', String(!!next));
  renderCounts();
  renderCalendar();
  renderSummary();
  updateRing(); // cincin berubah seketika, tanpa menunggu renderPanel
  clearTimeout(row._move);
  row._move = setTimeout(renderPanel, 450);

  try {
    const updated = await api('/api/tasks/' + id, { method: 'PATCH', body: { is_done: !!next } });
    Object.assign(task, updated);

    // ============================================================
    // FITUR   : Konfeti saat semua tugas satu hari selesai
    // FUNGSI  : Memanggil launchConfetti() hanya pada perpindahan dari
    //           "belum semua selesai" menjadi "semua selesai".
    // ALUR    : Baru berjalan SETELAH PATCH berhasil, jadi konfeti tidak
    //           terpicu saat halaman dibuka, ganti tanggal, atau rollback.
    // UBAH DI SINI: Ambang jumlah tugas ada di CONFETTI_MIN_TASKS di CONFIG.
    // ============================================================
    const now = selectedTasks();
    if (
      next === 1 &&                                     // pengguna mencentang, bukan membatalkan
      doneBefore < totalBefore &&                       // sebelumnya belum semua selesai
      now.length > 0 && now.every((t) => t.is_done) && // sekarang semua selesai
      now.length >= CONFIG.CONFETTI_MIN_TASKS
    ) {
      launchConfetti();
    }
  } catch (err) {
    task.is_done = next ? 0 : 1; // batalkan
    updateRing(); // cincin ikut kembali ke keadaan semula
    clearTimeout(row._move);
    renderAll();
    setStatus(err.message, 'error');
  }
}

async function onDelete(id, row, btn) {
  // Klik pertama minta konfirmasi, klik kedua menghapus.
  if (!row.classList.contains('is-confirm')) {
    row.classList.add('is-confirm');
    btn.setAttribute('aria-label', 'Klik lagi untuk menghapus');
    clearTimeout(row._confirm);
    row._confirm = setTimeout(() => {
      row.classList.remove('is-confirm');
      btn.setAttribute('aria-label', 'Hapus tugas');
    }, 3000);
    return;
  }
  clearTimeout(row._confirm);
  try {
    await api('/api/tasks/' + id, { method: 'DELETE' });
    state.tasks = state.tasks.filter((t) => String(t.id) !== String(id));
    // Kalau tugas tanpa kategori terakhir dihapus, kembalikan filter ke "Semua".
    if (state.currentCat === 'uncat' && !state.tasks.some((t) => t.category_id == null)) {
      state.currentCat = 'all';
      renderCategories();
    }
    row.classList.add('is-removing');
    renderCounts();
    renderCalendar();
    renderSummary();
    setTimeout(renderPanel, 220);
  } catch (err) {
    row.classList.remove('is-confirm');
    setStatus(err.message, 'error');
  }
}

/* ---------------- Drag and drop ---------------- */

let dropTarget = null; // target yang sedang di-highlight saat dragover

function clearDropTarget() {
  if (dropTarget) dropTarget.classList.remove('is-drop-target');
  dropTarget = null;
}

function setDropTarget(el) {
  if (dropTarget === el) return;
  clearDropTarget();
  if (el) {
    el.classList.add('is-drop-target');
    dropTarget = el;
  }
}

// Bersihkan sisa seretan. Dipanggil dari drop dan dragend karena elemen
// sumber bisa sudah hilang saat render ulang.
function endDrag() {
  state.dragId = null;
  dropTarget = null;
  for (const el of document.querySelectorAll('.is-dragging, .is-drop-target')) {
    el.classList.remove('is-dragging', 'is-drop-target');
  }
}

// Delegasi dragstart: sumbernya baris .task atau chip .chip.
function onDragStart(e) {
  const source = e.target.closest('.task, .chip');
  if (!source || !source.dataset.id) return;

  state.dragId = String(source.dataset.id);
  source.classList.add('is-dragging');
  e.dataTransfer.setData('text/plain', state.dragId);
  e.dataTransfer.effectAllowed = 'move';
}

// dragover pada kotak tanggal harus preventDefault agar drop diizinkan.
function onCalendarDragOver(e) {
  if (state.dragId === null) return;

  const day = e.target.closest('.day');
  if (!day) {
    clearDropTarget();
    return;
  }

  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  setDropTarget(day);
}

// Target kategori adalah .cat selain "Semua"; #uncatFilter hanya jika terlihat.
function onCategoryDragOver(e) {
  if (state.dragId === null) return;

  const cat = e.target.closest('.cat');
  if (!cat || cat.dataset.cat === 'all' || cat.hidden) {
    clearDropTarget();
    return;
  }

  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  setDropTarget(cat);
}

function onCalendarDrop(e) {
  if (state.dragId === null) return;
  e.preventDefault();

  const day = e.target.closest('.day');
  if (!day) {
    endDrag();
    return;
  }

  const id = state.dragId;
  const targetKey = day.dataset.key;
  endDrag();
  moveTaskToDate(id, targetKey);
}

function onCategoryDrop(e) {
  if (state.dragId === null) return;
  e.preventDefault();

  const cat = e.target.closest('.cat');
  if (!cat || cat.dataset.cat === 'all' || cat.hidden) {
    endDrag();
    return;
  }

  const id = state.dragId;
  const targetCat = cat.dataset.cat;
  endDrag();
  moveTaskToCategory(id, targetCat);
}

async function moveTaskToDate(id, targetKey) {
  const task = state.tasks.find((t) => String(t.id) === String(id));
  if (!task || !task.due_at) return;

  const oldKey = taskKey(task);
  if (oldKey === targetKey) return; // tanggal sama: tidak ada yang berubah

  const oldDue = task.due_at;
  const oldDate = new Date(oldDue);
  // Jam dan menit lokal dipertahankan; hanya tanggalnya yang diganti.
  task.due_at = keyToDate(targetKey, oldDate.getHours(), oldDate.getMinutes()).toISOString();

  // Optimistic: tampilkan dulu, kirim ke server setelahnya.
  selectDay(targetKey);
  renderSummary();

  try {
    const updated = await api('/api/tasks/' + task.id, {
      method: 'PATCH',
      body: { due_at: task.due_at },
    });
    Object.assign(task, updated);
    selectDay(targetKey);
    renderSummary();
    const d = keyToDate(targetKey);
    showToast('Tugas dipindah', d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }), 3000);
  } catch (err) {
    task.due_at = oldDue; // batalkan perubahan optimistis
    selectDay(oldKey);
    renderSummary();
    setStatus(err.message, 'error');
  }
}

async function moveTaskToCategory(id, targetCat) {
  const task = state.tasks.find((t) => String(t.id) === String(id));
  if (!task) return;

  const oldCat = task.category_id;
  const nextCat = targetCat === 'uncat' ? null : Number(targetCat);
  const same = (oldCat == null && nextCat == null) ||
    (oldCat != null && nextCat != null && String(oldCat) === String(nextCat));
  if (same) return; // kategori sama: tidak ada yang berubah

  task.category_id = nextCat;

  // Optimistic: hitungan dan tampilan langsung mengikuti kategori baru.
  renderCounts();
  renderCalendar();
  renderPanel();
  renderSummary();

  try {
    const updated = await api('/api/tasks/' + task.id, {
      method: 'PATCH',
      body: { category_id: nextCat },
    });
    Object.assign(task, updated);
    const name = nextCat === null
      ? 'Tanpa kategori'
      : ((state.categories.find((c) => String(c.id) === String(nextCat)) || {}).name || 'Kategori');
    showToast('Tugas dipindah', name, 3000);
    renderCounts();
    renderCalendar();
    renderPanel();
    renderSummary();
  } catch (err) {
    task.category_id = oldCat; // batalkan perubahan optimistis
    renderCounts();
    renderCalendar();
    renderPanel();
    renderSummary();
    setStatus(err.message, 'error');
  }
}

/* ---------------- Event ---------------- */

els.taskForm.addEventListener('submit', (e) => {
  e.preventDefault();
  addTask();
});

// ============================================================
// FITUR   : Tulis tugas dengan bahasa biasa
// FUNGSI  : Menghubungkan kolom judul, kolom jam, kolom kategori, dan
//           tombol abaikan dengan parser quick add.
// ALUR    : Mengetik di #taskInput menjalankan parser setelah 150 ms
//           (debounce) lalu mengisi jam, kategori, dan pratinjau;
//           mengubah kolom jam/kategori dengan tangan menandainya
//           sebagai pilihan manual yang tidak boleh ditimpa; tombol x
//           menyembunyikan hasil parser untuk teks ini dan mengembalikan
//           semua isian otomatis.
// UBAH DI SINI: Jeda debounce (150 ms) di bawah ini.
// ============================================================
els.taskInput.addEventListener('input', () => {
  // Teks berubah: pengabaian sebelumnya tidak berlaku lagi.
  state.quickIgnore = false;
  clearTimeout(quickTimer);
  quickTimer = setTimeout(runQuickAdd, 150);
});

// Ketikan manual di kolom jam menimpa hasil otomatis parser.
els.taskTime.addEventListener('input', () => {
  state.timeAuto = false;
});

// Pilihan manual di kolom kategori menimpa hasil otomatis parser;
// setelah ini parser tidak mengubah kolomnya lagi untuk teks saat ini.
els.taskCategory.addEventListener('change', () => {
  state.catAuto = false;
});

// Tombol x: hasil parser untuk teks ini diabaikan sampai teks berubah,
// termasuk kategori yang sempat diisi otomatis.
els.quickIgnoreBtn.addEventListener('click', () => {
  state.quickIgnore = true;
  if (state.timeAuto) {
    els.taskTime.value = '';
    state.timeAuto = false;
  }
  if (state.catAuto) {
    els.taskCategory.value = state.catBefore;
    state.catAuto = false;
  }
  els.quickPreview.hidden = true;
});

// ============================================================
// FITUR   : Pencarian tugas
// FUNGSI  : Menghubungkan kolom cari dengan daftar hasil pencarian.
// ALUR    : Mengetik menampilkan daftar hasil; memfokuskan kolom yang
//           sudah berisi teks membuka daftar lagi; Escape mengosongkan
//           kolom dan menutup daftar; klik di luar .search menutup
//           daftar saja.
// UBAH DI SINI: Tidak ada; jumlah hasil lewat SEARCH_MAX_RESULTS
//           di CONFIG.
// ============================================================
els.searchInput.addEventListener('input', renderSearchResults);

// Fokus ke kolom yang sudah berisi teks membuka daftar lagi.
els.searchInput.addEventListener('focus', () => {
  if (els.searchInput.value.trim()) renderSearchResults();
});

// Escape: kosongkan kolom dan tutup daftar.
els.searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    els.searchInput.value = '';
    closeSearch();
  }
});

// Klik di luar .search (termasuk klik kalender) menutup daftar.
document.addEventListener('click', (e) => {
  if (!e.target.closest || !e.target.closest('.search')) closeSearch();
});

els.catForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = els.catInput.value.trim();
  if (!name) return;
  try {
    await addCategory(name);
    els.catInput.value = '';
    clearStatus();
  } catch (err) {
    setStatus(err.message, 'error');
  }
});

// Drag and drop memakai delegasi karena elemen dibuat ulang tiap render.
els.taskList.addEventListener('dragstart', onDragStart);
els.calGrid.addEventListener('dragstart', onDragStart);
els.calGrid.addEventListener('dragover', onCalendarDragOver);
els.catList.addEventListener('dragover', onCategoryDragOver);
els.calGrid.addEventListener('drop', onCalendarDrop);
els.catList.addEventListener('drop', onCategoryDrop);
document.addEventListener('dragend', endDrag);

els.catList.querySelector('[data-cat="all"]').addEventListener('click', () => selectCategory('all'));
els.uncatFilter.addEventListener('click', () => selectCategory('uncat'));
els.prevMonth.addEventListener('click', () => changeMonth(-1));
els.nextMonth.addEventListener('click', () => changeMonth(1));
els.todayBtn.addEventListener('click', () => {
  const now = new Date();
  state.viewYear = now.getFullYear();
  state.viewMonth = now.getMonth();
  state.selected = dateKey(now);
  renderAll();
});

/* ---------------- Mulai ---------------- */

async function load() {
  setStatus('Memuat...', 'loading');
  try {
    const [cats, tasks] = await Promise.all([api('/api/categories'), api('/api/tasks')]);
    state.categories = cats;
    state.tasks = tasks;
    clearStatus();
    renderCategories();
    renderAll();
  } catch (err) {
    setStatus(err.message, 'error', load);
  }
}

renderWeekdays();
renderHead();
setupRing();
load();

// Tanda "terlambat" ikut diperbarui tiap menit (tanpa notifikasi).
setInterval(() => {
  // Jangan menggambar ulang saat ada tugas yang sedang diseret.
  if (state.dragId !== null) return;
  renderSummary();
  renderCalendar();
  for (const row of els.taskList.children) {
    const task = state.tasks.find((t) => String(t.id) === row.dataset.id);
    const el = row.querySelector('.meta-due');
    if (task && el) el.classList.toggle('is-overdue', isOverdue(task));
  }
}, 60000);
