import { AUTH_VALUES, CORS_VALUES, PRICING_VALUES, STATUS_VALUES } from './constants.js';
import type { ApiRecord, RegistryManifest, Contracts, Aliases } from './types.js';

const CANONICAL_CATEGORIES = [
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

export function validateCategories(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error('Categories must be an array');
  }

  for (const cat of value) {
    if (!CANONICAL_CATEGORIES.includes(cat)) {
      throw new Error(`"${cat}" is not a valid category`);
    }
  }

  return value;
}

export function validateAliases(value: unknown): Aliases {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Aliases must be an object');
  }

  const aliases = value as Record<string, unknown>;
  for (const [key, val] of Object.entries(aliases)) {
    if (!Array.isArray(val)) {
      throw new Error(`Alias "${key}" must have an array value`);
    }
    for (const item of val) {
      if (typeof item !== 'string') {
        throw new Error(`Alias "${key}" contains non-string value`);
      }
    }
  }

  return aliases as Aliases;
}

export function validateContracts(value: unknown): Contracts {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Contracts must be an object');
  }

  const contracts = value as Record<string, unknown>;

  for (const key of ['schemaVersion', 'authValues', 'corsValues', 'pricingValues', 'statusValues', 'consumerProfiles', 'fitKeys']) {
    if (!(key in contracts)) {
      throw new Error(`Contracts missing ${key}`);
    }
  }

  if (typeof contracts.schemaVersion !== 'string') {
    throw new Error('Contracts must have schemaVersion string');
  }

  for (const key of ['authValues', 'corsValues', 'pricingValues', 'statusValues', 'consumerProfiles', 'fitKeys']) {
    if (!Array.isArray(contracts[key])) {
      throw new Error(`Contracts must have ${key} array`);
    }
  }

  return contracts as unknown as Contracts;
}

export function validateRegistryManifest(value: unknown): RegistryManifest {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Manifest must be an object');
  }

  const manifest = value as Record<string, unknown>;

  if (typeof manifest.version !== 'string') {
    throw new Error('Manifest must have version string');
  }
  if (typeof manifest.generatedAt !== 'string') {
    throw new Error('Manifest must have generatedAt string');
  }
  if (typeof manifest.recordCount !== 'number') {
    throw new Error('Manifest must have recordCount number');
  }
  if (!Array.isArray(manifest.categories)) {
    throw new Error('Manifest must have categories array');
  }
  if (typeof manifest.sourceCatalog !== 'string') {
    throw new Error('Manifest must have sourceCatalog string');
  }

  return manifest as unknown as RegistryManifest;
}

export function validateApiRecord(value: unknown): ApiRecord {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Record must be an object');
  }

  const record = value as Record<string, unknown>;
  const requiredFields = ['id', 'name', 'description', 'category', 'tags', 'homepage', 'auth', 'cors', 'pricing', 'status', 'fit', 'consumerProfiles', 'source', 'evidence', 'confidence', 'updatedAt', 'createdAt'];

  for (const field of requiredFields) {
    if (!(field in record)) {
      throw new Error(`Record missing required field: ${field}`);
    }
  }

  if (typeof record.id !== 'string') throw new Error('id must be string');
  if (typeof record.name !== 'string') throw new Error('name must be string');
  if (typeof record.description !== 'string') throw new Error('description must be string');
  if (typeof record.category !== 'string') throw new Error('category must be string');
  if (!Array.isArray(record.tags)) throw new Error('tags must be array');
  if (typeof record.homepage !== 'string') throw new Error('homepage must be string');
  if (!AUTH_VALUES.includes(record.auth as any)) throw new Error(`auth must be one of: ${AUTH_VALUES.join(', ')}`);
  if (!CORS_VALUES.includes(record.cors as any)) throw new Error(`cors must be one of: ${CORS_VALUES.join(', ')}`);
  if (!PRICING_VALUES.includes(record.pricing as any)) throw new Error(`pricing must be one of: ${PRICING_VALUES.join(', ')}`);
  if (!STATUS_VALUES.includes(record.status as any)) throw new Error(`status must be one of: ${STATUS_VALUES.join(', ')}`);
  if (!Array.isArray(record.consumerProfiles)) throw new Error('consumerProfiles must be array');
  if (typeof record.source !== 'object' || record.source === null) throw new Error('source must be object');
  if (!Array.isArray(record.evidence)) throw new Error('evidence must be array');
  if (!Array.isArray(record.confidence)) throw new Error('confidence must be array');
  if (typeof record.updatedAt !== 'string') throw new Error('updatedAt must be string');
  if (typeof record.createdAt !== 'string') throw new Error('createdAt must be string');

  return record as unknown as ApiRecord;
}
