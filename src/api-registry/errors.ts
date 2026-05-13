export interface RegistryErrorParts {
  error: string;
  cause: string;
  fix: string;
  docs: string;
}

export function formatRegistryError(parts: RegistryErrorParts): string {
  return [`ERROR: ${parts.error}`, `CAUSE: ${parts.cause}`, `FIX:   ${parts.fix}`, `DOCS:  ${parts.docs}`].join('\n');
}
