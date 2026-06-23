-- Cache hasil auto-translate (Workers AI) biar gak re-translate tiap view.
-- key = sha256(source_text + target_lang), value = hasil terjemahan.
CREATE TABLE IF NOT EXISTS translation_cache (
  cache_key TEXT PRIMARY KEY,
  target_lang TEXT NOT NULL,
  source_text TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
