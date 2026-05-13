# Contributing

## Registry changes

- Add or update records in `data/api-registry/apis.json`.
- Preserve source provenance for every record.
- Add evidence URLs for trusted records.
- Use `unknown` instead of guessing auth, CORS, or pricing.

## Validation

Run:

```bash
npm test -- tests/api-registry/release-artifacts.test.ts
npm run typecheck
npm test
```

## Documentation

Update docs and examples when command output, schema, or source policy changes.
