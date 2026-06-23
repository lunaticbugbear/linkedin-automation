-- Supplier Manager — integrasi bot store eksternal sebagai aggregator.
CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                     -- nama supplier
  api_key TEXT NOT NULL,                  -- API key reseller
  base_url TEXT NOT NULL,                 -- base endpoint API (contoh: https://bot.example.com/api/v1)
  is_active INTEGER DEFAULT 1,            -- 0 = disable
  last_sync_at TEXT,                      -- terakhir sync katalog
  products_count INTEGER DEFAULT 0,       -- jumlah produk dari supplier
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Cache katalog dari supplier (hasil sync).
CREATE TABLE IF NOT EXISTS supplier_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  external_id TEXT NOT NULL,              -- product_id dari supplier
  title TEXT NOT NULL,
  price REAL NOT NULL,
  currency TEXT DEFAULT 'IDR',
  description TEXT,
  available INTEGER DEFAULT 1,            -- 1=aktif, 0=habis
  synced_at TEXT DEFAULT (datetime('now')),
  UNIQUE(supplier_id, external_id)
);
