import React, { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          action?: string;
          theme?: 'light' | 'dark' | 'auto';
          callback: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

const SCRIPT_ID = 'cf-turnstile-script';
let scriptPromise: Promise<void> | null = null;

function ensureTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Turnstile')), {
        once: true,
      });
      return;
    }
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Turnstile widget script.'));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export const TurnstileWidget: React.FC<{
  action: 'proposal_submit' | 'review_submit';
  resetNonce: number;
  onTokenChange: (token: string) => void;
}> = ({ action, resetNonce, onTokenChange }) => {
  const siteKey = (import.meta.env.VITE_TURNSTILE_SITE_KEY || '').trim();
  const isDevBypass = !siteKey && import.meta.env.DEV;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (isDevBypass) {
      onTokenChange('dev-turnstile-bypass');
      return;
    }
    if (!siteKey) {
      setLoadError('Turnstile site key (VITE_TURNSTILE_SITE_KEY) is not configured.');
      onTokenChange('');
      return;
    }

    let cancelled = false;
    setLoadError(null);
    onTokenChange('');

    ensureTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        if (widgetIdRef.current) {
          window.turnstile.remove(widgetIdRef.current);
          widgetIdRef.current = null;
        }
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action,
          theme: 'light',
          callback: (token) => onTokenChange(token),
          'expired-callback': () => onTokenChange(''),
          'error-callback': () => {
            onTokenChange('');
            setLoadError('Verification challenge failed to load. Please refresh.');
          },
        });
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Unable to load verification widget.');
        }
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey, action, isDevBypass]);

  useEffect(() => {
    if (resetNonce === 0) return;
    if (isDevBypass) {
      onTokenChange('dev-turnstile-bypass');
      return;
    }
    if (widgetIdRef.current && window.turnstile) {
      onTokenChange('');
      window.turnstile.reset(widgetIdRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetNonce]);

  if (isDevBypass) {
    return (
      <div className="ed-small ed-faint" style={{ padding: '6px 10px', border: '1px dashed var(--ed-line)', borderRadius: '6px' }}>
        Local dev mode · Turnstile human verification auto-satisfied
      </div>
    );
  }

  return (
    <div className="ed-stack" style={{ gap: '6px' }}>
      <div ref={containerRef} />
      {loadError && <span className="ed-field-error">{loadError}</span>}
    </div>
  );
};
