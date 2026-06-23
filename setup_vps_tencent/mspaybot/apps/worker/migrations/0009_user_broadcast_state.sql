-- Track user yang block bot biar broadcast skip mereka di kirim berikutnya.
-- Default 0 = aktif. Saat sendMessage return 403 (Forbidden / blocked), set ke 1.
ALTER TABLE users ADD COLUMN is_blocked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN blocked_at TEXT;

CREATE INDEX IF NOT EXISTS idx_users_active_broadcast ON users(is_blocked);

-- Tabel job broadcast: 1 row = 1 sesi broadcast.
-- Status: queued -> running -> done | failed.
-- Dipakai admin panel untuk lihat progress broadcast yang lagi jalan di background.
CREATE TABLE IF NOT EXISTS broadcast_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL DEFAULT 'queued',
  message TEXT NOT NULL,
  button_text TEXT,
  button_url TEXT,
  recipients INTEGER NOT NULL DEFAULT 0,
  sent INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  blocked INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_broadcast_jobs_created ON broadcast_jobs(created_at DESC);
