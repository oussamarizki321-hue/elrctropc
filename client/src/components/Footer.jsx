import { Link } from 'react-router-dom';
import { useI18n } from '../i18n.jsx';
import { CATEGORIES } from '../data.js';

export default function Footer() {
  const { t, lang } = useI18n();
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <div className="brand footer-brand">
            <span className="brand-mark" aria-hidden="true">
              ⚡
            </span>
            <strong>ElectroPC</strong>
          </div>
          <p className="muted">{t('footer.aboutText')}</p>
        </div>
        <div>
          <h3>{t('footer.shop')}</h3>
          <ul className="footer-list">
            {CATEGORIES.slice(0, 5).map((category) => (
              <li key={category.id}>
                <Link to={`/catalog?category=${category.id}`}>{lang === 'ar' ? category.ar : category.fr}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>{t('footer.help')}</h3>
          <ul className="footer-list">
            <li>
              <Link to="/catalog">{t('footer.shipping')}</Link>
            </li>
            <li>
              <Link to="/catalog">{t('footer.returns')}</Link>
            </li>
            <li>
              <Link to="/cart">{t('nav.cart')}</Link>
            </li>
            <li>
              <Link to="/admin">{t('nav.admin')}</Link>
            </li>
          </ul>
        </div>
        <div>
          <h3>{t('footer.contact')}</h3>
          <ul className="footer-list">
            <li>+213 555 00 00 00</li>
            <li>contact@electropc.dz</li>
            <li>{t('footer.hours')}</li>
          </ul>
        </div>
      </div>
      <div className="footer-bottom">
        <div className="container">
          <span>
            © {year} ElectroPC — {t('footer.rights')}
          </span>
        </div>
      </div>
    </footer>
  );
}
