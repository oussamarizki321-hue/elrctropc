import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { api, setToken } from '../../api.js';
import { useI18n } from '../../i18n.jsx';

export default function AdminLayout() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, authenticated: false, defaultPasswordInUse: false });

  useEffect(() => {
    let alive = true;
    api('/api/admin/session')
      .then((data) => {
        if (!alive) return;
        setState({
          loading: false,
          authenticated: Boolean(data.authenticated),
          defaultPasswordInUse: Boolean(data.defaultPasswordInUse),
        });
      })
      .catch(() => {
        if (alive) setState({ loading: false, authenticated: false, defaultPasswordInUse: false });
      });
    return () => {
      alive = false;
    };
  }, []);

  if (state.loading) {
    return (
      <div className="container section">
        <p className="muted">{t('common.loading')}</p>
      </div>
    );
  }

  if (!state.authenticated) return <Navigate to="/admin/login" replace />;

  async function logout() {
    try {
      await api('/api/admin/logout', { method: 'POST' });
    } catch {
      /* the token is cleared locally either way */
    }
    setToken('');
    navigate('/admin/login', { replace: true });
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="container admin-header-inner">
          <Link to="/" className="brand">
            <span className="brand-mark" aria-hidden="true">
              ⚡
            </span>
            <strong>ElectroPC</strong>
          </Link>
          <nav className="admin-tabs" aria-label={t('admin.dashboard')}>
            <NavLink to="/admin" end>
              {t('admin.dashboard')}
            </NavLink>
            <NavLink to="/admin/products">{t('admin.products')}</NavLink>
            <NavLink to="/admin/orders">{t('admin.orders')}</NavLink>
          </nav>
          <div className="admin-header-actions">
            <Link to="/" className="btn btn-ghost btn-sm">
              {t('admin.viewStore')}
            </Link>
            <button type="button" className="btn btn-outline btn-sm" onClick={logout} data-testid="admin-logout">
              {t('admin.logout')}
            </button>
          </div>
        </div>
      </header>

      {state.defaultPasswordInUse ? (
        <div className="container">
          <p className="alert alert-warn" data-testid="default-password-warning">
            {t('admin.defaultPassword')}
          </p>
        </div>
      ) : null}

      <main className="container section">
        <Outlet />
      </main>
    </div>
  );
}
