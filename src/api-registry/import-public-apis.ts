import { findDuplicate, mergeApiRecord } from './merge.js';
import { normalizeApiRecord } from './normalize.js';
import { validateApiRecord } from './validation.js';
import type { ApiRecord, AuditFinding, ImportReport, RejectedRecord } from './types.js';

export interface PublicApisRow {
  api: string;
  description: string;
  auth: string;
  https: string;
  cors: string;
  link: string;
  category: string;
  raw: string;
  rowNumber: number;
  malformed?: boolean;
  reason?: string;
}

export interface ImportPublicApisInput {
  markdown: string;
  existingRecords: ApiRecord[];
  categories: string[];
  today?: string;
  chunkSize?: number;
}

const SOURCE_NAME = 'public-apis';
const SOURCE_URL = 'https://github.com/public-apis/public-apis';

const CATEGORY_ALIASES: Record<string, string> = {
  animals: 'data',
  weather: 'weather',
  jobs: 'jobs',
  development: 'developer-tools',
  'developer tools': 'developer-tools',
  programming: 'developer-tools',
};

function utcStart(today: string): string {
  return today.includes('T') ? today : `${today}T00:00:00Z`;
}

function splitMarkdownRow(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function isSeparator(cells: string[]): boolean {
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

export function parsePublicApisMarkdown(markdown: string): PublicApisRow[] {
  const rows: PublicApisRow[] = [];
  const lines = markdown.split(/\r?\n/);
  let inTable = false;

  lines.forEach((line, index) => {
    if (!line.trim().startsWith('|')) return;

    const cells = splitMarkdownRow(line);
    const lower = cells.map((cell) => cell.toLowerCase());
    if (lower.includes('api') && lower.includes('description') && lower.includes('auth')) {
      inTable = true;
      return;
    }
    if (!inTable || isSeparator(cells)) return;

    if (cells.length !== 7) {
      rows.push({
        api: cells[0] ?? '',
        description: cells[1] ?? '',
        auth: cells[2] ?? '',
        https: cells[3] ?? '',
        cors: cells[4] ?? '',
        link: cells[5] ?? '',
        category: cells[6] ?? '',
        raw: line,
        rowNumber: index + 1,
        malformed: true,
        reason: `Expected 7 columns, got ${cells.length}`,
      });
      return;
    }

    rows.push({
      api: cells[0],
      description: cells[1],
      auth: cells[2],
      https: cells[3],
      cors: cells[4],
      link: cells[5],
      category: cells[6],
      raw: line,
      rowNumber: index + 1,
    });
  });

  return rows;
}

function normalizeCategory(category: string, categories: string[]): { category: string; confidence: number; note?: string } {
  const key = category.trim().toLowerCase();
  const mapped = CATEGORY_ALIASES[key] ?? key.replace(/\s+/g, '-');
  if (categories.includes(mapped)) {
    return { category: mapped, confidence: CATEGORY_ALIASES[key] ? 8 : 9 };
  }
  return { category: categories.includes('data') ? 'data' : categories[0], confidence: 2, note: `Unknown public-apis category: ${category}` };
}

function normalizeAuth(value: string): { auth: ApiRecord['auth']; confidence: number; unknown: boolean } {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'no') return { auth: 'No', confidence: 9, unknown: false };
  if (normalized === 'apikey') return { auth: 'apiKey', confidence: 9, unknown: false };
  if (normalized === 'oauth') return { auth: 'OAuth', confidence: 9, unknown: false };
  if (normalized === 'user-agent') return { auth: 'User-Agent', confidence: 9, unknown: false };
  if (normalized === 'x-mashape-key') return { auth: 'X-Mashape-Key', confidence: 9, unknown: false };
  return { auth: 'unknown', confidence: 2, unknown: true };
}

function normalizeCors(value: string): { cors: ApiRecord['cors']; confidence: number; unknown: boolean } {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'yes') return { cors: 'yes', confidence: 9, unknown: false };
  if (normalized === 'no') return { cors: 'no', confidence: 9, unknown: false };
  return { cors: 'unknown', confidence: 2, unknown: true };
}

function rowToRecord(row: PublicApisRow, categories: string[], today: string): { record?: ApiRecord; rejected?: RejectedRecord; finding?: AuditFinding } {
  const now = utcStart(today);
  if (row.malformed) {
    return {
      rejected: { record: { name: row.api }, reason: row.reason ?? 'Malformed row', rejectedAt: now },
      finding: { level: 'warning', code: 'row_rejected', message: row.reason ?? 'Malformed row' },
    };
  }

  if (!row.api || !row.link) {
    return {
      rejected: { record: { name: row.api, homepage: row.link }, reason: 'Missing required API name or link', rejectedAt: now },
      finding: { level: 'warning', code: 'row_rejected', message: 'Missing required API name or link' },
    };
  }

  const category = normalizeCategory(row.category, categories);
  const auth = normalizeAuth(row.auth);
  const cors = normalizeCors(row.cors);
  const httpsYes = row.https.trim().toLowerCase() === 'yes';
  const notes: string[] = [];
  let status: ApiRecord['status'] = 'trusted';

  if (!row.description.trim()) {
    status = 'needs_review';
    notes.push('public-apis row missing description');
  }
  if (!httpsYes) {
    status = 'needs_review';
    notes.push('public-apis HTTPS is not Yes');
  }
  if (auth.unknown || cors.unknown || category.confidence < 5) {
    status = 'needs_review';
  }
  if (category.note) notes.push(category.note);

  const record = normalizeApiRecord({
    name: row.api,
    description: row.description,
    category: category.category,
    tags: [row.category.trim().toLowerCase()].filter(Boolean),
    homepage: row.link,
    auth: auth.auth,
    cors: cors.cors,
    pricing: 'free',
    status,
    consumerProfiles: ['prototype'],
    source: { name: SOURCE_NAME, url: SOURCE_URL, importedAt: now },
    evidence: [{ url: row.link, title: row.api, checkedAt: now, excerpt: row.raw }],
    confidence: [
      { field: 'name', confidence: 8, source: SOURCE_NAME },
      { field: 'description', confidence: row.description.trim() ? 7 : 2, source: SOURCE_NAME },
      { field: 'category', confidence: category.confidence, source: SOURCE_NAME, note: category.note },
      { field: 'auth', confidence: auth.confidence, source: SOURCE_NAME },
      { field: 'cors', confidence: cors.confidence, source: SOURCE_NAME },
      { field: 'pricing', confidence: 6, source: SOURCE_NAME },
    ],
    notes,
  }, categories, today);

  return { record };
}

function emptyReport(today: string): ImportReport {
  return {
    source: SOURCE_NAME,
    importedAt: utcStart(today),
    added: 0,
    updated: 0,
    skipped: 0,
    trusted: 0,
    needs_review: 0,
    duplicate: 0,
    records: [],
    rejected: [],
    findings: [],
  };
}

export function importPublicApis(input: ImportPublicApisInput): ImportReport {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const chunkSize = input.chunkSize ?? 100;
  const rows = parsePublicApisMarkdown(input.markdown);
  const report = emptyReport(today);
  const pending = new Map(input.existingRecords.map((record) => [record.id, record]));
  const additions: ApiRecord[] = [];

  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const chunkRecords: ApiRecord[] = [];
    const chunkRejected: RejectedRecord[] = [];
    const chunkFindings: AuditFinding[] = [];
    let chunkHasMalformed = false;

    for (const row of chunk) {
      const converted = rowToRecord(row, input.categories, today);
      if (converted.rejected) {
        chunkRejected.push(converted.rejected);
        chunkHasMalformed = true;
      }
      if (converted.finding) chunkFindings.push(converted.finding);
      if (converted.record) {
        try {
          validateApiRecord(converted.record);
          chunkRecords.push(converted.record);
        } catch (error) {
          chunkRejected.push({ record: converted.record, reason: error instanceof Error ? error.message : String(error), rejectedAt: utcStart(today) });
          chunkHasMalformed = true;
        }
      }
    }

    if (chunkHasMalformed) {
      report.rejected.push(...chunkRejected);
      report.findings.push(...chunkFindings, { level: 'warning', code: 'chunk_rejected', message: `Chunk starting at row ${start + 1} rejected before pending import` });
      return report;
    }

    for (const candidate of chunkRecords) {
      const duplicate = findDuplicate([...pending.values(), ...additions], candidate);
      if (duplicate) {
        report.duplicate += 1;
        const existing = pending.get(duplicate.existingId) ?? additions.find((record) => record.id === duplicate.existingId);
        if (!existing) {
          report.skipped += 1;
          continue;
        }
        const merged = mergeApiRecord(existing, candidate);
        const wasExisting = input.existingRecords.some((record) => record.id === existing.id);
        if (wasExisting) {
          pending.set(existing.id, merged);
          report.updated += 1;
        } else {
          const index = additions.findIndex((record) => record.id === existing.id);
          if (index >= 0) additions[index] = merged;
        }
      } else {
        additions.push(candidate);
        report.added += 1;
      }
    }
  }

  const allRecords = [...pending.values(), ...additions];
  report.records = allRecords;
  report.trusted = allRecords.filter((record) => record.status === 'trusted').length;
  report.needs_review = allRecords.filter((record) => record.status === 'needs_review').length;

  return report;
}
