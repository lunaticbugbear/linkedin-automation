import { describe, expect, it } from 'vitest';
import type { AgentInput, AgentOutput } from '../../src/api-registry/types.js';
import { validateAgentInput, validateAgentOutput } from '../../src/api-registry/agent-contract.js';

describe('validateAgentInput', () => {
  it('accepts valid agent input with required fields', () => {
    const input: AgentInput = {
      query: 'weather APIs',
    };
    expect(validateAgentInput(input)).toEqual(input);
  });

  it('accepts valid agent input with all optional fields', () => {
    const input: AgentInput = {
      query: 'weather APIs',
      category: 'weather',
      consumerProfile: 'frontend-only',
      maxResults: 10,
      refresh: true,
    };
    expect(validateAgentInput(input)).toEqual(input);
  });

  it('rejects input with missing query', () => {
    expect(() => validateAgentInput({ category: 'weather' })).toThrow('$.query');
  });

  it('rejects input with empty query', () => {
    expect(() => validateAgentInput({ query: '' })).toThrow('$.query');
  });

  it('rejects input with non-string query', () => {
    expect(() => validateAgentInput({ query: 123 })).toThrow('$.query');
  });

  it('rejects input with invalid consumerProfile', () => {
    expect(() => validateAgentInput({ query: 'test', consumerProfile: 'invalid' as never })).toThrow('$.consumerProfile');
  });

  it('rejects input with negative maxResults', () => {
    expect(() => validateAgentInput({ query: 'test', maxResults: -1 })).toThrow('$.maxResults');
  });

  it('rejects input with non-integer maxResults', () => {
    expect(() => validateAgentInput({ query: 'test', maxResults: 1.5 })).toThrow('$.maxResults');
  });

  it('rejects input with non-boolean refresh', () => {
    expect(() => validateAgentInput({ query: 'test', refresh: 'yes' as never })).toThrow('$.refresh');
  });
});

describe('validateAgentOutput', () => {
  const validOutput: AgentOutput = {
    query: 'weather APIs',
    generatedAt: '2026-05-13T00:00:00Z',
    results: [
      {
        record: {
          id: 'open-meteo',
          name: 'Open-Meteo',
          description: 'Free weather API',
          category: 'weather',
          tags: ['forecast'],
          homepage: 'https://open-meteo.com',
          docsUrl: 'https://open-meteo.com/docs',
          auth: 'No',
          cors: 'yes',
          pricing: 'free',
          status: 'trusted',
          fit: { frontend: 9, backend: 8, prototype: 9, production: 8, mobile: 9, dashboard: 9, automation: 7 },
          consumerProfiles: ['frontend-only'],
          source: { name: 'agent', url: 'https://open-meteo.com', importedAt: '2026-05-13T00:00:00Z' },
          evidence: [{ url: 'https://open-meteo.com/docs', checkedAt: '2026-05-13T00:00:00Z' }],
          confidence: [{ field: 'auth', confidence: 10, source: 'https://open-meteo.com/docs' }],
          updatedAt: '2026-05-13T00:00:00Z',
          createdAt: '2026-05-13T00:00:00Z',
        },
        score: 9.5,
        matched_fields: ['name'],
        matched_terms: ['weather'],
        warnings: [],
      },
    ],
    findings: [],
  };

  it('accepts valid agent output', () => {
    expect(validateAgentOutput(validOutput)).toEqual(validOutput);
  });

  it('rejects output with missing query', () => {
    const invalid = { ...validOutput, query: undefined };
    expect(() => validateAgentOutput(invalid)).toThrow('$.query');
  });

  it('rejects output with missing generatedAt', () => {
    const invalid = { ...validOutput, generatedAt: undefined };
    expect(() => validateAgentOutput(invalid)).toThrow('$.generatedAt');
  });

  it('rejects output with non-array results', () => {
    const invalid = { ...validOutput, results: 'not-array' };
    expect(() => validateAgentOutput(invalid)).toThrow('$.results');
  });

  it('rejects output with non-array findings', () => {
    const invalid = { ...validOutput, findings: 'not-array' };
    expect(() => validateAgentOutput(invalid)).toThrow('$.findings');
  });

  it('rejects result with missing evidence URL in confidence source', () => {
    const invalid = {
      ...validOutput,
      results: [
        {
          ...validOutput.results[0],
          record: {
            ...validOutput.results[0].record,
            confidence: [{ field: 'auth', confidence: 10, source: 'https://missing.com/docs' }],
          },
        },
      ],
    };
    expect(() => validateAgentOutput(invalid)).toThrow('must match record evidence URL');
  });

  it('rejects result with missing confidence source', () => {
    const invalid = {
      ...validOutput,
      results: [
        {
          ...validOutput.results[0],
          record: {
            ...validOutput.results[0].record,
            confidence: [{ field: 'auth', confidence: 10 }],
          },
        },
      ],
    };
    expect(() => validateAgentOutput(invalid)).toThrow('expected evidence URL for field confidence');
  });

  it('preserves unknown metadata fields in records', () => {
    const withMetadata = {
      ...validOutput,
      results: [
        {
          ...validOutput.results[0],
          record: {
            ...validOutput.results[0].record,
            notes: ['Custom note'],
          },
        },
      ],
    };
    const result = validateAgentOutput(withMetadata);
    expect(result.results[0].record.notes).toEqual(['Custom note']);
  });

  it('rejects finding with invalid level', () => {
    const invalid = {
      ...validOutput,
      findings: [{ level: 'invalid', code: 'test', message: 'test' }],
    };
    expect(() => validateAgentOutput(invalid)).toThrow('$.findings[0].level');
  });

  it('accepts finding with error level', () => {
    const withFinding = {
      ...validOutput,
      findings: [{ level: 'error', code: 'test_error', message: 'Test error' }],
    };
    expect(validateAgentOutput(withFinding).findings).toHaveLength(1);
  });

  it('accepts finding with warning level', () => {
    const withFinding = {
      ...validOutput,
      findings: [{ level: 'warning', code: 'test_warning', message: 'Test warning' }],
    };
    expect(validateAgentOutput(withFinding).findings).toHaveLength(1);
  });

  it('accepts finding with info level', () => {
    const withFinding = {
      ...validOutput,
      findings: [{ level: 'info', code: 'test_info', message: 'Test info' }],
    };
    expect(validateAgentOutput(withFinding).findings).toHaveLength(1);
  });
});
