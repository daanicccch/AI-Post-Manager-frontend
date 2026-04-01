declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready?: () => void;
        expand?: () => void;
        onEvent?: (eventType: string, eventHandler: () => void) => void;
        offEvent?: (eventType: string, eventHandler: () => void) => void;
        colorScheme?: 'light' | 'dark';
        viewportHeight?: number;
        viewportStableHeight?: number;
        initData?: string;
        safeAreaInset?: {
          top?: number;
          bottom?: number;
          left?: number;
          right?: number;
        };
        contentSafeAreaInset?: {
          top?: number;
          bottom?: number;
          left?: number;
          right?: number;
        };
        initDataUnsafe?: {
          start_param?: string;
          user?: {
            id?: number;
            first_name?: string;
            last_name?: string;
            username?: string;
            language_code?: string;
            photo_url?: string;
          };
        };
      };
    };
  }
}

function setCssVar(name: string, value: number | undefined) {
  if (typeof document === 'undefined' || typeof value !== 'number' || Number.isNaN(value)) {
    return;
  }

  document.documentElement.style.setProperty(name, `${Math.max(0, value)}px`);
}

function syncTelegramViewportVars() {
  const webApp = window.Telegram?.WebApp;
  if (!webApp || typeof document === 'undefined') {
    return;
  }

  setCssVar('--tg-safe-area-inset-top', webApp.safeAreaInset?.top);
  setCssVar('--tg-safe-area-inset-bottom', webApp.safeAreaInset?.bottom);
  setCssVar('--tg-safe-area-inset-left', webApp.safeAreaInset?.left);
  setCssVar('--tg-safe-area-inset-right', webApp.safeAreaInset?.right);

  setCssVar('--tg-content-safe-area-inset-top', webApp.contentSafeAreaInset?.top);
  setCssVar('--tg-content-safe-area-inset-bottom', webApp.contentSafeAreaInset?.bottom);
  setCssVar('--tg-content-safe-area-inset-left', webApp.contentSafeAreaInset?.left);
  setCssVar('--tg-content-safe-area-inset-right', webApp.contentSafeAreaInset?.right);

  setCssVar('--tg-viewport-height', webApp.viewportHeight);
  setCssVar('--tg-viewport-stable-height', webApp.viewportStableHeight);
}

export function initTelegramWebApp() {
  const webApp = window.Telegram?.WebApp;
  if (!webApp) {
    return () => {};
  }

  const sync = () => syncTelegramViewportVars();

  sync();
  webApp.ready?.();
  webApp.expand?.();
  sync();

  webApp.onEvent?.('safeAreaChanged', sync);
  webApp.onEvent?.('contentSafeAreaChanged', sync);
  webApp.onEvent?.('viewportChanged', sync);

  return () => {
    webApp.offEvent?.('safeAreaChanged', sync);
    webApp.offEvent?.('contentSafeAreaChanged', sync);
    webApp.offEvent?.('viewportChanged', sync);
  };
}

export function getTelegramInitDataRaw() {
  return String(window.Telegram?.WebApp?.initData || '').trim();
}

export function buildTelegramAuthHeader(): Record<string, string> {
  const initDataRaw = getTelegramInitDataRaw();
  return initDataRaw ? { Authorization: `tma ${initDataRaw}` } : {};
}

export function appendTelegramInitData(url: string) {
  const initDataRaw = getTelegramInitDataRaw();
  if (!initDataRaw) {
    return url;
  }

  const resolvedUrl = new URL(url, window.location.origin);
  resolvedUrl.searchParams.set('tgInitData', initDataRaw);
  return resolvedUrl.toString();
}
