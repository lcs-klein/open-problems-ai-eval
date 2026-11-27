import React, { useEffect, useState } from 'react';
import type { AdminUserRecord, AuditLogEntry, AuthUser, UserRole } from '@opae/core';
import { CopyButton, PlusIcon, ShieldIcon } from '@opae/ui';
import { ApiError, adminApi, authApi } from '../api/client';

export const AccountsAuditTab: React.FC<{
  user: AuthUser;
  onNotify: (msg: string) => void;
}> = ({ user, onNotify }) => {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('moderator');
  const [issuedCreds, setIssuedCreds] = useState<{ email: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Own password change state
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const logRes = await adminApi.getAuditLogs(100, 0);
      setLogs(logRes.logs);
      if (user.role === 'admin') {
        const userRes = await adminApi.getUsers();
        setUsers(userRes.users);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load audit/team records.');
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.role]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIssuedCreds(null);
    try {
      const res = await adminApi.createUser({
        email: inviteEmail.trim(),
        display_name: inviteName.trim(),
        role: inviteRole,
      });
      setIssuedCreds({ email: res.user.email, password: res.temporary_password });
      setInviteEmail('');
      setInviteName('');
      await loadData();
      onNotify(`Invited ${res.user.display_name} (${res.user.role}).`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create account.');
    }
  };

  const handleToggleUser = async (target: AdminUserRecord) => {
    try {
      await adminApi.updateUser(target.id, { is_active: !target.is_active });
      await loadData();
      onNotify(`${target.email} ${target.is_active ? 'disabled' : 're-enabled'}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Update failed.');
    }
  };

  const handleResetPassword = async (target: AdminUserRecord) => {
    if (!window.confirm(`Reset password and revoke sessions for ${target.email}?`)) return;
    try {
      const res = await adminApi.updateUser(target.id, { reset_password: true });
      if (res.temporary_password) {
        setIssuedCreds({ email: target.email, password: res.temporary_password });
      }
      await loadData();
      onNotify(`Password reset for ${target.email}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Password reset failed.');
    }
  };

  const handleChangeOwnPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    try {
      await authApi.changePassword(curPw, newPw);
      setCurPw('');
      setNewPw('');
      setPwMsg('Password updated successfully.');
      onNotify('Password updated.');
    } catch (err) {
      setPwMsg(err instanceof ApiError ? err.message : 'Password update failed.');
    }
  };

  return (
    <div className="ed-stack">
      {error && <div className="ed-notice is-accent">{error}</div>}

      {user.role === 'admin' && (
        <section className="ed-panel ed-stack" style={{ gap: '14px' }}>
          <div className="ed-inline">
            <ShieldIcon size={16} />
            <h2 className="ed-panel-title">Editorial Team Accounts (Admin Only)</h2>
          </div>

          <form className="ed-form" onSubmit={handleInvite}>
            <div className="ed-field-row">
              <label className="ed-field" style={{ flex: '1 1 200px' }}>
                Co-Author Email
                <input
                  type="email"
                  className="ed-input"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
              </label>
              <label className="ed-field" style={{ flex: '1 1 180px' }}>
                Display Name (appears on Sign-offs)
                <input
                  type="text"
                  className="ed-input"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  required
                />
              </label>
              <label className="ed-field" style={{ flex: '0 1 150px' }}>
                Role
                <select
                  className="ed-select"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as UserRole)}
                >
                  <option value="moderator">Moderator (Co-Author)</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
            </div>
            <div className="ed-actions-row">
              <button type="submit" className="ed-btn is-primary is-sm">
                <PlusIcon size={13} />
                <span>Create Invited Account</span>
              </button>
            </div>
          </form>

          {issuedCreds && (
            <div className="ed-panel-soft ed-stack" style={{ gap: '6px', borderColor: 'var(--ed-add)' }}>
              <strong className="ed-small" style={{ color: 'var(--ed-add)' }}>
                One-Time Temporary Credentials (share securely — user will be forced to change on
                first login):
              </strong>
              <div className="ed-inline" style={{ flexWrap: 'wrap' }}>
                <span className="ed-mono ed-code">{issuedCreds.email}</span>
                <span className="ed-mono ed-code">{issuedCreds.password}</span>
                <CopyButton
                  text={`Email: ${issuedCreds.email}\nTemporary Password: ${issuedCreds.password}`}
                  label="Copy Credentials"
                  copiedLabel="Copied"
                  className="ed-btn is-sm"
                />
              </div>
            </div>
          )}

          <div className="ed-table-wrap">
            <table className="ed-table">
              <thead>
                <tr>
                  <th>Name &amp; Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <strong className="ed-small">{u.display_name}</strong>
                      <div className="ed-small ed-faint ed-mono">{u.email}</div>
                    </td>
                    <td>
                      <span className={`ed-tag ${u.role === 'admin' ? 'is-ink' : ''}`}>
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <span className={`ed-tag ${u.is_active ? 'is-add' : 'is-del'}`}>
                        {u.is_active ? 'active' : 'disabled'}
                      </span>
                    </td>
                    <td className="ed-mono ed-small ed-faint">
                      {u.last_login_at ? u.last_login_at.slice(0, 16).replace('T', ' ') : 'Never'}
                    </td>
                    <td>
                      <div className="ed-inline">
                        <button
                          type="button"
                          className="ed-btn is-sm"
                          onClick={() => void handleResetPassword(u)}
                        >
                          Reset PW
                        </button>
                        {u.id !== user.id && (
                          <button
                            type="button"
                            className="ed-btn is-del-outline is-sm"
                            onClick={() => void handleToggleUser(u)}
                          >
                            {u.is_active ? 'Disable' : 'Enable'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Own Password Change */}
      <form className="ed-panel ed-form" onSubmit={handleChangeOwnPassword}>
        <h2 className="ed-panel-title">Change Your Password</h2>
        <div className="ed-field-row">
          <label className="ed-field" style={{ flex: '1 1 200px' }}>
            Current Password
            <input
              type="password"
              className="ed-input"
              value={curPw}
              onChange={(e) => setCurPw(e.target.value)}
              required
            />
          </label>
          <label className="ed-field" style={{ flex: '1 1 200px' }}>
            New Password (≥ 10 chars)
            <input
              type="password"
              className="ed-input"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              required
            />
          </label>
        </div>
        {pwMsg && <span className="ed-small ed-muted">{pwMsg}</span>}
        <div className="ed-actions-row">
          <button
            type="submit"
            className="ed-btn is-sm"
            disabled={!curPw || newPw.length < 10}
          >
            Update Password
          </button>
        </div>
      </form>

      {/* Immutable Audit Log */}
      <section className="ed-panel ed-stack" style={{ gap: '12px' }}>
        <h2 className="ed-panel-title">Immutable Editorial Audit Log ({logs.length})</h2>
        <div className="ed-table-wrap">
          <table className="ed-table">
            <thead>
              <tr>
                <th>Time (UTC)</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="ed-mono ed-small ed-faint" style={{ whiteSpace: 'nowrap' }}>
                    {l.created_at.slice(0, 19).replace('T', ' ')}
                  </td>
                  <td className="ed-small">
                    <strong>{l.actor_name}</strong>{' '}
                    <span className="ed-faint">({l.actor_role})</span>
                  </td>
                  <td>
                    <span className="ed-tag ed-mono">{l.action}</span>
                  </td>
                  <td className="ed-mono ed-small">
                    {l.entity_type}:{l.entity_id}
                  </td>
                  <td className="ed-small ed-muted">{l.reason || '—'}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="ed-small ed-faint">
                    No editorial actions logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
