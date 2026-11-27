import React, { Suspense, lazy, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../packages/ui/src/styles.css';
import { PublicApp } from './public/PublicApp';

// Strict code-splitting: admin UI code loads only when visiting /admin*
const AdminApp = lazy(() =>
  import('./admin/AdminApp').then((m) => ({ default: m.AdminApp }))
);

export function navigatePath(nextPath: string): void {
  if (window.location.pathname !== nextPath) {
    window.history.pushState(null, '', nextPath);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}

const RootRouter: React.FC = () => {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPop = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');

  if (isAdmin) {
    return (
      <Suspense
        fallback={
          <div className="ed-shell">
            <main className="ed-container" style={{ paddingTop: '64px' }}>
              <div className="ed-panel">
                <p className="ed-muted">Loading Editorial Workbench…</p>
              </div>
            </main>
          </div>
        }
      >
        <AdminApp onGoPublic={() => navigatePath('/')} />
      </Suspense>
    );
  }

  return <PublicApp onGoAdmin={() => navigatePath('/admin')} />;
};

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootRouter />
  </React.StrictMode>
);
