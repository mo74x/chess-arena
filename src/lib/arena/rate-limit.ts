/**
 * Single-instance in-memory sliding-window rate limiter.
 * Protects Stockfish CPU and route handlers from per-IP bursts.
 */
const buckets = new Map<string, number[]>();

export function checkRateLimit(
  key: string,
  limitPerMinute: number,
  nowMs = Date.now(),
): { allowed: boolean; retryAfterSec: number } {
  const windowMs = 60_000;
  const cutoff = nowMs - windowMs;
  const timestamps = (buckets.get(key) ?? []).filter((ts) => ts > cutoff);

  if (timestamps.length >= limitPerMinute) {
    const oldest = timestamps[0] ?? nowMs;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - nowMs) / 1000));
    buckets.set(key, timestamps);
    return { allowed: false, retryAfterSec };
  }

  timestamps.push(nowMs);
  buckets.set(key, timestamps);
  return { allowed: true, retryAfterSec: 0 };
}

export function resetRateLimits(): void {
  buckets.clear();
}

export function extractClientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip')?.trim() || '127.0.0.1';
}
