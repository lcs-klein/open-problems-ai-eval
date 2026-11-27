import type { AuthUser } from '@opae/core';

export interface AppBindings {
  DB: D1Database;
  ASSETS?: Fetcher;
  ENVIRONMENT?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_HOSTNAMES?: string;
  NOTIFY_WEBHOOK_URL?: string;
}

export interface AppVariables {
  user?: AuthUser;
  sessionTokenHash?: string;
}

export interface AppEnv {
  Bindings: AppBindings;
  Variables: AppVariables;
}
