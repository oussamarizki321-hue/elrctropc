import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useI18n } from '../../i18n.jsx';
import { CATEGORIES } from '../../data.js';

const EMPTY = {
  nameAr: '',
  nameFr: '',
  brand: '',
  category: 'laptop',
  price: '',
  oldPrice: '',
  stock: '',
  image: '/img/cpu.svg',
  sku: '',
  featured: false,
  descAr: '',
  descFr: '',
  specsAr: '',
  specsFr: '',
};

const IMAGE_OPTIONS = [
  '/img/laptop.svg',
  '/img/gpu.svg',
  '/img/cpu.svg',
  '/img/ram.svg',
  '/img/storage.svg',
  '/img/monitor.svg',
  '/img/keyboard.svg',
  '/img/mouse.svg',
  '/img/headset.svg',
  '/img/psu.svg',
];

function toForm(product) {
  return {
    nameAr: product.name?.ar || '',
    nameFr: product.name?.fr || '',
    brand: product.brand || '',
    category: product.category || 'laptop',
    price: String(product.price ?? ''),
    oldPrice: product.oldPrice ? String(product.oldPrice) : '',
    stock: String(product.stock ?? ''),
    image: product.image || '/img/cpu.svg',
    sku: product.sku || '',
    featured: Boolean(product.featured),
    descAr: product.desc?.ar || '',
    descFr: product.desc?.fr || '',
    specsAr: (product.specs?.ar || []).join('\n'),
    specsFr: (product.specs?.fr || []).join('\n'),
  };
}

export default function AdminProducts() {
  const { t, lang, formatPrice } = useI18n();
  const navigate = useNavigate();

  const [state, setState] = useState({ status: 'loading', items: [] });
  const [reload, setReload] = useState(0);
  const [filter, setFilter] = useState('');
  const [modal, setModal] = useState(null); // { id?: string, form }
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);

  useEffect(() => {
    let alive = true;
    setState((prev) => ({ ...prev, status: prev.items.length ? 'ready' : 'loading' }));
    api('/api/admin/products')
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

  const visible = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return state.items;
    return state.items.filter((product) =>
      `${product.name?.ar} ${product.name?.fr} ${product.brand} ${product.sku}`.toLowerCase().includes(term)
    );
  }, [state.items, filter]);

  function openCreate() {
    setErrors({});
    setModal({ form: { ...EMPTY, sku: `EPC-${Date.now().toString().slice(-6)}` } });
  }

  function openEdit(product) {
    setErrors({});
    setModal({ id: product.id, form: toForm(product) });
  }

  function setField(key, value) {
    setModal((prev) => ({ ...prev, form: { ...prev.form, [key]: value } }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function validate(form) {
    const next = {};
    if (form.nameAr.trim().length < 2) next.nameAr = t('admin.formErrors');
    if (form.nameFr.trim().length < 2) next.nameFr = t('admin.formErrors');
    if (!form.brand.trim()) next.brand = t('admin.formErrors');
    const price = Number(form.price);
    if (!Number.isFinite(price) || price <= 0) next.price = t('admin.formErrors');
    const stock = Number(form.stock);
    if (!Number.isInteger(stock) || stock < 0) next.stock = t('admin.formErrors');
    if (form.oldPrice !== '' && (!Number.isFinite(Number(form.oldPrice)) || Number(form.oldPrice) <= price)) {
      next.oldPrice = t('admin.formErrors');
    }
    if (!form.image.trim()) next.image = t('admin.formErrors');
    return next;
  }

  async function save(event) {
    event.preventDefault();
    if (!modal || saving) return;
    const found = validate(modal.form);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    setSaving(true);
    const form = modal.form;
    const payload = {
      name: { ar: form.nameAr.trim(), fr: form.nameFr.trim() },
      desc: { ar: form.descAr.trim(), fr: form.descFr.trim() },
      specs: {
        ar: form.specsAr.split('\n').map((s) => s.trim()).filter(Boolean),
        fr: form.specsFr.split('\n').map((s) => s.trim()).filter(Boolean),
      },
      category: form.category,
      brand: form.brand.trim(),
      price: Number(form.price),
      oldPrice: form.oldPrice === '' ? null : Number(form.oldPrice),
      stock: Number(form.stock),
      image: form.image.trim(),
      sku: form.sku.trim(),
      featured: Boolean(form.featured),
    };

    try {
      if (modal.id) await api(`/api/admin/products/${modal.id}`, { method: 'PUT', body: payload });
      else await api('/api/admin/products', { method: 'POST', body: payload });
      setModal(null);
      setErrors({});
      setToast(t('admin.saved'));
      setReload((r) => r + 1);
      window.setTimeout(() => setToast(''), 2500);
    } catch (err) {
      if (err.status === 401) {
        navigate('/admin/login', { replace: true });
        return;
      }
      const fields = err?.data?.fields || {};
      const mapped = {};
      for (const [key, value] of Object.entries(fields)) {
        const flat = key.replace('.', '').replace(/^(\w)/, (m) => m.toUpperCase());
        mapped[flat] = Array.isArray(value) ? value[0] : String(value);
      }
      setErrors(Object.keys(mapped).length ? mapped : { form: t('admin.failed') });
    } finally {
      setSaving(false);
    }
  }

  async function remove(product) {
    setPendingDelete(null);
    try {
      await api(`/api/admin/products/${product.id}`, { method: 'DELETE' });
      setToast(t('admin.deleted'));
      setReload((r) => r + 1);
      window.setTimeout(() => setToast(''), 2500);
    } catch (err) {
      if (err.status === 401) {
        navigate('/admin/login', { replace: true });
        return;
      }
      setToast(t('admin.failed'));
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>{t('admin.products')}</h1>
        <button type="button" className="btn btn-primary" onClick={openCreate} data-testid="new-product">
          + {t('admin.newProduct')}
        </button>
      </div>

      {toast ? (
        <p className="alert alert-success" data-testid="admin-toast">
          {toast}
        </p>
      ) : null}

      <div className="toolbar">
        <label className="field toolbar-search">
          <span>{t('admin.searchProducts')}</span>
          <input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={t('admin.searchProducts')}
            data-testid="admin-product-search"
          />
        </label>
        <span className="muted">
          {visible.length} {t('common.of')} {state.items.length}
        </span>
      </div>

      {state.status === 'loading' ? <p className="muted">{t('admin.loading')}</p> : null}
      {state.status === 'error' ? (
        <div className="alert alert-error">
          <span>{t('common.error')}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setReload((r) => r + 1)}>
            {t('common.retry')}
          </button>
        </div>
      ) : null}

      {state.status === 'ready' && visible.length === 0 ? <p className="muted">{t('admin.noProducts')}</p> : null}

      {state.status === 'ready' && visible.length > 0 ? (
        <div className="table-wrap">
          <table className="data-table" data-testid="admin-products-table">
            <thead>
              <tr>
                <th>{t('admin.tableImage')}</th>
                <th>{t('admin.tableName')}</th>
                <th>{t('admin.tableCategory')}</th>
                <th>{t('admin.tablePrice')}</th>
                <th>{t('admin.tableStock')}</th>
                <th>{t('admin.tableActions')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((product) => (
                <tr key={product.id} data-testid={`admin-row-${product.id}`}>
                  <td>
                    <img className="thumb" src={product.image} alt="" width="56" height="42" loading="lazy" />
                  </td>
                  <td>
                    <strong>{lang === 'ar' ? product.name?.ar : product.name?.fr}</strong>
                    <div className="muted small">
                      {product.brand} · {product.sku}
                    </div>
                  </td>
                  <td>{product.category}</td>
                  <td>{formatPrice(product.price)}</td>
                  <td>
                    <span className={product.stock === 0 ? 'stock out' : product.stock <= 3 ? 'stock low' : ''}>
                      {product.stock}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => openEdit(product)}
                        data-testid={`edit-${product.id}`}
                      >
                        {t('common.edit')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => setPendingDelete(product)}
                        data-testid={`delete-${product.id}`}
                      >
                        {t('common.delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {modal ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal card" role="dialog" aria-modal="true" aria-label={modal.id ? t('admin.editProduct') : t('admin.newProduct')}>
            <div className="modal-head">
              <h2>{modal.id ? t('admin.editProduct') : t('admin.newProduct')}</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModal(null)} data-testid="close-modal">
                ✕
              </button>
            </div>

            <form onSubmit={save} className="modal-body" noValidate>
              <div className="form-grid">
                <label className={`field${errors.nameAr ? ' has-error' : ''}`}>
                  <span>{t('admin.nameAr')} *</span>
                  <input
                    type="text"
                    value={modal.form.nameAr}
                    onChange={(event) => setField('nameAr', event.target.value)}
                    dir="rtl"
                    data-testid="product-nameAr"
                  />
                  {errors.nameAr ? <small className="field-error">{errors.nameAr}</small> : null}
                </label>
                <label className={`field${errors.nameFr ? ' has-error' : ''}`}>
                  <span>{t('admin.nameFr')} *</span>
                  <input
                    type="text"
                    value={modal.form.nameFr}
                    onChange={(event) => setField('nameFr', event.target.value)}
                    dir="ltr"
                    data-testid="product-nameFr"
                  />
                  {errors.nameFr ? <small className="field-error">{errors.nameFr}</small> : null}
                </label>
                <label className={`field${errors.brand ? ' has-error' : ''}`}>
                  <span>{t('admin.brand')} *</span>
                  <input
                    type="text"
                    value={modal.form.brand}
                    onChange={(event) => setField('brand', event.target.value)}
                    data-testid="product-brand"
                  />
                  {errors.brand ? <small className="field-error">{errors.brand}</small> : null}
                </label>
                <label className="field">
                  <span>{t('admin.category')}</span>
                  <select
                    value={modal.form.category}
                    onChange={(event) => setField('category', event.target.value)}
                    data-testid="product-category"
                  >
                    {CATEGORIES.map((category) => (
                      <option key={category.id} value={category.id}>
                        {lang === 'ar' ? category.ar : category.fr}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={`field${errors.price ? ' has-error' : ''}`}>
                  <span>{t('admin.price')} *</span>
                  <input
                    type="number"
                    min="1"
                    value={modal.form.price}
                    onChange={(event) => setField('price', event.target.value)}
                    data-testid="product-price"
                  />
                  {errors.price ? <small className="field-error">{errors.price}</small> : null}
                </label>
                <label className={`field${errors.oldPrice ? ' has-error' : ''}`}>
                  <span>{t('admin.oldPrice')}</span>
                  <input
                    type="number"
                    min="0"
                    value={modal.form.oldPrice}
                    onChange={(event) => setField('oldPrice', event.target.value)}
                    data-testid="product-oldPrice"
                  />
                  {errors.oldPrice ? <small className="field-error">{errors.oldPrice}</small> : null}
                </label>
                <label className={`field${errors.stock ? ' has-error' : ''}`}>
                  <span>{t('admin.stock')} *</span>
                  <input
                    type="number"
                    min="0"
                    value={modal.form.stock}
                    onChange={(event) => setField('stock', event.target.value)}
                    data-testid="product-stock"
                  />
                  {errors.stock ? <small className="field-error">{errors.stock}</small> : null}
                </label>
                <label className={`field${errors.sku ? ' has-error' : ''}`}>
                  <span>{t('admin.sku')}</span>
                  <input
                    type="text"
                    value={modal.form.sku}
                    onChange={(event) => setField('sku', event.target.value)}
                    data-testid="product-sku"
                  />
                  {errors.sku ? <small className="field-error">{errors.sku}</small> : null}
                </label>
                <label className={`field${errors.image ? ' has-error' : ''}`}>
                  <span>{t('admin.image')} *</span>
                  <select
                    value={modal.form.image}
                    onChange={(event) => setField('image', event.target.value)}
                    data-testid="product-image"
                  >
                    {IMAGE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option.replace('/img/', '').replace('.svg', '')}
                      </option>
                    ))}
                  </select>
                  {errors.image ? <small className="field-error">{errors.image}</small> : null}
                </label>
                <label className="switch-row modal-switch">
                  <input
                    type="checkbox"
                    checked={modal.form.featured}
                    onChange={(event) => setField('featured', event.target.checked)}
                    data-testid="product-featured"
                  />
                  <span>{t('admin.toggleFeatured')}</span>
                </label>
              </div>

              <label className="field">
                <span>{t('admin.descAr')}</span>
                <textarea
                  rows="2"
                  dir="rtl"
                  value={modal.form.descAr}
                  onChange={(event) => setField('descAr', event.target.value)}
                />
              </label>
              <label className="field">
                <span>{t('admin.descFr')}</span>
                <textarea
                  rows="2"
                  dir="ltr"
                  value={modal.form.descFr}
                  onChange={(event) => setField('descFr', event.target.value)}
                />
              </label>
              <div className="form-grid">
                <label className="field">
                  <span>{t('admin.specsAr')}</span>
                  <textarea
                    rows="4"
                    dir="rtl"
                    value={modal.form.specsAr}
                    onChange={(event) => setField('specsAr', event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>{t('admin.specsFr')}</span>
                  <textarea
                    rows="4"
                    dir="ltr"
                    value={modal.form.specsFr}
                    onChange={(event) => setField('specsFr', event.target.value)}
                  />
                </label>
              </div>

              {errors.form ? <p className="alert alert-error">{errors.form}</p> : null}

              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setModal(null)}>
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving} data-testid="save-product">
                  {saving ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {pendingDelete ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal card" role="dialog" aria-modal="true" aria-label={t('common.delete')}>
            <div className="modal-head">
              <h2>{t('common.delete')}</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setPendingDelete(null)}
                data-testid="close-delete"
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p>{t('admin.deleteConfirm')}</p>
              <p className="muted small">
                {lang === 'ar' ? pendingDelete.name?.ar : pendingDelete.name?.fr} · {pendingDelete.brand}
              </p>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setPendingDelete(null)}
                  data-testid="cancel-delete"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => remove(pendingDelete)}
                  data-testid="confirm-delete"
                >
                  {t('common.delete')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
