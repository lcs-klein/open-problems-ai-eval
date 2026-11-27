import type { Context } from 'hono';
import type { AppEnv } from '../env';
import { sha256Hex } from '../services/crypto';

export function getClientIp(c: Context<AppEnv>): string {
  const cfIp = c.req.header('CF-Connecting-IP')?.trim();
  if (cfIp) return cfIp;
  const xff = c.req.header('X-Forwarded-For')?.split(',')[0]?.trim();
  if (xff) return xff;
  return '127.0.0.1';
}

export async function getClientIpHash(c: Context<AppEnv>): Promise<string> {
  return (await sha256Hex(getClientIp(c))).slice(0, 32);
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window rate limiter backed by D1 `rate_limits` table.
 */
export async function checkRateLimit(
  db: D1Database,
  bucketKey: string,
  maxRequests: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const nowSec = Math.floor(Date.now() / 1000);
  const windowId = Math.floor(nowSec / windowSeconds);
  const fullKey = `${bucketKey}:${windowId}`;
  const resetAt = (windowId + 1) * windowSeconds;

  const existing = await db
    .prepare('SELECT count, reset_at FROM rate_limits WHERE bucket_key = ?')
    .bind(fullKey)
    .first<{ count: number; reset_at: number }>();

  if (!existing) {
    await db
      .prepare('INSERT OR REPLACE INTO rate_limits (bucket_key, count, reset_at) VALUES (?, 1, ?)')
      .bind(fullKey, resetAt)
      .run();
    // Opportunistic cleanup of expired buckets
    await db
      .prepare('DELETE FROM rate_limits WHERE reset_at < ?')
      .bind(nowSec - 300)
      .run();
    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - 1),
      retryAfterSeconds: Math.max(1, resetAt - nowSec),
    };
  }

  if (existing.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, existing.reset_at - nowSec),
    };
  }

  const nextCount = existing.count + 1;
  await db
    .prepare('UPDATE rate_limits SET count = ? WHERE bucket_key = ?')
    .bind(nextCount, fullKey)
    .run();

  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - nextCount),
    retryAfterSeconds: Math.max(1, existing.reset_at - nowSec),
  };
}
