import { getServerEnv } from '@/lib/env';

/**
 * Single-instance in-memory sliding-window rate limiter with bounded LRU/TTL eviction.
 * Protects Stockfish CPU and route handlers from per-IP bursts.
 */
const MAX_BUCKETS = 10_000;
const WINDOW_MS = 60_000;
const buckets = new Map<string, number[]>();

function pruneExpiredBuckets(nowMs: number): void {
  const cutoff = nowMs - WINDOW_MS;
  for (const [k, list] of buckets.entries()) {
    const active = list.filter((ts) => ts > cutoff);
    if (active.length === 0) {
      buckets.delete(k);
    } else if (active.length !== list.length) {
      buckets.set(k, active);
    }
  }
}

export function checkRateLimit(
  key: string,
  limitPerMinute: number,
  nowMs = Date.now(),
): { allowed: boolean; retryAfterSec: number } {
  const cutoff = nowMs - WINDOW_MS;
  const existing = buckets.get(key);
  const timestamps = existing ? existing.filter((ts) => ts > cutoff) : [];

  if (timestamps.length >= limitPerMinute) {
    const oldest = timestamps[0] ?? nowMs;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + WINDOW_MS - nowMs) / 1000));
    buckets.delete(key);
    buckets.set(key, timestamps);
    return { allowed: false, retryAfterSec };
  }

  if (!existing && buckets.size >= MAX_BUCKETS) {
    pruneExpiredBuckets(nowMs);
    while (buckets.size >= MAX_BUCKETS) {
      const oldestKey = buckets.keys().next().value;
      if (!oldestKey) break;
      buckets.delete(oldestKey);
    }
  }

  timestamps.push(nowMs);
  buckets.delete(key);
  buckets.set(key, timestamps);
  return { allowed: true, retryAfterSec: 0 };
}

export function resetRateLimits(): void {
  buckets.clear();
}

export function getRateLimitBucketCount(): number {
  return buckets.size;
}

const DEFAULT_PROXY_HEADERS = [
  'x-vercel-forwarded-for',
  'cf-connecting-ip',
  'x-forwarded-for',
  'x-real-ip',
];

export function extractClientIp(headers: Headers): string {
  let headerOrder = DEFAULT_PROXY_HEADERS;
  try {
    const configured = getServerEnv().TRUSTED_PROXY_HEADERS?.trim();
    if (configured) {
      headerOrder = configured
        .split(',')
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean);
    }
  } catch {
    // Fallback to defaults if env validation isn't initialized
  }

  for (const headerName of headerOrder) {
    const raw = headers.get(headerName);
    if (!raw) continue;
    const first = raw.split(',')[0]?.trim();
    if (first) return first;
  }

  return '127.0.0.1';
}
