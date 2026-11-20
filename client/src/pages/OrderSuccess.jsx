import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useI18n } from '../i18n.jsx';
import { WILAYAS } from '../data.js';

export default function OrderSuccess() {
  const { number } = useParams();
  const location = useLocation();
  const { t, lang, formatPrice } = useI18n();
  const [order, setOrder] = useState(location.state?.order || null);

  useEffect(() => {
    if (order) return;
    try {
      const raw = sessionStorage.getItem('electropc_last_order');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.number === number) setOrder(parsed);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [number]);

  if (!order) {
    return (
      <div className="container section">
        <div className="empty-state">
          <h1>{t('order.missing')}</h1>
          <p className="muted">{t('order.missingHint')}</p>
          <Link to="/catalog" className="btn btn-primary">
            {t('order.continue')}
          </Link>
        </div>
      </div>
    );
  }

  const wilaya = WILAYAS.find((w) => w.code === order.customer?.wilaya);
  const wilayaLabel = wilaya ? `${wilaya.code} — ${lang === 'ar' ? wilaya.ar : wilaya.fr}` : order.customer?.wilaya;

  return (
    <div className="container section">
      <div className="order-success card">
        <div className="success-mark" aria-hidden="true">
          ✓
        </div>
        <h1>{t('order.success')}</h1>
        <p className="muted">{t('order.thanks')}</p>

        <div className="order-number">
          <span>{t('order.number')}</span>
          <strong data-testid="order-number">{order.number}</strong>
        </div>

        <dl className="order-details">
          <div>
            <dt>{t('order.status')}</dt>
            <dd>
              <span className={`status-pill status-${order.status}`}>
                {t(`order.status${order.status.charAt(0).toUpperCase()}${order.status.slice(1)}`)}
              </span>
            </dd>
          </div>
          <div>
            <dt>{t('order.customer')}</dt>
            <dd>{order.customer?.name}</dd>
          </div>
          <div>
            <dt>{t('checkout.phone')}</dt>
            <dd>{order.customer?.phone}</dd>
          </div>
          <div>
            <dt>{t('checkout.wilaya')}</dt>
            <dd>{wilayaLabel}</dd>
          </div>
          <div className="full">
            <dt>{t('checkout.address')}</dt>
            <dd>{order.customer?.address}</dd>
          </div>
        </dl>

        <h2>{t('order.details')}</h2>
        <ul className="checkout-items">
          {order.items?.map((item) => (
            <li key={item.id}>
              <span className="checkout-item-name">
                {item.name?.[lang] || item.name?.fr} × {item.qty}
              </span>
              <span>{formatPrice(item.price * item.qty)}</span>
            </li>
          ))}
        </ul>
        <dl className="summary-list">
          <div>
            <dt>{t('cart.subtotal')}</dt>
            <dd>{formatPrice(order.subtotal)}</dd>
          </div>
          <div>
            <dt>{t('cart.shipping')}</dt>
            <dd>{order.shipping === 0 ? t('cart.free') : formatPrice(order.shipping)}</dd>
          </div>
          <div className="summary-total">
            <dt>{t('cart.total')}</dt>
            <dd data-testid="order-total">{formatPrice(order.total)}</dd>
          </div>
        </dl>

        <div className="row-actions">
          <Link to="/catalog" className="btn btn-primary">
            {t('order.continue')}
          </Link>
          <Link to="/" className="btn btn-outline">
            {t('order.backHome')}
          </Link>
        </div>
      </div>
    </div>
  );
}
