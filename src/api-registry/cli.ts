import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bootstrapRegistry, registryFilePath, readJsonFile } from './bootstrap.js';
import { validateApiRecord } from './validation.js';
import { writeJsonAtomically } from './safe-write.js';
import { searchApis } from './search.js';
import { exportShortlist } from './export.js';
import { importPublicApis } from './import-public-apis.js';
import { selectStaleRecords } from './refresh.js';
import { auditRegistry } from './audit.js';
import type { Aliases, ApiRecord, Contracts, RegistryManifest } from './types.js';

function loadRegistry(cwd: string): { records: ApiRecord[]; manifest: RegistryManifest; aliases: Aliases; contracts: Contracts; categories: string[] } {
  bootstrapRegistry(cwd);
  const manifest = readJsonFile<RegistryManifest>(registryFilePath('registry.json', cwd));
  const aliases = readJsonFile<Aliases>(registryFilePath('aliases.json', cwd));
  const contracts = readJsonFile<Contracts>(registryFilePath('contracts.json', cwd));
  const categories = readJsonFile<string[]>(registryFilePath('categories.json', cwd));
  const recordsPath = registryFilePath('records.json', cwd);
  let records: ApiRecord[] = existsSync(recordsPath) ? readJsonFile<ApiRecord[]>(recordsPath) : [];

  // Fallback to apis.json if records.json is empty
  if (records.length === 0) {
    const apisPath = registryFilePath('apis.json', cwd);
    if (existsSync(apisPath)) {
      records = readJsonFile<ApiRecord[]>(apisPath);
    }
  }

  return { records, manifest, aliases, contracts, categories };
}

function saveRecords(records: ApiRecord[], cwd: string): void {
  writeJsonAtomically(registryFilePath('records.json', cwd), records);
}

function parseArgs(argv: string[]): { command: string; args: string[]; flags: Record<string, string> } {
  const [command = '', ...rest] = argv;
  const args: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) {
      flags[rest[i].slice(2)] = rest[i + 1] ?? 'true';
      i++;
    } else {
      args.push(rest[i]);
    }
  }
  return { command, args, flags };
}

async function cmdAdd(args: string[], cwd: string): Promise<string> {
  const [filePath] = args;
  if (!filePath) throw new Error('add: missing file path argument');
  const raw = JSON.parse(readFileSync(resolve(cwd, filePath), 'utf-8'));
  const record = validateApiRecord(raw);
  const { records } = loadRegistry(cwd);
  if (records.some((r) => r.id === record.id)) {
    return `add: skipped ${record.id} (already exists)`;
  }
  records.push(record);
  saveRecords(records, cwd);
  return `add: added ${record.id}`;
}

async function cmdSearch(args: string[], flags: Record<string, string>, cwd: string): Promise<string> {
  const query = args.join(' ');
  if (!query) throw new Error('search: missing query');
  const { records, manifest, aliases } = loadRegistry(cwd);
  const limit = flags.limit ? parseInt(flags.limit, 10) : 10;
  const consumer_profile = flags.profile as any;
  const result = searchApis({ query, limit, consumer_profile }, records, aliases, manifest);
  const lines = [`search: ${query}`];
  result.recommended.forEach((match, i) => {
    lines.push(`${i + 1}. ${match.record.name} [${match.record.category}] score=${match.score}`);
  });
  if (result.recommended.length === 0) lines.push('(no results)');
  return lines.join('\n');
}

async function cmdImport(args: string[], cwd: string): Promise<string> {
  const [filePath] = args;
  if (!filePath) throw new Error('import: missing file path argument');
  const markdown = readFileSync(resolve(cwd, filePath), 'utf-8');
  const { records, categories } = loadRegistry(cwd);
  const today = new Date().toISOString().slice(0, 10);
  const report = importPublicApis({ markdown, existingRecords: records, categories, today });
  saveRecords(report.records, cwd);
  return `import: source=${report.source} added=${report.added} updated=${report.updated} skipped=${report.skipped} duplicate=${report.duplicate} needs_review=${report.needs_review}`;
}

async function cmdRefresh(cwd: string): Promise<string> {
  const { records, manifest } = loadRegistry(cwd);
  const today = new Date().toISOString().slice(0, 10);
  const stale = selectStaleRecords(records, manifest, today);
  const lines = [`refresh: stale=${stale.length}`];
  for (const record of stale) {
    lines.push(`- ${record.id} ${record.name} updatedAt=${record.updatedAt}`);
  }
  return lines.join('\n');
}

async function cmdAudit(cwd: string): Promise<string> {
  const { records, manifest, categories } = loadRegistry(cwd);
  const today = new Date().toISOString().slice(0, 10);
  const summary = auditRegistry({ records, manifest, categories, now: today, cwd, updateManifest: true });
  const health = summary.health;
  return `audit: records=${summary.recordCount} errors=${summary.errorCount} warnings=${summary.warningCount} health=${health} score=${summary.healthScore}`;
}

async function cmdExport(args: string[], flags: Record<string, string>, cwd: string): Promise<string> {
  const query = args.join(' ');
  if (!query) throw new Error('export: missing query');
  const format = (flags.format ?? 'markdown') as 'json' | 'markdown';
  const { records, manifest, aliases, contracts } = loadRegistry(cwd);
  return exportShortlist({ query, format }, records, aliases, manifest, contracts);
}

export async function runCli(argv: string[], cwd = process.cwd()): Promise<string> {
  const { command, args, flags } = parseArgs(argv);
  switch (command) {
    case 'add': return cmdAdd(args, cwd);
    case 'search': return cmdSearch(args, flags, cwd);
    case 'import': return cmdImport(args, cwd);
    case 'refresh': return cmdRefresh(cwd);
    case 'audit': return cmdAudit(cwd);
    case 'export': return cmdExport(args, flags, cwd);
    default: throw new Error(`Unknown command: ${command}. Available: add, search, import, refresh, audit, export`);
  }
}

// Direct invocation
if (process.argv[1] && process.argv[1].endsWith('cli.ts') || process.argv[1]?.endsWith('cli.js')) {
  runCli(process.argv.slice(2)).then((output) => {
    process.stdout.write(output + '\n');
  }).catch((err) => {
    process.stderr.write((err instanceof Error ? err.message : String(err)) + '\n');
    process.exit(1);
  });
}
