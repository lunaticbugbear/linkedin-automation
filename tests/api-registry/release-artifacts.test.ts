import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateApiRecord } from '../../src/api-registry/validation.js';
import { generateIndex } from '../../src/api-registry/index-generator.js';
import type { ApiRecord } from '../../src/api-registry/types.js';

const DATA_DIR = join(process.cwd(), 'data', 'api-registry');

describe('release artifacts', () => {
  describe('apis.json seed data', () => {
    let records: ApiRecord[];

    it('loads and parses apis.json', () => {
      const raw = readFileSync(join(DATA_DIR, 'apis.json'), 'utf-8');
      const parsed = JSON.parse(raw);
      expect(Array.isArray(parsed)).toBe(true);
      records = parsed;
    });

    it('contains at least 30 APIs', () => {
      const raw = readFileSync(join(DATA_DIR, 'apis.json'), 'utf-8');
      const parsed = JSON.parse(raw);
      expect(parsed.length).toBeGreaterThanOrEqual(30);
    });

    it('covers required categories', () => {
      const raw = readFileSync(join(DATA_DIR, 'apis.json'), 'utf-8');
      const parsed = JSON.parse(raw);
      const categories = new Set(parsed.map((r: ApiRecord) => r.category));

      expect(categories.has('entertainment')).toBe(true);
      expect(categories.has('weather')).toBe(true);
      expect(categories.has('finance')).toBe(true);
      expect(categories.has('maps')).toBe(true);
      expect(categories.has('developer-tools')).toBe(true);
    });

    it('every record passes validateApiRecord', () => {
      const raw = readFileSync(join(DATA_DIR, 'apis.json'), 'utf-8');
      const parsed = JSON.parse(raw);

      for (const record of parsed) {
        expect(() => validateApiRecord(record)).not.toThrow();
        for (const confidence of record.confidence) {
          expect(confidence.confidence).toBeGreaterThanOrEqual(1);
          expect(confidence.confidence).toBeLessThanOrEqual(10);
        }
      }
    });

    it('includes required seed API names', () => {
      const raw = readFileSync(join(DATA_DIR, 'apis.json'), 'utf-8');
      const parsed = JSON.parse(raw);
      const names = new Set(parsed.map((r: ApiRecord) => r.name));

      for (const name of [
        'AniList',
        'Jikan',
        'TVMaze',
        'Open-Meteo',
        'National Weather Service',
        'WeatherAPI',
        'Alpha Vantage',
        'Frankfurter',
        'CoinGecko',
        'OpenStreetMap Nominatim',
        'OpenRouteService',
        'GitHub REST',
        'Stack Exchange',
        'npm Registry',
        'Hacker News',
        'Adzuna',
        'USAJOBS',
        'NewsAPI',
        'GNews',
        'Hugging Face',
        'REST Countries',
        'World Bank',
        'Pexels',
        'Unsplash',
        'Wikipedia REST',
        'RAWG',
      ]) {
        expect(names.has(name)).toBe(true);
      }
    });

    it('every trusted record has at least one evidence entry', () => {
      const raw = readFileSync(join(DATA_DIR, 'apis.json'), 'utf-8');
      const parsed = JSON.parse(raw);

      for (const record of parsed) {
        if (record.status === 'trusted') {
          expect(record.evidence.length).toBeGreaterThanOrEqual(1);
        }
      }
    });
  });

  describe('index.md generation', () => {
    it('generateIndex function is exported', () => {
      expect(typeof generateIndex).toBe('function');
    });

    it('index.md contains grouped sections for seeded categories', () => {
      const indexContent = readFileSync(join(DATA_DIR, 'index.md'), 'utf-8');

      expect(indexContent).toContain('Entertainment');
      expect(indexContent).toContain('Weather');
      expect(indexContent).toContain('Finance');
      expect(indexContent).toContain('Maps');
      expect(indexContent).toContain('Developer Tools');
    });

    it('index.md contains table headers', () => {
      const indexContent = readFileSync(join(DATA_DIR, 'index.md'), 'utf-8');

      expect(indexContent).toContain('Name');
      expect(indexContent).toContain('Auth');
      expect(indexContent).toContain('CORS');
      expect(indexContent).toContain('Pricing');
      expect(indexContent).toContain('Status');
    });
  });

  describe('schema.md documentation', () => {
    it('schema.md exists and contains ApiRecord field documentation', () => {
      const schemaContent = readFileSync(join(DATA_DIR, 'schema.md'), 'utf-8');

      expect(schemaContent).toContain('ApiRecord');
      expect(schemaContent).toContain('id');
      expect(schemaContent).toContain('name');
      expect(schemaContent).toContain('auth');
      expect(schemaContent).toContain('cors');
      expect(schemaContent).toContain('pricing');
      expect(schemaContent).toContain('status');
      expect(schemaContent).toContain('fit');
      expect(schemaContent).toContain('consumerProfiles');
    });
  });
});
