require('dotenv').config();

const path = require('path');
const express = require('express');
const mysql = require('mysql2/promise');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Database pool. Created from .env only; never from hardcoded credentials.
// timezone 'Z' makes DATETIME values read/written as UTC consistently.
// ---------------------------------------------------------------------------
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'todo_app',
  port: Number(process.env.DB_PORT) || 3306,
  timezone: 'Z',
  waitForConnections: true,
  connectionLimit: 5,
  dateStrings: false,
});

// True when required .env vars are present (env loaded, not DB reachable).
// Catatan: password kosong sah untuk MySQL lokal (mis. root tanpa password),
// jadi hanya DB_USER dan DB_NAME yang wajib terisi.
const dbConfigured = Boolean(
  process.env.DB_USER &&
  process.env.DB_NAME
);

function dbUnavailable(res) {
  res.status(503).json({
    error: 'Database belum terhubung. Salin .env.example menjadi .env, isi kredensial MySQL, lalu jalankan ulang: npm start',
  });
}

// Wrap every DB-touching handler so a connection error becomes clean JSON
// (500 with a message) instead of an unhandled crash.
async function withDb(req, res, fn) {
  if (!dbConfigured) return dbUnavailable(res);
  try {
    await fn();
  } catch (err) {
    if (err && (err.code === 'ECONNREFUSED' || err.code === 'ER_ACCESS_DENIED_ERROR' || err.code === 'ER_BAD_DB_ERROR' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND')) {
      return res.status(503).json({
        error: 'Database belum terhubung: ' + (err.code || 'unknown') + '. Cek kredensial di .env dan pastikan MySQL berjalan.',
      });
    }
    console.error('[db]', err);
    res.status(500).json({ error: 'Kesalahan database.', detail: err.code || String(err) });
  }
}

// ---------------------------------------------------------------------------
// Helpers / validation
// ---------------------------------------------------------------------------
function badRequest(res, message) {
  res.status(400).json({ error: message });
}

// Parse due_at. Accepts full ISO (recommended: "2026-11-10T14:30:00.000Z").
// Returns a JS Date (stored as UTC by mysql2) or null when input is null/''.
function parseDueAt(value) {
  if (value === null || value === undefined || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined; // signal: invalid
  return d;
}

function toBool01(value) {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value === 1 || value === 0) return value;
  if (value === 'true' || value === '1') return 1;
  if (value === 'false' || value === '0') return 0;
  return undefined; // signal: invalid
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
app.get('/api/categories', (req, res) => {
  withDb(req, res, async () => {
    const [rows] = await pool.query('SELECT id, name, created_at FROM categories ORDER BY id ASC');
    res.status(200).json(rows);
  });
});

app.post('/api/categories', (req, res) => {
  withDb(req, res, async () => {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name) return badRequest(res, 'Nama kategori wajib diisi.');
    if (name.length > 100) return badRequest(res, 'Nama kategori maksimal 100 karakter.');

    const [dup] = await pool.query('SELECT id FROM categories WHERE name = ?', [name]);
    if (dup.length > 0) return res.status(409).json({ error: 'Kategori dengan nama itu sudah ada.' });

    const [result] = await pool.query('INSERT INTO categories (name) VALUES (?)', [name]);
    const [rows] = await pool.query('SELECT id, name, created_at FROM categories WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  });
});

// Ubah nama kategori. Validasi sama dengan POST, tetapi nama milik kategori
// itu sendiri tidak dianggap duplikat (id <> ?).
app.patch('/api/categories/:id', (req, res) => {
  withDb(req, res, async () => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return badRequest(res, 'ID kategori tidak valid.');

    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name) return badRequest(res, 'Nama kategori wajib diisi.');
    if (name.length > 100) return badRequest(res, 'Nama kategori maksimal 100 karakter.');

    const [existing] = await pool.query('SELECT id FROM categories WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Kategori tidak ditemukan.' });

    const [dup] = await pool.query('SELECT id FROM categories WHERE name = ? AND id <> ?', [name, id]);
    if (dup.length > 0) return res.status(409).json({ error: 'Kategori dengan nama itu sudah ada.' });

    await pool.query('UPDATE categories SET name = ? WHERE id = ?', [name, id]);
    const [rows] = await pool.query('SELECT id, name, created_at FROM categories WHERE id = ?', [id]);
    res.status(200).json(rows[0]);
  });
});

// Hapus kategori. Tugas tidak ikut dihapus: FOREIGN KEY ... ON DELETE SET NULL
// di database otomatis mengubah category_id tugas menjadi NULL.
app.delete('/api/categories/:id', (req, res) => {
  withDb(req, res, async () => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return badRequest(res, 'ID kategori tidak valid.');

    const [result] = await pool.query('DELETE FROM categories WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Kategori tidak ditemukan.' });
    res.status(200).json({ ok: true, id: id });
  });
});

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
app.get('/api/tasks', (req, res) => {
  withDb(req, res, async () => {
    const categoryId = req.query.category_id;
    const params = [];
    let sql = 'SELECT id, category_id, title, is_done, due_at, created_at FROM tasks';

    if (categoryId !== undefined && categoryId !== null && String(categoryId).trim() !== '') {
      const id = Number(categoryId);
      if (!Number.isInteger(id) || id < 1) return badRequest(res, 'category_id harus berupa angka bulat positif.');
      sql += ' WHERE category_id = ?';
      params.push(id);
    }

    sql += ' ORDER BY is_done ASC, due_at IS NULL ASC, due_at ASC, created_at DESC';
    const [rows] = await pool.query(sql, params);
    res.status(200).json(rows);
  });
});

app.post('/api/tasks', (req, res) => {
  withDb(req, res, async () => {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    if (!title) return badRequest(res, 'Judul tugas wajib diisi.');
    if (title.length > 255) return badRequest(res, 'Judul tugas maksimal 255 karakter.');

    // category_id optional (nullable column)
    let categoryId = null;
    if (req.body.category_id !== undefined && req.body.category_id !== null && req.body.category_id !== '') {
      const id = Number(req.body.category_id);
      if (!Number.isInteger(id) || id < 1) return badRequest(res, 'category_id harus berupa angka bulat positif.');
      const [cat] = await pool.query('SELECT id FROM categories WHERE id = ?', [id]);
      if (cat.length === 0) return badRequest(res, 'Kategori tidak ditemukan.');
      categoryId = id;
    }

    // due_at optional; stored as UTC
    const dueAt = parseDueAt(req.body.due_at);
    if (dueAt === undefined) return badRequest(res, 'due_at tidak valid. Gunakan format ISO, mis. 2026-11-10T14:30:00.000Z');

    const [result] = await pool.query(
      'INSERT INTO tasks (category_id, title, is_done, due_at) VALUES (?, ?, 0, ?)',
      [categoryId, title, dueAt]
    );
    const [rows] = await pool.query(
      'SELECT id, category_id, title, is_done, due_at, created_at FROM tasks WHERE id = ?',
      [result.insertId]
    );
    res.status(201).json(rows[0]);
  });
});

app.patch('/api/tasks/:id', (req, res) => {
  withDb(req, res, async () => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return badRequest(res, 'ID tugas tidak valid.');

    const [existing] = await pool.query('SELECT id FROM tasks WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Tugas tidak ditemukan.' });

    const sets = [];
    const params = [];

    if (req.body.title !== undefined) {
      const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
      if (!title) return badRequest(res, 'Judul tugas wajib diisi.');
      if (title.length > 255) return badRequest(res, 'Judul tugas maksimal 255 karakter.');
      sets.push('title = ?');
      params.push(title);
    }

    if (req.body.is_done !== undefined) {
      const v = toBool01(req.body.is_done);
      if (v === undefined) return badRequest(res, 'is_done harus boolean.');
      sets.push('is_done = ?');
      params.push(v);
    }

    if (req.body.due_at !== undefined) {
      const dueAt = parseDueAt(req.body.due_at);
      if (dueAt === undefined) return badRequest(res, 'due_at tidak valid. Gunakan format ISO, mis. 2026-11-10T14:30:00.000Z');
      sets.push('due_at = ?');
      params.push(dueAt);
    }

    // null atau '' berarti tugas menjadi tanpa kategori; selain itu wajib
    // berupa id kategori yang benar-benar ada.
    if (req.body.category_id !== undefined) {
      let categoryId = null;
      if (req.body.category_id !== null && req.body.category_id !== '') {
        const catId = Number(req.body.category_id);
        if (!Number.isInteger(catId) || catId < 1) return badRequest(res, 'category_id harus berupa angka bulat positif.');
        const [cat] = await pool.query('SELECT id FROM categories WHERE id = ?', [catId]);
        if (cat.length === 0) return badRequest(res, 'Kategori tidak ditemukan.');
        categoryId = catId;
      }
      sets.push('category_id = ?');
      params.push(categoryId);
    }

    if (sets.length === 0) return badRequest(res, 'Tidak ada field yang diubah. Kirim title, is_done, due_at, atau category_id.');

    params.push(id);
    await pool.query('UPDATE tasks SET ' + sets.join(', ') + ' WHERE id = ?', params);
    const [rows] = await pool.query(
      'SELECT id, category_id, title, is_done, due_at, created_at FROM tasks WHERE id = ?',
      [id]
    );
    res.status(200).json(rows[0]);
  });
});

app.delete('/api/tasks/:id', (req, res) => {
  withDb(req, res, async () => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return badRequest(res, 'ID tugas tidak valid.');

    const [result] = await pool.query('DELETE FROM tasks WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Tugas tidak ditemukan.' });
    res.status(200).json({ ok: true, id: id });
  });
});

// ---------------------------------------------------------------------------
// SPA fallback + 404 + error handler
// ---------------------------------------------------------------------------
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan.' });
});

app.use((err, req, res, next) => {
  console.error('[server]', err);
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Body JSON tidak valid.' });
  }
  res.status(500).json({ error: 'Kesalahan internal server.' });
});

// ---------------------------------------------------------------------------
// Cek koneksi MySQL saat startup.
// Error asli dari pool.getConnection() dicetak dengan console.error supaya
// penyebabnya terlihat jelas di console (host salah, akses ditolak, dsb.).
// ---------------------------------------------------------------------------
async function checkDbAtStartup() {
  try {
    const conn = await pool.getConnection();
    conn.release();
    console.log('[mysql] koneksi OK: ' + (process.env.DB_NAME || 'todo_app') + '@' + (process.env.DB_HOST || 'localhost'));
  } catch (err) {
    console.error('[mysql] GAGAL TERHUBUNG saat startup:', err);
  }
}

const BASE_PORT = Number(process.env.PORT) || 3000;

// Kalau port sudah dipakai (mis. server lama masih jalan), coba port berikutnya
// dan beri tahu jelas, bukan crash dengan error panjang.
function start(port, retriesLeft) {
  const server = app.listen(port, () => {
    console.log('Server berjalan di http://localhost:' + port);
    if (!dbConfigured) {
      console.log('PERINGATAN: .env tidak lengkap. Salin .env.example menjadi .env dan isi kredensial MySQL.');
    }
    checkDbAtStartup();
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && retriesLeft > 0) {
      console.warn('Port ' + port + ' sudah dipakai program lain, mencoba port ' + (port + 1) + '...');
      start(port + 1, retriesLeft - 1);
    } else {
      console.error('Server gagal berjalan:', err.message);
      process.exit(1);
    }
  });
}

start(BASE_PORT, 10);
