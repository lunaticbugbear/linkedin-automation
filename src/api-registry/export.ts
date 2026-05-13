import { searchApis } from './search.js';
import type { Aliases, ApiRecord, Contracts, ExportInput, RegistryManifest, SearchResult } from './types.js';

export function exportShortlist(input: ExportInput, records: ApiRecord[], aliases: Aliases, manifest: RegistryManifest, contracts: Contracts): string {
  const result = searchApis(input, records, aliases, manifest);

  if (input.format === 'json') {
    return JSON.stringify({ ...result, contract: contracts.outputShapes.export, exportedAt: new Date().toISOString() }, null, 2);
  }

  return toMarkdown(result);
}

function toMarkdown(result: SearchResult): string {
  const lines: string[] = [];
  lines.push(`# API shortlist: ${result.query}`);
  lines.push('');
  if (result.consumer_profile) lines.push(`Consumer profile: ${result.consumer_profile}`);
  lines.push('');
  lines.push('## Recommended');
  lines.push('');
  appendTable(lines, result.recommended);
  lines.push('');
  lines.push('## Alternatives');
  lines.push('');
  appendTable(lines, result.alternatives);
  lines.push('');
  lines.push('## Rejected');
  lines.push('');
  if (result.rejected.length === 0) lines.push('- None');
  for (const item of result.rejected) lines.push(`- ${item.id}: ${item.reason}`);
  lines.push('');
  lines.push('## Warnings');
  lines.push('');
  if (result.warnings.length === 0) lines.push('- None');
  for (const warning of result.warnings) lines.push(`- ${warning}`);
  lines.push('');
  lines.push('## Registry health');
  lines.push('');
  lines.push(`- schema_version: ${result.registry_health.schema_version}`);
  lines.push(`- last_imported_at: ${result.registry_health.last_imported_at}`);
  lines.push(`- last_audited_at: ${result.registry_health.last_audited_at}`);
  lines.push(`- freshness_days: ${result.registry_health.freshness_days}`);
  lines.push(`- health: ${result.registry_health.health}`);
  lines.push(`- health_score: ${result.registry_health.health_score}`);
  return lines.join('\n');
}

function appendTable(lines: string[], matches: SearchResult['recommended']): void {
  if (matches.length === 0) {
    lines.push('- None');
    return;
  }

  lines.push('| Name | Category | Auth | CORS | Pricing | Status |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const match of matches) {
    const record = match.record;
    lines.push(`| ${record.name} | ${record.category} | ${record.auth} | ${record.cors} | ${record.pricing} | ${record.status} |`);
  }
}
