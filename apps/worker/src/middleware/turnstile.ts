import type { AppBindings } from '../env';

const TURNSTILE_TEST_SECRET = '1x0000000000000000000000000000000AA';
const LOCAL_DEV_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export interface TurnstileCheckResult {
  ok: boolean;
  reason?: string;
}

interface SiteverifyResponse {
  success?: boolean;
  action?: string;
  hostname?: string;
  'error-codes'?: string[];
}

/**
 * Canonical Cloudflare Turnstile server-side verification.
 * Validates success === true, action === expectedAction, and hostname allowlist.
 * Fails closed on network/upstream error in production.
 */
export async function verifyTurnstileToken(params: {
  token: unknown;
  expectedAction: string;
  clientIp: string;
  requestHostname: string;
  env: AppBindings;
}): Promise<TurnstileCheckResult> {
  const { token, expectedAction, clientIp, requestHostname, env } = params;
  const environment = (env.ENVIRONMENT || 'production').toLowerCase();
  const isProd = environment === 'production';
  const secret = env.TURNSTILE_SECRET_KEY?.trim() || '';

  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) {
    return { ok: false, reason: 'Missing or invalid human verification token.' };
  }

  // Explicit local dev / automated unit test bypass when no live secret is configured
  if (!isProd && !secret && token === 'dev-turnstile-bypass') {
    return { ok: true };
  }

  if (!secret) {
    return { ok: false, reason: 'Turnstile server secret is not configured.' };
  }

  const configuredHosts = (env.TURNSTILE_HOSTNAMES || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

  const expectedHostnames = new Set<string>(
    configuredHosts.length > 0 ? configuredHosts : [requestHostname.toLowerCase()]
  );

  // Never allow localhost / 127.0.0.1 in production hostname allowlist
  if (isProd) {
    for (const h of LOCAL_DEV_HOSTS) {
      expectedHostnames.delete(h);
    }
    if (expectedHostnames.size === 0) {
      return { ok: false, reason: 'No production Turnstile hostname configured.' };
    }
  }

  let result: SiteverifyResponse;
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({
        secret,
        response: token,
        remoteip: clientIp,
      }),
    });
    if (!response.ok) {
      return { ok: false, reason: `Verification service returned HTTP ${response.status}.` };
    }
    result = (await response.json()) as SiteverifyResponse;
  } catch {
    return { ok: false, reason: 'Human verification service unreachable. Please retry.' };
  }

  if (!result.success) {
    return { ok: false, reason: 'Human verification failed. Please complete the challenge again.' };
  }

  // Cloudflare official dummy test secret returns hostname="example.com" and empty action
  const usingDummyTestSecret = !isProd && secret === TURNSTILE_TEST_SECRET;
  if (!usingDummyTestSecret) {
    if (result.action && result.action !== expectedAction) {
      return { ok: false, reason: 'Verification action mismatch.' };
    }
    if (result.action === undefined || result.action === '') {
      return { ok: false, reason: 'Verification action missing.' };
    }
    const returnedHost = (result.hostname || '').toLowerCase();
    if (!expectedHostnames.has(returnedHost)) {
      return { ok: false, reason: 'Verification hostname mismatch.' };
    }
  }

  return { ok: true };
}
