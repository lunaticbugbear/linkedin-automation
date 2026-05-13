import { describe, expect, it } from 'vitest';
import { AUTH_VALUES, CONSUMER_PROFILES, CORS_VALUES, FIT_KEYS, PRICING_VALUES, STATUS_VALUES } from '../../src/api-registry/constants';
import { formatRegistryError } from '../../src/api-registry/errors';
import { validateAliases, validateApiRecord, validateCategories, validateContracts, validateRegistryManifest } from '../../src/api-registry/validation';

describe('registry constants and errors', () => {
  it('defines the approved enum values used by records and filters', () => {
    expect(AUTH_VALUES).toEqual(['No', 'apiKey', 'OAuth', 'User-Agent', 'X-Mashape-Key', 'unknown']);
    expect(CORS_VALUES).toEqual(['yes', 'no', 'unknown']);
    expect(PRICING_VALUES).toEqual(['free', 'free_tier', 'paid', 'unknown']);
    expect(STATUS_VALUES).toEqual(['trusted', 'needs_review', 'rejected']);
    expect(CONSUMER_PROFILES).toEqual(['frontend-only', 'backend-required', 'prototype', 'production', 'mobile-app', 'dashboard', 'automation']);
    expect(FIT_KEYS).toEqual(['frontend', 'backend', 'prototype', 'production', 'mobile', 'dashboard', 'automation']);
  });

  it('formats every command error with the required four-line structure', () => {
    expect(formatRegistryError({
      error: 'Category "anime" is not a valid category.',
      cause: '"anime" is not in categories.json.',
      fix: 'Use /api-registry search "anime app" or add "anime" as a tag.',
      docs: 'See data/api-registry/categories.json for valid categories.'
    })).toBe([
      'ERROR: Category "anime" is not a valid category.',
      'CAUSE: "anime" is not in categories.json.',
      'FIX:   Use /api-registry search "anime app" or add "anime" as a tag.',
      'DOCS:  See data/api-registry/categories.json for valid categories.'
    ].join('\n'));
  });
});

describe('registry validation', () => {
  it('rejects non-canonical primary categories', () => {
    expect(() => validateCategories(['entertainment', 'anime'])).toThrow('"anime" is not a valid category');
  });

  it('expands anime alias to animation, manga, and entertainment', () => {
    const aliases = validateAliases({ anime: ['animation', 'manga', 'entertainment'] });

    expect(aliases.anime).toEqual(['animation', 'manga', 'entertainment']);
  });

  const contractFixture = {
    schemaVersion: 'api-registry',
    authValues: AUTH_VALUES,
    corsValues: CORS_VALUES,
    pricingValues: PRICING_VALUES,
    statusValues: STATUS_VALUES,
    consumerProfiles: CONSUMER_PROFILES,
    fitKeys: FIT_KEYS,
    outputShapes: {
      search: {
        type: 'object',
        required: ['query', 'results', 'generatedAt'],
        properties: {
          query: 'string',
          results: 'SearchResult[]',
          generatedAt: 'string',
        },
      },
      export: {
        type: 'object',
        required: ['records', 'exportedAt'],
        properties: {
          records: 'ApiRecord[]',
          exportedAt: 'string',
        },
      },
      agent: {
        type: 'object',
        required: ['query', 'results', 'findings', 'generatedAt'],
        properties: {
          query: 'string',
          results: 'SearchResult[]',
          findings: 'AuditFinding[]',
          generatedAt: 'string',
        },
      },
    },
  };

  const apiRecordFixture = {
    id: 'example-api',
    name: 'Example API',
    description: 'Example API for validation.',
    category: 'developer-tools',
    tags: ['example'],
    homepage: 'https://example.com',
    auth: 'apiKey',
    cors: 'yes',
    pricing: 'free',
    status: 'trusted',
    fit: { frontend: 5, backend: 5, prototype: 5, production: 5, mobile: 5, dashboard: 5, automation: 5 },
    consumerProfiles: ['prototype'],
    source: { name: 'test', url: 'https://example.com/source', importedAt: '2026-05-13' },
    evidence: [{ url: 'https://example.com/docs', checkedAt: '2026-05-13', title: 'Docs', excerpt: 'Evidence text' }],
    confidence: [{ field: 'auth', confidence: 9, source: 'docs', note: 'Documented auth' }],
    updatedAt: '2026-05-13',
    createdAt: '2026-05-13',
  };

  it('accepts contracts containing search, export, and agent output shapes', () => {
    const contracts = validateContracts(contractFixture);

    expect(contracts.outputShapes.search.required).toContain('results');
    expect(contracts.outputShapes.export.properties.records).toBe('ApiRecord[]');
    expect(contracts.outputShapes.agent.required).toContain('findings');
  });

  it('rejects contract enum drift and non-string enum elements with useful paths', () => {
    expect(() => validateContracts({ ...contractFixture, authValues: ['apiKey', 'bad-auth'] })).toThrow('authValues[1]');
    expect(() => validateContracts({ ...contractFixture, fitKeys: ['frontend', 1] })).toThrow('fitKeys[1]');
  });

  it('rejects missing contract output shapes with useful path', () => {
    expect(() => validateContracts({ ...contractFixture, outputShapes: { search: contractFixture.outputShapes.search } })).toThrow('outputShapes.export');
  });

  it('enforces required API record fields and enum values', () => {
    expect(validateApiRecord(apiRecordFixture).id).toBe('example-api');
    expect(() => validateApiRecord({ ...apiRecordFixture, auth: 'bad-auth' })).toThrow('auth must be one of');
    expect(() => validateApiRecord({ id: 'incomplete' })).toThrow('Record missing required field: name');
  });

  it('rejects invalid API record element and nested field types with useful paths', () => {
    expect(() => validateApiRecord({ ...apiRecordFixture, tags: ['example', 7] })).toThrow('tags[1]');
    expect(() => validateApiRecord({ ...apiRecordFixture, fit: { ...apiRecordFixture.fit, backend: 11 } })).toThrow('fit.backend');
    expect(() => validateApiRecord({ ...apiRecordFixture, consumerProfiles: ['prototype', 'bad-profile'] })).toThrow('consumerProfiles[1]');
    expect(() => validateApiRecord({ ...apiRecordFixture, source: { ...apiRecordFixture.source, url: 7 } })).toThrow('source.url');
    expect(() => validateApiRecord({ ...apiRecordFixture, evidence: [{ ...apiRecordFixture.evidence[0], excerpt: 7 }] })).toThrow('evidence[0].excerpt');
    expect(() => validateApiRecord({ ...apiRecordFixture, confidence: [{ ...apiRecordFixture.confidence[0], confidence: 11 }] })).toThrow('confidence[0].confidence');
  });

  it('accepts approved manifest shape and rejects old manifest fields', () => {
    const manifest = {
      schema_version: 'api-registry',
      last_imported_at: '2026-05-13',
      last_audited_at: '2026-05-13',
      freshness_days: 90,
      health: 'ok',
      health_score: 8.7,
    };

    expect(validateRegistryManifest(manifest)).toEqual(manifest);
    expect(() => validateRegistryManifest({ version: 'api-registry' })).toThrow('schema_version');
  });
});
