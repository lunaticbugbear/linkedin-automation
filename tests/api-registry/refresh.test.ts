import { describe, expect, it } from 'vitest';
import validFixture from './fixtures/valid-agent-output.json' with { type: 'json' };
import malformedFixture from './fixtures/malformed-agent-output.json' with { type: 'json' };
import type { AgentOutput, ApiRecord, RegistryManifest } from '../../src/api-registry/types.js';
import { applyRefreshResults, normalizeAgentRecords, selectStaleRecords } from '../../src/api-registry/refresh.js';

const manifest: RegistryManifest = {
  schema_version: 'api-registry',
  last_imported_at: '2026-05-13',
  last_audited_at: '2026-05-13',
  freshness_days: 90,
  health: 'ok',
  health_score: 8.7,
};

function record(overrides: Partial<ApiRecord>): ApiRecord {
  return {
    id: 'base',
    name: 'Base API',
    description: 'Generic API',
    category: 'developer-tools',
    tags: ['generic'],
    homepage: 'https://example.com',
    docsUrl: 'https://example.com/docs',
    auth: 'No',
    cors: 'yes',
    pricing: 'free',
    status: 'trusted',
    fit: { frontend: 5, backend: 5, prototype: 5, production: 5, mobile: 5, dashboard: 5, automation: 5 },
    consumerProfiles: ['prototype'],
    source: { name: 'test', url: 'https://example.com', importedAt: '2026-05-13' },
    evidence: [{ url: 'https://example.com/docs', title: 'Docs', checkedAt: '2026-05-13', excerpt: 'Evidence' }],
    confidence: [{ field: 'docsUrl', confidence: 8, source: 'https://example.com/docs' }],
    updatedAt: '2026-05-13',
    createdAt: '2026-05-13',
    ...overrides,
  };
}

describe('normalizeAgentRecords', () => {
  it('accepts valid agent output and returns normalized records', () => {
    const records = normalizeAgentRecords(validFixture as AgentOutput, ['weather']);
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe('open-meteo');
  });

  it('rejects malformed output with formatted error', () => {
    expect(() => normalizeAgentRecords(malformedFixture as AgentOutput, ['weather'])).toThrow(
      'Invalid agent payload at $.results[0].record.confidence[0].source',
    );
  });

  it('rejects partial malformed output without returning partial records', () => {
    const validResult = (validFixture as AgentOutput).results[0];
    const output = {
      query: 'mixed',
      generatedAt: '2026-05-13T00:00:00Z',
      results: [validResult, (malformedFixture as AgentOutput).results[0]],
      findings: [],
    };
    expect(() => normalizeAgentRecords(output as AgentOutput, ['weather'])).toThrow('$.results[1].record.confidence[0].source');
  });

  it('preserves unknown metadata on accepted records', () => {
    const output = {
      ...(validFixture as AgentOutput),
      results: [
        {
          ...(validFixture as AgentOutput).results[0],
          record: {
            ...(validFixture as AgentOutput).results[0].record,
            notes: ['keep me'],
          },
        },
      ],
    };
    const records = normalizeAgentRecords(output as AgentOutput, ['weather']);
    expect(records[0].notes).toEqual(['keep me']);
  });
});

describe('selectStaleRecords', () => {
  it('selects stale records by checked_at freshness window', () => {
    const records = [
      record({ id: 'fresh', updatedAt: '2025-01-01', evidence: [{ url: 'https://example.com/docs', checkedAt: '2026-05-01' }] }),
      record({ id: 'stale', updatedAt: '2026-05-01', evidence: [{ url: 'https://example.com/docs', checkedAt: '2025-12-01' }] }),
      record({ id: 'borderline', updatedAt: '2025-01-01', evidence: [{ url: 'https://example.com/docs', checkedAt: '2026-02-12' }] }),
    ];

    expect(selectStaleRecords(records, manifest, '2026-05-13').map((item) => item.id)).toEqual(['stale']);
  });
});

describe('applyRefreshResults', () => {
  it('applies verified updates', () => {
    const oldRecord = record({ id: 'open-meteo', name: 'Old Open-Meteo', updatedAt: '2025-01-01' });
    const report = applyRefreshResults([oldRecord], validFixture as AgentOutput, ['weather']);

    expect(report.refreshed).toBe(1);
    expect(report.records[0].name).toBe('Open-Meteo');
    expect(report.records[0].updatedAt).toBe('2026-05-13T00:00:00Z');
  });

  it('preserves previous notes when refreshed data is inconclusive', () => {
    const previous = record({ id: 'open-meteo', notes: ['previous note'], updatedAt: '2025-01-01' });
    const output = {
      ...(validFixture as AgentOutput),
      findings: [{ level: 'error', code: 'inconclusive', message: 'Could not verify latest docs', recordId: 'open-meteo' }],
    };

    const report = applyRefreshResults([previous], output as AgentOutput, ['weather']);

    expect(report.failed).toBe(1);
    expect(report.records[0].notes).toEqual(['previous note']);
  });

  it('reports refreshed, unchanged, failed, and needs_review counts', () => {
    const refreshed = record({ id: 'open-meteo', name: 'Old Open-Meteo', updatedAt: '2025-01-01' });
    const unchanged = record({ id: 'unchanged' });
    const failed = record({ id: 'missing' });
    const needsReview = record({ id: 'needs-review' });
    const output: AgentOutput = {
      query: 'refresh',
      generatedAt: '2026-05-13T00:00:00Z',
      results: [
        (validFixture as AgentOutput).results[0],
        { record: unchanged, score: 8, matched_fields: ['name'], matched_terms: ['unchanged'], warnings: [] },
        { record: needsReview, score: 6, matched_fields: ['name'], matched_terms: ['review'], warnings: ['manual verification recommended'] },
      ],
      findings: [{ level: 'warning', code: 'manual_review', message: 'Needs manual review', recordId: 'needs-review' }],
    };

    const report = applyRefreshResults([refreshed, unchanged, failed, needsReview], output, ['weather', 'developer-tools']);

    expect(report.refreshed).toBe(1);
    expect(report.unchanged).toBe(2);
    expect(report.failed).toBe(1);
    expect(report.needs_review).toBe(1);
    expect(report.findings.some((finding) => finding.code === 'refresh_failed' && finding.recordId === 'missing')).toBe(true);
  });
});
