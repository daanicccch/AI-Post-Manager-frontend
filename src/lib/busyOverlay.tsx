import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import { BusyOverlay } from '../components/BusyOverlay';

type BusyOverlayState = {
  title: string;
  message: string;
  caption?: string;
};

type BusyOverlayContextValue = {
  hideBusyOverlay: () => void;
  isBusy: boolean;
  showBusyOverlay: (nextOverlay: BusyOverlayState) => void;
};

const BusyOverlayContext = createContext<BusyOverlayContextValue | null>(null);

export function BusyOverlayProvider({ children }: { children: ReactNode }) {
  const [overlay, setOverlay] = useState<BusyOverlayState | null>(null);
  const isBusy = overlay !== null;

  const showBusyOverlay = useCallback((nextOverlay: BusyOverlayState) => {
    setOverlay(nextOverlay);
  }, []);

  const hideBusyOverlay = useCallback(() => {
    setOverlay(null);
  }, []);

  useEffect(() => {
    if (!isBusy) {
      return undefined;
    }

    const currentUrl = window.location.href;
    window.history.pushState({ busyOverlay: true }, '', currentUrl);

    const handlePopState = () => {
      window.history.pushState({ busyOverlay: true }, '', currentUrl);
    };

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    document.body.classList.add('app-busy');
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.body.classList.remove('app-busy');
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isBusy]);

  const value = useMemo(
    () => ({
      hideBusyOverlay,
      isBusy,
      showBusyOverlay
    }),
    [hideBusyOverlay, isBusy, showBusyOverlay]
  );

  return (
    <BusyOverlayContext.Provider value={value}>
      {children}
      {overlay ? <BusyOverlay caption={overlay.caption} message={overlay.message} title={overlay.title} /> : null}
    </BusyOverlayContext.Provider>
  );
}

export function useBusyOverlay() {
  const context = useContext(BusyOverlayContext);

  if (!context) {
    throw new Error('useBusyOverlay must be used inside BusyOverlayProvider');
  }

  return context;
}
