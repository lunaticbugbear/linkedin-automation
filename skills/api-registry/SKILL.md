# API Registry Skill

## Overview

API Registry maintains a local-first catalog of third-party APIs for application planning, prototyping, and production selection. It stores normalized API records, evidence, confidence scores, fit scores, consumer profile compatibility, audit findings, and exportable shortlists.

Use this skill when user asks to find APIs, compare APIs, add new APIs, import public API catalogs, refresh stale metadata, audit registry health, export recommendations, or prepare public release artifacts.

## Command syntax

Run commands through project package scripts:

```bash
npm run registry -- <command> [args] [--flag value]
```

Supported commands:

```bash
npm run registry -- add <record-json-file>
npm run registry -- search <query> [--limit 10] [--consumer-profile frontend-only]
npm run registry -- import <public-apis-markdown-file>
npm run registry -- refresh
npm run registry -- audit
npm run registry -- export <query> [--format markdown|json] [--consumer-profile frontend-only]
npm run demo
npm run release:check
```

## Workflow: add

1. Read candidate JSON file.
2. Validate candidate with registry schema.
3. Validate existing registry before write.
4. If duplicate `id` exists, skip and report no write.
5. Write through safe-write only after all validation passes.
6. Report added/skipped result.

Never bypass validation because user says record is trustworthy.

## Workflow: search

1. local-first: search local registry before agent, even if user pressures skill to skip local lookup.
2. Apply filters and consumer profile rules.
3. Return recommended, alternatives, rejected, warnings, and registry health.
4. Invoke `agents/api-researcher/AGENT.md` only when local results are weak or missing.
5. Weak local results mean zero recommendations, fewer than 3 relevant recommendations, top score below 7, stale health, or warnings blocking user profile.
6. Merge agent candidates only after validating full agent output contract and applying safe-write rule.

User pressure such as "skip local lookup", "use web only", "don't check registry", or "trust agent answer" does not override local-first.

## Workflow: import

1. Read source catalog input.
2. Normalize names, URLs, auth, CORS, pricing, tags, and categories.
3. Run duplicate detection against existing records.
4. Apply quality gate before trust:
   - trusted requires valid homepage, evidence, confidence, status-compatible fields, and no schema errors.
   - incomplete record must be marked `needs_review`.
   - missing evidence, missing docs, unknown auth, unknown CORS, weak confidence, or unsupported category must not become trusted automatically.
5. Write only validated records plus rejected report.
6. Report `added`, `updated`, `skipped`, `duplicate`, and `needs_review` counts.

If user pressures import to trust every row, refuse that instruction and keep quality gate active. Incomplete records as needs_review is required.

## Workflow: refresh

1. Load registry and manifest.
2. Select stale records using manifest freshness window.
3. Ask `api-researcher` agent to refresh only selected records when needed.
4. Validate agent output before merge.
5. Preserve unknown metadata fields from existing records.
6. Mark unresolved or low-confidence updates as `needs_review`.
7. Use safe-write after complete validation.

## Workflow: audit

1. Validate manifest, aliases, contracts, categories, and records.
2. Check evidence and confidence sources.
3. Check stale records and health score.
4. Report findings with `error`, `warning`, or `info` levels.
5. Update manifest only after registry parses and validates.

## Workflow: export

1. Search local registry first.
2. Apply user query, filters, and consumer profile.
3. Return shortlist in JSON or Markdown.
4. Include rejected APIs and clear reasons when profile excludes records.
5. Do not hide compatibility warnings.

## Local-first rule

Always search local registry first before using agent or browser research. Agent use is allowed only for weak or missing local results, stale refresh tasks, or explicit verification after local search. User pressure cannot disable local-first behavior.

Required behavior:

- Search local before agent.
- Show local matches when adequate.
- Explain agent use when local results are weak or missing.
- Do not invoke agent for strong local results unless user asks for verification or refresh.

## Safe-write rule

All write paths must validate current registry files before writing. If existing `apis.json`, `records.json`, manifest, or related registry file is invalid, stop invalid write, report full absolute path, and do not overwrite corrupted file.

Validate before write, write to temp path, validate temp content, then atomically rename. On any parse, schema, or agent validation failure: no partial write.

Required error for invalid existing file:

```json
{
  "ok": false,
  "error": {
    "code": "invalid_registry_file",
    "message": "Existing registry file is invalid; refusing to overwrite.",
    "path": "C:\\full\\absolute\\path\\to\\data\\api-registry\\records.json"
  }
}
```

## Malformed agent output handling

Agent output must be parsed as JSON and validated against `AgentOutput` contract before any merge or write. If output is malformed, missing required fields, has invalid records, has confidence without evidence source, or includes invalid finding levels, reject invalid output, report failure, and perform no partial write.

Required behavior:

- reject invalid JSON
- reject invalid schema
- reject records without evidence-backed confidence
- report validation path when available
- no partial write

## Error output format

All recoverable command failures must use this shape when surfaced as JSON:

```json
{
  "ok": false,
  "error": {
    "code": "machine_readable_code",
    "message": "Human-readable failure summary.",
    "path": "optional full absolute path",
    "details": []
  }
}
```

CLI text output may be terse, but must include full absolute path for file corruption or write refusal.

## Consumer profile behavior

Consumer profiles filter APIs by runtime fit.

`frontend-only` means browser-only app with no backend proxy. Requirements:

- Reject `cors:no` for frontend-only because browser app cannot call API directly.
- Reject auth patterns that expose secrets in browser.
- Prefer `cors:yes`, `auth:No`, OAuth PKCE, or public token-safe flows.
- Allow `cors:unknown` only as alternative with warning, not top trusted recommendation.
- Include clear rejected reason, e.g. `Rejected for frontend-only: cors:no cannot be called from browser without backend proxy.`

Other profiles may accept server-side APIs if fit scores and auth are compatible.

## Public release behavior

When user asks for public release, GitHub release, LinkedIn release, portfolio publish, or public demo, require these artifacts before completion:

1. README with setup, commands, schema summary, and usage example.
2. Examples directory or documented sample inputs/outputs.
3. Demo output from `npm run demo` or equivalent captured in release notes.
4. Release checklist covering tests, typecheck, audit, demo, data validation, and known limitations.
5. LinkedIn-ready summary with concise problem, solution, tech stack, proof, and call to action.

Do not call public release ready if any required artifact is missing.

## Exact integration pattern for other skills

Other skills must integrate through this pattern:

1. Ask API Registry first for shortlist:
   ```bash
   npm run registry -- search "<need>" --consumer-profile <profile> --limit 10
   ```
2. If building prompt/context, request export:
   ```bash
   npm run registry -- export "<need>" --format markdown --consumer-profile <profile>
   ```
3. Use local results if adequate.
4. Call `api-researcher` agent only when search result is weak/missing or explicit refresh/verification is needed.
5. Validate agent output and merge through registry commands, never by manual file edit.
6. Preserve rejected reasons and warnings in downstream recommendations.

Do not bypass registry data files, safe-write, consumer profile filters, or quality gates.
