-- Poin/saldo per user — otomatis nambah tiap order paid/delivered.
ALTER TABLE users ADD COLUMN wallet_points INTEGER DEFAULT 0;

-- Tabel refund requests.
CREATE TABLE IF NOT EXISTS refund_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'pending',  -- pending | approved | rejected
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
