import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useAppLocale } from '../../lib/appLocale';
import {
  clearStoredProfileRegeneration,
  getStoredProfileRegeneration,
} from '../profiles/profileRegenerationTracker';
import {
  buildOnboardingUrl,
  isTemporaryPersonaGuideMarkdown,
  useOnboardingData,
} from './onboardingShared';
import { OnboardingFooter } from './OnboardingFooter';

const ONBOARDING_STYLE_TIMEOUT_MS = 10 * 60 * 1000;

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
  const [generationStartedAt, setGenerationStartedAt] = useState<number | null>(null);
  const [generationNow, setGenerationNow] = useState(() => Date.now());

  const hasReadyGuide = useMemo(() => {
    const currentGuide = String(profile?.personaGuideMarkdown || '');
    return Boolean(currentGuide.trim()) && !isTemporaryPersonaGuideMarkdown(currentGuide);
  }, [profile?.personaGuideMarkdown]);

  const shouldShowGenerationOnlyState = isGenerating && !hasReadyGuide;
  const generationElapsedMs = generationStartedAt ? Math.max(0, generationNow - generationStartedAt) : 0;
  const generationProgress = Math.min(92, 12 + generationElapsedMs / 3500);
  const generationStage = generationElapsedMs >= 80_000 ? 2 : generationElapsedMs >= 28_000 ? 1 : 0;
  const generationElapsedLabel = generationElapsedMs < 60_000
    ? `${Math.max(1, Math.floor(generationElapsedMs / 1000))}s`
    : `${Math.max(1, Math.floor(generationElapsedMs / 60_000))} min`;

  useEffect(() => {
    setDraftGuide(String(profile?.personaGuideMarkdown || ''));
  }, [profile?.personaGuideMarkdown]);

  useEffect(() => {
    if (!isGenerating || !generationStartedAt) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setGenerationNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [generationStartedAt, isGenerating]);

  useEffect(() => {
    if (!profileId) {
      setIsGenerating(false);
      setGenerationStartedAt(null);
      return;
    }

    const storedRegeneration = getStoredProfileRegeneration(profileId);
    const startedAt = storedRegeneration?.startedAt || Date.now();
    const shouldTrackGeneration = Boolean(storedRegeneration)
      || (profile?.onboardingStatus === 'awaiting_style_generation' && !hasReadyGuide);

    if (!shouldTrackGeneration) {
      setIsGenerating(false);
      setGenerationStartedAt(null);
      return;
    }

    let cancelled = false;
    let timeoutId = 0;
    let attempt = 0;

    setIsGenerating(true);
    setGenerationStartedAt(startedAt);
    setGenerationNow(Date.now());

    const scheduleNextPoll = () => {
      const delays = [1500, 3000, 5000, 8000, 12000];
      const nextDelay = delays[Math.min(attempt, delays.length - 1)];
      attempt += 1;
      timeoutId = window.setTimeout(() => {
        void pollStatus();
      }, nextDelay);
    };

    const stopGeneration = () => {
      setIsGenerating(false);
      setGenerationStartedAt(null);
    };

    const pollStatus = async () => {
      if (Date.now() - startedAt > ONBOARDING_STYLE_TIMEOUT_MS) {
        clearStoredProfileRegeneration(profileId);
        stopGeneration();
        setError(
          isRu
            ? '\u0413\u0435\u043d\u0435\u0440\u0430\u0446\u0438\u044f \u0441\u0442\u0438\u043b\u044f \u0437\u0430\u043d\u044f\u043b\u0430 \u0441\u043b\u0438\u0448\u043a\u043e\u043c \u043c\u043d\u043e\u0433\u043e \u0432\u0440\u0435\u043c\u0435\u043d\u0438. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439 \u0437\u0430\u043f\u0443\u0441\u0442\u0438\u0442\u044c \u0435\u0451 \u0435\u0449\u0451 \u0440\u0430\u0437.'
            : 'Style generation is taking too long. Try starting it again.',
        );
        return;
      }

      try {
        const status = await api.getPersonaDistillStatus(profileId);
        if (cancelled) {
          return;
        }

        if (status.status === 'completed') {
          clearStoredProfileRegeneration(profileId);
          stopGeneration();
          await reload();
          return;
        }

        if (status.status === 'failed') {
          clearStoredProfileRegeneration(profileId);
          stopGeneration();
          setError(
            status.errorMessage
              || (isRu ? '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u0433\u0435\u043d\u0435\u0440\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0441\u0442\u0438\u043b\u044c' : 'Failed to generate style'),
          );
          return;
        }

        if (status.status === 'idle') {
          if (profile?.onboardingStatus === 'awaiting_style_generation' && !hasReadyGuide) {
            scheduleNextPoll();
            return;
          }

          clearStoredProfileRegeneration(profileId);
          stopGeneration();
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
  }, [hasReadyGuide, isRu, profile?.onboardingStatus, profileId, reload, setError]);

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

  if (isLoading && !profile) {
    return (
      <section className="page-stack">
        <div className="state-banner">{isRu ? '\u0413\u0435\u043d\u0435\u0440\u0438\u0440\u0443\u0435\u043c \u0441\u0442\u0438\u043b\u044c...' : 'Generating style...'}</div>
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

      {isGenerating ? (
        <section className="setup-generation-panel" aria-live="polite" aria-busy="true">
          <div className="setup-generation-panel__glow setup-generation-panel__glow--one" aria-hidden="true" />
          <div className="setup-generation-panel__glow setup-generation-panel__glow--two" aria-hidden="true" />

          <div className="busy-overlay__loader setup-generation-panel__loader" aria-hidden="true">
            <span className="busy-overlay__cube busy-overlay__cube--anchor" />
            <span className="busy-overlay__cube busy-overlay__cube--one" />
            <span className="busy-overlay__cube busy-overlay__cube--two" />
            <span className="busy-overlay__cube busy-overlay__cube--three" />
            <span className="busy-overlay__cube busy-overlay__cube--four" />
          </div>

          <div className="setup-generation-panel__copy">
            <span className="setup-generation-panel__eyebrow">
              {isRu ? '\u0421\u0431\u043e\u0440 \u0441\u0442\u0438\u043b\u044f' : 'Style distill'}
            </span>
            <strong>{isRu ? '\u0421\u043e\u0431\u0438\u0440\u0430\u0435\u043c \u0433\u043e\u043b\u043e\u0441 \u043a\u0430\u043d\u0430\u043b\u0430' : 'Building the channel voice'}</strong>
            <p>
              {isRu
                ? '\u0410\u043d\u0430\u043b\u0438\u0437\u0438\u0440\u0443\u0435\u043c \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438, \u0442\u043e\u043d, \u0440\u0438\u0442\u043c \u0438 \u0444\u043e\u0440\u043c\u0443\u043b\u0438\u0440\u0443\u0435\u043c \u0438\u0442\u043e\u0433\u043e\u0432\u044b\u0439 style guide. \u041a\u043e\u0433\u0434\u0430 \u043e\u043d \u0431\u0443\u0434\u0435\u0442 \u0433\u043e\u0442\u043e\u0432, \u044d\u043a\u0440\u0430\u043d \u043e\u0431\u043d\u043e\u0432\u0438\u0442\u0441\u044f \u0441\u0430\u043c.'
                : 'We are analyzing sources, tone, pacing, and phrasing to assemble the final style guide. This screen will refresh automatically once it is ready.'}
            </p>
          </div>

          <div className="setup-generation-panel__meta">
            <span>{isRu ? '\u041f\u0440\u043e\u0448\u043b\u043e' : 'Elapsed'}</span>
            <strong>{generationElapsedLabel}</strong>
          </div>

          <div className="busy-overlay__progress setup-generation-panel__progress" aria-hidden="true">
            <span className="busy-overlay__progress-track" style={{ width: `${generationProgress}%` }} />
          </div>

          <div className="setup-generation-stages" aria-hidden="true">
            <span className={`setup-generation-stage${generationStage >= 0 ? ' setup-generation-stage--active' : ''}`}>
              {isRu ? '\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438' : 'Sources'}
            </span>
            <span className={`setup-generation-stage${generationStage >= 1 ? ' setup-generation-stage--active' : ''}`}>
              {isRu ? '\u0422\u043e\u043d \u0438 \u0441\u0442\u0440\u0443\u043a\u0442\u0443\u0440\u0430' : 'Tone and structure'}
            </span>
            <span className={`setup-generation-stage${generationStage >= 2 ? ' setup-generation-stage--active' : ''}`}>
              {isRu ? '\u0424\u0438\u043d\u0430\u043b\u044c\u043d\u044b\u0439 guide' : 'Final guide'}
            </span>
          </div>
        </section>
      ) : null}

      {!shouldShowGenerationOnlyState ? (
        <section className="editor-panel editor-panel--main editor-panel--profile setup-panel setup-panel--fill setup-style-review-panel">
          <textarea
            className="config-editor config-editor--setup-preview setup-style-review-editor"
            disabled={isGenerating || isSaving}
            value={draftGuide}
            onChange={(event) => setDraftGuide(event.target.value)}
          />
        </section>
      ) : null}

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
