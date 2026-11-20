import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useI18n } from '../i18n.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { CATEGORIES } from '../data.js';

export default function Home() {
  const { t, lang } = useI18n();
  const [featured, setFeatured] = useState([]);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let alive = true;
    api('/api/products?featured=true&pageSize=8')
      .then((data) => {
        if (!alive) return;
        setFeatured(data.items || []);
        setStatus('ready');
      })
      .catch(() => {
        if (alive) setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <div className="hero-copy">
            <span className="hero-eyebrow">ElectroPC</span>
            <h1>{t('home.heroTitle')}</h1>
            <p>{t('home.heroSubtitle')}</p>
            <div className="hero-actions">
              <Link to="/catalog" className="btn btn-primary">
                {t('home.shopNow')}
              </Link>
              <a href="#categories" className="btn btn-ghost">
                {t('home.browseCategories')}
              </a>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <img src="/img/hero.svg" alt="" width="420" height="320" />
          </div>
        </div>
      </section>

      <section className="container perks">
        <div className="perk">
          <span aria-hidden="true">🚚</span>
          <div>
            <strong>{t('home.perkShipping')}</strong>
            <p>{t('home.perkShippingText')}</p>
          </div>
        </div>
        <div className="perk">
          <span aria-hidden="true">🛡️</span>
          <div>
            <strong>{t('home.perkWarranty')}</strong>
            <p>{t('home.perkWarrantyText')}</p>
          </div>
        </div>
        <div className="perk">
          <span aria-hidden="true">💵</span>
          <div>
            <strong>{t('home.perkCod')}</strong>
            <p>{t('home.perkCodText')}</p>
          </div>
        </div>
        <div className="perk">
          <span aria-hidden="true">🎧</span>
          <div>
            <strong>{t('home.perkSupport')}</strong>
            <p>{t('home.perkSupportText')}</p>
          </div>
        </div>
      </section>

      <section className="container section" id="categories">
        <div className="section-head">
          <h2>{t('home.categories')}</h2>
          <Link to="/catalog" className="link-more">
            {t('home.viewAll')}
          </Link>
        </div>
        <div className="category-grid">
          {CATEGORIES.map((category) => (
            <Link key={category.id} to={`/catalog?category=${category.id}`} className="category-tile">
              <img src={category.image} alt="" width="64" height="64" loading="lazy" />
              <span>{lang === 'ar' ? category.ar : category.fr}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="container section">
        <div className="section-head">
          <h2>{t('home.featured')}</h2>
          <Link to="/catalog" className="link-more">
            {t('home.viewAll')}
          </Link>
        </div>
        {status === 'loading' ? <p className="muted">{t('common.loading')}</p> : null}
        {status === 'error' ? <p className="alert alert-error">{t('common.error')}</p> : null}
        {status === 'ready' ? (
          <div className="product-grid">
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : null}
      </section>

      <section className="container section">
        <div className="promo-banner">
          <div>
            <h2>{t('home.promoTitle')}</h2>
            <p>{t('home.promoText')}</p>
          </div>
          <Link to="/catalog" className="btn btn-light">
            {t('home.shopNow')}
          </Link>
        </div>
      </section>
    </>
  );
}
