-- Cleanup gateway lama: pakai Violet sebagai satu-satunya payment gateway.
-- Hapus row settings untuk saweria/mspay agar tidak muncul lagi di admin.
DELETE FROM settings WHERE key IN (
  'saweria_username',
  'mspay_api_base_url',
  'mspay_api_key',
  'mspay_secret_key',
  'mspay_webhook_secret'
);

-- Pastikan gateway aktif = violet (idempotent).
INSERT INTO settings (key, value) VALUES ('payment_gateway', 'violet')
  ON CONFLICT(key) DO UPDATE SET value = 'violet';

-- Order lama: tetap pakai payment_provider mereka (untuk record history),
-- tapi normalisasi pending order yang masih saweria/mspay ke violet
-- hanya kalau memang ingin di-reset. Skip default; biar history tetap akurat.
