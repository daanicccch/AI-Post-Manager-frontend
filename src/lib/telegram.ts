declare global {
      interface Window {
    Telegram?: {
      WebApp?: {
        ready?: () => void;
        expand?: () => void;
        requestFullscreen?: () => void;
        exitFullscreen?: () => void;
        close?: () => void;
        openTelegramLink?: (url: string) => void;
        disableVerticalSwipes?: () => void;
        enableVerticalSwipes?: () => void;
        BackButton?: {
          show?: () => void;
          hide?: () => void;
          onClick?: (callback: () => void) => void;
          offClick?: (callback: () => void) => void;
          isVisible?: boolean;
        };
        onEvent?: (eventType: string, eventHandler: () => void) => void;
        offEvent?: (eventType: string, eventHandler: () => void) => void;
        colorScheme?: 'light' | 'dark';
        themeParams?: Record<string, string | undefined>;
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

function syncTelegramThemeVars() {
  const webApp = window.Telegram?.WebApp;
  if (!webApp || typeof document === 'undefined') {
    return;
  }

  const themeParams = webApp.themeParams || {};
  Object.entries(themeParams).forEach(([key, value]) => {
    const normalizedValue = String(value || '').trim();
    if (!normalizedValue) {
      return;
    }

    const normalizedKey = String(key || '').trim().replace(/_/g, '-');
    if (!normalizedKey) {
      return;
    }

    document.documentElement.style.setProperty(`--tg-theme-${normalizedKey}`, normalizedValue);
  });

  if (webApp.colorScheme) {
    document.documentElement.style.setProperty('--tg-color-scheme', webApp.colorScheme);
  }
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

function syncDesktopWindowMode(
  webApp: NonNullable<NonNullable<Window['Telegram']>['WebApp']>,
  shouldUseImmersiveMode: boolean
) {
  if (shouldUseImmersiveMode || !webApp.isFullscreen) {
    return;
  }

  safelyCallTelegramMethod('exitFullscreen', webApp.exitFullscreen);
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

  const shouldUseImmersiveMode = shouldUseTelegramImmersiveMode(webApp);
  const sync = () => {
    syncDesktopWindowMode(webApp, shouldUseImmersiveMode);
    syncTelegramViewportVars();
    syncTelegramThemeVars();
  };

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
  webApp.onEvent?.('themeChanged', sync);

  return () => {
    webApp.offEvent?.('safeAreaChanged', sync);
    webApp.offEvent?.('contentSafeAreaChanged', sync);
    webApp.offEvent?.('viewportChanged', sync);
    webApp.offEvent?.('fullscreenChanged', sync);
    webApp.offEvent?.('themeChanged', sync);
  };
}

export function configureTelegramBackButton(onClick?: () => void) {
  const backButton = window.Telegram?.WebApp?.BackButton;
  if (!backButton) {
    return () => {};
  }

  if (typeof onClick !== 'function') {
    safelyCallTelegramMethod('BackButton.hide', backButton.hide);
    return () => {};
  }

  safelyCallTelegramMethod('BackButton.show', backButton.show);

  try {
    backButton.onClick?.(onClick);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[telegram] BackButton.onClick is unavailable in this environment', error);
    }
  }

  return () => {
    try {
      backButton.offClick?.(onClick);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[telegram] BackButton.offClick is unavailable in this environment', error);
      }
    }

    safelyCallTelegramMethod('BackButton.hide', backButton.hide);
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

export function openTelegramLink(url: string) {
  const normalizedUrl = String(url || '').trim();
  if (!normalizedUrl) {
    return;
  }

  const webApp = window.Telegram?.WebApp;
  if (webApp?.openTelegramLink) {
    safelyCallTelegramMethod('openTelegramLink', () => webApp.openTelegramLink?.(normalizedUrl));
    return;
  }

  window.location.href = normalizedUrl;
}

export function openTelegramLinkAndClose(url: string) {
  const normalizedUrl = String(url || '').trim();
  if (!normalizedUrl) {
    return;
  }

  const webApp = window.Telegram?.WebApp;
  let openedByTelegram = false;

  if (webApp?.openTelegramLink) {
    try {
      webApp.openTelegramLink(normalizedUrl);
      openedByTelegram = true;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[telegram] openTelegramLink is unavailable in this environment', error);
      }
    }
  }

  if (!openedByTelegram) {
    window.location.href = normalizedUrl;
    return;
  }

  window.setTimeout(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      window.location.href = normalizedUrl;
    }
  }, 180);
}

export function closeTelegramMiniApp() {
  const webApp = window.Telegram?.WebApp;
  try {
    webApp?.close?.();
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[telegram] close is unavailable in this environment', error);
    }
  }

  window.setTimeout(() => {
    try {
      window.Telegram?.WebApp?.close?.();
    } catch {}
  }, 80);
}
