import type { Aliases, ApiRecord, ConsumerProfile, RankedApiMatch, RegistryManifest, SearchInput, SearchResult } from './types.js';

const PROFILE_FIT: Record<ConsumerProfile, keyof ApiRecord['fit']> = {
  'frontend-only': 'frontend',
  'backend-required': 'backend',
  prototype: 'prototype',
  production: 'production',
  'mobile-app': 'mobile',
  dashboard: 'dashboard',
  automation: 'automation',
};

export function expandQuery(query: string, aliases: Aliases): string[] {
  const lower = query.toLowerCase();
  const terms = tokenize(query);
  const expanded = [...terms];

  for (const [alias, values] of Object.entries(aliases)) {
    if (lower.includes(alias.toLowerCase()) || terms.includes(alias.toLowerCase())) {
      for (const value of values) {
        if (!expanded.includes(value.toLowerCase())) expanded.push(value.toLowerCase());
      }
    }
  }

  return expanded;
}

export function searchApis(input: SearchInput, records: ApiRecord[], aliases: Aliases, manifest: RegistryManifest): SearchResult {
  const terms = expandQuery(input.query, aliases);
  const rejected = records
    .filter((record) => input.consumer_profile === 'frontend-only' && record.cors === 'no')
    .map((record) => ({ id: record.id, reason: 'frontend-only requires cors:yes or cors:unknown, got cors:no' }));

  const candidates = records
    .filter((record) => !rejected.some((item) => item.id === record.id))
    .filter((record) => matchesFilters(record, input))
    .map((record) => scoreRecord(record, terms, input, manifest))
    .filter((match) => match.matched_terms.length > 0)
    .sort((a, b) => b.score - a.score || a.record.name.localeCompare(b.record.name));

  const limit = input.limit ?? 10;
  const recommended = candidates.slice(0, limit);
  const alternatives = candidates.slice(limit);
  const warnings = candidates.flatMap((match) => match.warnings);

  return {
    query: input.query,
    consumer_profile: input.consumer_profile ?? null,
    recommended,
    alternatives,
    rejected,
    warnings,
    registry_health: manifest,
  };
}

function tokenize(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9-]+/).filter(Boolean);
}

function matchesFilters(record: ApiRecord, input: SearchInput): boolean {
  if (input.category && record.category !== input.category) return false;
  if (input.tags?.length && !input.tags.every((tag) => record.tags.includes(tag))) return false;
  if (input.auth?.length && !input.auth.includes(record.auth)) return false;
  if (input.cors?.length && !input.cors.includes(record.cors)) return false;
  if (input.pricing?.length && !input.pricing.includes(record.pricing)) return false;
  if (input.status?.length && !input.status.includes(record.status)) return false;
  return true;
}

function scoreRecord(record: ApiRecord, terms: string[], input: SearchInput, manifest: RegistryManifest): RankedApiMatch {
  const matchedFields = new Set<string>();
  const matchedTerms = new Set<string>();
  let score = 0;

  for (const term of terms) {
    if (record.name.toLowerCase().includes(term)) addMatch(term, 'name', 35);
    if (record.description.toLowerCase().includes(term)) addMatch(term, 'description', 25);
    if (record.category.toLowerCase() === term) addMatch(term, 'category', 30);
    if (record.tags.some((tag) => tag.toLowerCase() === term || tag.toLowerCase().includes(term))) addMatch(term, 'tags', 20);
  }

  const fitKey = input.consumer_profile ? PROFILE_FIT[input.consumer_profile] : undefined;
  if (fitKey) score += record.fit[fitKey] * 5;
  if (input.consumer_profile && record.consumerProfiles.includes(input.consumer_profile)) score += 20;

  score += record.status === 'trusted' ? 20 : record.status === 'needs_review' ? 5 : -50;
  score += averageConfidence(record) * 3;
  score += record.source.url ? 5 : 0;
  score += freshnessScore(record.updatedAt, manifest);
  score += completenessScore(record);
  score -= qualityWarnings(record, manifest).length * 4;

  return {
    record,
    score,
    matched_fields: [...matchedFields],
    matched_terms: [...matchedTerms],
    warnings: qualityWarnings(record, manifest),
  };

  function addMatch(term: string, field: string, points: number): void {
    matchedTerms.add(term);
    matchedFields.add(field);
    score += points;
  }
}

function averageConfidence(record: ApiRecord): number {
  if (record.confidence.length === 0) return 0;
  return record.confidence.reduce((sum, item) => sum + item.confidence, 0) / record.confidence.length;
}

function freshnessScore(updatedAt: string, manifest: RegistryManifest): number {
  const updated = Date.parse(updatedAt);
  const audited = Date.parse(manifest.last_audited_at);
  if (Number.isNaN(updated) || Number.isNaN(audited)) return 0;
  const days = (audited - updated) / 86_400_000;
  return days <= manifest.freshness_days ? 20 : 0;
}

function completenessScore(record: ApiRecord): number {
  let score = 0;
  if (record.homepage) score += 3;
  if (record.docsUrl) score += 5;
  if (record.evidence.length > 0) score += 5;
  if (record.tags.length > 0) score += 3;
  return score;
}

export function qualityWarnings(record: ApiRecord, manifest: RegistryManifest): string[] {
  const warnings: string[] = [];
  const confidence = averageConfidence(record);
  const updated = Date.parse(record.updatedAt);
  const audited = Date.parse(manifest.last_audited_at);
  const days = (audited - updated) / 86_400_000;

  if (!record.docsUrl) warnings.push(`${record.id}: missing docsUrl`);
  if (record.evidence.length === 0) warnings.push(`${record.id}: missing evidence`);
  if (confidence > 0 && confidence < 6) warnings.push(`${record.id}: low average confidence ${formatNumber(confidence)}`);
  if (record.cors === 'unknown') warnings.push(`${record.id}: cors is unknown`);
  if (record.pricing === 'unknown') warnings.push(`${record.id}: pricing is unknown`);
  if (record.status === 'needs_review') warnings.push(`${record.id}: needs review before production use`);
  if (!Number.isNaN(days) && days > manifest.freshness_days) {
    warnings.push(`${record.id}: stale record updatedAt ${record.updatedAt} exceeds freshness window ${manifest.freshness_days} days`);
  }

  return warnings;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
