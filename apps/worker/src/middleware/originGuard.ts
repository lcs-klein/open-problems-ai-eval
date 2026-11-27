import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../env';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Mitigates CSRF on state-changing requests by enforcing same-origin Origin header
 * when present and requiring JSON content-type on non-empty bodies.
 */
export const originGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (SAFE_METHODS.has(c.req.method.toUpperCase())) {
    await next();
    return;
  }

  const reqUrl = new URL(c.req.url);
  const origin = c.req.header('Origin');
  if (origin) {
    let originUrl: URL;
    try {
      originUrl = new URL(origin);
    } catch {
      return c.json({ error: 'Invalid Origin header.' }, 403);
    }
    if (originUrl.origin !== reqUrl.origin) {
      return c.json({ error: 'Cross-origin state-changing request rejected.' }, 403);
    }
  }

  const contentLength = Number(c.req.header('Content-Length') || '0');
  const contentType = c.req.header('Content-Type') || '';
  if (contentLength > 0 && !contentType.toLowerCase().includes('application/json')) {
    return c.json({ error: 'Content-Type must be application/json.' }, 415);
  }

  await next();
};
