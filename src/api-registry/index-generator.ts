import { CURRENT_DATE } from './constants.js';
import type { ApiRecord } from './types.js';

export function generateIndex(records: ApiRecord[]): string {
  // Group records by category
  const grouped = new Map<string, ApiRecord[]>();

  for (const record of records) {
    if (!grouped.has(record.category)) {
      grouped.set(record.category, []);
    }
    grouped.get(record.category)!.push(record);
  }

  // Sort categories alphabetically
  const sortedCategories = Array.from(grouped.keys()).sort();

  // Build markdown
  let markdown = '# API Registry Index\n\n';
  markdown += `Generated: ${CURRENT_DATE}\n\n`;

  for (const category of sortedCategories) {
    const categoryRecords = grouped.get(category)!;
    markdown += `## ${capitalize(category)}\n\n`;
    markdown += '| Name | Auth | CORS | Pricing | Status | Docs |\n';
    markdown += '|------|------|------|---------|--------|------|\n';

    for (const record of categoryRecords) {
      const docsUrl = record.docsUrl ? `[Docs](${record.docsUrl})` : 'N/A';
      markdown += `| ${record.name} | ${record.auth} | ${record.cors} | ${record.pricing} | ${record.status} | ${docsUrl} |\n`;
    }

    markdown += '\n';
  }

  return markdown;
}

function capitalize(str: string): string {
  return str
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
