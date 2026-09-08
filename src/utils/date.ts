export type Clock = () => string;

export function nowIso(clock?: Clock): string {
  if (clock) {
    return clock();
  }

  return new Date().toISOString();
}

export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function toLocalDateKeyFromIso(isoDateTime: string): string {
  return toLocalDateKey(new Date(isoDateTime));
}

export function todayKey(): string {
  return toLocalDateKey(new Date());
}
