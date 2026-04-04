import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { CreateDraftPage } from '../features/create/CreateDraftPage';
import { DraftPage } from '../features/drafts/DraftPage';
import { HistoryPage } from '../features/history/HistoryPage';
import { InboxPage } from '../features/inbox/InboxPage';
import { OnboardingPlanPage } from '../features/onboarding/OnboardingPlanPage';
import { OnboardingPage } from '../features/onboarding/OnboardingPage';
import { OnboardingSourcesPage } from '../features/onboarding/OnboardingSourcesPage';
import { OnboardingStylePage } from '../features/onboarding/OnboardingStylePage';
import { OnboardingStyleReviewPage } from '../features/onboarding/OnboardingStyleReviewPage';
import { buildOnboardingUrl, getOnboardingStepFromStatus } from '../features/onboarding/onboardingShared';
import { ProfilePage } from '../features/profiles/ProfilePage';
import { SchedulePage } from '../features/schedule/SchedulePage';
import { BusyOverlayProvider } from '../lib/busyOverlay';
import { api } from '../lib/api';
import { initTelegramWebApp } from '../lib/telegram';

function HomeEntry() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isResolving, setIsResolving] = useState(true);

  useEffect(() => {
    if (location.pathname !== '/') {
      return;
    }

    let cancelled = false;

    void api.getOnboarding()
      .then((data) => {
        if (cancelled) {
          return;
        }

        const profile = data?.profile;
        const status = String(profile?.onboardingStatus || data?.session?.status || '').trim();
        if (profile?.slug && status && status !== 'completed') {
          const step = getOnboardingStepFromStatus(status);
          navigate(buildOnboardingUrl(step, profile.slug), { replace: true });
          return;
        }

        setIsResolving(false);
      })
      .catch(() => {
        if (!cancelled) {
          setIsResolving(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [location.pathname, navigate]);

  if (isResolving) {
    return null;
  }

  return <InboxPage />;
}

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
          <Route path="/" element={<HomeEntry />} />
          <Route path="/create" element={<CreateDraftPage />} />
          <Route path="/drafts/:draftId" element={<DraftPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/onboarding/sources" element={<OnboardingSourcesPage />} />
          <Route path="/onboarding/style" element={<OnboardingStylePage />} />
          <Route path="/onboarding/style-review" element={<OnboardingStyleReviewPage />} />
          <Route path="/onboarding/plan" element={<OnboardingPlanPage />} />
          <Route path="/onboarding-plan" element={<Navigate to="/onboarding/plan" replace />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/profiles" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BusyOverlayProvider>
  );
}
