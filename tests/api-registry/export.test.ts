import { describe, expect, it } from 'vitest';
import type { Aliases, ApiRecord, Contracts, RegistryManifest } from '../../src/api-registry/types.js';
import { exportShortlist } from '../../src/api-registry/export.js';

const manifest: RegistryManifest = {
  schema_version: 'api-registry',
  last_imported_at: '2026-05-13',
  last_audited_at: '2026-05-13',
  freshness_days: 90,
  health: 'ok',
  health_score: 8.7,
};

const contracts: Contracts = {
  schemaVersion: 'api-registry',
  authValues: ['No', 'apiKey', 'OAuth', 'User-Agent', 'X-Mashape-Key', 'unknown'],
  corsValues: ['yes', 'no', 'unknown'],
  pricingValues: ['free', 'free_tier', 'paid', 'unknown'],
  statusValues: ['trusted', 'needs_review', 'rejected'],
  consumerProfiles: ['frontend-only', 'backend-required', 'prototype', 'production', 'mobile-app', 'dashboard', 'automation'],
  fitKeys: ['frontend', 'backend', 'prototype', 'production', 'mobile', 'dashboard', 'automation'],
  outputShapes: {
    search: { type: 'object', required: ['query', 'results', 'generatedAt'], properties: { query: 'string', results: 'SearchResult[]', generatedAt: 'string' } },
    export: { type: 'object', required: ['records', 'exportedAt'], properties: { records: 'ApiRecord[]', exportedAt: 'string' } },
    agent: { type: 'object', required: ['query', 'results', 'findings', 'generatedAt'], properties: { query: 'string', results: 'SearchResult[]', findings: 'AuditFinding[]', generatedAt: 'string' } },
  },
};

const aliases: Aliases = { weather: ['forecast', 'climate'] };

function record(overrides: Partial<ApiRecord>): ApiRecord {
  return {
    id: 'open-meteo',
    name: 'Open-Meteo',
    description: 'Free weather forecast API',
    category: 'weather',
    tags: ['forecast'],
    homepage: 'https://open-meteo.com',
    docsUrl: 'https://open-meteo.com/en/docs',
    auth: 'No',
    cors: 'yes',
    pricing: 'free',
    status: 'trusted',
    fit: { frontend: 9, backend: 8, prototype: 9, production: 8, mobile: 9, dashboard: 8, automation: 7 },
    consumerProfiles: ['frontend-only', 'prototype'],
    source: { name: 'test', url: 'https://open-meteo.com/en/docs', importedAt: '2026-05-13' },
    evidence: [{ url: 'https://open-meteo.com/en/docs', title: 'Docs', checkedAt: '2026-05-13' }],
    confidence: [{ field: 'docsUrl', confidence: 9 }],
    updatedAt: '2026-05-13',
    createdAt: '2026-05-13',
    ...overrides,
  };
}

describe('exportShortlist', () => {
  it('exports JSON using contracts.json export shape and runtime shortlist shape', () => {
    const output = exportShortlist({ query: 'weather', format: 'json', limit: 1 }, [record({})], aliases, manifest, contracts);
    const parsed = JSON.parse(output);

    expect(parsed).toMatchObject({
      query: 'weather',
      consumer_profile: null,
      recommended: [{ record: { id: 'open-meteo' } }],
      alternatives: [],
      rejected: [],
      registry_health: manifest,
      contract: contracts.outputShapes.export,
    });
    expect(parsed.exportedAt).toEqual(expect.any(String));
  });

  it('exports Markdown with recommended APIs, alternatives, rejected records, warnings, and health', () => {
    const output = exportShortlist({ query: 'weather', format: 'markdown', consumer_profile: 'frontend-only', limit: 1 }, [
      record({ id: 'open-meteo', name: 'Open-Meteo' }),
      record({ id: 'weak-weather', name: 'Weak Weather', status: 'needs_review', confidence: [{ field: 'docsUrl', confidence: 3 }] }),
      record({ id: 'proxy-only', name: 'Proxy Only', cors: 'no' }),
    ], aliases, manifest, contracts);

    expect(output).toContain('# API shortlist: weather');
    expect(output).toContain('Consumer profile: frontend-only');
    expect(output).toContain('## Recommended');
    expect(output).toContain('| Open-Meteo | weather | No | yes | free | trusted |');
    expect(output).toContain('## Alternatives');
    expect(output).toContain('Weak Weather');
    expect(output).toContain('## Rejected');
    expect(output).toContain('proxy-only: frontend-only requires cors:yes or cors:unknown, got cors:no');
    expect(output).toContain('## Warnings');
    expect(output).toContain('weak-weather: low average confidence 3');
    expect(output).toContain('## Registry health');
    expect(output).toContain('health: ok');
    expect(output).toContain('health_score: 8.7');
  });
});
