import React, { useState } from 'react';
import type { AuthUser } from '@opae/core';
import { EditorialMark, ShieldIcon } from '@opae/ui';
import { ApiError, authApi } from '../api/client';

export const LoginPage: React.FC<{
  onAuthenticated: (user: AuthUser) => void;
  onGoPublic: () => void;
}> = ({ onAuthenticated, onGoPublic }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await authApi.login(email.trim(), password);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign-in failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ed-shell">
      <header className="ed-topbar">
        <div className="ed-topbar-inner">
          <button type="button" className="ed-brand" onClick={onGoPublic}>
            <EditorialMark size={18} />
            <span>AI Eval Agenda</span>
          </button>
          <button type="button" className="ed-btn is-ghost is-sm" onClick={onGoPublic}>
            ← Back to Public Site
          </button>
        </div>
      </header>

      <main className="ed-container" style={{ maxWidth: '460px', paddingTop: '56px' }}>
        <form className="ed-panel ed-form" onSubmit={handleSubmit}>
          <div className="ed-inline" style={{ gap: '8px' }}>
            <ShieldIcon size={18} />
            <span className="ed-section-label">Invite-Only Editorial Workbench</span>
          </div>
          <h1 className="ed-panel-title" style={{ fontSize: '20px' }}>
            Co-Author &amp; Moderator Sign In
          </h1>
          <p className="ed-small ed-muted">
            Sign in with your invited editorial email and password to moderate community
            submissions, publish agenda updates, and access internal unredacted evidence.
          </p>

          <label className="ed-field">
            Email Address
            <input
              type="email"
              className="ed-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="coauthor@institution.edu"
              autoComplete="email"
              required
            />
          </label>

          <label className="ed-field">
            Password
            <input
              type="password"
              className="ed-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error && <div className="ed-notice is-accent">{error}</div>}

          <div className="ed-actions-row">
            <button
              type="submit"
              className="ed-btn is-primary"
              disabled={submitting || !email.trim() || !password}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {submitting ? 'Signing in…' : 'Sign In to Editorial Workbench'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
};

export const ForcePasswordChangeModal: React.FC<{
  user: AuthUser;
  onCompleted: () => void;
}> = ({ user, onCompleted }) => {
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPw.length < 10) {
      setError('New password must be at least 10 characters.');
      return;
    }
    if (newPw !== confirmPw) {
      setError('New passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      await authApi.changePassword(currentPw, newPw);
      onCompleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to change password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ed-panel ed-form" style={{ maxWidth: '480px', margin: '48px auto' }}>
      <span className="ed-section-label">First-Time Security Setup</span>
      <h2 className="ed-panel-title">Change Your Initial Password</h2>
      <p className="ed-small ed-muted">
        Welcome, <strong>{user.display_name}</strong> ({user.email}). Please replace your temporary
        password before accessing the moderation workbench.
      </p>

      <form className="ed-form" onSubmit={handleSubmit}>
        <label className="ed-field">
          Current Temporary Password
          <input
            type="password"
            className="ed-input"
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
            required
          />
        </label>
        <label className="ed-field">
          New Password (≥ 10 characters)
          <input
            type="password"
            className="ed-input"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            required
          />
        </label>
        <label className="ed-field">
          Confirm New Password
          <input
            type="password"
            className="ed-input"
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            required
          />
        </label>
        {error && <div className="ed-notice is-accent">{error}</div>}
        <button type="submit" className="ed-btn is-primary" disabled={saving}>
          {saving ? 'Updating…' : 'Update Password & Continue'}
        </button>
      </form>
    </div>
  );
};
