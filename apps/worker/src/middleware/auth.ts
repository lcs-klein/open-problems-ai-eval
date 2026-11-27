import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AuthUser, UserRole } from '@opae/core';
import type { AppEnv } from '../env';
import { sha256Hex } from '../services/crypto';

export const SESSION_COOKIE_NAME = 'opae_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

interface SessionUserRow {
  user_id: string;
  email: string;
  display_name: string;
  role: UserRole;
  is_active: number;
  must_change_password: number;
  last_login_at: string | null;
  expires_at: string;
}

export async function resolveSessionUser(
  db: D1Database,
  rawToken: string | undefined
): Promise<{ user: AuthUser; tokenHash: string } | null> {
  if (!rawToken || rawToken.length < 16) return null;
  const tokenHash = await sha256Hex(rawToken);
  const nowIso = new Date().toISOString();

  const row = await db
    .prepare(
      `SELECT u.id AS user_id, u.email, u.display_name, u.role, u.is_active,
              u.must_change_password, u.last_login_at, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`
    )
    .bind(tokenHash, nowIso)
    .first<SessionUserRow>();

  if (!row || row.is_active !== 1) return null;

  return {
    tokenHash,
    user: {
      id: row.user_id,
      email: row.email,
      display_name: row.display_name,
      role: row.role,
      must_change_password: row.must_change_password === 1,
      last_login_at: row.last_login_at,
    },
  };
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE_NAME);
  const resolved = await resolveSessionUser(c.env.DB, token);
  if (!resolved) {
    return c.json({ error: 'Authentication required.' }, 401);
  }
  c.set('user', resolved.user);
  c.set('sessionTokenHash', resolved.tokenHash);
  await next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Authentication required.' }, 401);
  }
  if (user.role !== 'admin') {
    return c.json({ error: 'Administrator privileges required.' }, 403);
  }
  await next();
};
