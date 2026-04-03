import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAppLocale } from '../../lib/appLocale';
import { buildOnboardingUrl, normalizeSourceChannels, normalizeWebSources, useOnboardingData } from './onboardingShared';

export function OnboardingStyleReviewPage() {
  const { language } = useAppLocale();
  const isRu = language === 'ru';
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const profileId = String(searchParams.get('profileId') || '').trim();
  const { error, isLoading, profile, setError } = useOnboardingData(profileId);
  const [isSaving, setIsSaving] = useState(false);

  const sourceChannels = useMemo(() => normalizeSourceChannels(profile?.sourceChannels), [profile?.sourceChannels]);
  const webSources = useMemo(() => normalizeWebSources(profile?.webSources), [profile?.webSources]);

  async function handleContinue() {
    if (!profile?.slug) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await api.confirmOnboardingStyle(profile.slug);
      navigate(buildOnboardingUrl('plan', profile.slug));
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : 'Failed to continue');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading && !profile) {
    return (
      <section className="page-stack">
        <div className="state-banner">{isRu ? '\u0417\u0430\u0433\u0440\u0440\u0443\u0436\u0430\u0435\u043c \u043f\u0440\u0435\u0432\u044c\u044e \u0441\u0442\u0438\u043b\u044f...' : 'Loading style review...'}</div>
      </section>
    );
  }

  if (!profile?.slug) {
    return null;
  }

  return (
    <section className="page-stack">
      <section className="setup-header">
        <div className="setup-progress" aria-label="Onboarding progress">
          <span className="setup-progress__segment setup-progress__segment--done" />
          <span className="setup-progress__segment setup-progress__segment--done" />
          <span className="setup-progress__segment setup-progress__segment--active" />
          <span className="setup-progress__segment" />
        </div>
        <span className="eyebrow">{isRu ? '\u0428\u0430\u0433 3 \u0438\u0437 4' : 'Step 3 of 4'}</span>
        <h2 className="setup-header__title">{isRu ? '\u041f\u0440\u043e\u0441\u043c\u043e\u0442\u0440 \u0441\u0442\u0438\u043b\u044f' : 'Review style'}</h2>
      </section>

      {error && <div className="state-banner state-banner--error">{error}</div>}

      <section className="context-section context-section--tight">
        <h4>{isRu ? '\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438 \u0434\u043b\u044f \u0433\u0438\u0434\u0430' : 'Guide source set'}</h4>
        <p>{sourceChannels.length > 0 ? sourceChannels.map((item) => `@${item.username}`).join(', ') : '—'}</p>
        <p>{webSources.length > 0 ? webSources.map((item) => item.title || item.url).join(', ') : '—'}</p>
      </section>

      <section className="editor-panel editor-panel--main editor-panel--profile">
        <textarea className="config-editor" readOnly value={String(profile.personaGuideMarkdown || '')} />
      </section>

      <div className="action-row action-row--wrap">
        <button
          className="secondary-button secondary-button--small"
          type="button"
          onClick={() => navigate(buildOnboardingUrl('style', profile.slug))}
        >
          {isRu ? '\u041d\u0430\u0437\u0430\u0434 \u043a \u0433\u0435\u043d\u0435\u0440\u0430\u0446\u0438\u0438' : 'Back to generation'}
        </button>
        <button
          className="primary-button primary-button--profile"
          disabled={isSaving}
          type="button"
          onClick={handleContinue}
        >
          {isSaving ? (isRu ? '\u041f\u0435\u0440\u0435\u0445\u043e\u0434\u0438\u043c...' : 'Continuing...') : (isRu ? '\u041f\u0435\u0440\u0435\u0439\u0442\u0438 \u043a \u043f\u043b\u0430\u043d\u0443' : 'Continue to planner')}
        </button>
      </div>
    </section>
  );
}
