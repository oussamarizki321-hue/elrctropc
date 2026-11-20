import { Link } from 'react-router-dom';
import { useI18n } from '../i18n.jsx';

export default function NotFound() {
  const { t } = useI18n();

  return (
    <div className="container section">
      <div className="empty-state">
        <h1>404 — {t('notfound.title')}</h1>
        <p className="muted">{t('notfound.text')}</p>
        <Link to="/" className="btn btn-primary">
          {t('notfound.cta')}
        </Link>
      </div>
    </div>
  );
}
