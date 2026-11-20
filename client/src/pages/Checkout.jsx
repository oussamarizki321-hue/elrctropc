import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { useCart } from '../cart.jsx';
import { WILAYAS } from '../data.js';

const EMPTY = { name: '', phone: '', email: '', wilaya: '', address: '', notes: '' };

export default function Checkout() {
  const { t, lang, formatPrice } = useI18n();
  const { items, subtotal, shipping, total, clear } = useCart();
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle');
  const [serverError, setServerError] = useState('');

  if (items.length === 0 && status !== 'submitting') {
    return (
      <div className="container section">
        <div className="empty-state">
          <h1>{t('cart.empty')}</h1>
          <p className="muted">{t('cart.emptyHint')}</p>
          <Link to="/catalog" className="btn btn-primary">
            {t('cart.continue')}
          </Link>
        </div>
      </div>
    );
  }

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function validate() {
    const next = {};
    if (form.name.trim().length < 3) next.name = t('checkout.errName');
    const phone = form.phone.replace(/[\s-]/g, '');
    if (!/^(?:\+212|0)[5-7]\d{8}$/.test(phone)) next.phone = t('checkout.errPhone');
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(form.email.trim())) {
      next.email = t('checkout.errEmail');
    }
    if (!form.wilaya) next.wilaya = t('checkout.errWilaya');
    if (form.address.trim().length < 10) next.address = t('checkout.errAddress');
    return next;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (status === 'submitting') return;

    const found = validate();
    if (Object.keys(found).length > 0) {
      setErrors(found);
      setServerError('');
      return;
    }

    setStatus('submitting');
    setServerError('');
    try {
      const data = await api('/api/orders', {
        method: 'POST',
        body: {
          customer: { ...form, phone: form.phone.replace(/[\s-]/g, '') },
          items: items.map((item) => ({ id: item.id, qty: item.qty })),
          payment: 'cod',
        },
      });
      const order = data.order;
      try {
        sessionStorage.setItem('electropc_last_order', JSON.stringify(order));
      } catch {
        /* ignore */
      }
      clear();
      setStatus('idle');
      navigate(`/order/${order.number}`, { state: { order } });
    } catch (err) {
      setStatus('error');
      const fields = err?.data?.error?.fields || err?.data?.fields || {};
      if (Object.keys(fields).length > 0) {
        const mapped = {};
        for (const [key, value] of Object.entries(fields)) {
          mapped[key] = Array.isArray(value) ? value[0] : String(value);
        }
        setErrors(mapped);
      } else {
        setServerError(err?.data?.error?.message || t('checkout.errGeneric'));
      }
    }
  }

  return (
    <div className="container section">
      <div className="page-head">
        <h1>{t('checkout.title')}</h1>
        <Link to="/cart" className="link-more">
          {t('checkout.backToCart')}
        </Link>
      </div>

      <form className="checkout-layout" onSubmit={handleSubmit} noValidate>
        <div className="checkout-form card">
          <h2>{t('checkout.contact')}</h2>

          <div className="form-grid">
            <label className={`field${errors.name ? ' has-error' : ''}`}>
              <span>
                {t('checkout.name')} <em aria-hidden="true">*</em>
              </span>
              <input
                type="text"
                value={form.name}
                onChange={(event) => setField('name', event.target.value)}
                autoComplete="name"
                data-testid="checkout-name"
                aria-invalid={Boolean(errors.name)}
              />
              {errors.name ? (
                <small className="field-error" data-testid="error-name">
                  {errors.name}
                </small>
              ) : null}
            </label>

            <label className={`field${errors.phone ? ' has-error' : ''}`}>
              <span>
                {t('checkout.phone')} <em aria-hidden="true">*</em>
              </span>
              <input
                type="tel"
                value={form.phone}
                onChange={(event) => setField('phone', event.target.value)}
                placeholder="0X XX XX XX XX"
                autoComplete="tel"
                data-testid="checkout-phone"
                aria-invalid={Boolean(errors.phone)}
              />
              {errors.phone ? (
                <small className="field-error" data-testid="error-phone">
                  {errors.phone}
                </small>
              ) : null}
            </label>

            <label className={`field${errors.email ? ' has-error' : ''}`}>
              <span>
                {t('checkout.email')} <span className="muted small">({t('common.optional')})</span>
              </span>
              <input
                type="email"
                value={form.email}
                onChange={(event) => setField('email', event.target.value)}
                autoComplete="email"
                data-testid="checkout-email"
                aria-invalid={Boolean(errors.email)}
              />
              {errors.email ? (
                <small className="field-error" data-testid="error-email">
                  {errors.email}
                </small>
              ) : null}
            </label>

            <label className={`field${errors.wilaya ? ' has-error' : ''}`}>
              <span>
                {t('checkout.wilaya')} <em aria-hidden="true">*</em>
              </span>
              <select
                value={form.wilaya}
                onChange={(event) => setField('wilaya', event.target.value)}
                data-testid="checkout-wilaya"
                aria-invalid={Boolean(errors.wilaya)}
              >
                <option value="">{t('checkout.selectWilaya')}</option>
                {WILAYAS.map((wilaya) => (
                  <option key={wilaya.code} value={wilaya.code}>
                    {wilaya.code} — {lang === 'ar' ? wilaya.ar : wilaya.fr}
                  </option>
                ))}
              </select>
              {errors.wilaya ? (
                <small className="field-error" data-testid="error-wilaya">
                  {errors.wilaya}
                </small>
              ) : null}
            </label>
          </div>

          <label className={`field${errors.address ? ' has-error' : ''}`}>
            <span>
              {t('checkout.address')} <em aria-hidden="true">*</em>
            </span>
            <textarea
              rows="3"
              value={form.address}
              onChange={(event) => setField('address', event.target.value)}
              autoComplete="street-address"
              data-testid="checkout-address"
              aria-invalid={Boolean(errors.address)}
            />
            {errors.address ? (
              <small className="field-error" data-testid="error-address">
                {errors.address}
              </small>
            ) : null}
          </label>

          <label className="field">
            <span>
              {t('checkout.notes')} <span className="muted small">({t('common.optional')})</span>
            </span>
            <textarea
              rows="2"
              value={form.notes}
              onChange={(event) => setField('notes', event.target.value)}
              data-testid="checkout-notes"
            />
          </label>

          <h2>{t('checkout.payment')}</h2>
          <label className="payment-option">
            <input type="radio" name="payment" value="cod" checked readOnly />
            <span>
              <strong>{t('checkout.cod')}</strong>
              <small className="muted">{t('checkout.codHint')}</small>
            </span>
          </label>

          {errors.items ? (
            <p className="alert alert-error" data-testid="error-items">
              {Array.isArray(errors.items) ? errors.items[0] : errors.items}
            </p>
          ) : null}
          {serverError ? (
            <p className="alert alert-error" data-testid="error-server">
              {serverError}
            </p>
          ) : null}

          <button
            type="submit"
            className="btn btn-primary btn-block btn-lg"
            disabled={status === 'submitting'}
            data-testid="place-order"
          >
            {status === 'submitting' ? t('checkout.submitting') : t('checkout.submit')}
          </button>
        </div>

        <aside className="checkout-summary card">
          <h2>{t('checkout.summary')}</h2>
          <ul className="checkout-items">
            {items.map((item) => (
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
              <dd>{formatPrice(subtotal)}</dd>
            </div>
            <div>
              <dt>{t('cart.shipping')}</dt>
              <dd>{shipping === 0 ? t('cart.free') : formatPrice(shipping)}</dd>
            </div>
            <div className="summary-total">
              <dt>{t('cart.total')}</dt>
              <dd data-testid="checkout-total">{formatPrice(total)}</dd>
            </div>
          </dl>
        </aside>
      </form>
    </div>
  );
}
