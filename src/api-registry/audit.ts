import { AUTH_VALUES, CORS_VALUES, FIT_KEYS, PRICING_VALUES, STATUS_VALUES } from './constants.js';
import { registryFilePath, readJsonFile } from './paths.js';
import { writeJsonAtomically } from './safe-write.js';
import type { ApiRecord, AuditFinding, AuditSummary, RegistryManifest } from './types.js';

export interface AuditInput {
  records: unknown[];
  manifest: RegistryManifest;
  categories: string[];
  now?: string;
  cwd?: string;
  updateManifest?: boolean;
  linkChecker?: (url: string) => boolean;
}

interface ExtendedAuditSummary extends AuditSummary {
  health: 'ok' | 'warning' | 'critical';
  healthScore: number;
}

const REQUIRED_FIELDS = ['id', 'name', 'description', 'category', 'tags', 'homepage', 'auth', 'cors', 'pricing', 'status', 'fit', 'consumerProfiles', 'source', 'evidence', 'confidence', 'updatedAt', 'createdAt'];

function finding(level: AuditFinding['level'], code: string, message: string, recordId?: string, fix?: string): AuditFinding {
  return { level, code, message, recordId, fix };
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function calcHealth(findings: AuditFinding[]): { health: ExtendedAuditSummary['health']; healthScore: number } {
  const errors = findings.filter((item) => item.level === 'error').length;
  const warnings = findings.filter((item) => item.level === 'warning').length;
  const score = Math.max(0, Number((10 - errors * 2 - warnings * 0.06).toFixed(1)));
  return { healthScore: score, health: errors > 0 ? 'critical' : score < 8 ? 'warning' : 'ok' };
}

function latestEvidenceDate(record: ApiRecord): string {
  const checked = record.evidence.map((item) => item.checkedAt).filter((x) => typeof x === 'string' && x.length > 0).sort();
  return checked.length > 0 ? checked[checked.length - 1] : record.updatedAt;
}

function auditRecordShape(raw: unknown, categories: string[], findings: AuditFinding[]): ApiRecord | null {
  const record = objectRecord(raw);
  if (!record) {
    findings.push(finding('error', 'invalid_record', 'Record must be object'));
    return null;
  }

  const id = typeof record.id === 'string' ? record.id : undefined;
  for (const field of REQUIRED_FIELDS) {
    if (!(field in record)) {
      findings.push(finding('error', 'missing_required_field', `Record missing required field: ${field}`, id));
    }
  }
  if (REQUIRED_FIELDS.some((field) => !(field in record))) return null;

  if (!categories.includes(String(record.category))) {
    findings.push(finding('error', 'contract_drift', `Record category ${String(record.category)} is not configured`, id, 'Use configured categories.json category.'));
  }
  if (!AUTH_VALUES.includes(record.auth as never)) findings.push(finding('error', 'contract_drift', `Invalid auth value ${String(record.auth)}`, id));
  if (!CORS_VALUES.includes(record.cors as never)) findings.push(finding('error', 'contract_drift', `Invalid cors value ${String(record.cors)}`, id));
  if (!PRICING_VALUES.includes(record.pricing as never)) findings.push(finding('error', 'contract_drift', `Invalid pricing value ${String(record.pricing)}`, id));
  if (!STATUS_VALUES.includes(record.status as never)) findings.push(finding('error', 'contract_drift', `Invalid status value ${String(record.status)}`, id));

  return record as unknown as ApiRecord;
}

function auditRecordQuality(record: ApiRecord, categories: string[], findings: AuditFinding[]): void {
  if (record.auth === 'unknown' || record.cors === 'unknown' || record.pricing === 'unknown') {
    findings.push(finding('warning', 'unknown_value_needs_review', `${record.id} has unknown values`, record.id, 'Refresh evidence and resolve unknown values.'));
  }

  if (!record.tags.includes(record.category) && categories.includes(record.category)) {
    findings.push(finding('warning', 'inconsistent_tags', `${record.id} tags do not include category ${record.category}`, record.id));
  }

  const source = objectRecord(record.source);
  if (!source || typeof source.name !== 'string' || source.name.length === 0 || typeof source.url !== 'string' || source.url.length === 0 || typeof source.importedAt !== 'string' || source.importedAt.length === 0) {
    findings.push(finding('error', 'invalid_source', `${record.id} has invalid source metadata`, record.id));
  }

  if (!Array.isArray(record.evidence) || record.evidence.length === 0) {
    findings.push(finding('warning', 'missing_evidence', `${record.id} has no evidence`, record.id));
  }

  for (const key of FIT_KEYS) {
    const score = record.fit?.[key];
    if (typeof score !== 'number' || score < 0 || score > 10) {
      findings.push(finding('error', 'invalid_fit_score', `${record.id} fit.${key} must be 0-10`, record.id));
    }
  }

  for (const entry of record.confidence ?? []) {
    if (typeof entry.confidence !== 'number' || entry.confidence < 1 || entry.confidence > 10) {
      findings.push(finding('error', 'invalid_confidence', `${record.id} confidence.${entry.field} must be 1-10`, record.id));
    }
    if (!entry.source || !record.evidence.some((evidence) => evidence.url === entry.source)) {
      findings.push(finding('warning', 'missing_evidence', `${record.id} confidence.${entry.field} lacks matching evidence`, record.id));
    }
  }
}

export function auditRegistry(input: AuditInput): ExtendedAuditSummary {
  const now = input.now ?? new Date().toISOString().slice(0, 10);
  const findings: AuditFinding[] = [];
  const records: ApiRecord[] = [];

  for (const raw of input.records) {
    const record = auditRecordShape(raw, input.categories, findings);
    if (record) records.push(record);
  }

  const ids = new Map<string, number>();
  const docsUrls = new Map<string, string[]>();
  for (const record of records) {
    ids.set(record.id, (ids.get(record.id) ?? 0) + 1);
    if (record.docsUrl) {
      if (!docsUrls.has(record.docsUrl)) docsUrls.set(record.docsUrl, []);
      docsUrls.get(record.docsUrl)!.push(record.id);
    }
    auditRecordQuality(record, input.categories, findings);
  }
  for (const [id, count] of ids) {
    if (count > 1) findings.push(finding('error', 'duplicate_id', `Duplicate record id ${id}`, id));
  }
  for (const [url, ids] of docsUrls) {
    if (ids.length > 1) {
      for (const id of ids) {
        findings.push(finding('warning', 'duplicate_docs_url', `${id} shares docs URL ${url} with ${ids.filter((x) => x !== id).join(', ')}`, id));
      }
    }
  }

  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - input.manifest.freshness_days);
  for (const record of records) {
    const latest = latestEvidenceDate(record);
    if (new Date(record.updatedAt) < cutoff || new Date(latest) < cutoff) {
      findings.push(finding('warning', 'stale_record', `${record.id} latest evidence ${latest} exceeds freshness window ${input.manifest.freshness_days} days`, record.id));
    }
  }

  const finish = (extraFindings: AuditFinding[] = []): ExtendedAuditSummary => {
    findings.push(...extraFindings);
    const { health, healthScore } = calcHealth(findings);
    const summary: ExtendedAuditSummary = {
      checkedAt: now,
      recordCount: input.records.length,
      errorCount: findings.filter((item) => item.level === 'error').length,
      warningCount: findings.filter((item) => item.level === 'warning').length,
      findings,
      health,
      healthScore,
    };

    if (input.updateManifest && input.cwd) {
      const manifestPath = registryFilePath('registry.json', input.cwd);
      const manifest = readJsonFile<RegistryManifest>(manifestPath);
      writeJsonAtomically(manifestPath, { ...manifest, last_audited_at: now, health, health_score: healthScore });
    }

    return summary;
  };

  if (!input.linkChecker) return finish();

  const linkFindings: AuditFinding[] = [];
  for (const record of records.filter((item) => item.docsUrl)) {
    const ok = input.linkChecker(record.docsUrl!);
    if (!ok) linkFindings.push(finding('warning', 'broken_docs_link', `${record.id} docs URL failed link check: ${record.docsUrl}`, record.id));
  }

  return finish(linkFindings);
}
