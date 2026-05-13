import { copyFileSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { randomUUID } from 'crypto';
import { formatRegistryError } from './errors.js';

export interface SafeWriteResult {
  filePath: string;
  backupPath: string;
  tempPath: string;
}

function buildResult(filePath: string): SafeWriteResult {
  const absolutePath = resolve(filePath);
  return {
    filePath: absolutePath,
    backupPath: `${absolutePath}.bak`,
    tempPath: resolve(dirname(absolutePath), `.${randomUUID()}.tmp`),
  };
}

function removeTempFile(tempPath: string): void {
  if (existsSync(tempPath)) {
    rmSync(tempPath, { force: true });
  }
}

function registryWriteError(error: string, cause: string, result: SafeWriteResult): Error {
  return new Error(
    formatRegistryError({
      error,
      cause: `${cause}\nfilePath: ${result.filePath}\nbackupPath: ${result.backupPath}\ntempPath: ${result.tempPath}`,
      fix: 'Fix source content, then retry safe write.',
      docs: 'docs/superpowers/specs/2026-05-13-api-registry-design.md',
    })
  );
}

function copyExistingFileToBackup(result: SafeWriteResult): void {
  if (existsSync(result.filePath)) {
    copyFileSync(result.filePath, result.backupPath);
  }
}

export function writeJsonAtomically(filePath: string, value: unknown): SafeWriteResult {
  const result = buildResult(filePath);

  try {
    if (existsSync(result.filePath)) {
      const currentContent = readFileSync(result.filePath, 'utf-8');
      if (currentContent.trim().length > 0) {
        JSON.parse(currentContent);
      }
    }
  } catch (error) {
    throw registryWriteError('Cannot safely write JSON file', `Existing JSON is invalid: ${(error as Error).message}`, result);
  }

  try {
    const content = JSON.stringify(value, null, 2) + '\n';
    writeFileSync(result.tempPath, content, 'utf-8');

    const tempContent = readFileSync(result.tempPath, 'utf-8');
    JSON.parse(tempContent);

    copyExistingFileToBackup(result);
    renameSync(result.tempPath, result.filePath);

    const writtenContent = readFileSync(result.filePath, 'utf-8');
    JSON.parse(writtenContent);

    return result;
  } catch (error) {
    removeTempFile(result.tempPath);
    throw registryWriteError('Cannot safely write JSON file', (error as Error).message, result);
  }
}

export function writeTextAtomically(filePath: string, content: string): SafeWriteResult {
  const result = buildResult(filePath);

  try {
    writeFileSync(result.tempPath, content, 'utf-8');

    const tempContent = readFileSync(result.tempPath, 'utf-8');
    if (tempContent.length === 0) {
      throw new Error('Text content must not be empty');
    }
    if (tempContent !== content) {
      throw new Error('Temp text content does not match requested content');
    }

    copyExistingFileToBackup(result);
    renameSync(result.tempPath, result.filePath);

    const writtenContent = readFileSync(result.filePath, 'utf-8');
    if (writtenContent !== content) {
      throw new Error('Written text content does not match requested content');
    }

    return result;
  } catch (error) {
    removeTempFile(result.tempPath);
    throw registryWriteError('Cannot safely write text file', (error as Error).message, result);
  }
}
