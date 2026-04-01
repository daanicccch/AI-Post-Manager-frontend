declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready?: () => void;
        expand?: () => void;
        colorScheme?: 'light' | 'dark';
        initData?: string;
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

export function initTelegramWebApp() {
  window.Telegram?.WebApp?.ready?.();
  window.Telegram?.WebApp?.expand?.();
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
