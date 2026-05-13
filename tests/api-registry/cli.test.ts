import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCli } from '../../src/api-registry/cli.js';
import { bootstrapRegistry, registryFilePath } from '../../src/api-registry/bootstrap.js';
import type { ApiRecord } from '../../src/api-registry/types.js';

function record(overrides: Partial<ApiRecord> = {}): ApiRecord {
  return {
    id: 'weather-api',
    name: 'Weather API',
    description: 'Forecast data',
    category: 'weather',
    tags: ['weather', 'forecast'],
    homepage: 'https://weather.example.com',
    docsUrl: 'https://weather.example.com/docs',
    auth: 'No',
    cors: 'yes',
    pricing: 'free',
    status: 'trusted',
    fit: { frontend: 8, backend: 7, prototype: 9, production: 7, mobile: 8, dashboard: 8, automation: 6 },
    consumerProfiles: ['frontend-only', 'prototype'],
    source: { name: 'test', url: 'https://source.example.com', importedAt: '2026-05-13' },
    evidence: [{ url: 'https://weather.example.com/docs', title: 'Docs', checkedAt: '2026-05-13', excerpt: 'Auth: none' }],
    confidence: [{ field: 'docsUrl', confidence: 8, source: 'https://weather.example.com/docs' }],
    updatedAt: '2026-05-13',
    createdAt: '2026-05-13',
    ...overrides,
  };
}

describe('runCli', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'registry-cli-'));
    bootstrapRegistry(tempDir);
    writeFileSync(registryFilePath('records.json', tempDir), JSON.stringify([record()], null, 2));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('adds a record from JSON and returns deterministic summary', async () => {
    const addPath = join(tempDir, 'add.json');
    writeFileSync(addPath, JSON.stringify(record({ id: 'jobs-api', name: 'Jobs API', category: 'jobs', tags: ['jobs'], homepage: 'https://jobs.example.com', docsUrl: 'https://jobs.example.com/docs' }), null, 2));

    const output = await runCli(['add', addPath], tempDir);

    expect(output).toContain('add: added jobs-api');
    expect(await runCli(['search', 'jobs'], tempDir)).toContain('1. Jobs API [jobs] score=');
  });

  it('searches registry records with deterministic ranking output', async () => {
    const output = await runCli(['search', 'forecast', '--limit', '1'], tempDir);
    expect(output).toContain('search: forecast');
    expect(output).toContain('1. Weather API [weather] score=');
  });

  it('imports public-apis markdown from a local file', async () => {
    const importPath = join(tempDir, 'public-apis.md');
    writeFileSync(importPath, '| API | Description | Auth | HTTPS | CORS | Link | Category |\n| --- | --- | --- | --- | --- | --- | --- |\n| Cat Facts | Daily cat facts | No | Yes | Yes | https://catfact.ninja | Animals |');

    const output = await runCli(['import', importPath], tempDir);

    expect(output).toBe('import: source=public-apis added=1 updated=0 skipped=0 duplicate=0 needs_review=0');
  });

  it('refresh reports stale records without changing network state', async () => {
    writeFileSync(registryFilePath('records.json', tempDir), JSON.stringify([record({ updatedAt: '2025-01-01', evidence: [{ url: 'https://weather.example.com/docs', checkedAt: '2025-01-01' }] })], null, 2));

    const output = await runCli(['refresh'], tempDir);

    expect(output).toBe('refresh: stale=1\n- weather-api Weather API updatedAt=2025-01-01');
  });

  it('audits registry, updates manifest, and prints deterministic summary', async () => {
    const output = await runCli(['audit'], tempDir);
    expect(output).toBe('audit: records=1 errors=0 warnings=0 health=ok score=10');
  });

  it('exports shortlist as markdown or json', async () => {
    const markdown = await runCli(['export', 'forecast', '--format', 'markdown'], tempDir);
    const json = await runCli(['export', 'forecast', '--format', 'json'], tempDir);

    expect(markdown).toContain('# API shortlist: forecast');
    expect(json).toContain('"query": "forecast"');
  });
});
