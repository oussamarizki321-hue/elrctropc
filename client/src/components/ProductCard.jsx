import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n.jsx';
import { useCart } from '../cart.jsx';

export default function ProductCard({ product }) {
  const { t, lang, formatPrice } = useI18n();
  const { add } = useCart();
  const [justAdded, setJustAdded] = useState(false);
  const outOfStock = product.stock <= 0;
  const name = product.name?.[lang] || product.name?.fr || product.name?.ar || '';

  function handleAdd() {
    const ok = add(product, 1);
    if (!ok) return;
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1500);
  }

  return (
    <article className="product-card" data-testid={`product-card-${product.id}`}>
      <Link to={`/product/${product.id}`} className="product-card-media">
        <img src={product.image} alt={name} loading="lazy" width="320" height="220" />
        {product.oldPrice ? (
          <span className="pill pill-sale">
            -{Math.round((1 - product.price / product.oldPrice) * 100)}%
          </span>
        ) : null}
        {outOfStock ? <span className="pill pill-out">{t('product.outOfStock')}</span> : null}
      </Link>
      <div className="product-card-body">
        <span className="product-brand">{product.brand}</span>
        <h3 className="product-title">
          <Link to={`/product/${product.id}`}>{name}</Link>
        </h3>
        <div className="product-rating" aria-label={`${product.rating} / 5`}>
          <span aria-hidden="true">★</span> {product.rating}
          <span className="muted">
            ({product.reviews} {t('product.reviews')})
          </span>
        </div>
        <div className="price-row">
          <strong className="price">{formatPrice(product.price)}</strong>
          {product.oldPrice ? <s className="price-old">{formatPrice(product.oldPrice)}</s> : null}
        </div>
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={handleAdd}
          disabled={outOfStock}
          data-testid={`add-to-cart-${product.id}`}
        >
          {outOfStock ? t('product.outOfStock') : justAdded ? t('product.added') : t('product.addToCart')}
        </button>
      </div>
    </article>
  );
}
