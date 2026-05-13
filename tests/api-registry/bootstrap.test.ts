import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  registryRoot,
  registryFilePath,
  readJsonFile,
  bootstrapRegistry,
  validateApiRecord,
  validateRegistryManifest,
  validateContracts,
  validateCategories,
  validateAliases,
} from '../../src/api-registry/bootstrap.js';

describe('bootstrap', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'registry-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('registryRoot', () => {
    it('returns data/api-registry relative to cwd', () => {
      const root = registryRoot(tempDir);
      expect(root).toBe(join(tempDir, 'data', 'api-registry'));
    });

    it('uses process.cwd() by default', () => {
      const root = registryRoot();
      expect(root).toBe(join(process.cwd(), 'data', 'api-registry'));
    });
  });

  describe('registryFilePath', () => {
    it('returns full path to registry file', () => {
      const path = registryFilePath('registry.json', tempDir);
      expect(path).toBe(join(tempDir, 'data', 'api-registry', 'registry.json'));
    });

    it('works with multiple file names', () => {
      expect(registryFilePath('categories.json', tempDir)).toBe(
        join(tempDir, 'data', 'api-registry', 'categories.json')
      );
      expect(registryFilePath('aliases.json', tempDir)).toBe(
        join(tempDir, 'data', 'api-registry', 'aliases.json')
      );
    });
  });

  describe('readJsonFile', () => {
    it('reads valid JSON file', () => {
      const testFile = join(tempDir, 'test.json');
      const data = { test: 'value' };
      writeFileSync(testFile, JSON.stringify(data));

      const result = readJsonFile<typeof data>(testFile);
      expect(result).toEqual(data);
    });

    it('throws RegistryError with absolute path for invalid JSON', () => {
      const testFile = join(tempDir, 'invalid.json');
      writeFileSync(testFile, '{invalid json}');

      expect(() => readJsonFile(testFile)).toThrow();
      try {
        readJsonFile(testFile);
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect((e as Error).message).toContain(testFile);
        expect((e as Error).message).toContain('invalid.json');
      }
    });

    it('throws error for missing file', () => {
      const testFile = join(tempDir, 'missing.json');
      expect(() => readJsonFile(testFile)).toThrow();
    });
  });

  describe('validateCategories', () => {
    it('accepts canonical categories array', () => {
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
      const result = validateCategories(categories);
      expect(result).toEqual(categories);
    });

    it('rejects non-canonical primary categories', () => {
      const invalid = ['entertainment', 'anime', 'weather'];
      expect(() => validateCategories(invalid)).toThrow();
    });

    it('rejects non-array input', () => {
      expect(() => validateCategories('not-array')).toThrow();
      expect(() => validateCategories({ categories: [] })).toThrow();
    });
  });

  describe('validateAliases', () => {
    it('accepts valid aliases object', () => {
      const aliases = {
        anime: ['animation', 'manga', 'entertainment'],
        movie: ['film', 'cinema', 'entertainment'],
      };
      const result = validateAliases(aliases);
      expect(result).toEqual(aliases);
    });

    it('expands anime to animation, manga, and entertainment', () => {
      const aliases = validateAliases({
        anime: ['animation', 'manga', 'entertainment'],
      });
      expect(aliases.anime).toContain('animation');
      expect(aliases.anime).toContain('manga');
      expect(aliases.anime).toContain('entertainment');
    });

    it('rejects non-object input', () => {
      expect(() => validateAliases(['not', 'object'])).toThrow();
      expect(() => validateAliases('string')).toThrow();
    });

    it('rejects aliases with non-array values', () => {
      expect(() => validateAliases({ anime: 'animation' })).toThrow();
    });
  });

  describe('validateContracts', () => {
    it('accepts valid contracts object', () => {
      const contracts = {
        schemaVersion: 'api-registry',
        authValues: ['No', 'apiKey', 'OAuth', 'User-Agent', 'X-Mashape-Key', 'unknown'],
        corsValues: ['yes', 'no', 'unknown'],
        pricingValues: ['free', 'free_tier', 'paid', 'unknown'],
        statusValues: ['trusted', 'needs_review', 'rejected'],
        consumerProfiles: ['frontend-only', 'backend-required', 'prototype', 'production', 'mobile-app', 'dashboard', 'automation'],
        fitKeys: ['frontend', 'backend', 'prototype', 'production', 'mobile', 'dashboard', 'automation'],
        outputShapes: {
          search: {
            type: 'object',
            required: ['query', 'results', 'generatedAt'],
            properties: { query: 'string', results: 'SearchResult[]', generatedAt: 'string' },
          },
          export: {
            type: 'object',
            required: ['records', 'exportedAt'],
            properties: { records: 'ApiRecord[]', exportedAt: 'string' },
          },
          agent: {
            type: 'object',
            required: ['query', 'results', 'findings', 'generatedAt'],
            properties: { query: 'string', results: 'SearchResult[]', findings: 'AuditFinding[]', generatedAt: 'string' },
          },
        },
      };
      const result = validateContracts(contracts);
      expect(result).toEqual(contracts);
    });

    it('contains search output shape', () => {
      bootstrapRegistry(tempDir);
      const contracts = validateContracts(readJsonFile(registryFilePath('contracts.json', tempDir)));
      expect(contracts.outputShapes.search.properties.results).toBe('SearchResult[]');
    });

    it('contains export output shape', () => {
      bootstrapRegistry(tempDir);
      const contracts = validateContracts(readJsonFile(registryFilePath('contracts.json', tempDir)));
      expect(contracts.outputShapes.export.properties.records).toBe('ApiRecord[]');
    });

    it('contains agent output shape', () => {
      bootstrapRegistry(tempDir);
      const contracts = validateContracts(readJsonFile(registryFilePath('contracts.json', tempDir)));
      expect(contracts.outputShapes.agent.properties.findings).toBe('AuditFinding[]');
    });
  });

  describe('validateRegistryManifest', () => {
    it('accepts valid manifest', () => {
      const manifest = {
        schema_version: 'api-registry',
        last_imported_at: '2026-05-13',
        last_audited_at: '2026-05-13',
        freshness_days: 90,
        health: 'ok',
        health_score: 8.7,
      };
      const result = validateRegistryManifest(manifest);
      expect(result).toEqual(manifest);
    });

    it('rejects manifest without required fields', () => {
      expect(() => validateRegistryManifest({ version: 'api-registry' })).toThrow();
    });
  });

  describe('validateApiRecord', () => {
    it('accepts valid API record', () => {
      const record = {
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
        confidence: [],
        updatedAt: '2026-05-13T00:00:00Z',
        createdAt: '2026-05-13T00:00:00Z',
      };
      const result = validateApiRecord(record);
      expect(result.id).toBe('test-api');
    });

    it('enforces required fields', () => {
      expect(() => validateApiRecord({ id: 'test' })).toThrow();
    });

    it('enforces enum values', () => {
      const record = {
        id: 'test-api',
        name: 'Test API',
        description: 'A test API',
        category: 'entertainment',
        tags: ['test'],
        homepage: 'https://example.com',
        auth: 'invalid-auth' as any,
        cors: 'yes' as const,
        pricing: 'free' as const,
        status: 'trusted' as const,
        fit: { frontend: 5, backend: 5, prototype: 5, production: 5, mobile: 5, dashboard: 5, automation: 5 },
        consumerProfiles: ['frontend-only'],
        source: { name: 'test', url: 'https://test.com', importedAt: '2026-05-13T00:00:00Z' },
        evidence: [],
        confidence: [],
        updatedAt: '2026-05-13T00:00:00Z',
        createdAt: '2026-05-13T00:00:00Z',
      };
      expect(() => validateApiRecord(record)).toThrow();
    });
  });

  describe('bootstrapRegistry', () => {
    it('creates missing registry files with schema-valid defaults', () => {
      bootstrapRegistry(tempDir);

      const registryPath = registryFilePath('registry.json', tempDir);
      const categoriesPath = registryFilePath('categories.json', tempDir);
      const aliasesPath = registryFilePath('aliases.json', tempDir);
      const contractsPath = registryFilePath('contracts.json', tempDir);
      const sourcesPath = registryFilePath('sources.json', tempDir);

      expect(existsSync(registryPath)).toBe(true);
      expect(existsSync(categoriesPath)).toBe(true);
      expect(existsSync(aliasesPath)).toBe(true);
      expect(existsSync(contractsPath)).toBe(true);
      expect(existsSync(sourcesPath)).toBe(true);
    });

    it('creates registry.json with correct schema', () => {
      bootstrapRegistry(tempDir);
      const registry = readJsonFile(registryFilePath('registry.json', tempDir));
      expect(registry).toHaveProperty('schema_version', 'api-registry');
      expect(registry).toHaveProperty('last_imported_at');
      expect(registry).toHaveProperty('last_audited_at');
      expect(registry).toHaveProperty('freshness_days', 90);
      expect(registry).toHaveProperty('health', 'ok');
      expect(registry).toHaveProperty('health_score');
    });

    it('creates categories.json with canonical categories', () => {
      bootstrapRegistry(tempDir);
      const categories = readJsonFile(registryFilePath('categories.json', tempDir));
      expect(Array.isArray(categories)).toBe(true);
      expect(categories).toContain('entertainment');
      expect(categories).toContain('weather');
      expect(categories).toContain('finance');
    });

    it('creates aliases.json with anime expansion', () => {
      bootstrapRegistry(tempDir);
      const aliases = readJsonFile<Record<string, string[]>>(registryFilePath('aliases.json', tempDir));
      expect(aliases.anime).toContain('animation');
      expect(aliases.anime).toContain('manga');
      expect(aliases.anime).toContain('entertainment');
    });

    it('creates contracts.json with machine-readable shapes', () => {
      bootstrapRegistry(tempDir);
      const contracts = readJsonFile(registryFilePath('contracts.json', tempDir));
      expect(contracts).toHaveProperty('schemaVersion');
      expect(contracts).toHaveProperty('authValues');
      expect(contracts).toHaveProperty('corsValues');
      expect(contracts).toHaveProperty('pricingValues');
      expect(contracts).toHaveProperty('statusValues');
      expect(contracts).toHaveProperty('consumerProfiles');
      expect(contracts).toHaveProperty('fitKeys');
    });

    it('creates sources.json with public-apis metadata', () => {
      bootstrapRegistry(tempDir);
      const sources = readJsonFile<{ sources: unknown[] }>(registryFilePath('sources.json', tempDir));
      expect(sources).toHaveProperty('sources');
      expect(Array.isArray(sources.sources)).toBe(true);
    });

    it('bootstrap-generated registry.json passes manifest validator', () => {
      bootstrapRegistry(tempDir);
      const registry = readJsonFile(registryFilePath('registry.json', tempDir));
      expect(() => validateRegistryManifest(registry)).not.toThrow();
    });

    it('does not overwrite existing files', () => {
      bootstrapRegistry(tempDir);
      const registryPath = registryFilePath('registry.json', tempDir);
      const originalContent = readFileSync(registryPath, 'utf-8');

      bootstrapRegistry(tempDir);
      const newContent = readFileSync(registryPath, 'utf-8');

      expect(newContent).toBe(originalContent);
    });
  });
});
