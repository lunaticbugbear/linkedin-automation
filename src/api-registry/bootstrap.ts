import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { registryFilePath, registryRoot, readJsonFile } from './paths.js';
import { AUTH_VALUES, CORS_VALUES, PRICING_VALUES, STATUS_VALUES, CONSUMER_PROFILES, FIT_KEYS, CURRENT_DATE, DEFAULT_FRESHNESS_DAYS } from './constants.js';
import type { Aliases, Contracts } from './types.js';

export { registryFilePath, registryRoot, readJsonFile } from './paths.js';
export { validateApiRecord, validateRegistryManifest, validateContracts, validateCategories, validateAliases } from './validation.js';

export function bootstrapRegistry(cwd = process.cwd()): void {
  const root = registryRoot(cwd);

  if (!existsSync(root)) {
    mkdirSync(root, { recursive: true });
  }

  const registryPath = registryFilePath('registry.json', cwd);
  if (!existsSync(registryPath)) {
    const registry = {
      schema_version: 'api-registry',
      last_imported_at: CURRENT_DATE,
      last_audited_at: CURRENT_DATE,
      freshness_days: DEFAULT_FRESHNESS_DAYS,
      health: 'ok',
      health_score: 8.7,
    };
    writeFileSync(registryPath, JSON.stringify(registry, null, 2));
  }

  const categoriesPath = registryFilePath('categories.json', cwd);
  if (!existsSync(categoriesPath)) {
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
    writeFileSync(categoriesPath, JSON.stringify(categories, null, 2));
  }

  const aliasesPath = registryFilePath('aliases.json', cwd);
  if (!existsSync(aliasesPath)) {
    const aliases: Aliases = {
      anime: ['animation', 'manga', 'entertainment'],
      movie: ['film', 'cinema', 'entertainment'],
      job: ['career', 'employment', 'recruiting'],
      'weather app': ['forecast', 'climate', 'weather'],
      'finance tracker': ['stocks', 'currency', 'finance'],
      'developer tool': ['devtools', 'programming', 'developer-tools'],
    };
    writeFileSync(aliasesPath, JSON.stringify(aliases, null, 2));
  }

  const contractsPath = registryFilePath('contracts.json', cwd);
  if (!existsSync(contractsPath)) {
    const contracts: Contracts = {
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
    writeFileSync(contractsPath, JSON.stringify(contracts, null, 2));
  }

  const sourcesPath = registryFilePath('sources.json', cwd);
  if (!existsSync(sourcesPath)) {
    const sources = {
      sources: [
        {
          name: 'public-apis',
          url: 'https://github.com/public-apis/public-apis',
          importedAt: CURRENT_DATE,
          license: 'MIT',
        },
      ],
      updatedAt: CURRENT_DATE,
    };
    writeFileSync(sourcesPath, JSON.stringify(sources, null, 2));
  }
}
