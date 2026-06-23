-- Pivot to pure self-stock store: remove the supplier/reseller/aggregator subsystem.
-- Drop child tables before parent. supplier_id/supplier_external_id no longer referenced by any query.
DROP TABLE IF EXISTS supplier_fulfillment_queue;
DROP TABLE IF EXISTS supplier_products;
DROP TABLE IF EXISTS suppliers;
ALTER TABLE products DROP COLUMN supplier_id;
ALTER TABLE products DROP COLUMN supplier_external_id;
