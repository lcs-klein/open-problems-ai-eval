import type {
  AdminUserRecord,
  AuditLogEntry,
  AuthUser,
  CategoryCode,
  GovernanceStatus,
  InternalCrosswalkResponse,
  InternalSourcesResponse,
  ModerationQueueResponse,
  PeerReview,
  ProposalDraft,
  PublicBootstrapResponse,
  PublishProposalRequest,
  ReleaseRecord,
  TerminologyAlert,
  UserRole,
} from '@opae/core';

export class ApiError extends Error {
  status: number;
  warnings?: string[];
  fieldErrors?: Record<string, string>;

  constructor(
    message: string,
    status: number,
    extra?: { warnings?: string[]; fieldErrors?: Record<string, string> }
  ) {
    super(message);
    this.status = status;
    this.warnings = extra?.warnings;
    this.fieldErrors = extra?.fieldErrors;
  }
}

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(url, {
    ...init,
    headers,
    credentials: 'include',
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(
      String(data.error || `Request failed with HTTP ${res.status}`),
      res.status,
      {
        warnings: Array.isArray(data.warnings) ? (data.warnings as string[]) : undefined,
        fieldErrors:
          data.fieldErrors && typeof data.fieldErrors === 'object'
            ? (data.fieldErrors as Record<string, string>)
            : undefined,
      }
    );
  }
  return data as T;
}

export const publicApi = {
  getBootstrap: () => requestJson<PublicBootstrapResponse>('/api/public/bootstrap'),
  submitProposal: (payload: Omit<ProposalDraft, 'id' | 'created_at'> & { turnstile_token: string }) =>
    requestJson<{
      id: string;
      moderation_status: 'pending';
      created_at: string;
      terminology_alerts: TerminologyAlert[];
      message: string;
    }>('/api/public/proposals', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  submitReview: (payload: Omit<PeerReview, 'id' | 'created_at'> & { turnstile_token: string }) =>
    requestJson<{
      id: string;
      moderation_status: 'pending';
      created_at: string;
      message: string;
    }>('/api/public/reviews', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};

export const authApi = {
  me: () => requestJson<{ authenticated: boolean; user: AuthUser | null }>('/api/auth/me'),
  login: (email: string, password: string) =>
    requestJson<{ authenticated: boolean; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => requestJson<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  changePassword: (current_password: string, new_password: string) =>
    requestJson<{ ok: boolean }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password, new_password }),
    }),
};

export const adminApi = {
  getQueue: () => requestJson<ModerationQueueResponse>('/api/admin/queue'),
  publishProposal: (id: string, body: PublishProposalRequest) =>
    requestJson<{
      ok: boolean;
      decision_id: string;
      affected_ids: string[];
      sanitization_warnings: string[];
    }>(`/api/admin/proposals/${encodeURIComponent(id)}/publish`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  decideProposal: (
    id: string,
    body: {
      status: 'rejected' | 'deferred' | 'spam';
      rationale: string;
      minority_dissent?: string;
      record_public_decision?: boolean;
    }
  ) =>
    requestJson<{ ok: boolean; id: string; moderation_status: string }>(
      `/api/admin/proposals/${encodeURIComponent(id)}/decide`,
      { method: 'POST', body: JSON.stringify(body) }
    ),
  moderateReview: (id: string, status: 'approved' | 'rejected' | 'spam', notes?: string) =>
    requestJson<{ ok: boolean; id: string; moderation_status: string }>(
      `/api/admin/reviews/${encodeURIComponent(id)}/moderate`,
      { method: 'POST', body: JSON.stringify({ status, notes }) }
    ),
  deleteProposal: (id: string) =>
    requestJson<{ ok: boolean }>(`/api/admin/proposals/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  deleteReview: (id: string) =>
    requestJson<{ ok: boolean }>(`/api/admin/reviews/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  updateProblem: (
    id: string,
    body: {
      title?: string;
      description?: string;
      category?: CategoryCode;
      scores?: number[];
      governance_status?: GovernanceStatus;
      why_changed: string;
      what_changed?: string;
      status?: 'active' | 'retired';
      allow_cjk?: boolean;
    }
  ) =>
    requestJson<{ ok: boolean; id: string; terminology_alerts: TerminologyAlert[] }>(
      `/api/admin/problems/${encodeURIComponent(id)}`,
      { method: 'PUT', body: JSON.stringify(body) }
    ),
  createProblem: (body: {
    id?: string;
    title: string;
    description: string;
    category: CategoryCode;
    scores: number[];
    governance_status?: GovernanceStatus;
    why_changed: string;
    allow_cjk?: boolean;
  }) =>
    requestJson<{ ok: boolean; id: string; terminology_alerts: TerminologyAlert[] }>(
      '/api/admin/problems',
      { method: 'POST', body: JSON.stringify(body) }
    ),
  getReleases: () => requestJson<{ releases: ReleaseRecord[] }>('/api/admin/releases'),
  createRelease: (body: { id: string; title: string; kind?: string; summary?: string }) =>
    requestJson<{ ok: boolean; id: string; problem_count: number }>('/api/admin/releases', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  rollbackRelease: (id: string, reason: string) =>
    requestJson<{ ok: boolean; restored_release: string; problem_count: number }>(
      `/api/admin/releases/${encodeURIComponent(id)}/rollback`,
      { method: 'POST', body: JSON.stringify({ reason }) }
    ),
  getAuditLogs: (limit = 100, offset = 0) =>
    requestJson<{ total: number; logs: AuditLogEntry[] }>(
      `/api/admin/audit-logs?limit=${limit}&offset=${offset}`
    ),
  getUsers: () => requestJson<{ users: AdminUserRecord[] }>('/api/admin/users'),
  createUser: (body: { email: string; display_name: string; role: UserRole; password?: string }) =>
    requestJson<{ ok: boolean; user: AdminUserRecord; temporary_password: string }>(
      '/api/admin/users',
      { method: 'POST', body: JSON.stringify(body) }
    ),
  updateUser: (
    id: string,
    body: { display_name?: string; role?: UserRole; is_active?: boolean; reset_password?: boolean }
  ) =>
    requestJson<{ ok: boolean; id: string; temporary_password?: string }>(
      `/api/admin/users/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(body) }
    ),
};

export const internalApi = {
  getCrosswalk: () => requestJson<InternalCrosswalkResponse>('/api/internal/crosswalk'),
  getSources: (
    kind: 'experts' | 'originals' | 'programme' | 'literature',
    q = '',
    limit = 80,
    offset = 0
  ) =>
    requestJson<InternalSourcesResponse>(
      `/api/internal/sources?kind=${encodeURIComponent(kind)}&q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`
    ),
};
