import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setToken } from '../../api.js';
import { useI18n } from '../../i18n.jsx';

export default function AdminLogin() {
  const { t, lang, toggleLang } = useI18n();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [defaultPasswordInUse, setDefaultPasswordInUse] = useState(false);

  useEffect(() => {
    let alive = true;
    api('/api/admin/session')
      .then((data) => {
        if (!alive) return;
        if (data.authenticated) navigate('/admin', { replace: true });
        else setDefaultPasswordInUse(Boolean(data.defaultPasswordInUse));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [navigate]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (loading) return;
    if (!password) {
      setError(t('admin.wrongPassword'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await api('/api/admin/login', { method: 'POST', body: { password } });
      setToken(data.token);
      navigate('/admin', { replace: true });
    } catch (err) {
      if (err.status === 429) setError(t('admin.failed'));
      else setError(t('admin.wrongPassword'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card card">
        <div className="login-top">
          <Link to="/" className="brand">
            <img src="/img/logo.svg" alt="" className="brand-mark" width="40" height="40" aria-hidden="true" />
            <strong>ElectroPC</strong>
          </Link>
          <button type="button" className="btn btn-ghost btn-sm" onClick={toggleLang}>
            {lang === 'ar' ? 'Français' : 'العربية'}
          </button>
        </div>

        <h1>{t('admin.loginTitle')}</h1>
        <p className="muted">{t('admin.loginSubtitle')}</p>

        <form onSubmit={handleSubmit}>
          <label className="field">
            <span>{t('admin.password')}</span>
            <input
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError('');
              }}
              autoComplete="current-password"
              data-testid="admin-password"
              autoFocus
            />
          </label>
          {error ? (
            <p className="alert alert-error" data-testid="login-error">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn btn-primary btn-block" disabled={loading} data-testid="admin-login">
            {loading ? t('admin.signingIn') : t('admin.signIn')}
          </button>
        </form>

        {defaultPasswordInUse ? (
          <p className="alert alert-warn small" data-testid="login-default-hint">
            {t('admin.defaultPassword')}
          </p>
        ) : null}

        <Link to="/" className="link-more">
          ← {t('admin.viewStore')}
        </Link>
      </div>
    </div>
  );
}
