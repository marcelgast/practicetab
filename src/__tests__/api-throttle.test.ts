import { describe, expect, it, beforeEach } from 'vitest';
import {
  checkRouteThrottle,
  recordRouteRequest,
  resetThrottleForTests,
} from '../services/apiThrottle';

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 5;

describe('apiThrottle', () => {
  beforeEach(() => {
    resetThrottleForTests();
  });

  it('allows requests below the limit', () => {
    const now = Date.now();
    for (let i = 0; i < MAX_REQUESTS - 1; i++) {
      expect(checkRouteThrottle('/activate', now)).toBe(false);
      recordRouteRequest('/activate', now);
    }
  });

  it('blocks after max requests in window', () => {
    const now = Date.now();
    for (let i = 0; i < MAX_REQUESTS; i++) {
      recordRouteRequest('/activate', now + i);
    }
    expect(checkRouteThrottle('/activate', now + MAX_REQUESTS)).toBe(true);
  });

  it('allows requests after window expires', () => {
    const now = Date.now();
    for (let i = 0; i < MAX_REQUESTS; i++) {
      recordRouteRequest('/activate', now);
    }
    expect(checkRouteThrottle('/activate', now + WINDOW_MS)).toBe(false);
  });

  it('tracks routes independently', () => {
    const now = Date.now();
    for (let i = 0; i < MAX_REQUESTS; i++) {
      recordRouteRequest('/activate', now);
    }
    expect(checkRouteThrottle('/activate', now + 1)).toBe(true);
    expect(checkRouteThrottle('/validate', now + 1)).toBe(false);
  });

  it('uses sliding window (oldest request falls off)', () => {
    const now = Date.now();
    // Record 5 requests spread over just over a minute
    recordRouteRequest('/activate', now - WINDOW_MS - 1); // older than window
    for (let i = 0; i < MAX_REQUESTS - 1; i++) {
      recordRouteRequest('/activate', now);
    }
    // 4 recent + 1 expired = only 4 in window, should not be throttled
    expect(checkRouteThrottle('/activate', now)).toBe(false);
  });
});
