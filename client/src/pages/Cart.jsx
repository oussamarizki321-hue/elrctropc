import { Link, useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n.jsx';
import { useCart } from '../cart.jsx';

export default function Cart() {
  const { t, lang, formatPrice } = useI18n();
  const { items, setQty, remove, clear, subtotal, shipping, total, remainingForFreeShipping } = useCart();
  const navigate = useNavigate();

  if (items.length === 0) {
    return (
      <div className="container section">
        <div className="empty-state">
          <h1>{t('cart.empty')}</h1>
          <p className="muted">{t('cart.emptyHint')}</p>
          <Link to="/catalog" className="btn btn-primary" data-testid="empty-shop">
            {t('cart.continue')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container section">
      <div className="page-head">
        <h1>{t('cart.title')}</h1>
        <button type="button" className="btn btn-outline btn-sm" onClick={clear} data-testid="clear-cart">
          {t('cart.clear')}
        </button>
      </div>

      <div className="cart-layout">
        <div className="cart-items card">
          <div className="cart-head">
            <span>{t('cart.item')}</span>
            <span>{t('cart.price')}</span>
            <span>{t('cart.qty')}</span>
            <span>{t('cart.lineTotal')}</span>
            <span />
          </div>

          {items.map((item) => {
            const name = item.name?.[lang] || item.name?.fr || item.id;
            const max = item.stock > 0 ? Math.min(99, item.stock) : 99;
            return (
              <div className="cart-row" key={item.id} data-testid={`cart-row-${item.id}`}>
                <div className="cart-product">
                  <img src={item.image} alt="" width="72" height="56" loading="lazy" />
                  <Link to={`/product/${item.id}`}>{name}</Link>
                </div>
                <span className="cart-price">{formatPrice(item.price)}</span>
                <div className="qty-control qty-control-sm">
                  <button
                    type="button"
                    onClick={() => setQty(item.id, item.qty - 1)}
                    aria-label="-"
                    data-testid={`dec-${item.id}`}
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min="1"
                    max={max}
                    value={item.qty}
                    onChange={(event) => setQty(item.id, event.target.value)}
                    aria-label={t('cart.qty')}
                    data-testid={`qty-${item.id}`}
                  />
                  <button
                    type="button"
                    onClick={() => setQty(item.id, item.qty + 1)}
                    disabled={item.qty >= max}
                    aria-label="+"
                    data-testid={`inc-${item.id}`}
                  >
                    +
                  </button>
                </div>
                <strong className="cart-line-total" data-testid={`line-total-${item.id}`}>
                  {formatPrice(item.price * item.qty)}
                </strong>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => remove(item.id)}
                  data-testid={`remove-${item.id}`}
                >
                  {t('cart.remove')}
                </button>
              </div>
            );
          })}
        </div>

        <aside className="cart-summary card">
          <h2>{t('cart.summary')}</h2>
          <dl className="summary-list">
            <div>
              <dt>{t('cart.subtotal')}</dt>
              <dd data-testid="subtotal">{formatPrice(subtotal)}</dd>
            </div>
            <div>
              <dt>{t('cart.shipping')}</dt>
              <dd data-testid="shipping">{shipping === 0 ? t('cart.free') : formatPrice(shipping)}</dd>
            </div>
            <div className="summary-total">
              <dt>{t('cart.total')}</dt>
              <dd data-testid="total">{formatPrice(total)}</dd>
            </div>
          </dl>

          {remainingForFreeShipping > 0 ? (
            <p className="muted small">{t('cart.freeHint', { n: formatPrice(remainingForFreeShipping) })}</p>
          ) : null}

          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={() => navigate('/checkout')}
            data-testid="checkout-btn"
          >
            {t('cart.checkout')}
          </button>
          <Link to="/catalog" className="btn btn-ghost btn-block">
            {t('cart.continue')}
          </Link>
        </aside>
      </div>
    </div>
  );
}
