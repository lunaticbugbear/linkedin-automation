import { describe, expect, it } from 'vitest';
import type { Aliases, ApiRecord, RegistryManifest } from '../../src/api-registry/types.js';
import { expandQuery, searchApis } from '../../src/api-registry/search.js';

const manifest: RegistryManifest = {
  schema_version: 'api-registry',
  last_imported_at: '2026-05-13',
  last_audited_at: '2026-05-13',
  freshness_days: 90,
  health: 'ok',
  health_score: 8.7,
};

const aliases: Aliases = {
  anime: ['animation', 'manga', 'entertainment'],
  job: ['career', 'employment', 'recruiting'],
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

describe('expandQuery', () => {
  it('expands matching aliases into searchable terms', () => {
    expect(expandQuery('anime app', aliases)).toEqual(['anime', 'app', 'animation', 'manga', 'entertainment']);
  });
});

describe('searchApis', () => {
  it('matches free-text query terms against name, description, category, and tags', () => {
    const results = searchApis({ query: 'forecast' }, [
      record({ id: 'movies', name: 'Movie API', description: 'Cinema data', category: 'entertainment', tags: ['film'] }),
      record({ id: 'weather', name: 'Open-Meteo', description: 'Global forecast API', category: 'weather', tags: ['climate'] }),
    ], aliases, manifest);

    expect(results.recommended.map((item) => item.record.id)).toEqual(['weather']);
    expect(results.recommended[0].matched_fields).toContain('description');
  });

  it('uses alias expansion so domain terms can match canonical categories and tags', () => {
    const results = searchApis({ query: 'anime' }, [
      record({ id: 'jobs', name: 'Jobs API', category: 'jobs', tags: ['career'] }),
      record({ id: 'tvmaze', name: 'TVMaze', category: 'entertainment', tags: ['television'] }),
    ], aliases, manifest);

    expect(results.recommended.map((item) => item.record.id)).toEqual(['tvmaze']);
    expect(results.recommended[0].matched_terms).toContain('entertainment');
  });

  it('applies category and tag filters before ranking', () => {
    const results = searchApis({ query: 'api', category: 'weather', tags: ['forecast'] }, [
      record({ id: 'weather-good', name: 'Weather Good', category: 'weather', tags: ['forecast'] }),
      record({ id: 'weather-other', name: 'Weather Other', category: 'weather', tags: ['radar'] }),
      record({ id: 'finance', name: 'Finance Forecast', category: 'finance', tags: ['forecast'] }),
    ], aliases, manifest);

    expect(results.recommended.map((item) => item.record.id)).toEqual(['weather-good']);
  });

  it('applies auth, CORS, pricing, and status filters before ranking', () => {
    const results = searchApis({ query: 'api', auth: ['No'], cors: ['yes'], pricing: ['free'], status: ['trusted'] }, [
      record({ id: 'good', name: 'Good API', auth: 'No', cors: 'yes', pricing: 'free', status: 'trusted' }),
      record({ id: 'auth', name: 'Auth API', auth: 'apiKey' }),
      record({ id: 'cors', name: 'Cors API', cors: 'no' }),
      record({ id: 'pricing', name: 'Pricing API', pricing: 'paid' }),
      record({ id: 'status', name: 'Status API', status: 'needs_review' }),
    ], aliases, manifest);

    expect(results.recommended.map((item) => item.record.id)).toEqual(['good']);
  });

  it('ranks consumer profile fit above weaker profile matches', () => {
    const results = searchApis({ query: 'weather', consumer_profile: 'frontend-only' }, [
      record({ id: 'backend', name: 'Weather Backend', category: 'weather', consumerProfiles: ['backend-required'], fit: { frontend: 3, backend: 9, prototype: 6, production: 6, mobile: 4, dashboard: 5, automation: 5 } }),
      record({ id: 'frontend', name: 'Weather Frontend', category: 'weather', consumerProfiles: ['frontend-only'], fit: { frontend: 9, backend: 5, prototype: 8, production: 7, mobile: 8, dashboard: 8, automation: 5 } }),
    ], aliases, manifest);

    expect(results.recommended[0].record.id).toBe('frontend');
  });

  it('ranks confidence and freshness above stale low-confidence records', () => {
    const results = searchApis({ query: 'weather' }, [
      record({ id: 'stale', name: 'Weather Stale', category: 'weather', confidence: [{ field: 'docsUrl', confidence: 3 }], updatedAt: '2025-01-01' }),
      record({ id: 'fresh', name: 'Weather Fresh', category: 'weather', confidence: [{ field: 'docsUrl', confidence: 9 }], updatedAt: '2026-05-12' }),
    ], aliases, manifest);

    expect(results.recommended[0].record.id).toBe('fresh');
  });

  it('rejects cors:no records for frontend-only consumers', () => {
    const results = searchApis({ query: 'maps', consumer_profile: 'frontend-only' }, [
      record({ id: 'proxy-only', name: 'Maps Proxy', category: 'maps', cors: 'no' }),
      record({ id: 'browser-ready', name: 'Maps Browser', category: 'maps', cors: 'yes' }),
    ], aliases, manifest);

    expect(results.recommended.map((item) => item.record.id)).toEqual(['browser-ready']);
    expect(results.rejected).toEqual([{ id: 'proxy-only', reason: 'frontend-only requires cors:yes or cors:unknown, got cors:no' }]);
  });

  it('moves weak matching records into alternatives', () => {
    const results = searchApis({ query: 'weather', limit: 1 }, [
      record({ id: 'strong', name: 'Weather Strong', category: 'weather', status: 'trusted' }),
      record({ id: 'weak', name: 'Weather Weak', category: 'weather', status: 'needs_review', confidence: [{ field: 'docsUrl', confidence: 3 }] }),
    ], aliases, manifest);

    expect(results.recommended.map((item) => item.record.id)).toEqual(['strong']);
    expect(results.alternatives.map((item) => item.record.id)).toEqual(['weak']);
  });

  it('returns concrete warnings for quality issues', () => {
    const results = searchApis({ query: 'weather' }, [
      record({ id: 'weak', name: 'Weather Weak', category: 'weather', docsUrl: undefined, cors: 'unknown', pricing: 'unknown', status: 'needs_review', evidence: [], confidence: [{ field: 'docsUrl', confidence: 3 }], updatedAt: '2025-01-01' }),
    ], aliases, manifest);

    expect(results.warnings).toContain('weak: missing docsUrl');
    expect(results.warnings).toContain('weak: missing evidence');
    expect(results.warnings).toContain('weak: low average confidence 3');
    expect(results.warnings).toContain('weak: cors is unknown');
    expect(results.warnings).toContain('weak: pricing is unknown');
    expect(results.warnings).toContain('weak: needs review before production use');
    expect(results.warnings).toContain('weak: stale record updatedAt 2025-01-01 exceeds freshness window 90 days');
  });
});
