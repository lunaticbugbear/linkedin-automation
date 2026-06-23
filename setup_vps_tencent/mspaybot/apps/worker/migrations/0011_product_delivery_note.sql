-- Tambah delivery note dan terms link untuk tiap produk.
-- delivery_note: panduan/syarat/note custom yang muncul di pesan delivery
--                bot Telegram & detail order miniapp. Mendukung HTML basic.
-- terms_url:     link halaman syarat/garansi (opsional). Render sebagai
--                inline button di pesan delivery kalau diisi.
ALTER TABLE products ADD COLUMN delivery_note TEXT;
ALTER TABLE products ADD COLUMN terms_url TEXT;
