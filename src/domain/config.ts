export function resolveConfigValue(
  fileValue: string,
  envValue?: string,
): string {
  if (envValue && envValue.trim()) {
    return envValue.trim();
  }
  return fileValue;
}
