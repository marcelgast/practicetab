const WINDOW_MS = 60_000;
const MAX_REQUESTS = 5;

const requestLog = new Map<string, number[]>();

export function checkRouteThrottle(
  route: string,
  nowMs: number = Date.now(),
): boolean {
  const log = requestLog.get(route) ?? [];
  const recent = log.filter((ts) => nowMs - ts < WINDOW_MS);
  return recent.length >= MAX_REQUESTS;
}

export function recordRouteRequest(
  route: string,
  nowMs: number = Date.now(),
): void {
  const log = requestLog.get(route) ?? [];
  const recent = log.filter((ts) => nowMs - ts < WINDOW_MS);
  recent.push(nowMs);
  requestLog.set(route, recent);
}

export function resetThrottleForTests(): void {
  requestLog.clear();
}
