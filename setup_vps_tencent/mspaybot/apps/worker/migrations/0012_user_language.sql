-- Preferensi bahasa per user (untuk i18n: id / en / zh).
-- Default kosong = belum pilih, bot akan tampilkan language picker saat /start.
ALTER TABLE users ADD COLUMN language_code TEXT DEFAULT '';
