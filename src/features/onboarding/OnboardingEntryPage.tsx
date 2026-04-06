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
        <div className="state-banner">{isRu ? 'Загружаем настройку канала...' : 'Loading channel setup...'}</div>
      </section>
    );
  }

  if (!profile?.slug) {
    return (
      <section className="page-stack">
        <section className="queue-control-card queue-control-card--profile">
          <div className="queue-control-card__top">
            <div className="queue-control-card__title">
              <h2>{isRu ? 'Начни в боте' : 'Start in the bot'}</h2>
            </div>
          </div>
          <section className="context-section context-section--tight">
            <p>
              {isRu
                ? 'Открой чат с ботом, нажми /start и выбери канал через native Telegram picker.'
                : 'Open the bot chat, press /start, and choose your channel through the native Telegram picker.'}
            </p>
          </section>
        </section>
      </section>
    );
  }

  return (
    <section className="page-stack">
      <div className="state-banner">{isRu ? 'Перенаправляем к нужному шагу...' : 'Redirecting to the correct step...'}</div>
    </section>
  );
}
