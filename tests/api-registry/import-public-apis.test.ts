import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importPublicApis, parsePublicApisMarkdown } from '../../src/api-registry/import-public-apis.js';
import type { ApiRecord } from '../../src/api-registry/types.js';

const categories = ['data', 'weather', 'jobs', 'developer-tools'];
const samplePath = join(process.cwd(), 'tests/api-registry/fixtures/public-apis-sample.md');

function baseRecord(overrides: Partial<ApiRecord> = {}): ApiRecord {
  return {
    id: 'cat-facts',
    name: 'Cat Facts',
    description: 'Old cat facts',
    category: 'data',
    tags: ['old'],
    homepage: 'https://catfact.ninja',
    auth: 'No',
    cors: 'yes',
    pricing: 'free',
    status: 'trusted',
    fit: { frontend: 5, backend: 5, prototype: 5, production: 5, mobile: 5, dashboard: 5, automation: 5 },
    consumerProfiles: ['prototype'],
    source: { name: 'existing', url: 'https://example.com', importedAt: '2026-05-12T00:00:00Z' },
    evidence: [],
    confidence: [{ field: 'description', confidence: 2 }],
    updatedAt: '2026-05-12T00:00:00Z',
    createdAt: '2026-05-12T00:00:00Z',
    notes: [],
    ...overrides,
  };
}

describe('parsePublicApisMarkdown', () => {
  it('parses Markdown table rows from public-apis style source', () => {
    const rows = parsePublicApisMarkdown(readFileSync(samplePath, 'utf8'));

    expect(rows).toHaveLength(7);
    expect(rows[0]).toMatchObject({
      api: 'Cat Facts',
      description: 'Daily cat facts',
      auth: 'No',
      https: 'Yes',
      cors: 'Yes',
      link: 'https://catfact.ninja',
      category: 'Animals',
    });
  });
});

describe('importPublicApis', () => {
  it('maps public-apis categories to canonical categories', () => {
    const report = importPublicApis({
      markdown: '| API | Description | Auth | HTTPS | CORS | Link | Category |\n| --- | --- | --- | --- | --- | --- | --- |\n| Cat Facts | Daily cat facts | No | Yes | Yes | https://catfact.ninja | Animals |',
      existingRecords: [],
      categories,
      today: '2026-05-13',
    });

    expect(report.records[0].category).toBe('data');
    expect(report.records[0].tags).toContain('animals');
  });

  it('normalizes auth, HTTPS, and CORS values', () => {
    const report = importPublicApis({
      markdown: '| API | Description | Auth | HTTPS | CORS | Link | Category |\n| --- | --- | --- | --- | --- | --- | --- |\n| Weather API | Forecast data | apiKey | Yes | Unknown | https://weather.example.com | Weather |\n| Jobs Board | Job listings | OAuth | No | No | http://jobs.example.com | Jobs |',
      existingRecords: [],
      categories,
      today: '2026-05-13',
    });

    expect(report.records.map((record) => ({ name: record.name, auth: record.auth, cors: record.cors, status: record.status }))).toEqual([
      { name: 'Weather API', auth: 'apiKey', cors: 'unknown', status: 'needs_review' },
      { name: 'Jobs Board', auth: 'OAuth', cors: 'no', status: 'needs_review' },
    ]);
    expect(report.records[1].notes).toContain('public-apis HTTPS is not Yes');
  });

  it('validates every bounded chunk before adding to pending result', () => {
    const markdown = '| API | Description | Auth | HTTPS | CORS | Link | Category |\n| --- | --- | --- | --- | --- | --- | --- |\n| Valid One | Good row | No | Yes | Yes | https://one.example.com | Animals |\n| Malformed API | Broken row | No | Yes |';

    const report = importPublicApis({ markdown, existingRecords: [], categories, today: '2026-05-13', chunkSize: 2 });

    expect(report.records).toEqual([]);
    expect(report.added).toBe(0);
    expect(report.rejected).toHaveLength(1);
    expect(report.findings.some((finding) => finding.code === 'chunk_rejected')).toBe(true);
  });

  it('marks incomplete rows as needs_review', () => {
    const report = importPublicApis({
      markdown: '| API | Description | Auth | HTTPS | CORS | Link | Category |\n| --- | --- | --- | --- | --- | --- | --- |\n| Incomplete API |  | No | Yes | Yes | https://incomplete.example.com | Animals |',
      existingRecords: [],
      categories,
      today: '2026-05-13',
    });

    expect(report.records[0].status).toBe('needs_review');
    expect(report.needs_review).toBe(1);
  });

  it('rejects malformed rows', () => {
    const report = importPublicApis({
      markdown: '| API | Description | Auth | HTTPS | CORS | Link | Category |\n| --- | --- | --- | --- | --- | --- | --- |\n| Malformed API | Broken row | No | Yes |',
      existingRecords: [],
      categories,
      today: '2026-05-13',
    });

    expect(report.records).toEqual([]);
    expect(report.rejected).toHaveLength(1);
    expect(report.rejected[0].reason).toContain('Expected 7 columns');
  });

  it('uses merge rules for duplicate rows', () => {
    const report = importPublicApis({
      markdown: '| API | Description | Auth | HTTPS | CORS | Link | Category |\n| --- | --- | --- | --- | --- | --- | --- |\n| Cat Facts | Better cat facts | apiKey | Yes | Yes | https://catfact.ninja | Animals |',
      existingRecords: [baseRecord()],
      categories,
      today: '2026-05-13',
    });

    expect(report.records).toHaveLength(1);
    expect(report.records[0]).toMatchObject({ id: 'cat-facts', description: 'Better cat facts', auth: 'apiKey' });
    expect(report.updated).toBe(1);
    expect(report.duplicate).toBe(1);
  });

  it('stores uncertain fields as unknown', () => {
    const report = importPublicApis({
      markdown: '| API | Description | Auth | HTTPS | CORS | Link | Category |\n| --- | --- | --- | --- | --- | --- | --- |\n| Half Known | Needs manual review | ? | Yes | ? | https://unknown.example.com | Unknown |',
      existingRecords: [],
      categories,
      today: '2026-05-13',
    });

    expect(report.records[0]).toMatchObject({ auth: 'unknown', cors: 'unknown', category: 'data', status: 'needs_review' });
    expect(report.records[0].confidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'auth', confidence: 2 }),
      expect.objectContaining({ field: 'cors', confidence: 2 }),
      expect.objectContaining({ field: 'category', confidence: 2 }),
    ]));
  });

  it('reports counts for added, updated, skipped, trusted, needs_review, rejected, and duplicate records', () => {
    const markdown = '| API | Description | Auth | HTTPS | CORS | Link | Category |\n| --- | --- | --- | --- | --- | --- | --- |\n| Cat Facts | Daily cat facts | apiKey | Yes | Yes | https://catfact.ninja | Animals |\n| Weather API | Forecast data | apiKey | Yes | Unknown | https://weather.example.com | Weather |\n| Jobs Board | Job listings | OAuth | No | No | http://jobs.example.com | Jobs |\n| Half Known | Needs manual review | ? | Yes | ? | https://unknown.example.com | Unknown |';
    const report = importPublicApis({
      markdown,
      existingRecords: [baseRecord()],
      categories,
      today: '2026-05-13',
      chunkSize: 20,
    });

    expect(report.added).toBe(3);
    expect(report.updated).toBe(1);
    expect(report.skipped).toBe(0);
    expect(report.trusted).toBe(1);
    expect(report.needs_review).toBe(3);
    expect(report.rejected).toHaveLength(0);
    expect(report.duplicate).toBe(1);
    expect(report.records).toHaveLength(4);
  });
});
