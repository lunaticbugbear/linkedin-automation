import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { auditRegistry } from '../../src/api-registry/audit.js';
import { bootstrapRegistry, registryFilePath } from '../../src/api-registry/bootstrap.js';
import type { ApiRecord, RegistryManifest } from '../../src/api-registry/types.js';

const manifest: RegistryManifest = {
  schema_version: 'api-registry',
  last_imported_at: '2026-05-13',
  last_audited_at: '2026-05-13',
  freshness_days: 90,
  health: 'ok',
  health_score: 8.7,
};

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

function codes(summary: ReturnType<typeof auditRegistry>): string[] {
  return summary.findings.map((finding) => finding.code);
}

describe('auditRegistry', () => {
  it('reports missing required fields without throwing', () => {
    const summary = auditRegistry({ records: [{ id: 'broken' }], manifest, categories: ['weather'], now: '2026-05-13' });
    expect(codes(summary)).toContain('missing_required_field');
    expect(summary.errorCount).toBeGreaterThan(0);
  });

  it('reports duplicate ids and duplicate docs URLs', () => {
    const summary = auditRegistry({ records: [record({ id: 'one' }), record({ id: 'one', docsUrl: 'https://weather.example.com/docs' })], manifest, categories: ['weather'], now: '2026-05-13' });
    expect(codes(summary)).toContain('duplicate_id');
    expect(codes(summary)).toContain('duplicate_docs_url');
  });

  it('reports stale records using manifest freshness window', () => {
    const summary = auditRegistry({ records: [record({ updatedAt: '2025-01-01' })], manifest, categories: ['weather'], now: '2026-05-13' });
    expect(codes(summary)).toContain('stale_record');
  });

  it('reports invalid source records and missing evidence', () => {
    const summary = auditRegistry({ records: [record({ source: { name: '', url: '', importedAt: '' }, evidence: [] })], manifest, categories: ['weather'], now: '2026-05-13' });
    expect(codes(summary)).toContain('invalid_source');
    expect(codes(summary)).toContain('missing_evidence');
  });

  it('finds broken docs links through injectable link checker', () => {
    const summary = auditRegistry({ records: [record()], manifest, categories: ['weather'], now: '2026-05-13', linkChecker: (url) => url.includes('/docs') ? false : true });
    expect(codes(summary)).toContain('broken_docs_link');
  });

  it('reports inconsistent tags, invalid fit scores, and invalid confidence values', () => {
    const summary = auditRegistry({ records: [record({ category: 'weather', tags: ['finance'], fit: { frontend: 11, backend: 7, prototype: 9, production: 7, mobile: 8, dashboard: 8, automation: 6 }, confidence: [{ field: 'docsUrl', confidence: 0 }] })], manifest, categories: ['weather'], now: '2026-05-13' });
    expect(codes(summary)).toContain('inconsistent_tags');
    expect(codes(summary)).toContain('invalid_fit_score');
    expect(codes(summary)).toContain('invalid_confidence');
  });

  it('reports unknown values needing review and contract drift', () => {
    const drifted = record({ auth: 'unknown', cors: 'unknown', pricing: 'unknown', category: 'weather' });
    const summary = auditRegistry({ records: [drifted], manifest, categories: ['data'], now: '2026-05-13' });
    expect(codes(summary)).toContain('unknown_value_needs_review');
    expect(codes(summary)).toContain('contract_drift');
  });

  it('calculates health score from audit findings', () => {
    const clean = auditRegistry({ records: [record()], manifest, categories: ['weather'], now: '2026-05-13' });
    const dirty = auditRegistry({ records: [{ id: 'broken' }], manifest, categories: ['weather'], now: '2026-05-13' });
    expect(clean.healthScore).toBe(10);
    expect(dirty.healthScore).toBeLessThan(clean.healthScore);
    expect(dirty.health).toBe('critical');
  });

  it('updates manifest audit metadata through safe write', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'registry-audit-'));
    try {
      bootstrapRegistry(tempDir);
      const registryPath = registryFilePath('registry.json', tempDir);
      writeFileSync(registryFilePath('records.json', tempDir), JSON.stringify([record()], null, 2));

      const summary = auditRegistry({ records: [record()], manifest, categories: ['weather'], now: '2026-05-13', cwd: tempDir, updateManifest: true });
      const manifestAfter = JSON.parse(readFileSync(registryPath, 'utf8')) as RegistryManifest;

      expect(summary.healthScore).toBe(10);
      expect(manifestAfter.last_audited_at).toBe('2026-05-13');
      expect(manifestAfter.health_score).toBe(10);
      expect(existsSync(`${registryPath}.bak`)).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
