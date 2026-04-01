declare global {
      interface Window {
    Telegram?: {
      WebApp?: {
        ready?: () => void;
        expand?: () => void;
        requestFullscreen?: () => void;
        disableVerticalSwipes?: () => void;
        enableVerticalSwipes?: () => void;
        onEvent?: (eventType: string, eventHandler: () => void) => void;
        offEvent?: (eventType: string, eventHandler: () => void) => void;
        colorScheme?: 'light' | 'dark';
        platform?: string;
        isFullscreen?: boolean;
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

  const safeTop = Math.max(0, Number(webApp.safeAreaInset?.top || 0));
  const safeBottom = Math.max(0, Number(webApp.safeAreaInset?.bottom || 0));
  const safeLeft = Math.max(0, Number(webApp.safeAreaInset?.left || 0));
  const safeRight = Math.max(0, Number(webApp.safeAreaInset?.right || 0));

  const contentTop = Math.max(0, Number(webApp.contentSafeAreaInset?.top || 0));
  const contentBottom = Math.max(0, Number(webApp.contentSafeAreaInset?.bottom || 0));
  const contentLeft = Math.max(0, Number(webApp.contentSafeAreaInset?.left || 0));
  const contentRight = Math.max(0, Number(webApp.contentSafeAreaInset?.right || 0));

  setCssVar('--tg-safe-area-inset-top', safeTop);
  setCssVar('--tg-safe-area-inset-bottom', safeBottom);
  setCssVar('--tg-safe-area-inset-left', safeLeft);
  setCssVar('--tg-safe-area-inset-right', safeRight);

  setCssVar('--tg-content-safe-area-inset-top', contentTop);
  setCssVar('--tg-content-safe-area-inset-bottom', contentBottom);
  setCssVar('--tg-content-safe-area-inset-left', contentLeft);
  setCssVar('--tg-content-safe-area-inset-right', contentRight);
  setCssVar('--tg-safe-area-combined-top', webApp.isFullscreen ? safeTop + contentTop : safeTop);
  setCssVar('--tg-safe-area-combined-bottom', webApp.isFullscreen ? safeBottom + contentBottom : safeBottom);
  setCssVar('--tg-safe-area-combined-left', webApp.isFullscreen ? safeLeft + contentLeft : safeLeft);
  setCssVar('--tg-safe-area-combined-right', webApp.isFullscreen ? safeRight + contentRight : safeRight);

  setCssVar('--tg-viewport-height', webApp.viewportHeight);
  setCssVar('--tg-viewport-stable-height', webApp.viewportStableHeight);
}

function safelyCallTelegramMethod(methodName: string, action?: () => void) {
  if (typeof action !== 'function') {
    return;
  }

  try {
    action();
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn(`[telegram] ${methodName} is unavailable in this environment`, error);
    }
  }
}

function shouldUseTelegramImmersiveMode(webApp: NonNullable<Window['Telegram']>['WebApp']) {
  const platform = String(webApp?.platform || '').trim().toLowerCase();

  if (platform) {
    return !['tdesktop', 'macos', 'weba', 'webk', 'web', 'unknown'].includes(platform);
  }

  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia('(pointer: coarse)').matches;
}

export function initTelegramWebApp() {
  const webApp = window.Telegram?.WebApp;
  if (!webApp) {
    return () => {};
  }

  const sync = () => syncTelegramViewportVars();
  const shouldUseImmersiveMode = shouldUseTelegramImmersiveMode(webApp);

  sync();
  safelyCallTelegramMethod('ready', webApp.ready);
  safelyCallTelegramMethod('disableVerticalSwipes', webApp.disableVerticalSwipes);
  if (shouldUseImmersiveMode) {
    safelyCallTelegramMethod('expand', webApp.expand);
    if (!webApp.isFullscreen) {
      safelyCallTelegramMethod('requestFullscreen', webApp.requestFullscreen);
    }
  }
  sync();

  webApp.onEvent?.('safeAreaChanged', sync);
  webApp.onEvent?.('contentSafeAreaChanged', sync);
  webApp.onEvent?.('viewportChanged', sync);
  webApp.onEvent?.('fullscreenChanged', sync);

  return () => {
    webApp.offEvent?.('safeAreaChanged', sync);
    webApp.offEvent?.('contentSafeAreaChanged', sync);
    webApp.offEvent?.('viewportChanged', sync);
    webApp.offEvent?.('fullscreenChanged', sync);
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
