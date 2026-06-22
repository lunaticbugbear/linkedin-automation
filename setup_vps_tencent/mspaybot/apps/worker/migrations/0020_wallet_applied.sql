-- Track the internal-wallet portion applied to an order so cancel/expire/fail paths
-- can refund it. wallet_refunded guards against double-credit (idempotent refund).
ALTER TABLE orders ADD COLUMN wallet_applied INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN wallet_refunded INTEGER NOT NULL DEFAULT 0;
