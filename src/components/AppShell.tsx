import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAppLocale } from '../lib/appLocale';
import { useTelegramKeyboard } from '../lib/useTelegramKeyboard';

interface AppShellProps {
  children: ReactNode;
}

function NavIcon({ kind }: { kind: string }) {
  if (kind === 'queue') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <rect x="4" y="5" width="16" height="4" rx="2" />
        <rect x="4" y="10" width="11" height="4" rx="2" />
        <rect x="4" y="15" width="14" height="4" rx="2" />
      </svg>
    );
  }

  if (kind === 'create') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </svg>
    );
  }

  if (kind === 'planner') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <rect x="4" y="5" width="16" height="15" rx="3" />
        <path d="M8 3v4" />
        <path d="M16 3v4" />
        <path d="M4 10h16" />
      </svg>
    );
  }

  if (kind === 'history') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M6 8V4" />
        <path d="M6 4h4" />
        <path d="M6.8 15.2A7 7 0 1 0 12 5" />
        <path d="M12 9v4l3 2" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 12a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z" />
      <path d="M5 19.5a7.5 7.5 0 0 1 14 0" />
    </svg>
  );
}

export function AppShell({ children }: AppShellProps) {
  const { language } = useAppLocale();
  const location = useLocation();
  const keyboardOpen = useTelegramKeyboard();
  const isRu = language === 'ru';
  const navigation = [
    {
      to: '/',
      label: isRu ? '\u0410\u043a\u0442\u0438\u0432\u043d\u044b\u0435' : 'Active',
      icon: 'queue'
    },
    {
      to: '/create',
      label: isRu ? '\u0421\u043e\u0437\u0434\u0430\u0442\u044c' : 'Create',
      icon: 'create'
    },
    {
      to: '/schedule',
      label: isRu ? '\u041f\u043b\u0430\u043d' : 'Planner',
      icon: 'planner'
    },
    {
      to: '/history',
      label: isRu ? '\u0418\u0441\u0442\u043e\u0440\u0438\u044f' : 'History',
      icon: 'history'
    },
    {
      to: '/profiles',
      label: isRu ? '\u041f\u0440\u043e\u0444\u0438\u043b\u044c' : 'Profile',
      icon: 'profile'
    }
  ];
  const isEditor = location.pathname.startsWith('/drafts/');
  const currentSection =
    navigation.find((item) => (item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to))) ??
    null;
  const title =
    isEditor
      ? isRu
        ? '\u041f\u0440\u043e\u0432\u0435\u0440\u043a\u0430 \u043f\u043e\u0441\u0442\u0430'
        : 'Draft Review'
      : currentSection?.label || 'ChannelBot';

  return (
    <div className={`workspace-shell${keyboardOpen ? ' workspace-shell--keyboard-open' : ''}`}>
      <div className="workspace-shell__glow workspace-shell__glow--one" aria-hidden="true" />
      <div className="workspace-shell__glow workspace-shell__glow--two" aria-hidden="true" />

      <div className="app-frame">
        <header className="app-topbar">
          <div className="app-topbar__intro">
            <h1>{title}</h1>
          </div>
        </header>

        <div className="workspace-main-shell">
          <main className="workspace-main">{children}</main>
        </div>

        {!keyboardOpen ? (
          <nav className="bottom-nav" aria-label={isRu ? '\u041d\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u044f' : 'Primary'}>
            {navigation.map((item) => (
              <NavLink
                key={item.to}
                className={({ isActive }) => `bottom-nav__item${isActive ? ' bottom-nav__item--active' : ''}`}
                to={item.to}
                end={item.to === '/'}
              >
                <span className="bottom-nav__icon">
                  <NavIcon kind={item.icon} />
                </span>
                <span className="bottom-nav__label">{item.label}</span>
              </NavLink>
            ))}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
