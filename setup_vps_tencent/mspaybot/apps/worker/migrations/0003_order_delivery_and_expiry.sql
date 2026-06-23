ALTER TABLE stock_items ADD COLUMN sold_in_order_id INTEGER;
ALTER TABLE orders ADD COLUMN delivery_payload TEXT;
INSERT OR IGNORE INTO settings (key, value) VALUES ('checkout_expiry_minutes', '60');
