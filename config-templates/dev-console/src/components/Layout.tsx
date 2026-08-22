// ============================================================
// Layout.tsx — 深色主題 Sidebar Layout + i18n 語系切換
// AC-5: Slate + Indigo 色系、DB 連線狀態指示燈、響應式收合
// ============================================================
import { useState, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider';

interface DbStatus {
  connected: boolean;
  checking: boolean;
}

export default function Layout() {
  const { t, toggleLang } = useI18n();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dbStatus, setDbStatus] = useState<DbStatus>({ connected: false, checking: true });
  const [isMobile, setIsMobile] = useState(false);

  const NAV_ITEMS = [
    { to: '/', label: t.nav.dashboard, icon: '⊞', end: true },
    { to: '/stories', label: t.nav.stories, icon: '📋', end: false },
    { to: '/sessions', label: t.nav.sessions, icon: '⏱', end: false },
    { to: '/memory', label: t.nav.memory, icon: '🧠', end: false },
    { to: '/documents', label: t.nav.documents, icon: '📄', end: false },
    { to: '/decisions', label: t.nav.decisions, icon: '🏛️', end: false },
    { to: '/cr-issues', label: t.nav.crIssues, icon: '🔍', end: false },
    { to: '/tech-debt', label: t.nav.techDebt, icon: '⚠️', end: false },
    { to: '/intentional', label: t.nav.intentional, icon: '🛡️', end: false },
    { to: '/reviews', label: '審查報告', icon: '🔬', end: false },
    { to: '/sprint', label: t.nav.sprint, icon: '📈', end: false },
    { to: '/schema', label: t.nav.schema, icon: '🗃️', end: false },
    { to: '/patterns', label: t.nav.patterns, icon: '🔄', end: false },
    { to: '/rule-violations', label: '規則違規', icon: '🛡️', end: false },
    { to: '/god-nodes', label: t.nav.godNodes, icon: '🎯', end: false },
    { to: '/emergence', label: t.nav.emergence, icon: '🧬', end: false },
    { to: '/workers', label: 'Pipeline 工作台', icon: '🖥️', end: false },
    { to: '/channel', label: t.nav.channel, icon: '💬', end: false },
    { to: '/roadmap', label: t.nav.roadmap, icon: '🗺️', end: false },
    { to: '/settings', label: t.nav.system, icon: '⚙️', end: false },
  ];

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) =>
        setDbStatus({ connected: data.db?.connected === true, checking: false }),
      )
      .catch(() => setDbStatus({ connected: false, checking: false }));
  }, []);

  const dotClass = dbStatus.checking
    ? 'dvc-conn-dot dvc-conn-dot--checking'
    : dbStatus.connected
      ? 'dvc-conn-dot dvc-conn-dot--ok'
      : 'dvc-conn-dot dvc-conn-dot--error';

  const connLabel = dbStatus.checking
    ? t.header.dbChecking
    : dbStatus.connected
      ? t.header.dbConnected
      : t.header.dbDisconnected;

  const sidebarClass = [
    'dvc-sidebar',
    !sidebarOpen && isMobile ? 'dvc-sidebar--mobile-hidden' : '',
    !sidebarOpen && !isMobile ? 'dvc-sidebar--collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="dvc-shell">
      {/* ── Header ── */}
      <header className="dvc-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            className="dvc-sidebar-toggle"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label={sidebarOpen ? t.header.collapseSidebar : t.header.expandSidebar}
          >
            ☰
          </button>
          <div className="dvc-header__brand">
            <span>⚙</span>
            <span>{t.header.brand}</span>
            <span className="dvc-header__badge">{t.header.standalone}</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* 語系切換按鈕 */}
          <button
            className="dvc-lang-toggle"
            onClick={toggleLang}
            title="Switch language / 切換語言"
          >
            {t.header.langSwitch}
          </button>

          {/* DB 連線狀態 */}
          <div className="dvc-conn-indicator">
            <span className={dotClass} />
            <span>{connLabel}</span>
          </div>
        </div>
      </header>

      {/* ── Sidebar + Content ── */}
      <div className="dvc-layout">
        <nav className={sidebarClass}>
          <div className="dvc-nav">
            {NAV_ITEMS.map(({ to, label, icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `dvc-nav__item${isActive ? ' active' : ''}`
                }
              >
                <span className="dvc-nav__icon">{icon}</span>
                <span className="dvc-nav__label">{label}</span>
              </NavLink>
            ))}
          </div>
        </nav>

        <main className="dvc-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
