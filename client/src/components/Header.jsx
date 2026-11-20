import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n.jsx';
import { useCart } from '../cart.jsx';
import { CATEGORIES } from '../data.js';

export default function Header() {
  const { t, lang, toggleLang } = useI18n();
  const { count } = useCart();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');

  function submitSearch(event) {
    event.preventDefault();
    const q = term.trim();
    navigate(q ? `/catalog?q=${encodeURIComponent(q)}` : '/catalog');
    setOpen(false);
  }

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link to="/" className="brand" onClick={() => setOpen(false)}>
          <span className="brand-mark" aria-hidden="true">
            ⚡
          </span>
          <span className="brand-text">
            <strong>ElectroPC</strong>
            <small>{t('brand.tagline')}</small>
          </span>
        </Link>

        <form className="header-search" role="search" onSubmit={submitSearch}>
          <input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={t('nav.search')}
            aria-label={t('catalog.searchLabel')}
            data-testid="header-search"
          />
          <button type="submit" className="btn btn-primary btn-sm">
            {t('common.search')}
          </button>
        </form>

        <div className="header-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm lang-toggle"
            onClick={toggleLang}
            aria-label={t('common.language')}
            data-testid="lang-toggle"
          >
            {lang === 'ar' ? 'Français' : 'العربية'}
          </button>
          <Link to="/cart" className="cart-link" data-testid="cart-link" onClick={() => setOpen(false)}>
            <span aria-hidden="true">🛒</span>
            <span className="cart-link-label">{t('nav.cart')}</span>
            <span className="badge" data-testid="cart-count">
              {count}
            </span>
          </Link>
          <Link to="/admin" className="btn btn-outline btn-sm admin-link" onClick={() => setOpen(false)}>
            {t('nav.admin')}
          </Link>
          <button
            type="button"
            className="menu-toggle"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="main-nav"
            aria-label={t('nav.menu')}
          >
            {open ? '✕' : '☰'}
          </button>
        </div>
      </div>

      <nav id="main-nav" className={`main-nav${open ? ' is-open' : ''}`} aria-label={t('nav.catalog')}>
        <div className="container nav-inner">
          <Link to="/" onClick={() => setOpen(false)}>
            {t('nav.home')}
          </Link>
          <Link to="/catalog" onClick={() => setOpen(false)}>
            {t('nav.catalog')}
          </Link>
          {CATEGORIES.map((category) => (
            <Link
              key={category.id}
              to={`/catalog?category=${category.id}`}
              onClick={() => setOpen(false)}
              className="nav-category"
            >
              {lang === 'ar' ? category.ar : category.fr}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
