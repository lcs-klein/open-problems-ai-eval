import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { UserRole } from '@opae/core';
import type { AppEnv } from '../env';
import {
  requireAuth,
  resolveSessionUser,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from '../middleware/auth';
import { checkRateLimit, getClientIpHash } from '../middleware/rateLimit';
import { generateSessionToken, hashPassword, sha256Hex, verifyPassword } from '../services/crypto';
import { buildAuditInsert } from '../services/mappers';

export const authRoutes = new Hono<AppEnv>();

interface UserLoginRow {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  password_hash: string;
  password_salt: string;
  is_active: number;
  must_change_password: number;
}

authRoutes.get('/me', async (c) => {
  const token = getCookie(c, SESSION_COOKIE_NAME);
  const resolved = await resolveSessionUser(c.env.DB, token);
  if (!resolved) {
    return c.json({ authenticated: false, user: null }, 200);
  }
  return c.json({ authenticated: true, user: resolved.user }, 200);
});

authRoutes.post('/login', async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    email?: string;
    password?: string;
  } | null;

  const email = (body?.email || '').trim().toLowerCase();
  const password = body?.password || '';

  if (!email || !password) {
    return c.json({ error: 'Email and password are required.' }, 400);
  }

  const ipHash = await getClientIpHash(c);
  const rlIp = await checkRateLimit(c.env.DB, `login:ip:${ipHash}`, 10, 900);
  const rlEmail = await checkRateLimit(c.env.DB, `login:email:${email}`, 10, 900);
  if (!rlIp.allowed || !rlEmail.allowed) {
    const retry = Math.max(rlIp.retryAfterSeconds, rlEmail.retryAfterSeconds);
    c.header('Retry-After', String(retry));
    return c.json({ error: 'Too many login attempts. Please wait and try again.' }, 429);
  }

  const user = await c.env.DB.prepare(
    `SELECT id, email, display_name, role, password_hash, password_salt, is_active, must_change_password
     FROM users WHERE email = ?`
  )
    .bind(email)
    .first<UserLoginRow>();

  if (!user || user.is_active !== 1) {
    return c.json({ error: 'Invalid email or password.' }, 401);
  }

  const valid = await verifyPassword(password, user.password_hash, user.password_salt);
  if (!valid) {
    return c.json({ error: 'Invalid email or password.' }, 401);
  }

  const rawToken = generateSessionToken();
  const tokenHash = await sha256Hex(rawToken);
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresIso = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString();
  const userAgent = (c.req.header('User-Agent') || '').slice(0, 200);

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO sessions (token_hash, user_id, expires_at, ip_hint, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(tokenHash, user.id, expiresIso, ipHash.slice(0, 12), userAgent, nowIso),
    c.env.DB.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(nowIso, user.id),
    c.env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(nowIso),
  ]);

  const isHttps = new URL(c.req.url).protocol === 'https:';
  setCookie(c, SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });

  return c.json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      role: user.role,
      must_change_password: user.must_change_password === 1,
      last_login_at: nowIso,
    },
  });
});

authRoutes.post('/logout', async (c) => {
  const rawToken = getCookie(c, SESSION_COOKIE_NAME);
  if (rawToken) {
    const tokenHash = await sha256Hex(rawToken);
    await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
  }
  deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' });
  return c.json({ ok: true });
});

authRoutes.post('/change-password', requireAuth, async (c) => {
  const user = c.get('user')!;
  const currentSessionHash = c.get('sessionTokenHash')!;
  const body = (await c.req.json().catch(() => null)) as {
    current_password?: string;
    new_password?: string;
  } | null;

  const currentPassword = body?.current_password || '';
  const newPassword = body?.new_password || '';

  if (!currentPassword || newPassword.length < 10) {
    return c.json(
      { error: 'Current password is required and new password must be at least 10 characters.' },
      400
    );
  }

  const row = await c.env.DB.prepare(
    'SELECT password_hash, password_salt FROM users WHERE id = ?'
  )
    .bind(user.id)
    .first<{ password_hash: string; password_salt: string }>();

  if (!row || !(await verifyPassword(currentPassword, row.password_hash, row.password_salt))) {
    return c.json({ error: 'Current password is incorrect.' }, 401);
  }

  const next = await hashPassword(newPassword);
  await c.env.DB.batch([
    c.env.DB.prepare(
      'UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 0 WHERE id = ?'
    ).bind(next.hashHex, next.saltHex, user.id),
    // Revoke all other sessions for this user
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(
      user.id,
      currentSessionHash
    ),
    buildAuditInsert(c.env.DB, {
      actor: user,
      action: 'auth.change_password',
      entityType: 'user',
      entityId: user.id,
      reason: 'User updated own password',
    }),
  ]);

  return c.json({ ok: true });
});
