import { Hono } from 'hono';
import type { AppEnv } from './env';
import { originGuard } from './middleware/originGuard';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { internalRoutes } from './routes/internal';
import { publicRoutes } from './routes/public';

const CSP_HEADER = [
  "default-src 'self'",
  "script-src 'self' https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
  "connect-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // Global security headers
  app.use('*', async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('X-Frame-Options', 'DENY');
    c.header('Content-Security-Policy', CSP_HEADER);
  });

  // CSRF / Origin protection for state-changing API routes
  app.use('/api/auth/*', originGuard);
  app.use('/api/admin/*', originGuard);
  app.use('/api/internal/*', originGuard);

  app.get('/api/health', (c) =>
    c.json({ ok: true, service: 'open-problems-ai-eval', timestamp: new Date().toISOString() })
  );

  app.route('/api/public', publicRoutes);
  app.route('/api/auth', authRoutes);
  app.route('/api/admin', adminRoutes);
  app.route('/api/internal', internalRoutes);

  app.all('/api/*', (c) => c.json({ error: 'API endpoint not found.' }, 404));

  // Fallback to Cloudflare Workers Static Assets (SPA)
  app.all('*', async (c) => {
    if (c.env.ASSETS) {
      return c.env.ASSETS.fetch(c.req.raw);
    }
    return c.text('Static assets binding unavailable in this environment.', 404);
  });

  app.onError((err, c) => {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'unhandled_worker_error',
        path: c.req.path,
        error: err instanceof Error ? err.message : String(err),
      })
    );
    return c.json({ error: 'Internal server error.' }, 500);
  });

  return app;
}

const app = createApp();
export default app;
