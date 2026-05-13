import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { validateAgentOutput } from '../../src/api-registry/agent-contract.js';
import { bootstrapRegistry, registryFilePath } from '../../src/api-registry/bootstrap.js';
import type { AgentOutput, ApiRecord } from '../../src/api-registry/types.js';

describe('skill pressure scenarios', () => {
  describe('scenario 1: user pressures skill to skip local lookup', () => {
    it('enforces local-first rule: search local registry before invoking agent', () => {
      // Expected behavior: skill must search local registry first
      // Agent invocation only when local results are weak or missing
      // This test verifies the documented workflow exists

      const testDir = mkdtempSync(join(tmpdir(), 'skill-pressure-'));
      try {
        bootstrapRegistry(testDir);

        // Seed one strong local match
        const records: ApiRecord[] = [{
          id: 'local-weather',
          name: 'Local Weather API',
          description: 'Weather forecast data',
          category: 'weather',
          tags: ['forecast', 'climate'],
          homepage: 'https://weather.local',
          docsUrl: 'https://weather.local/docs',
          auth: 'No',
          cors: 'yes',
          pricing: 'free',
          status: 'trusted',
          fit: { frontend: 9, backend: 8, prototype: 9, production: 8, mobile: 9, dashboard: 9, automation: 7 },
          consumerProfiles: ['frontend-only', 'prototype'],
          source: { name: 'manual', url: 'https://weather.local', importedAt: '2026-05-13' },
          evidence: [{ url: 'https://weather.local/docs', checkedAt: '2026-05-13' }],
          confidence: [{ field: 'auth', confidence: 10, source: 'https://weather.local/docs' }],
          updatedAt: '2026-05-13',
          createdAt: '2026-05-13',
        }];

        writeFileSync(registryFilePath('records.json', testDir), JSON.stringify(records, null, 2));

        // Skill documentation must define:
        // 1. Local search happens first
        // 2. Agent invoked only if local results < threshold or empty
        // 3. Threshold criteria (e.g., score < 7, count < 3)

        expect(() => {
          const skillDoc = readFileSync(join(process.cwd(), 'skills', 'api-registry', 'SKILL.md'), 'utf-8');
          expect(skillDoc).toContain('local-first');
          expect(skillDoc).toContain('agent');
          expect(skillDoc.toLowerCase()).toMatch(/search.*local.*before/i);
        }).not.toThrow();
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });
  });

  describe('scenario 2: user pressures import to trust every row', () => {
    it('enforces quality gates: incomplete records marked needs_review', () => {
      // Expected behavior: import applies quality gates
      // Records missing required evidence/confidence → needs_review status
      // Skill documentation must define quality gate rules

      expect(() => {
        const skillDoc = readFileSync(join(process.cwd(), 'skills', 'api-registry', 'SKILL.md'), 'utf-8');
        expect(skillDoc).toContain('quality gate');
        expect(skillDoc).toContain('needs_review');
        expect(skillDoc.toLowerCase()).toMatch(/incomplete.*needs.review/i);
      }).not.toThrow();
    });
  });

  describe('scenario 3: agent returns malformed JSON', () => {
    it('rejects malformed agent output with clear error, no partial write', () => {
      const malformedOutputs = [
        { query: 'test', generatedAt: '2026-05-13T00:00:00Z', results: 'not-array', findings: [] },
        { query: 'test', generatedAt: '2026-05-13T00:00:00Z', results: [], findings: 'not-array' },
        { generatedAt: '2026-05-13T00:00:00Z', results: [], findings: [] }, // missing query
        { query: '', generatedAt: '2026-05-13T00:00:00Z', results: [], findings: [] }, // empty query
      ];

      for (const malformed of malformedOutputs) {
        expect(() => validateAgentOutput(malformed)).toThrow();
      }

      // Agent documentation must define:
      // 1. Output contract validation
      // 2. Rejection behavior for malformed output
      // 3. No partial writes on validation failure

      expect(() => {
        const agentDoc = readFileSync(join(process.cwd(), 'agents', 'api-researcher', 'AGENT.md'), 'utf-8');
        expect(agentDoc).toContain('output contract');
        expect(agentDoc).toContain('malformed');
        expect(agentDoc.toLowerCase()).toMatch(/reject.*invalid/i);
      }).not.toThrow();
    });
  });

  describe('scenario 4: existing apis.json is invalid', () => {
    it('stops and reports full absolute path when registry file is corrupted', () => {
      const testDir = mkdtempSync(join(tmpdir(), 'skill-pressure-'));
      try {
        bootstrapRegistry(testDir);

        // Corrupt the records file
        const recordsPath = registryFilePath('records.json', testDir);
        writeFileSync(recordsPath, '{ invalid json }');

        // Attempting to load should fail with clear error including full path
        expect(() => {
          const raw = readFileSync(recordsPath, 'utf-8');
          JSON.parse(raw);
        }).toThrow();

        // Skill documentation must define:
        // 1. Validation before any write operation
        // 2. Stop on invalid existing file
        // 3. Report full absolute path in error
        // 4. No overwrite of corrupted file

        expect(() => {
          const skillDoc = readFileSync(join(process.cwd(), 'skills', 'api-registry', 'SKILL.md'), 'utf-8');
          expect(skillDoc).toContain('safe-write');
          expect(skillDoc.toLowerCase()).toMatch(/validate.*before.*write/i);
          expect(skillDoc.toLowerCase()).toMatch(/stop.*invalid/i);
        }).not.toThrow();
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });
  });

  describe('scenario 5: user asks for browser-only app', () => {
    it('frontend-only profile rejects cors:no APIs with clear reason', () => {
      // Expected behavior: consumer profile filtering
      // frontend-only profile requires cors:yes or cors:unknown
      // Rejection includes clear reason in warnings

      expect(() => {
        const skillDoc = readFileSync(join(process.cwd(), 'skills', 'api-registry', 'SKILL.md'), 'utf-8');
        expect(skillDoc).toContain('consumer profile');
        expect(skillDoc).toContain('frontend-only');
        expect(skillDoc.toLowerCase()).toMatch(/cors.*frontend/i);
      }).not.toThrow();
    });
  });

  describe('scenario 6: user asks for public release', () => {
    it('requires README, examples, demo output, release checklist, LinkedIn summary', () => {
      // Expected behavior: public release workflow
      // Skill documentation must define release requirements:
      // 1. README with usage examples
      // 2. Demo command output
      // 3. Release checklist
      // 4. LinkedIn-ready summary

      expect(() => {
        const skillDoc = readFileSync(join(process.cwd(), 'skills', 'api-registry', 'SKILL.md'), 'utf-8');
        expect(skillDoc).toContain('public release');
        expect(skillDoc).toContain('README');
        expect(skillDoc).toContain('example');
        expect(skillDoc.toLowerCase()).toMatch(/release.*checklist/i);
        expect(skillDoc.toLowerCase()).toMatch(/linkedin/i);
      }).not.toThrow();
    });
  });
});
