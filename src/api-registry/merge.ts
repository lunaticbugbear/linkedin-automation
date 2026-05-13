import type { ApiRecord, DuplicateMatch, FieldConfidence } from './types.js';
import { normalizeId } from './normalize.js';

type MergeField = keyof Pick<ApiRecord, 'name' | 'description' | 'category' | 'homepage' | 'docsUrl' | 'auth' | 'cors' | 'pricing'>;

const MERGE_FIELDS: MergeField[] = ['name', 'description', 'category', 'homepage', 'docsUrl', 'auth', 'cors', 'pricing'];

function newestEvidenceDate(record: ApiRecord): string {
  return record.evidence
    .map((evidence) => evidence.checkedAt)
    .sort()
    .at(-1) ?? record.updatedAt;
}

function confidenceFor(record: ApiRecord, field: string): number {
  return record.confidence.find((confidence) => confidence.field === field)?.confidence ?? 0;
}

function chooseField<T>(field: MergeField, existing: ApiRecord, candidate: ApiRecord): T {
  const existingValue = existing[field] as T;
  const candidateValue = candidate[field] as T;

  if (candidateValue === undefined || candidateValue === '') return existingValue;
  if (existingValue === undefined || existingValue === '') return candidateValue;

  const existingConfidence = confidenceFor(existing, field);
  const candidateConfidence = confidenceFor(candidate, field);

  if (candidateConfidence > existingConfidence) return candidateValue;
  if (existingConfidence > candidateConfidence) return existingValue;

  return newestEvidenceDate(candidate) > newestEvidenceDate(existing) ? candidateValue : existingValue;
}

function uniqueByJson<T>(items: T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    const key = JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

function mergeConfidence(existing: FieldConfidence[], candidate: FieldConfidence[]): FieldConfidence[] {
  const byField = new Map<string, FieldConfidence>();
  for (const confidence of [...existing, ...candidate]) {
    const current = byField.get(confidence.field);
    if (!current || confidence.confidence > current.confidence) {
      byField.set(confidence.field, confidence);
    }
  }
  return [...byField.values()];
}

function hasHighConfidenceConflict(existing: ApiRecord, candidate: ApiRecord): boolean {
  for (const field of MERGE_FIELDS) {
    const existingValue = existing[field];
    const candidateValue = candidate[field];
    if (existingValue === undefined || candidateValue === undefined || existingValue === candidateValue) {
      continue;
    }
    if (confidenceFor(existing, field) >= 8 && confidenceFor(candidate, field) >= 8) {
      return true;
    }
  }
  return false;
}

function latestTimestamp(a: string, b: string): string {
  return b > a ? b : a;
}

export function findDuplicate(existing: ApiRecord[], candidate: ApiRecord): DuplicateMatch | undefined {
  if (candidate.docsUrl) {
    const docsMatch = existing.find((record) => record.docsUrl && record.docsUrl === candidate.docsUrl);
    if (docsMatch) {
      return {
        type: 'same-docs',
        existingId: docsMatch.id,
        candidateId: candidate.id,
        reason: `same docsUrl: ${candidate.docsUrl}`,
      };
    }
  }

  const candidateName = normalizeId(candidate.name);
  const nameMatch = existing.find((record) => normalizeId(record.name) === candidateName && record.category === candidate.category);
  if (nameMatch) {
    return {
      type: 'possible-duplicate',
      existingId: nameMatch.id,
      candidateId: candidate.id,
      reason: `same normalized name/category: ${candidateName}/${candidate.category}`,
    };
  }

  return undefined;
}

export function mergeApiRecord(existing: ApiRecord, candidate: ApiRecord): ApiRecord {
  const merged: ApiRecord = {
    ...existing,
    tags: [...new Set([...existing.tags, ...candidate.tags])],
    fit: { ...existing.fit, ...candidate.fit },
    consumerProfiles: [...new Set([...existing.consumerProfiles, ...candidate.consumerProfiles])],
    evidence: uniqueByJson([...existing.evidence, ...candidate.evidence]),
    confidence: mergeConfidence(existing.confidence, candidate.confidence),
    updatedAt: latestTimestamp(existing.updatedAt, candidate.updatedAt),
    createdAt: existing.createdAt,
    notes: [...new Set([...(existing.notes ?? []), ...(candidate.notes ?? [])])],
  };

  for (const field of MERGE_FIELDS) {
    (merged as any)[field] = chooseField(field, existing, candidate);
  }

  if (hasHighConfidenceConflict(existing, candidate)) {
    merged.status = 'needs_review';
  }

  return merged;
}
