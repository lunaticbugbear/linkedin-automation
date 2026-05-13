import { describe, expect, it } from 'vitest';
import { AUTH_VALUES, CONSUMER_PROFILES, CORS_VALUES, FIT_KEYS, PRICING_VALUES, STATUS_VALUES } from '../../src/api-registry/constants';
import { formatRegistryError } from '../../src/api-registry/errors';

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
