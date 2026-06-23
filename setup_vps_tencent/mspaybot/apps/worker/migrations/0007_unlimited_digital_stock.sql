-- Tambah dukungan produk digital file dengan stok tak terbatas (1 file = unlimited download).
-- Tidak mengubah skema lama. Kolom default 0/NULL agar produk inventory tetap berjalan apa adanya.
ALTER TABLE products ADD COLUMN is_unlimited_stock INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN digital_file_pointer TEXT;
