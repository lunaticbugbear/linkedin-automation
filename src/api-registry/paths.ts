import { readFileSync } from 'fs';
import { join } from 'path';

export function registryRoot(cwd = process.cwd()): string {
  return join(cwd, 'data', 'api-registry');
}

export function registryFilePath(fileName: string, cwd = process.cwd()): string {
  return join(registryRoot(cwd), fileName);
}

export function readJsonFile<T>(filePath: string): T {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    const message = error instanceof SyntaxError
      ? `Invalid JSON in ${filePath}: ${error.message}`
      : `Failed to read ${filePath}: ${error instanceof Error ? error.message : String(error)}`;
    throw new Error(message);
  }
}
