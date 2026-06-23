-- Per-product emoji, settable by admin in the bot. Falls back to category-derived emoji when null.
ALTER TABLE products ADD COLUMN emoji TEXT;
