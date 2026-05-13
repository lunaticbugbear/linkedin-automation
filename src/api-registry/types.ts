import type { AUTH_VALUES, CONSUMER_PROFILES, CORS_VALUES, FIT_KEYS, PRICING_VALUES, STATUS_VALUES } from './constants.js';

export type AuthValue = (typeof AUTH_VALUES)[number];
export type CorsValue = (typeof CORS_VALUES)[number];
export type PricingValue = (typeof PRICING_VALUES)[number];
export type StatusValue = (typeof STATUS_VALUES)[number];
export type ConsumerProfile = (typeof CONSUMER_PROFILES)[number];
export type FitKey = (typeof FIT_KEYS)[number];

export type FitScores = Record<FitKey, number>;

export interface FieldConfidence {
  field: string;
  confidence: number;
  source?: string;
  note?: string;
}

export interface Evidence {
  url: string;
  title?: string;
  checkedAt: string;
  excerpt?: string;
}

export interface SourceInfo {
  name: string;
  url: string;
  importedAt: string;
  license?: string;
}

export interface ApiRecord {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  homepage: string;
  docsUrl?: string;
  auth: AuthValue;
  cors: CorsValue;
  pricing: PricingValue;
  status: StatusValue;
  fit: FitScores;
  consumerProfiles: ConsumerProfile[];
  source: SourceInfo;
  evidence: Evidence[];
  confidence: FieldConfidence[];
  updatedAt: string;
  createdAt: string;
  notes?: string[];
}

export interface DuplicateMatch {
  type: 'same-docs' | 'possible-duplicate';
  existingId: string;
  candidateId: string;
  reason: string;
}

export interface RegistryManifest {
  schema_version: string;
  last_imported_at: string;
  last_audited_at: string;
  freshness_days: number;
  health: string;
  health_score: number;
}

export interface SourceCatalog {
  sources: SourceInfo[];
  updatedAt: string;
}

export type Aliases = Record<string, string[]>;

export interface Contracts {
  schemaVersion: string;
  authValues: readonly AuthValue[];
  corsValues: readonly CorsValue[];
  pricingValues: readonly PricingValue[];
  statusValues: readonly StatusValue[];
  consumerProfiles: readonly ConsumerProfile[];
  fitKeys: readonly FitKey[];
  outputShapes: {
    search: {
      type: string;
      required: string[];
      properties: Record<string, string>;
    };
    export: {
      type: string;
      required: string[];
      properties: Record<string, string>;
    };
    agent: {
      type: string;
      required: string[];
      properties: Record<string, string>;
    };
  };
}

export interface SearchResult {
  record: ApiRecord;
  score: number;
  matchedFields: string[];
}

export interface RejectedRecord {
  record: Partial<ApiRecord>;
  reason: string;
  rejectedAt: string;
  evidence?: Evidence[];
}

export interface AuditFinding {
  level: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  recordId?: string;
  fix?: string;
}

export interface AuditSummary {
  checkedAt: string;
  recordCount: number;
  errorCount: number;
  warningCount: number;
  findings: AuditFinding[];
}

export interface AgentInput {
  query: string;
  category?: string;
  consumerProfile?: ConsumerProfile;
  maxResults?: number;
  refresh?: boolean;
}

export interface AgentOutput {
  query: string;
  results: SearchResult[];
  findings: AuditFinding[];
  generatedAt: string;
}

export interface ImportReport {
  source: string;
  importedAt: string;
  added: number;
  updated: number;
  rejected: RejectedRecord[];
  findings: AuditFinding[];
}
