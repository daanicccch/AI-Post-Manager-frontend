import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { CreateDraftPage } from '../features/create/CreateDraftPage';
import { DraftPage } from '../features/drafts/DraftPage';
import { HistoryPage } from '../features/history/HistoryPage';
import { InboxPage } from '../features/inbox/InboxPage';
import { ProfilePage } from '../features/profiles/ProfilePage';
import { SchedulePage } from '../features/schedule/SchedulePage';
import { BusyOverlayProvider } from '../lib/busyOverlay';
import { initTelegramWebApp } from '../lib/telegram';

function DraftDeepLinkRedirect() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.pathname !== '/') {
      return;
    }

    const search = new URLSearchParams(location.search);
    const draftId = Number(search.get('draftId'));
    if (!Number.isFinite(draftId) || draftId <= 0) {
      return;
    }

    navigate(`/drafts/${draftId}`, { replace: true });
  }, [location.pathname, location.search, navigate]);

  return null;
}

export function App() {
  useEffect(() => {
    return initTelegramWebApp();
  }, []);

  return (
    <BusyOverlayProvider>
      <AppShell>
        <DraftDeepLinkRedirect />
        <Routes>
          <Route path="/" element={<InboxPage />} />
          <Route path="/create" element={<CreateDraftPage />} />
          <Route path="/drafts/:draftId" element={<DraftPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/profiles" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BusyOverlayProvider>
  );
}
