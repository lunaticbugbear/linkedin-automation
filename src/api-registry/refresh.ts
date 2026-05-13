import type { AgentOutput, ApiRecord, RegistryManifest, RefreshReport } from './types.js';
import { validateAgentOutput } from './agent-contract.js';

export function normalizeAgentRecords(output: AgentOutput, categories: string[]): ApiRecord[] {
  const validated = validateAgentOutput(output);
  return validated.results.map((match) => {
    if (!categories.includes(match.record.category)) {
      throw new Error(`Invalid agent payload at $.results[].record.category: expected one of configured categories`);
    }
    return match.record;
  });
}

export function selectStaleRecords(records: ApiRecord[], manifest: RegistryManifest, today: string = new Date().toISOString().split('T')[0]): ApiRecord[] {
  const freshnessDays = manifest.freshness_days ?? 90;
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - freshnessDays);

  return records.filter((record) => {
    const checkedAtValues = record.evidence.map((item) => item.checkedAt).filter((value) => value.length > 0);
    const latestCheckedAt = checkedAtValues.length > 0
      ? checkedAtValues.sort().at(-1)!
      : record.updatedAt;
    return new Date(latestCheckedAt) < cutoff;
  });
}

export function applyRefreshResults(records: ApiRecord[], output: AgentOutput, categories: string[]): RefreshReport {
  const validated = validateAgentOutput(output);
  const findings = [...validated.findings];
  const refreshed: ApiRecord[] = [];
  let refreshedCount = 0;
  let unchangedCount = 0;
  let failedCount = 0;
  let needsReviewCount = 0;

  for (const record of records) {
    const matchedResult = validated.results.find((r) => r.record.id === record.id);
    if (!matchedResult) {
      failedCount++;
      findings.push({
        level: 'error',
        code: 'refresh_failed',
        message: `No refresh result for record ${record.id}`,
        recordId: record.id,
      });
      continue;
    }

    const newRecord = matchedResult.record;
    const hasErrors = validated.findings.some((f) => f.recordId === record.id && f.level === 'error');
    const hasWarnings = validated.findings.some((f) => f.recordId === record.id && f.level === 'warning');

    if (hasErrors) {
      failedCount++;
      refreshed.push(record);
      continue;
    }

    if (hasWarnings) {
      needsReviewCount++;
      findings.push({
        level: 'warning',
        code: 'refresh_needs_review',
        message: `Refresh of ${record.id} has warnings`,
        recordId: record.id,
      });
    }

    if (JSON.stringify(record) === JSON.stringify(newRecord)) {
      unchangedCount++;
      refreshed.push(record);
    } else {
      refreshedCount++;
      refreshed.push(newRecord);
    }
  }

  return {
    refreshed: refreshedCount,
    unchanged: unchangedCount,
    failed: failedCount,
    needs_review: needsReviewCount,
    records: refreshed,
    findings,
  };
}
