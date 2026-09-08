export const DEFAULT_ACCENT = '#5DD6A2';

const HEX_SHORT = /^#([0-9a-fA-F]{3})$/;
const HEX_LONG = /^#([0-9a-fA-F]{6})$/;

export function normalizeHexColor(
  value: string | null | undefined,
  fallback = DEFAULT_ACCENT,
): string {
  if (!value) {
    return fallback;
  }

  const trimmed = value.trim();
  const shortMatch = trimmed.match(HEX_SHORT);
  if (shortMatch) {
    const [r, g, b] = shortMatch[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }

  const longMatch = trimmed.match(HEX_LONG);
  if (longMatch) {
    return `#${longMatch[1]}`.toUpperCase();
  }

  return fallback;
}
