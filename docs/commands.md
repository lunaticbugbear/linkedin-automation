# Command reference

## add

`npm run registry -- add api.json` validates and stores one record.

## search

`npm run registry -- search "anime app" --profile frontend-only` returns ranked results.

## import

`npm run registry -- import public-apis.md` imports curated public API rows.

## refresh

`npm run registry -- refresh` lists stale APIs.

## audit

`npm run registry -- audit` checks schema, duplicates, source evidence, freshness, and registry health.

## export

`npm run registry -- export "weather dashboard" --format json` emits normalized JSON or Markdown for another skill.
