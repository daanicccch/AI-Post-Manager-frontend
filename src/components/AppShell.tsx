import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAppLocale } from '../lib/appLocale';
import { useBusyOverlay } from '../lib/busyOverlay';
import { useTelegramKeyboard } from '../lib/useTelegramKeyboard';
import { AiQuotaTopNotice } from './AiQuotaTopNotice';

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
  const searchParams = new URLSearchParams(location.search);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const keyboardOpen = useTelegramKeyboard();
  const { isBusy } = useBusyOverlay();
  const isRu = language === 'ru';
  const navigation = [
    {
      to: '/',
      label: isRu ? 'Активные' : 'Active',
      icon: 'queue'
    },
    {
      to: '/create',
      label: isRu ? 'Создать' : 'Create',
      icon: 'create'
    },
    {
      to: '/schedule',
      label: isRu ? 'План' : 'Planner',
      icon: 'planner'
    },
    {
      to: '/history',
      label: isRu ? 'История' : 'History',
      icon: 'history'
    },
    {
      to: '/profiles',
      label: isRu ? 'Профиль' : 'Profile',
      icon: 'profile'
    }
  ];
  const isEditor = location.pathname.startsWith('/drafts/');
  const isOnboardingFlow = location.pathname.startsWith('/onboarding') || searchParams.get('onboarding') === '1';
  const currentSection =
    navigation.find((item) => (item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to))) ??
    null;
  const title =
    isOnboardingFlow
      ? isRu
        ? 'Настройка канала'
        : 'Channel setup'
      :
    isEditor
      ? isRu
        ? 'Проверка поста'
        : 'Draft Review'
      : currentSection?.label || 'ChannelBot';

  useLayoutEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.key]);

  return (
    <div className={`workspace-shell${keyboardOpen ? ' workspace-shell--keyboard-open' : ''}`}>
      <div className="workspace-shell__glow workspace-shell__glow--one" aria-hidden="true" />
      <div className="workspace-shell__glow workspace-shell__glow--two" aria-hidden="true" />

      <div className={`app-frame${isBusy ? ' app-frame--busy' : ''}`}>
        <div
          ref={scrollContainerRef}
          className={`workspace-main-shell${isOnboardingFlow ? ' workspace-main-shell--onboarding' : ''}`}
        >
          <header className="app-topbar">
            <div className="app-topbar__intro">
              <h1>{title}</h1>
            </div>
          </header>

          <AiQuotaTopNotice />

          <main className={`workspace-main${isOnboardingFlow ? ' workspace-main--onboarding' : ''}`}>{children}</main>
        </div>

        {!keyboardOpen && !isOnboardingFlow ? (
          <nav
            className={`bottom-nav${isBusy ? ' bottom-nav--disabled' : ''}`}
            aria-label={isRu ? 'Навигация' : 'Primary'}
          >
            {navigation.map((item) => (
              <NavLink
                key={item.to}
                aria-disabled={isBusy || undefined}
                className={({ isActive }) => `bottom-nav__item${isActive ? ' bottom-nav__item--active' : ''}`}
                onClick={(event) => {
                  if (isBusy) {
                    event.preventDefault();
                  }
                }}
                tabIndex={isBusy ? -1 : undefined}
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
