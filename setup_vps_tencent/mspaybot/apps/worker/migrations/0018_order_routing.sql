-- Link produk ke supplier (kalau dari aggregator). NULL = produk lokal.
ALTER TABLE products ADD COLUMN supplier_id INTEGER DEFAULT NULL;
ALTER TABLE products ADD COLUMN supplier_external_id TEXT DEFAULT NULL;

-- Queue order yang nunggu fulfillment supplier (saldo kurang / gagal).
CREATE TABLE IF NOT EXISTS supplier_fulfillment_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  supplier_id INTEGER NOT NULL,
  supplier_external_id TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  status TEXT DEFAULT 'queued',   -- queued | fulfilled | failed
  reason TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
