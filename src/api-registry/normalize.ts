import { AUTH_VALUES, CONSUMER_PROFILES, CORS_VALUES, FIT_KEYS, PRICING_VALUES } from './constants.js';
import type { ApiRecord, FieldConfidence, FitScores } from './types.js';

function dateAtUtcStart(value: string): string {
  return value.includes('T') ? value : `${value}T00:00:00Z`;
}

function assertKnownCategory(category: string, categories: string[]): void {
  if (!categories.includes(category)) {
    throw new Error(`"${category}" is not a valid category`);
  }
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} is required`);
  }
  return value;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function firstValue<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  return typeof value === 'string' && allowed.includes(value) ? value as T[number] : fallback;
}

function normalizeFit(value: unknown): FitScores {
  const input = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const fit = {} as FitScores;

  for (const key of FIT_KEYS) {
    const score = input[key] ?? 5;
    if (typeof score !== 'number' || score < 1 || score > 10) {
      throw new Error(`fit.${key} must be number 1-10, got ${score}`);
    }
    fit[key] = score;
  }

  return fit;
}

function normalizeConfidence(value: unknown): FieldConfidence[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error('confidence must be array');
  }

  return value.map((item, index) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error(`confidence[${index}] must be object`);
    }
    const conf = item as Record<string, unknown>;
    const field = assertString(conf.field, `confidence[${index}].field`);
    const rawScore = conf.confidence;
    if (typeof rawScore !== 'number') {
      throw new Error(`confidence[${index}].confidence must be number`);
    }

    const score = rawScore > 0 && rawScore <= 1 ? rawScore * 10 : rawScore;
    if (score < 1 || score > 10) {
      throw new Error(`confidence[${index}].confidence must be number 1-10, got ${rawScore}`);
    }

    return {
      ...conf,
      field,
      confidence: score,
    } as FieldConfidence;
  });
}

export function normalizeId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function normalizeApiRecord(input: Partial<ApiRecord>, categories: string[], today = new Date().toISOString().slice(0, 10)): ApiRecord {
  const name = assertString(input.name, 'name');
  const category = assertString(input.category, 'category');
  assertKnownCategory(category, categories);

  const now = dateAtUtcStart(today);
  const record = {
    ...input,
    id: input.id ?? normalizeId(name),
    name,
    description: input.description ?? '',
    category,
    tags: isStringArray(input.tags) ? input.tags : [],
    homepage: assertString(input.homepage, 'homepage'),
    auth: firstValue(input.auth, AUTH_VALUES, 'unknown'),
    cors: firstValue(input.cors, CORS_VALUES, 'unknown'),
    pricing: firstValue(input.pricing, PRICING_VALUES, 'unknown'),
    status: input.status ?? 'trusted',
    fit: normalizeFit(input.fit),
    consumerProfiles: Array.isArray(input.consumerProfiles)
      ? input.consumerProfiles.filter((profile): profile is ApiRecord['consumerProfiles'][number] => CONSUMER_PROFILES.includes(profile as any))
      : [],
    source: input.source ?? { name: 'unknown', url: input.homepage, importedAt: now },
    evidence: Array.isArray(input.evidence) ? input.evidence : [],
    confidence: normalizeConfidence(input.confidence),
    updatedAt: input.updatedAt ?? now,
    createdAt: input.createdAt ?? now,
    notes: input.notes ?? [],
  };

  return record as ApiRecord;
}

export function staleAfter(checkedAt: string, freshnessDays: number): string {
  const stale = new Date(checkedAt);
  stale.setUTCDate(stale.getUTCDate() + freshnessDays);
  return stale.toISOString().replace('.000Z', 'Z');
}
