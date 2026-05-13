import { describe, expect, it } from 'vitest';
import {
  findDuplicate,
  mergeApiRecord,
} from '../../src/api-registry/merge.js';
import type { ApiRecord, DuplicateMatch } from '../../src/api-registry/types.js';

describe('merge', () => {
  const baseRecord = (overrides?: Partial<ApiRecord>): ApiRecord => ({
    id: 'test-api',
    name: 'Test API',
    description: 'A test API',
    category: 'entertainment',
    tags: ['test'],
    homepage: 'https://example.com',
    auth: 'apiKey' as const,
    cors: 'yes' as const,
    pricing: 'free' as const,
    status: 'trusted' as const,
    fit: { frontend: 5, backend: 5, prototype: 5, production: 5, mobile: 5, dashboard: 5, automation: 5 },
    consumerProfiles: ['frontend-only'],
    source: { name: 'test', url: 'https://test.com', importedAt: '2026-05-13T00:00:00Z' },
    evidence: [],
    confidence: [{ field: 'name', confidence: 9 }],
    updatedAt: '2026-05-13T00:00:00Z',
    createdAt: '2026-05-13T00:00:00Z',
    notes: [],
    ...overrides,
  });

  describe('findDuplicate', () => {
    it('detects same-docs duplicate', () => {
      const existing = [baseRecord({ docsUrl: 'https://docs.example.com' })];
      const candidate = baseRecord({ id: 'test-api-2', docsUrl: 'https://docs.example.com' });

      const match = findDuplicate(existing, candidate);
      expect(match).toBeDefined();
      expect(match?.type).toBe('same-docs');
      expect(match?.existingId).toBe('test-api');
    });

    it('detects same normalized name and category', () => {
      const existing = [baseRecord({ name: 'Test API', category: 'entertainment' })];
      const candidate = baseRecord({ id: 'test-api-2', name: 'test-api', category: 'entertainment' });

      const match = findDuplicate(existing, candidate);
      expect(match).toBeDefined();
      expect(match?.type).toBe('possible-duplicate');
    });

    it('does not match different categories', () => {
      const existing = [baseRecord({ name: 'Test API', category: 'entertainment' })];
      const candidate = baseRecord({ id: 'test-api-2', name: 'Test API', category: 'weather' });

      const match = findDuplicate(existing, candidate);
      expect(match).toBeUndefined();
    });

    it('does not match different normalized names', () => {
      const existing = [baseRecord({ name: 'Test API' })];
      const candidate = baseRecord({ id: 'test-api-2', name: 'Different API' });

      const match = findDuplicate(existing, candidate);
      expect(match).toBeUndefined();
    });

    it('returns undefined for no duplicates', () => {
      const existing = [baseRecord()];
      const candidate = baseRecord({ id: 'other-api', name: 'Other API' });

      const match = findDuplicate(existing, candidate);
      expect(match).toBeUndefined();
    });
  });

  describe('mergeApiRecord', () => {
    it('selects higher-confidence field values', () => {
      const existing = baseRecord({
        name: 'Test API',
        confidence: [{ field: 'name', confidence: 5 }],
      });
      const candidate = baseRecord({
        name: 'Test API v2',
        confidence: [{ field: 'name', confidence: 9 }],
      });

      const merged = mergeApiRecord(existing, candidate);
      expect(merged.name).toBe('Test API v2');
    });

    it('uses newer checkedAt as tie-breaker for same confidence', () => {
      const existing = baseRecord({
        name: 'Test API',
        evidence: [{ url: 'https://old.com', checkedAt: '2026-05-01T00:00:00Z' }],
        confidence: [{ field: 'name', confidence: 8 }],
      });
      const candidate = baseRecord({
        name: 'Test API v2',
        evidence: [{ url: 'https://new.com', checkedAt: '2026-05-13T00:00:00Z' }],
        confidence: [{ field: 'name', confidence: 8 }],
      });

      const merged = mergeApiRecord(existing, candidate);
      expect(merged.name).toBe('Test API v2');
    });

    it('appends notes from both records', () => {
      const existing = baseRecord({
        notes: ['Note 1', 'Note 2'],
      });
      const candidate = baseRecord({
        notes: ['Note 3'],
      });

      const merged = mergeApiRecord(existing, candidate);
      expect(merged.notes).toContain('Note 1');
      expect(merged.notes).toContain('Note 2');
      expect(merged.notes).toContain('Note 3');
    });

    it('deduplicates notes', () => {
      const existing = baseRecord({
        notes: ['Note 1', 'Note 2'],
      });
      const candidate = baseRecord({
        notes: ['Note 2', 'Note 3'],
      });

      const merged = mergeApiRecord(existing, candidate);
      expect(merged.notes?.filter(n => n === 'Note 2')).toHaveLength(1);
    });

    it('marks high-confidence conflicts as needs_review', () => {
      const existing = baseRecord({
        auth: 'apiKey' as const,
        confidence: [{ field: 'auth', confidence: 9 }],
      });
      const candidate = baseRecord({
        auth: 'OAuth' as const,
        confidence: [{ field: 'auth', confidence: 9 }],
      });

      const merged = mergeApiRecord(existing, candidate);
      expect(merged.status).toBe('needs_review');
    });

    it('does not mark low-confidence conflicts as needs_review', () => {
      const existing = baseRecord({
        auth: 'apiKey' as const,
        confidence: [{ field: 'auth', confidence: 3 }],
      });
      const candidate = baseRecord({
        auth: 'OAuth' as const,
        confidence: [{ field: 'auth', confidence: 3 }],
      });

      const merged = mergeApiRecord(existing, candidate);
      expect(merged.status).not.toBe('needs_review');
    });

    it('preserves existing createdAt', () => {
      const existing = baseRecord({
        createdAt: '2026-05-01T00:00:00Z',
      });
      const candidate = baseRecord({
        createdAt: '2026-05-13T00:00:00Z',
      });

      const merged = mergeApiRecord(existing, candidate);
      expect(merged.createdAt).toBe('2026-05-01T00:00:00Z');
    });

    it('updates updatedAt to newer timestamp', () => {
      const existing = baseRecord({
        updatedAt: '2026-05-01T00:00:00Z',
      });
      const candidate = baseRecord({
        updatedAt: '2026-05-13T00:00:00Z',
      });

      const merged = mergeApiRecord(existing, candidate);
      expect(merged.updatedAt).toBe('2026-05-13T00:00:00Z');
    });

    it('merges evidence arrays', () => {
      const existing = baseRecord({
        evidence: [{ url: 'https://old.com', checkedAt: '2026-05-01T00:00:00Z' }],
      });
      const candidate = baseRecord({
        evidence: [{ url: 'https://new.com', checkedAt: '2026-05-13T00:00:00Z' }],
      });

      const merged = mergeApiRecord(existing, candidate);
      expect(merged.evidence).toHaveLength(2);
      expect(merged.evidence.map(e => e.url)).toContain('https://old.com');
      expect(merged.evidence.map(e => e.url)).toContain('https://new.com');
    });

    it('merges confidence arrays', () => {
      const existing = baseRecord({
        confidence: [{ field: 'name', confidence: 8 }],
      });
      const candidate = baseRecord({
        confidence: [{ field: 'description', confidence: 7 }],
      });

      const merged = mergeApiRecord(existing, candidate);
      expect(merged.confidence.length).toBeGreaterThanOrEqual(2);
    });

    it('keeps higher confidence for same field', () => {
      const existing = baseRecord({
        confidence: [{ field: 'name', confidence: 5 }],
      });
      const candidate = baseRecord({
        confidence: [{ field: 'name', confidence: 9 }],
      });

      const merged = mergeApiRecord(existing, candidate);
      const nameConf = merged.confidence.find(c => c.field === 'name');
      expect(nameConf?.confidence).toBe(9);
    });
  });
});
