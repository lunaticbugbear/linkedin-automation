-- Markup harga per-supplier (persen). Default 25% (tengah 20-30%).
ALTER TABLE suppliers ADD COLUMN markup_percent REAL DEFAULT 25;
