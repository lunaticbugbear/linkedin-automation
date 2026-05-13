import { describe, expect, it } from 'vitest';
import {
  normalizeId,
  normalizeApiRecord,
  staleAfter,
} from '../../src/api-registry/normalize.js';
import type { ApiRecord } from '../../src/api-registry/types.js';

describe('normalize', () => {
  const categories = [
    'entertainment',
    'weather',
    'finance',
    'maps',
    'jobs',
    'news',
    'ai',
    'productivity',
    'government',
    'health',
    'education',
    'sports',
    'games',
    'developer-tools',
    'images',
    'text',
    'data',
  ];

  describe('normalizeId', () => {
    it('converts name to lowercase kebab-case', () => {
      expect(normalizeId('Test API')).toBe('test-api');
      expect(normalizeId('My Cool Service')).toBe('my-cool-service');
    });

    it('removes special characters', () => {
      expect(normalizeId('API@2.0')).toBe('api20');
      expect(normalizeId('Test-API_v1')).toBe('test-api-v1');
    });

    it('collapses multiple spaces', () => {
      expect(normalizeId('Test   API')).toBe('test-api');
    });

    it('handles empty string', () => {
      expect(normalizeId('')).toBe('');
    });
  });

  describe('normalizeApiRecord', () => {
    it('generates stable ID from name', () => {
      const input = {
        name: 'Test API',
        description: 'A test',
        category: 'entertainment',
        homepage: 'https://example.com',
      };
      const result = normalizeApiRecord(input, categories);
      expect(result.id).toBe('test-api');
    });

    it('validates category is canonical', () => {
      const input = {
        name: 'Test API',
        description: 'A test',
        category: 'invalid-category',
        homepage: 'https://example.com',
      };
      expect(() => normalizeApiRecord(input, categories)).toThrow();
    });

    it('preserves unknown metadata fields', () => {
      const input = {
        name: 'Test API',
        description: 'A test',
        category: 'entertainment',
        homepage: 'https://example.com',
        customField: 'custom-value',
      } as any;
      const result = normalizeApiRecord(input, categories);
      expect((result as any).customField).toBe('custom-value');
    });

    it('sets fit scores to 5 by default', () => {
      const input = {
        name: 'Test API',
        description: 'A test',
        category: 'entertainment',
        homepage: 'https://example.com',
      };
      const result = normalizeApiRecord(input, categories);
      expect(result.fit.frontend).toBe(5);
      expect(result.fit.backend).toBe(5);
      expect(result.fit.prototype).toBe(5);
      expect(result.fit.production).toBe(5);
      expect(result.fit.mobile).toBe(5);
      expect(result.fit.dashboard).toBe(5);
      expect(result.fit.automation).toBe(5);
    });

    it('enforces fit scores are 1-10', () => {
      const input = {
        name: 'Test API',
        description: 'A test',
        category: 'entertainment',
        homepage: 'https://example.com',
        fit: { frontend: 0, backend: 5, prototype: 5, production: 5, mobile: 5, dashboard: 5, automation: 5 },
      };
      expect(() => normalizeApiRecord(input, categories)).toThrow();
    });

    it('enforces fit scores upper bound 10', () => {
      const input = {
        name: 'Test API',
        description: 'A test',
        category: 'entertainment',
        homepage: 'https://example.com',
        fit: { frontend: 11, backend: 5, prototype: 5, production: 5, mobile: 5, dashboard: 5, automation: 5 },
      };
      expect(() => normalizeApiRecord(input, categories)).toThrow();
    });

    it('accepts fit scores 1-10', () => {
      const input = {
        name: 'Test API',
        description: 'A test',
        category: 'entertainment',
        homepage: 'https://example.com',
        fit: { frontend: 1, backend: 10, prototype: 5, production: 5, mobile: 5, dashboard: 5, automation: 5 },
      };
      const result = normalizeApiRecord(input, categories);
      expect(result.fit.frontend).toBe(1);
      expect(result.fit.backend).toBe(10);
    });

    it('normalizes confidence to 1-10 range', () => {
      const input = {
        name: 'Test API',
        description: 'A test',
        category: 'entertainment',
        homepage: 'https://example.com',
        confidence: [{ field: 'name', confidence: 0.8 }],
      };
      const result = normalizeApiRecord(input, categories);
      expect(result.confidence[0].confidence).toBe(8);
    });

    it('enforces confidence bounds 1-10', () => {
      const input = {
        name: 'Test API',
        description: 'A test',
        category: 'entertainment',
        homepage: 'https://example.com',
        confidence: [{ field: 'name', confidence: 0 }],
      };
      expect(() => normalizeApiRecord(input, categories)).toThrow();
    });

    it('uses provided today date or defaults to current', () => {
      const input = {
        name: 'Test API',
        description: 'A test',
        category: 'entertainment',
        homepage: 'https://example.com',
      };
      const result = normalizeApiRecord(input, categories, '2026-05-13');
      expect(result.createdAt).toBe('2026-05-13T00:00:00Z');
    });

    it('sets default status to trusted', () => {
      const input = {
        name: 'Test API',
        description: 'A test',
        category: 'entertainment',
        homepage: 'https://example.com',
      };
      const result = normalizeApiRecord(input, categories);
      expect(result.status).toBe('trusted');
    });

    it('initializes empty arrays for tags, evidence, consumerProfiles', () => {
      const input = {
        name: 'Test API',
        description: 'A test',
        category: 'entertainment',
        homepage: 'https://example.com',
      };
      const result = normalizeApiRecord(input, categories);
      expect(result.tags).toEqual([]);
      expect(result.evidence).toEqual([]);
      expect(result.consumerProfiles).toEqual([]);
    });

    it('initializes empty notes array', () => {
      const input = {
        name: 'Test API',
        description: 'A test',
        category: 'entertainment',
        homepage: 'https://example.com',
      };
      const result = normalizeApiRecord(input, categories);
      expect(result.notes).toEqual([]);
    });
  });

  describe('staleAfter', () => {
    it('calculates stale date from checkedAt + freshnessDays', () => {
      const stale = staleAfter('2026-05-13T00:00:00Z', 90);
      expect(stale).toBe('2026-08-11T00:00:00Z');
    });

    it('handles different freshness periods', () => {
      const stale30 = staleAfter('2026-05-13T00:00:00Z', 30);
      expect(stale30).toBe('2026-06-12T00:00:00Z');

      const stale365 = staleAfter('2026-05-13T00:00:00Z', 365);
      expect(stale365).toBe('2027-05-13T00:00:00Z');
    });

    it('preserves time component', () => {
      const stale = staleAfter('2026-05-13T14:30:45Z', 1);
      expect(stale).toBe('2026-05-14T14:30:45Z');
    });
  });
});
