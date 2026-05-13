import { AUTH_VALUES, CORS_VALUES, PRICING_VALUES, STATUS_VALUES, CONSUMER_PROFILES, FIT_KEYS } from './constants.js';
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

function isStringInReadonlyArray(value: unknown, allowed: readonly string[]): value is string {
  return typeof value === 'string' && allowed.includes(value);
}

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
    for (let i = 0; i < val.length; i++) {
      const item = val[i];
      if (typeof item !== 'string') {
        throw new Error(`Alias "${key}"[${i}] contains non-string value`);
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

  const requiredKeys = ['schemaVersion', 'authValues', 'corsValues', 'pricingValues', 'statusValues', 'consumerProfiles', 'fitKeys', 'outputShapes'];
  for (const key of requiredKeys) {
    if (!(key in contracts)) {
      throw new Error(`Contracts missing ${key}`);
    }
  }

  if (typeof contracts.schemaVersion !== 'string') {
    throw new Error('Contracts must have schemaVersion string');
  }

  const enumSpecs = [
    { key: 'authValues', allowed: AUTH_VALUES as readonly string[] },
    { key: 'corsValues', allowed: CORS_VALUES as readonly string[] },
    { key: 'pricingValues', allowed: PRICING_VALUES as readonly string[] },
    { key: 'statusValues', allowed: STATUS_VALUES as readonly string[] },
    { key: 'consumerProfiles', allowed: CONSUMER_PROFILES as readonly string[] },
    { key: 'fitKeys', allowed: FIT_KEYS as readonly string[] },
  ];
  for (const spec of enumSpecs) {
    const array = contracts[spec.key];
    if (!Array.isArray(array)) {
      throw new Error(`Contracts must have ${spec.key} array`);
    }
    for (let i = 0; i < array.length; i++) {
      const item = array[i];
      if (typeof item !== 'string') {
        throw new Error(`Contracts.${spec.key}[${i}] must be string, got ${typeof item}`);
      }
      if (!spec.allowed.includes(item)) {
        throw new Error(`Contracts.${spec.key}[${i}] must be one of: ${spec.allowed.join(', ')}`);
      }
    }
  }

  // Validate outputShapes
  if (typeof contracts.outputShapes !== 'object' || contracts.outputShapes === null) {
    throw new Error('Contracts.outputShapes must be object');
  }

  const outputShapes = contracts.outputShapes as Record<string, unknown>;
  const requiredShapes = ['search', 'export', 'agent'];
  for (const shape of requiredShapes) {
    if (!(shape in outputShapes)) {
      throw new Error(`Contracts.outputShapes.${shape} is required`);
    }
  }

  return contracts as unknown as Contracts;
}

export function validateRegistryManifest(value: unknown): RegistryManifest {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Manifest must be an object');
  }

  const manifest = value as Record<string, unknown>;

  const requiredFields = ['schema_version', 'last_imported_at', 'last_audited_at', 'freshness_days', 'health', 'health_score'];
  for (const field of requiredFields) {
    if (!(field in manifest)) {
      throw new Error(`Manifest missing required field: ${field}`);
    }
  }

  if (typeof manifest.schema_version !== 'string') {
    throw new Error('Manifest must have schema_version string');
  }
  if (typeof manifest.last_imported_at !== 'string') {
    throw new Error('Manifest must have last_imported_at string');
  }
  if (typeof manifest.last_audited_at !== 'string') {
    throw new Error('Manifest must have last_audited_at string');
  }
  if (typeof manifest.freshness_days !== 'number') {
    throw new Error('Manifest must have freshness_days number');
  }
  if (typeof manifest.health !== 'string') {
    throw new Error('Manifest must have health string');
  }
  if (typeof manifest.health_score !== 'number') {
    throw new Error('Manifest must have health_score number');
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
  for (let i = 0; i < record.tags.length; i++) {
    if (typeof record.tags[i] !== 'string') {
      throw new Error(`tags[${i}] must be string, got ${typeof record.tags[i]}`);
    }
  }

  if (typeof record.homepage !== 'string') throw new Error('homepage must be string');
  if (!isStringInReadonlyArray(record.auth, AUTH_VALUES)) throw new Error(`auth must be one of: ${AUTH_VALUES.join(', ')}`);
  if (!isStringInReadonlyArray(record.cors, CORS_VALUES)) throw new Error(`cors must be one of: ${CORS_VALUES.join(', ')}`);
  if (!isStringInReadonlyArray(record.pricing, PRICING_VALUES)) throw new Error(`pricing must be one of: ${PRICING_VALUES.join(', ')}`);
  if (!isStringInReadonlyArray(record.status, STATUS_VALUES)) throw new Error(`status must be one of: ${STATUS_VALUES.join(', ')}`);

  // Validate fit scores
  if (typeof record.fit !== 'object' || record.fit === null || Array.isArray(record.fit)) {
    throw new Error('fit must be object');
  }
  const fit = record.fit as Record<string, unknown>;
  for (const key of FIT_KEYS) {
    if (!(key in fit)) {
      throw new Error(`fit.${key} is required`);
    }
    const score = fit[key];
    if (typeof score !== 'number' || score < 0 || score > 10) {
      throw new Error(`fit.${key} must be number 0-10, got ${score}`);
    }
  }

  // Validate consumerProfiles
  if (!Array.isArray(record.consumerProfiles)) throw new Error('consumerProfiles must be array');
  for (let i = 0; i < record.consumerProfiles.length; i++) {
    const profile = record.consumerProfiles[i];
    if (!isStringInReadonlyArray(profile, CONSUMER_PROFILES)) {
      throw new Error(`consumerProfiles[${i}] must be one of: ${CONSUMER_PROFILES.join(', ')}`);
    }
  }

  // Validate source
  if (typeof record.source !== 'object' || record.source === null || Array.isArray(record.source)) {
    throw new Error('source must be object');
  }
  const source = record.source as Record<string, unknown>;
  if (typeof source.name !== 'string') throw new Error('source.name must be string');
  if (typeof source.url !== 'string') throw new Error('source.url must be string');
  if (typeof source.importedAt !== 'string') throw new Error('source.importedAt must be string');

  // Validate evidence
  if (!Array.isArray(record.evidence)) throw new Error('evidence must be array');
  for (let i = 0; i < record.evidence.length; i++) {
    const ev = record.evidence[i];
    if (typeof ev !== 'object' || ev === null || Array.isArray(ev)) {
      throw new Error(`evidence[${i}] must be object`);
    }
    const evObj = ev as Record<string, unknown>;
    if (typeof evObj.url !== 'string') throw new Error(`evidence[${i}].url must be string`);
    if (typeof evObj.checkedAt !== 'string') throw new Error(`evidence[${i}].checkedAt must be string`);
    if (evObj.excerpt !== undefined && typeof evObj.excerpt !== 'string') {
      throw new Error(`evidence[${i}].excerpt must be string, got ${typeof evObj.excerpt}`);
    }
  }

  // Validate confidence
  if (!Array.isArray(record.confidence)) throw new Error('confidence must be array');
  for (let i = 0; i < record.confidence.length; i++) {
    const conf = record.confidence[i];
    if (typeof conf !== 'object' || conf === null || Array.isArray(conf)) {
      throw new Error(`confidence[${i}] must be object`);
    }
    const confObj = conf as Record<string, unknown>;
    if (typeof confObj.field !== 'string') throw new Error(`confidence[${i}].field must be string`);
    const confScore = confObj.confidence;
    if (typeof confScore !== 'number' || confScore < 0 || confScore > 1) {
      throw new Error(`confidence[${i}].confidence must be number 0-1, got ${confScore}`);
    }
  }

  if (typeof record.updatedAt !== 'string') throw new Error('updatedAt must be string');
  if (typeof record.createdAt !== 'string') throw new Error('createdAt must be string');

  return record as unknown as ApiRecord;
}
