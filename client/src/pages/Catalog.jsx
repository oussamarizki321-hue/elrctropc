import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useI18n } from '../i18n.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { CATEGORIES } from '../data.js';

export default function Catalog() {
  const { t, lang } = useI18n();
  const [params, setParams] = useSearchParams();
  const query = params.toString();

  const [data, setData] = useState({ items: [], total: 0, page: 1, pages: 1 });
  const [status, setStatus] = useState('loading');
  const [reload, setReload] = useState(0);

  const [term, setTerm] = useState(params.get('q') || '');
  const [minInput, setMinInput] = useState(params.get('min') || '');
  const [maxInput, setMaxInput] = useState(params.get('max') || '');

  const activeCategory = params.get('category') || 'all';
  const activeSort = params.get('sort') || 'featured';
  const inStockOnly = params.get('inStock') === 'true';
  const page = Number(params.get('page')) || 1;

  useEffect(() => {
    setTerm(params.get('q') || '');
    setMinInput(params.get('min') || '');
    setMaxInput(params.get('max') || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    api(`/api/products${query ? `?${query}` : ''}`)
      .then((result) => {
        if (!alive) return;
        setData(result);
        setStatus('ready');
      })
      .catch(() => {
        if (alive) setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, [query, reload]);

  function update(patch, { keepPage = false } = {}) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === '' || value === null || value === undefined) next.delete(key);
      else next.set(key, String(value));
    }
    if (!keepPage) next.delete('page');
    setParams(next);
  }

  function resetAll() {
    setParams(new URLSearchParams());
  }

  const hasFilters =
    Boolean(params.get('q')) ||
    activeCategory !== 'all' ||
    Boolean(params.get('min')) ||
    Boolean(params.get('max')) ||
    inStockOnly ||
    activeSort !== 'featured';

  return (
    <div className="container section">
      <div className="page-head">
        <div>
          <h1>{t('catalog.title')}</h1>
          <p className="muted">{t('catalog.subtitle')}</p>
        </div>
        {hasFilters ? (
          <button type="button" className="btn btn-outline btn-sm" onClick={resetAll} data-testid="reset-filters">
            {t('catalog.reset')}
          </button>
        ) : null}
      </div>

      <div className="catalog-layout">
        <aside className="filters card">
          <h2>{t('catalog.filters')}</h2>

          <form
            className="filter-block"
            onSubmit={(event) => {
              event.preventDefault();
              update({ q: term.trim() });
            }}
          >
            <label className="field">
              <span>{t('catalog.searchLabel')}</span>
              <input
                type="search"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder={t('nav.search')}
                data-testid="catalog-search"
              />
            </label>
            <button type="submit" className="btn btn-primary btn-block btn-sm">
              {t('common.search')}
            </button>
          </form>

          <div className="filter-block">
            <span className="filter-title">{t('home.categories')}</span>
            <div className="chip-row">
              <button
                type="button"
                className={`chip${activeCategory === 'all' ? ' is-active' : ''}`}
                onClick={() => update({ category: '' })}
                data-testid="category-all"
              >
                {t('common.all')}
              </button>
              {CATEGORIES.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={`chip${activeCategory === category.id ? ' is-active' : ''}`}
                  onClick={() => update({ category: category.id })}
                  data-testid={`category-${category.id}`}
                >
                  {lang === 'ar' ? category.ar : category.fr}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-block">
            <span className="filter-title">{t('catalog.priceRange')}</span>
            <div className="price-inputs">
              <label className="field">
                <span>{t('catalog.min')}</span>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={minInput}
                  onChange={(event) => setMinInput(event.target.value)}
                  data-testid="filter-min"
                />
              </label>
              <label className="field">
                <span>{t('catalog.max')}</span>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={maxInput}
                  onChange={(event) => setMaxInput(event.target.value)}
                  data-testid="filter-max"
                />
              </label>
            </div>
            <button
              type="button"
              className="btn btn-outline btn-block btn-sm"
              onClick={() => update({ min: minInput, max: maxInput })}
              data-testid="apply-price"
            >
              {t('catalog.apply')}
            </button>
          </div>

          <label className="switch-row">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(event) => update({ inStock: event.target.checked ? 'true' : '' })}
              data-testid="filter-instock"
            />
            <span>{t('catalog.inStock')}</span>
          </label>
        </aside>

        <section className="catalog-results">
          <div className="results-bar">
            <span data-testid="results-count">
              {data.total} {t('catalog.results')}
            </span>
            <label className="sort-field">
              <span>{t('catalog.sort')}</span>
              <select
                value={activeSort}
                onChange={(event) => update({ sort: event.target.value === 'featured' ? '' : event.target.value })}
                data-testid="sort-select"
              >
                <option value="featured">{t('catalog.sortFeatured')}</option>
                <option value="price-asc">{t('catalog.sortPriceAsc')}</option>
                <option value="price-desc">{t('catalog.sortPriceDesc')}</option>
                <option value="rating">{t('catalog.sortRating')}</option>
                <option value="name">{t('catalog.sortName')}</option>
              </select>
            </label>
          </div>

          {status === 'loading' ? <p className="muted">{t('common.loading')}</p> : null}

          {status === 'error' ? (
            <div className="alert alert-error">
              <span>{t('common.error')}</span>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setReload((r) => r + 1)}>
                {t('common.retry')}
              </button>
            </div>
          ) : null}

          {status === 'ready' && data.items.length === 0 ? (
            <div className="empty-state">
              <h2>{t('catalog.noResults')}</h2>
              <p className="muted">{t('catalog.noResultsHint')}</p>
              <button type="button" className="btn btn-primary" onClick={resetAll} data-testid="empty-reset">
                {t('catalog.reset')}
              </button>
            </div>
          ) : null}

          {status === 'ready' && data.items.length > 0 ? (
            <div className="product-grid" data-testid="product-grid">
              {data.items.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : null}

          {status === 'ready' && data.pages > 1 ? (
            <div className="pagination">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={data.page <= 1}
                onClick={() => update({ page: data.page - 1 }, { keepPage: true })}
                data-testid="page-prev"
              >
                {t('catalog.prev')}
              </button>
              <span className="muted">{t('catalog.pageOf', { page: data.page, pages: data.pages })}</span>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={data.page >= data.pages}
                onClick={() => update({ page: data.page + 1 }, { keepPage: true })}
                data-testid="page-next"
              >
                {t('catalog.next')}
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
