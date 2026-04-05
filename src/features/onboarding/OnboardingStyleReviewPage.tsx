import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAppLocale } from '../../lib/appLocale';
import {
  clearStoredProfileRegeneration,
  getStoredProfileRegeneration,
} from '../profiles/profileRegenerationTracker';
import { buildOnboardingUrl, useOnboardingData } from './onboardingShared';
import { OnboardingFooter } from './OnboardingFooter';

export function OnboardingStyleReviewPage() {
  const { language } = useAppLocale();
  const isRu = language === 'ru';
  const profileId = typeof window === 'undefined'
    ? ''
    : String(new URLSearchParams(window.location.search).get('profileId') || '').trim();
  const { error, isLoading, profile, reload, setError } = useOnboardingData(profileId);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [draftGuide, setDraftGuide] = useState('');

  useEffect(() => {
    setDraftGuide(String(profile?.personaGuideMarkdown || ''));
  }, [profile?.personaGuideMarkdown]);

  useEffect(() => {
    if (!profileId) {
      setIsGenerating(false);
      return;
    }

    const storedRegeneration = getStoredProfileRegeneration(profileId);
    const hasGuide = Boolean(String(profile?.personaGuideMarkdown || '').trim());
    const shouldTrackGeneration = Boolean(storedRegeneration)
      || (profile?.onboardingStatus === 'awaiting_style_generation' && !hasGuide);

    if (!shouldTrackGeneration) {
      setIsGenerating(false);
      return;
    }

    let cancelled = false;
    let timeoutId = 0;
    let attempt = 0;

    const scheduleNextPoll = () => {
      const delays = [1500, 3000, 5000, 8000, 12000];
      const nextDelay = delays[Math.min(attempt, delays.length - 1)];
      attempt += 1;
      timeoutId = window.setTimeout(() => {
        void pollStatus();
      }, nextDelay);
    };

    const pollStatus = async () => {
      try {
        const status = await api.getPersonaDistillStatus(profileId);
        if (cancelled) {
          return;
        }

        if (status.status === 'completed') {
          clearStoredProfileRegeneration(profileId);
          setIsGenerating(false);
          await reload();
          return;
        }

        if (status.status === 'failed') {
          clearStoredProfileRegeneration(profileId);
          setIsGenerating(false);
          setError(status.errorMessage || (isRu ? 'Не удалось сгенерировать стиль' : 'Failed to generate style'));
          return;
        }

        if (status.status === 'idle') {
          clearStoredProfileRegeneration(profileId);
          setIsGenerating(false);
          return;
        }

        setIsGenerating(true);
        scheduleNextPoll();
      } catch (statusError) {
        if (cancelled) {
          return;
        }

        setIsGenerating(true);
        if (attempt >= 4) {
          setError(statusError instanceof Error ? statusError.message : 'Failed to load style status');
        } else {
          scheduleNextPoll();
        }
      }
    };

    void pollStatus();

    return () => {
      cancelled = true;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [isRu, profile?.onboardingStatus, profileId, reload, setError]);

  async function handleContinue() {
    if (!profile?.slug) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await api.updateProfileAssets(profile.slug, {
        personaGuideMarkdown: draftGuide,
      });
      await api.confirmOnboardingStyle(profile.slug);
      window.location.assign(buildOnboardingUrl('plan', profile.slug));
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : 'Failed to continue');
    } finally {
      setIsSaving(false);
    }
  }

  if ((isLoading && !profile) || (isGenerating && !String(draftGuide || '').trim())) {
    return (
      <section className="page-stack">
        <div className="state-banner">{isRu ? 'Генерируем стиль...' : 'Generating style...'}</div>
      </section>
    );
  }

  if (!profile?.slug) {
    return null;
  }

  return (
    <section className="page-stack page-stack--setup page-stack--setup-review">
      <section className="setup-header">
        <div className="setup-progress" aria-label="Onboarding progress">
          <span className="setup-progress__segment setup-progress__segment--done" />
          <span className="setup-progress__segment setup-progress__segment--done" />
          <span className="setup-progress__segment setup-progress__segment--active" />
          <span className="setup-progress__segment" />
        </div>
        <h2 className="setup-header__title">{isRu ? '\u041f\u0440\u043e\u0432\u0435\u0440\u044c \u0441\u0442\u0438\u043b\u044c' : 'Review the style'}</h2>
      </section>

      {error && <div className="state-banner state-banner--error setup-error-banner">{error}</div>}
      {isGenerating && <div className="state-banner state-banner--info setup-error-banner">{isRu ? 'Стиль ещё генерируется. Страница обновится автоматически.' : 'Style is still being generated. This page will refresh automatically.'}</div>}

      <section className="editor-panel editor-panel--main editor-panel--profile setup-panel setup-panel--fill setup-style-review-panel">
        <textarea
          className="config-editor config-editor--setup-preview setup-style-review-editor"
          disabled={isGenerating || isSaving}
          value={draftGuide}
          onChange={(event) => setDraftGuide(event.target.value)}
        />
      </section>

      <OnboardingFooter
        backLabel={isRu ? '\u041d\u0430\u0437\u0430\u0434' : 'Back'}
        continueLabel={
          isSaving
            ? (isRu ? '\u0421\u043e\u0445\u0440\u0430\u043d\u044f\u0435\u043c...' : 'Saving...')
            : (isRu ? '\u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c' : 'Continue')
        }
        continueDisabled={isSaving || isGenerating}
        onBack={() => window.location.assign(buildOnboardingUrl('style', profile.slug))}
        onContinue={handleContinue}
      />

    </section>
  );
}
