import { describe, expect, it } from 'vitest';
import { AUTH_VALUES, CONSUMER_PROFILES, CORS_VALUES, FIT_KEYS, PRICING_VALUES, STATUS_VALUES } from '../../src/api-registry/constants';
import { formatRegistryError } from '../../src/api-registry/errors';
import { validateAliases, validateApiRecord, validateCategories, validateContracts } from '../../src/api-registry/validation';

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

  it('accepts contracts containing search, export, and agent output enum shapes', () => {
    const contracts = validateContracts({
      schemaVersion: 'api-registry',
      authValues: AUTH_VALUES,
      corsValues: CORS_VALUES,
      pricingValues: PRICING_VALUES,
      statusValues: STATUS_VALUES,
      consumerProfiles: CONSUMER_PROFILES,
      fitKeys: FIT_KEYS,
    });

    expect(contracts.authValues).toContain('apiKey');
    expect(contracts.consumerProfiles).toContain('prototype');
    expect(contracts.statusValues).toContain('trusted');
  });

  it('enforces required API record fields and enum values', () => {
    const record = {
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
      evidence: [],
      confidence: [],
      updatedAt: '2026-05-13',
      createdAt: '2026-05-13',
    };

    expect(validateApiRecord(record).id).toBe('example-api');
    expect(() => validateApiRecord({ ...record, auth: 'bad-auth' })).toThrow('auth must be one of');
    expect(() => validateApiRecord({ id: 'incomplete' })).toThrow('Record missing required field');
  });
});
