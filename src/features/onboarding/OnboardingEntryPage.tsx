import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppLocale } from '../../lib/appLocale';
import { buildOnboardingUrl, getOnboardingStepFromStatus, useOnboardingData } from './onboardingShared';

export function OnboardingEntryPage() {
  const { language } = useAppLocale();
  const isRu = language === 'ru';
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const profileId = String(searchParams.get('profileId') || '').trim();
  const { data, profile, isLoading } = useOnboardingData(profileId);

  useEffect(() => {
    if (isLoading || !data) {
      return;
    }

    if (!profile?.slug) {
      return;
    }

    const step = getOnboardingStepFromStatus(profile.onboardingStatus || data.session?.status);
    navigate(buildOnboardingUrl(step, profile.slug), { replace: true });
  }, [data, isLoading, navigate, profile]);

  if (isLoading) {
    return (
      <section className="page-stack">
        <div className="state-banner">{isRu ? '\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043c \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0443 \u043a\u0430\u043d\u0430\u043b\u0430...' : 'Loading channel setup...'}</div>
      </section>
    );
  }

  if (!profile?.slug) {
    return (
      <section className="page-stack">
        <section className="queue-control-card queue-control-card--profile">
          <div className="queue-control-card__top">
            <div className="queue-control-card__title">
              <h2>{isRu ? '\u041d\u0430\u0447\u043d\u0438 \u0432 \u0431\u043e\u0442\u0435' : 'Start in the bot'}</h2>
            </div>
          </div>
          <section className="context-section context-section--tight">
            <p>
              {isRu
                ? '\u041e\u0442\u043a\u0440\u043e\u0439 \u0447\u0430\u0442 \u0441 \u0431\u043e\u0442\u043e\u043c, \u043d\u0430\u0436\u043c\u0438 /start \u0438 \u0432\u044b\u0431\u0435\u0440\u0438 \u043a\u0430\u043d\u0430\u043b \u0447\u0435\u0440\u0435\u0437 native Telegram picker.'
                : 'Open the bot chat, press /start, and choose your channel through the native Telegram picker.'}
            </p>
          </section>
        </section>
      </section>
    );
  }

  return (
    <section className="page-stack">
      <div className="state-banner">{isRu ? '\u041f\u0435\u0440\u0435\u043d\u0430\u043f\u0440\u0430\u0432\u043b\u044f\u0435\u043c \u043a \u043d\u0443\u0436\u043d\u043e\u043c\u0443 \u0448\u0430\u0433\u0443...' : 'Redirecting to the correct step...'}</div>
    </section>
  );
}
