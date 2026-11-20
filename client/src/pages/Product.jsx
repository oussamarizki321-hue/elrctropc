import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useI18n, categoryLabel } from '../i18n.jsx';
import { useCart } from '../cart.jsx';
import ProductCard from '../components/ProductCard.jsx';

export default function Product() {
  const { id } = useParams();
  const { t, lang, formatPrice } = useI18n();
  const { add } = useCart();

  const [state, setState] = useState({ status: 'loading', product: null, related: [] });
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading', product: null, related: [] });
    setQty(1);
    setAdded(false);
    api(`/api/products/${encodeURIComponent(id)}`)
      .then((data) => {
        if (alive) setState({ status: 'ready', product: data.product, related: data.related || [] });
      })
      .catch((err) => {
        if (alive) setState({ status: err.status === 404 ? 'missing' : 'error', product: null, related: [] });
      });
    return () => {
      alive = false;
    };
  }, [id, reload]);

  if (state.status === 'loading') {
    return (
      <div className="container section">
        <p className="muted">{t('common.loading')}</p>
      </div>
    );
  }

  if (state.status === 'error' || state.status === 'missing' || !state.product) {
    return (
      <div className="container section">
        <div className="empty-state">
          <h1>{t('product.notFound')}</h1>
          <p className="muted">{t('product.notFoundHint')}</p>
          <div className="row-actions">
            <Link to="/catalog" className="btn btn-primary">
              {t('product.back')}
            </Link>
            {state.status === 'error' ? (
              <button type="button" className="btn btn-outline" onClick={() => setReload((r) => r + 1)}>
                {t('common.retry')}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const product = state.product;
  const name = product.name?.[lang] || product.name?.fr || '';
  const desc = product.desc?.[lang] || product.desc?.fr || '';
  const specs = product.specs?.[lang] || product.specs?.fr || [];
  const outOfStock = product.stock <= 0;
  const maxQty = Math.min(99, Math.max(1, product.stock));

  function handleAdd() {
    const ok = add(product, qty);
    if (!ok) return;
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2000);
  }

  return (
    <div className="container section">
      <nav className="breadcrumb" aria-label="breadcrumb">
        <Link to="/">{t('nav.home')}</Link>
        <span aria-hidden="true">/</span>
        <Link to="/catalog">{t('nav.catalog')}</Link>
        <span aria-hidden="true">/</span>
        <Link to={`/catalog?category=${product.category}`}>{categoryLabel(product.category, lang)}</Link>
      </nav>

      <div className="product-detail">
        <div className="product-detail-media card">
          <img src={product.image} alt={name} width="640" height="440" />
        </div>

        <div className="product-detail-info">
          <span className="product-brand">{product.brand}</span>
          <h1 data-testid="product-name">{name}</h1>
          <div className="product-rating">
            <span aria-hidden="true">★</span> {product.rating}
            <span className="muted">
              ({product.reviews} {t('product.reviews')})
            </span>
            <span className="muted">· {t('product.sku')}: {product.sku}</span>
          </div>

          <div className="price-row price-row-lg">
            <strong className="price" data-testid="product-price">
              {formatPrice(product.price)}
            </strong>
            {product.oldPrice ? <s className="price-old">{formatPrice(product.oldPrice)}</s> : null}
          </div>

          <p className={outOfStock ? 'stock out' : product.stock <= 3 ? 'stock low' : 'stock in'}>
            {outOfStock
              ? t('product.outOfStock')
              : product.stock <= 3
                ? t('product.lowStock', { n: product.stock })
                : t('product.inStock')}
          </p>

          <div className="buy-row">
            <label className="qty-field">
              <span>{t('product.quantity')}</span>
              <div className="qty-control">
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  disabled={qty <= 1}
                  aria-label="-"
                  data-testid="qty-minus"
                >
                  −
                </button>
                <input
                  type="number"
                  min="1"
                  max={maxQty}
                  value={qty}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setQty(Number.isFinite(next) ? Math.min(maxQty, Math.max(1, Math.floor(next))) : 1);
                  }}
                  aria-label={t('product.quantity')}
                  data-testid="qty-input"
                />
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                  disabled={qty >= maxQty}
                  aria-label="+"
                  data-testid="qty-plus"
                >
                  +
                </button>
              </div>
            </label>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={handleAdd}
              disabled={outOfStock}
              data-testid="add-to-cart"
            >
              {outOfStock ? t('product.outOfStock') : added ? t('product.added') : t('product.addToCart')}
            </button>
            <Link to="/cart" className="btn btn-outline btn-lg" data-testid="go-to-cart">
              {t('nav.cart')}
            </Link>
          </div>

          {desc ? (
            <section className="detail-block">
              <h2>{t('product.description')}</h2>
              <p>{desc}</p>
            </section>
          ) : null}

          {specs.length > 0 ? (
            <section className="detail-block">
              <h2>{t('product.specs')}</h2>
              <ul className="spec-list">
                {specs.map((spec, index) => (
                  <li key={index}>{spec}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>

      {state.related.length > 0 ? (
        <section className="section">
          <div className="section-head">
            <h2>{t('product.related')}</h2>
            <Link to={`/catalog?category=${product.category}`} className="link-more">
              {t('home.viewAll')}
            </Link>
          </div>
          <div className="product-grid">
            {state.related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
