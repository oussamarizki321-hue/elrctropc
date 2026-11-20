import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useI18n } from '../../i18n.jsx';
import { WILAYAS } from '../../data.js';

const STATUSES = ['new', 'confirmed', 'shipped', 'delivered', 'cancelled'];

const STATUS_KEYS = {
  new: 'order.statusNew',
  confirmed: 'order.statusConfirmed',
  shipped: 'order.statusShipped',
  delivered: 'order.statusDelivered',
  cancelled: 'order.statusCancelled',
};

export default function AdminOrders() {
  const { t, lang, formatPrice, formatDate } = useI18n();
  const navigate = useNavigate();
  const [state, setState] = useState({ status: 'loading', items: [] });
  const [reload, setReload] = useState(0);
  const [filter, setFilter] = useState('all');
  const [toast, setToast] = useState('');
  const [busyId, setBusyId] = useState('');

  useEffect(() => {
    let alive = true;
    api('/api/admin/orders')
      .then((data) => {
        if (alive) setState({ status: 'ready', items: data.items || [] });
      })
      .catch((err) => {
        if (!alive) return;
        if (err.status === 401) navigate('/admin/login', { replace: true });
        else setState({ status: 'error', items: [] });
      });
    return () => {
      alive = false;
    };
  }, [navigate, reload]);

  const visible = useMemo(
    () => (filter === 'all' ? state.items : state.items.filter((order) => order.status === filter)),
    [state.items, filter]
  );

  async function changeStatus(order, status) {
    if (status === order.status) return;
    setBusyId(order.id);
    try {
      const data = await api(`/api/admin/orders/${order.id}`, { method: 'PATCH', body: { status } });
      setState((prev) => ({
        status: 'ready',
        items: prev.items.map((item) => (item.id === order.id ? data.order : item)),
      }));
      setToast(t('admin.statusUpdated'));
      window.setTimeout(() => setToast(''), 2500);
    } catch (err) {
      if (err.status === 401) {
        navigate('/admin/login', { replace: true });
        return;
      }
      setToast(t('admin.failed'));
    } finally {
      setBusyId('');
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>{t('admin.orders')}</h1>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setReload((r) => r + 1)}>
          {t('common.retry')}
        </button>
      </div>

      {toast ? (
        <p className="alert alert-success" data-testid="orders-toast">
          {toast}
        </p>
      ) : null}

      <div className="toolbar">
        <label className="field toolbar-search">
          <span>{t('admin.filterStatus')}</span>
          <select value={filter} onChange={(event) => setFilter(event.target.value)} data-testid="order-filter">
            <option value="all">{t('common.all')}</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(STATUS_KEYS[status])}
              </option>
            ))}
          </select>
        </label>
        <span className="muted">
          {visible.length} {t('common.of')} {state.items.length}
        </span>
      </div>

      {state.status === 'loading' ? <p className="muted">{t('admin.loading')}</p> : null}
      {state.status === 'error' ? <p className="alert alert-error">{t('common.error')}</p> : null}
      {state.status === 'ready' && visible.length === 0 ? <p className="muted">{t('admin.noOrders')}</p> : null}

      {state.status === 'ready' && visible.length > 0 ? (
        <div className="orders-list">
          {visible.map((order) => {
            const wilaya = WILAYAS.find((w) => w.code === order.customer?.wilaya);
            return (
              <article className="order-card card" key={order.id} data-testid={`order-${order.number}`}>
                <div className="order-card-head">
                  <div>
                    <strong>{order.number}</strong>
                    <div className="muted small">{formatDate(order.createdAt)}</div>
                  </div>
                  <span className={`status-pill status-${order.status}`}>{t(STATUS_KEYS[order.status])}</span>
                  <strong>{formatPrice(order.total)}</strong>
                </div>

                <div className="order-card-body">
                  <div>
                    <span className="muted small">{t('admin.customer')}</span>
                    <p>
                      {order.customer?.name}
                      <br />
                      <span className="muted">{order.customer?.phone}</span>
                    </p>
                  </div>
                  <div>
                    <span className="muted small">{t('admin.wilaya')}</span>
                    <p>{wilaya ? `${wilaya.code} — ${lang === 'ar' ? wilaya.ar : wilaya.fr}` : order.customer?.wilaya}</p>
                  </div>
                  <div className="order-address">
                    <span className="muted small">{t('admin.address')}</span>
                    <p>{order.customer?.address}</p>
                  </div>
                  <div>
                    <span className="muted small">{t('admin.items')}</span>
                    <p>{order.items?.reduce((sum, item) => sum + item.qty, 0)}</p>
                  </div>
                </div>

                <details className="order-items">
                  <summary>{t('order.details')}</summary>
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
                      <dd>{formatPrice(order.total)}</dd>
                    </div>
                  </dl>
                </details>

                <div className="order-card-actions">
                  <label className="field inline-field">
                    <span>{t('admin.changeStatus')}</span>
                    <select
                      value={order.status}
                      disabled={busyId === order.id}
                      onChange={(event) => changeStatus(order, event.target.value)}
                      data-testid={`status-${order.number}`}
                    >
                      {STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {t(STATUS_KEYS[status])}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
