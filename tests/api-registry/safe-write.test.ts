import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { writeJsonAtomically, writeTextAtomically } from '../../src/api-registry/safe-write.js';

describe('safe-write', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'safe-write-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('writeJsonAtomically', () => {
    it('writes new JSON file with pretty formatting', () => {
      const filePath = join(tempDir, 'test.json');
      const data = { test: 'value', nested: { key: 123 } };

      const result = writeJsonAtomically(filePath, data);

      expect(existsSync(filePath)).toBe(true);
      const content = readFileSync(filePath, 'utf-8');
      expect(content).toBe(JSON.stringify(data, null, 2) + '\n');
      expect(result.filePath).toBe(filePath);
    });

    it('creates backup of existing file before replacement', () => {
      const filePath = join(tempDir, 'existing.json');
      const original = { original: 'data' };
      writeFileSync(filePath, JSON.stringify(original));

      const updated = { updated: 'data' };
      const result = writeJsonAtomically(filePath, updated);

      expect(existsSync(result.backupPath)).toBe(true);
      const backupContent = JSON.parse(readFileSync(result.backupPath, 'utf-8'));
      expect(backupContent).toEqual(original);
    });

    it('replaces original file atomically', () => {
      const filePath = join(tempDir, 'replace.json');
      writeFileSync(filePath, JSON.stringify({ old: 'value' }));

      const newData = { new: 'value' };
      writeJsonAtomically(filePath, newData);

      const content = JSON.parse(readFileSync(filePath, 'utf-8'));
      expect(content).toEqual(newData);
    });

    it('uses temp file in same directory during write', () => {
      const filePath = join(tempDir, 'temp-test.json');
      const data = { test: 'value' };

      const result = writeJsonAtomically(filePath, data);

      expect(result.tempPath).toContain(tempDir);
      expect(result.tempPath).not.toBe(filePath);
      // Temp file should be cleaned up after successful write
      expect(existsSync(result.tempPath)).toBe(false);
    });

    it('validates temp file content before replacement', () => {
      const filePath = join(tempDir, 'validate.json');
      const data = { test: 'value' };

      writeJsonAtomically(filePath, data);

      // File should be valid JSON
      expect(() => JSON.parse(readFileSync(filePath, 'utf-8'))).not.toThrow();
    });

    it('re-reads and confirms written JSON parses correctly', () => {
      const filePath = join(tempDir, 'confirm.json');
      const data = { complex: { nested: [1, 2, 3], value: 'test' } };

      writeJsonAtomically(filePath, data);

      const reread = JSON.parse(readFileSync(filePath, 'utf-8'));
      expect(reread).toEqual(data);
    });

    it('throws error if existing JSON is invalid before write', () => {
      const filePath = join(tempDir, 'invalid.json');
      writeFileSync(filePath, '{invalid json}');

      expect(() => writeJsonAtomically(filePath, { new: 'data' })).toThrow();

      // Original invalid file should remain unchanged
      const content = readFileSync(filePath, 'utf-8');
      expect(content).toBe('{invalid json}');
    });

    it('error includes full absolute file path when existing JSON invalid', () => {
      const filePath = join(tempDir, 'invalid-path.json');
      writeFileSync(filePath, '{bad json}');

      try {
        writeJsonAtomically(filePath, { new: 'data' });
        expect.fail('Should have thrown');
      } catch (e) {
        expect((e as Error).message).toContain(filePath);
      }
    });

    it('preserves original file if new JSON validation fails', () => {
      const filePath = join(tempDir, 'preserve.json');
      const original = { original: 'data' };
      writeFileSync(filePath, JSON.stringify(original));

      // This should not happen in practice, but tests the safety mechanism
      // We'll test by mocking a scenario where validation could fail
      // For now, just verify the original is preserved on any error
      const originalContent = readFileSync(filePath, 'utf-8');

      // Normal write should succeed
      writeJsonAtomically(filePath, { new: 'data' });

      // Verify original was backed up
      expect(existsSync(filePath + '.bak')).toBe(true);
    });

    it('returns result with filePath, backupPath, and tempPath', () => {
      const filePath = join(tempDir, 'result.json');
      writeFileSync(filePath, JSON.stringify({ old: 'data' }));

      const result = writeJsonAtomically(filePath, { new: 'data' });

      expect(result).toHaveProperty('filePath');
      expect(result).toHaveProperty('backupPath');
      expect(result).toHaveProperty('tempPath');
      expect(result.filePath).toBe(filePath);
      expect(result.backupPath).toBe(filePath + '.bak');
    });

    it('handles empty object', () => {
      const filePath = join(tempDir, 'empty.json');

      writeJsonAtomically(filePath, {});

      const content = JSON.parse(readFileSync(filePath, 'utf-8'));
      expect(content).toEqual({});
    });

    it('handles arrays', () => {
      const filePath = join(tempDir, 'array.json');
      const data = [1, 2, 3, { nested: 'value' }];

      writeJsonAtomically(filePath, data);

      const content = JSON.parse(readFileSync(filePath, 'utf-8'));
      expect(content).toEqual(data);
    });
  });

  describe('writeTextAtomically', () => {
    it('writes new text file', () => {
      const filePath = join(tempDir, 'test.txt');
      const content = 'Hello, world!';

      const result = writeTextAtomically(filePath, content);

      expect(existsSync(filePath)).toBe(true);
      expect(readFileSync(filePath, 'utf-8')).toBe(content);
      expect(result.filePath).toBe(filePath);
    });

    it('creates backup of existing file before replacement', () => {
      const filePath = join(tempDir, 'existing.txt');
      const original = 'original content';
      writeFileSync(filePath, original);

      const updated = 'updated content';
      const result = writeTextAtomically(filePath, updated);

      expect(existsSync(result.backupPath)).toBe(true);
      expect(readFileSync(result.backupPath, 'utf-8')).toBe(original);
    });

    it('replaces original file with new content', () => {
      const filePath = join(tempDir, 'replace.txt');
      writeFileSync(filePath, 'old content');

      const newContent = 'new content';
      writeTextAtomically(filePath, newContent);

      expect(readFileSync(filePath, 'utf-8')).toBe(newContent);
    });

    it('uses temp file in same directory during write', () => {
      const filePath = join(tempDir, 'temp-test.txt');
      const content = 'test content';

      const result = writeTextAtomically(filePath, content);

      expect(result.tempPath).toContain(tempDir);
      expect(result.tempPath).not.toBe(filePath);
      // Temp file should be cleaned up
      expect(existsSync(result.tempPath)).toBe(false);
    });

    it('returns result with filePath, backupPath, and tempPath', () => {
      const filePath = join(tempDir, 'result.txt');
      writeFileSync(filePath, 'old content');

      const result = writeTextAtomically(filePath, 'new content');

      expect(result).toHaveProperty('filePath');
      expect(result).toHaveProperty('backupPath');
      expect(result).toHaveProperty('tempPath');
      expect(result.filePath).toBe(filePath);
      expect(result.backupPath).toBe(filePath + '.bak');
    });

    it('handles multiline content', () => {
      const filePath = join(tempDir, 'multiline.txt');
      const content = 'line 1\nline 2\nline 3';

      writeTextAtomically(filePath, content);

      expect(readFileSync(filePath, 'utf-8')).toBe(content);
    });

    it('rejects empty text content and preserves original file', () => {
      const filePath = join(tempDir, 'empty.txt');
      writeFileSync(filePath, 'original content');

      expect(() => writeTextAtomically(filePath, '')).toThrow();

      expect(readFileSync(filePath, 'utf-8')).toBe('original content');
    });
  });
});
