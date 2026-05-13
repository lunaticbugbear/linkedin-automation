import { CONSUMER_PROFILES } from './constants.js';
import type { AgentInput, AgentOutput, AuditFinding, RankedApiMatch } from './types.js';
import { validateApiRecord } from './validation.js';

function fail(path: string, message: string): never {
  throw new Error(`Invalid agent payload at ${path}: ${message}`);
}

function objectAt(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, 'expected object');
  }
  return value as Record<string, unknown>;
}

function stringAt(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    fail(path, 'expected non-empty string');
  }
  return value;
}

function numberAt(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(path, 'expected finite number');
  }
  return value;
}

function stringArrayAt(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) {
    fail(path, 'expected array');
  }
  value.forEach((item, index) => stringAt(item, `${path}[${index}]`));
  return value as string[];
}

function validateFinding(value: unknown, path: string): AuditFinding {
  const finding = objectAt(value, path);
  const level = finding.level;
  if (level !== 'error' && level !== 'warning' && level !== 'info') {
    fail(`${path}.level`, 'expected error, warning, or info');
  }
  stringAt(finding.code, `${path}.code`);
  stringAt(finding.message, `${path}.message`);
  if (finding.recordId !== undefined) stringAt(finding.recordId, `${path}.recordId`);
  if (finding.fix !== undefined) stringAt(finding.fix, `${path}.fix`);
  return value as AuditFinding;
}

function validateRankedMatch(value: unknown, path: string): RankedApiMatch {
  const match = objectAt(value, path);
  validateApiRecord(match.record);
  numberAt(match.score, `${path}.score`);
  stringArrayAt(match.matched_fields, `${path}.matched_fields`);
  stringArrayAt(match.matched_terms, `${path}.matched_terms`);
  stringArrayAt(match.warnings, `${path}.warnings`);
  requireFieldEvidence(match.record, `${path}.record`);
  return value as RankedApiMatch;
}

function requireFieldEvidence(value: unknown, path: string): void {
  const record = objectAt(value, path);
  const evidence = record.evidence as unknown[];
  const evidenceUrls = new Set(
    evidence
      .map((item) => (typeof item === 'object' && item !== null && !Array.isArray(item) ? (item as Record<string, unknown>).url : undefined))
      .filter((url): url is string => typeof url === 'string' && url.length > 0),
  );
  const confidence = record.confidence as unknown[];
  confidence.forEach((item, index) => {
    const entry = objectAt(item, `${path}.confidence[${index}]`);
    if (typeof entry.source !== 'string' || entry.source.length === 0) {
      fail(`${path}.confidence[${index}].source`, 'expected evidence URL for field confidence');
    }
    if (!evidenceUrls.has(entry.source)) {
      fail(`${path}.confidence[${index}].source`, 'must match record evidence URL');
    }
  });
}

export function validateAgentInput(value: unknown): AgentInput {
  const input = objectAt(value, '$');
  stringAt(input.query, '$.query');
  if (input.category !== undefined) stringAt(input.category, '$.category');
  if (input.consumerProfile !== undefined && !CONSUMER_PROFILES.includes(input.consumerProfile as never)) {
    fail('$.consumerProfile', `expected one of: ${CONSUMER_PROFILES.join(', ')}`);
  }
  if (input.maxResults !== undefined) {
    const maxResults = numberAt(input.maxResults, '$.maxResults');
    if (!Number.isInteger(maxResults) || maxResults < 1) fail('$.maxResults', 'expected positive integer');
  }
  if (input.refresh !== undefined && typeof input.refresh !== 'boolean') {
    fail('$.refresh', 'expected boolean');
  }
  return value as AgentInput;
}

export function validateAgentOutput(value: unknown): AgentOutput {
  const output = objectAt(value, '$');
  stringAt(output.query, '$.query');
  stringAt(output.generatedAt, '$.generatedAt');
  if (!Array.isArray(output.results)) fail('$.results', 'expected array');
  output.results.forEach((item, index) => validateRankedMatch(item, `$.results[${index}]`));
  if (!Array.isArray(output.findings)) fail('$.findings', 'expected array');
  output.findings.forEach((item, index) => validateFinding(item, `$.findings[${index}]`));
  return value as AgentOutput;
}
