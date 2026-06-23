ALTER TABLE orders ADD COLUMN payment_provider TEXT NOT NULL DEFAULT 'saweria';

INSERT OR IGNORE INTO settings (key, value) VALUES ('payment_gateway', 'saweria');
INSERT OR IGNORE INTO settings (key, value) VALUES ('mspay_api_base_url', 'https://mspay-gateway.renopurae.workers.dev');
INSERT OR IGNORE INTO settings (key, value) VALUES ('mspay_api_key', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('mspay_secret_key', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('mspay_webhook_secret', '');
