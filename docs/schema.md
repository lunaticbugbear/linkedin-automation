# Schema reference

## ApiRecord

Each record stores id, name, description, category, tags, homepage, docsUrl, auth, cors, pricing, status, fit, consumerProfiles, source, evidence, confidence, updatedAt, createdAt, and optional notes.

## field-level confidence

Every verified field can include field-level confidence from 1 to 10 with a source URL.

## evidence

Trusted records need evidence entries with URL, title, checkedAt, and excerpt. Confidence source URLs should match evidence URLs.

## registry health

registry health lives in `registry.json` with schema_version, last_imported_at, last_audited_at, freshness_days, health, and health_score.
