-- Saldo internal buyer (IDR) — terisi dari refund. Beda dari wallet_points (loyalty).
ALTER TABLE users ADD COLUMN wallet_balance INTEGER DEFAULT 0;
