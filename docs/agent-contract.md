# Agent contract

## api-researcher

api-researcher verifies APIs when local registry data is missing, stale, or uncertain.

## input contract

Input includes query, optional category, optional consumerProfile, optional maxResults, and optional refresh.

## output contract

Output includes query, generatedAt, results, and findings. Each result includes a validated ApiRecord, score, matched_fields, matched_terms, and warnings.

## malformed output

Malformed output must be rejected. Caller should keep existing registry data unchanged and report validation errors.
