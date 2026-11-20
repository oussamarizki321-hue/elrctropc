import { Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Header from './Header.jsx';
import Footer from './Footer.jsx';

export default function PublicLayout() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname, location.search]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {document.documentElement.dir === 'rtl' ? 'انتقل إلى المحتوى' : 'Skip to content'}
      </a>
      <Header />
      <main id="main-content" className="site-main">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
