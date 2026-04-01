import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';

export type AppLanguage = 'ru' | 'en';

const APP_LANGUAGE_STORAGE_KEY = 'channelbot-ui-language';

type AppLocaleContextValue = {
  language: AppLanguage;
  setLanguage: (nextLanguage: AppLanguage) => void;
};

const AppLocaleContext = createContext<AppLocaleContextValue | null>(null);

function getInitialLanguage(): AppLanguage {
  if (typeof window === 'undefined') {
    return 'ru';
  }

  const storedLanguage = window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY);
  return storedLanguage === 'en' ? 'en' : 'ru';
}

export function AppLocaleProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(getInitialLanguage);

  useEffect(() => {
    window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language === 'ru' ? 'ru' : 'en';
  }, [language]);

  const value = useMemo(
    () => ({
      language,
      setLanguage: setLanguageState
    }),
    [language]
  );

  return <AppLocaleContext.Provider value={value}>{children}</AppLocaleContext.Provider>;
}

export function useAppLocale() {
  const context = useContext(AppLocaleContext);
  if (!context) {
    throw new Error('useAppLocale must be used inside AppLocaleProvider');
  }

  return context;
}
