import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useI18n } from '../../i18n.jsx';

const STATUS_KEYS = {
  new: 'order.statusNew',
  confirmed: 'order.statusConfirmed',
  shipped: 'order.statusShipped',
  delivered: 'order.statusDelivered',
  cancelled: 'order.statusCancelled',
};

export default function AdminDashboard() {
  const { t, formatPrice, formatDate } = useI18n();
  const navigate = useNavigate();
  const [state, setState] = useState({ status: 'loading', stats: null, products: [] });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    setState((prev) => ({ ...prev, status: 'loading' }));
    Promise.all([api('/api/admin/stats'), api('/api/admin/products')])
      .then(([stats, products]) => {
        if (!alive) return;
        setState({ status: 'ready', stats, products: products.items || [] });
      })
      .catch((err) => {
        if (!alive) return;
        if (err.status === 401) {
          navigate('/admin/login', { replace: true });
          return;
        }
        setState({ status: 'error', stats: null, products: [] });
      });
    return () => {
      alive = false;
    };
  }, [navigate, reload]);

  if (state.status === 'loading') {
    return <p className="muted">{t('admin.loading')}</p>;
  }

  if (state.status === 'error') {
    return (
      <div className="alert alert-error">
        <span>{t('common.error')}</span>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setReload((r) => r + 1)}>
          {t('common.retry')}
        </button>
      </div>
    );
  }

  const { stats, products } = state;
  const lowStock = products.filter((product) => product.stock <= 3).slice(0, 6);

  return (
    <>
      <div className="page-head">
        <h1>{t('admin.dashboard')}</h1>
        <div className="row-actions">
          <Link to="/admin/products" className="btn btn-primary btn-sm">
            {t('admin.products')}
          </Link>
          <Link to="/admin/orders" className="btn btn-outline btn-sm">
            {t('admin.orders')}
          </Link>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span>{t('admin.statProducts')}</span>
          <strong data-testid="stat-products">{stats.products}</strong>
        </div>
        <div className="stat-card">
          <span>{t('admin.statOrders')}</span>
          <strong data-testid="stat-orders">{stats.orders}</strong>
        </div>
        <div className="stat-card">
          <span>{t('admin.statNew')}</span>
          <strong data-testid="stat-new">{stats.newOrders}</strong>
        </div>
        <div className="stat-card">
          <span>{t('admin.statLowStock')}</span>
          <strong data-testid="stat-low">{stats.lowStock}</strong>
        </div>
        <div className="stat-card stat-wide">
          <span>{t('admin.statRevenue')}</span>
          <strong data-testid="stat-revenue">{formatPrice(stats.revenue)}</strong>
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>{t('admin.recentOrders')}</h2>
          <Link to="/admin/orders" className="link-more">
            {t('home.viewAll')}
          </Link>
        </div>
        {stats.recentOrders.length === 0 ? (
          <p className="muted">{t('admin.noOrders')}</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('admin.order')}</th>
                  <th>{t('admin.customer')}</th>
                  <th>{t('admin.orderDate')}</th>
                  <th>{t('cart.total')}</th>
                  <th>{t('admin.status')}</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentOrders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.number}</td>
                    <td>{order.customer?.name}</td>
                    <td>{formatDate(order.createdAt)}</td>
                    <td>{formatPrice(order.total)}</td>
                    <td>
                      <span className={`status-pill status-${order.status}`}>{t(STATUS_KEYS[order.status])}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>{t('admin.statLowStock')}</h2>
          <Link to="/admin/products" className="link-more">
            {t('home.viewAll')}
          </Link>
        </div>
        {lowStock.length === 0 ? (
          <p className="muted">{t('admin.noProducts')}</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('admin.tableName')}</th>
                  <th>{t('admin.brand')}</th>
                  <th>{t('admin.stock')}</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.map((product) => (
                  <tr key={product.id}>
                    <td>{product.name?.fr}</td>
                    <td>{product.brand}</td>
                    <td>
                      <span className={product.stock === 0 ? 'stock out' : 'stock low'}>{product.stock}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
