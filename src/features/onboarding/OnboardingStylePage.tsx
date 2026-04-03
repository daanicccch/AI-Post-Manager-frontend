import { useEffect, useMemo, useState } from 'react';
import { api, type PersonaSource } from '../../lib/api';
import { useAppLocale } from '../../lib/appLocale';
import { buildOnboardingUrl, getDefaultPersonaSource, normalizeSourceChannels, normalizeWebSources, useOnboardingData } from './onboardingShared';
import { OnboardingFooter } from './OnboardingFooter';

export function OnboardingStylePage() {
  const { language } = useAppLocale();
  const isRu = language === 'ru';
  const profileId = typeof window === 'undefined'
    ? ''
    : String(new URLSearchParams(window.location.search).get('profileId') || '').trim();
  const { error, isLoading, profile, setError } = useOnboardingData(profileId);
  const [isGenerating, setIsGenerating] = useState(false);
  const [personaSource, setPersonaSource] = useState<PersonaSource>('sources');

  const sourceChannels = useMemo(() => normalizeSourceChannels(profile?.sourceChannels), [profile?.sourceChannels]);
  const webSources = useMemo(() => normalizeWebSources(profile?.webSources), [profile?.webSources]);
  const hasExternalSources = sourceChannels.some((item) => item.origin !== 'target') || webSources.length > 0;
  const hasTargetChannel = Boolean(String(profile?.telegramChannelUsername || '').trim());

  useEffect(() => {
    setPersonaSource(getDefaultPersonaSource(profile));
  }, [profile]);

  async function handleGenerate() {
    if (!profile?.slug) {
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      await api.generateOnboardingStyle(profile.slug, { personaSource });
      window.location.assign(buildOnboardingUrl('style-review', profile.slug));
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Failed to generate style');
    } finally {
      setIsGenerating(false);
    }
  }

  if (isLoading && !profile) {
    return (
      <section className="page-stack">
        <div className="state-banner">{isRu ? '\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043c \u0448\u0430\u0433 \u0441 \u0433\u0435\u043d\u0435\u0440\u0430\u0446\u0438\u0435\u0439...' : 'Loading style step...'}</div>
      </section>
    );
  }

  if (!profile?.slug) {
    return null;
  }

  return (
    <section className="page-stack page-stack--setup">
      <section className="setup-header">
        <div className="setup-progress" aria-label="Onboarding progress">
          <span className="setup-progress__segment setup-progress__segment--done" />
          <span className="setup-progress__segment setup-progress__segment--active" />
          <span className="setup-progress__segment" />
          <span className="setup-progress__segment" />
        </div>
        <h2 className="setup-header__title">{isRu ? '\u041a\u0430\u043a \u0433\u0435\u043d\u0435\u0440\u0438\u0442\u044c \u0441\u0442\u0438\u043b\u044c' : 'How style should be generated'}</h2>
        <div className="setup-header__description">
          <p>
            {isRu
              ? '\u0414\u043b\u044f \u043d\u043e\u0432\u043e\u0433\u043e \u043a\u0430\u043d\u0430\u043b\u0430 \u043b\u0443\u0447\u0448\u0435 \u043e\u0431\u044b\u0447\u043d\u043e \u0431\u0440\u0430\u0442\u044c \u0441\u0442\u0438\u043b\u044c \u043f\u043e \u0432\u043d\u0435\u0448\u043d\u0438\u043c \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0430\u043c.'
              : 'For a new channel, style is usually best generated from external sources.'}
          </p>
        </div>
      </section>

      {error && <div className="state-banner state-banner--error">{error}</div>}

      <section className="queue-control-card queue-control-card--profile setup-panel">
        <div className="setup-choice-grid">
          <button
            className={`setup-select-card${personaSource === 'sources' ? ' setup-select-card--active' : ''}`}
            disabled={!hasExternalSources}
            type="button"
            onClick={() => setPersonaSource('sources')}
          >
            <strong>{isRu ? '\u0414\u0440\u0443\u0433\u0438\u0435 \u043a\u0430\u043d\u0430\u043b\u044b \u0438 \u0441\u0430\u0439\u0442\u044b' : 'Other channels and sites'}</strong>
            <p>{isRu ? '\u0421\u0442\u0438\u043b\u044c \u0431\u0443\u0434\u0435\u0442 \u0441\u043e\u0431\u0440\u0430\u043d \u0442\u043e\u043b\u044c\u043a\u043e \u043f\u043e \u0432\u043d\u0435\u0448\u043d\u0438\u043c \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0430\u043c.' : 'Use only external sources.'}</p>
          </button>

          <button
            className={`setup-select-card${personaSource === 'target' ? ' setup-select-card--active' : ''}`}
            disabled={!hasTargetChannel}
            type="button"
            onClick={() => setPersonaSource('target')}
          >
            <strong>{isRu ? '\u041c\u043e\u0439 \u043a\u0430\u043d\u0430\u043b' : 'My channel'}</strong>
            <p>{isRu ? '\u0412\u043a\u043b\u044e\u0447\u0430\u0439 \u044d\u0442\u043e\u0442 \u0440\u0435\u0436\u0438\u043c, \u0435\u0441\u043b\u0438 \u0432 \u043a\u0430\u043d\u0430\u043b\u0435 \u0443\u0436\u0435 \u0435\u0441\u0442\u044c \u043f\u043e\u0441\u0442\u044b.' : 'Use this only if your channel already has posts.'}</p>
          </button>

          <button
            className={`setup-select-card${personaSource === 'mixed' ? ' setup-select-card--active' : ''}`}
            disabled={!hasTargetChannel || !hasExternalSources}
            type="button"
            onClick={() => setPersonaSource('mixed')}
          >
            <strong>{isRu ? '\u0421\u043c\u0435\u0448\u0430\u043d\u043d\u044b\u0439 \u0440\u0435\u0436\u0438\u043c' : 'Mixed mode'}</strong>
            <p>{isRu ? '\u0421\u043c\u0435\u0448\u0438\u0432\u0430\u0435\u0442 \u0442\u0432\u043e\u0439 \u043a\u0430\u043d\u0430\u043b \u0441 \u0432\u043d\u0435\u0448\u043d\u0438\u043c\u0438 \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0430\u043c\u0438.' : 'Blend your channel with external sources.'}</p>
          </button>
        </div>

        {!hasTargetChannel ? (
          <p className="editor-help">
            {isRu
              ? '\u0420\u0435\u0436\u0438\u043c\u044b \u00ab\u041c\u043e\u0439 \u043a\u0430\u043d\u0430\u043b\u00bb \u0438 \u00ab\u0421\u043c\u0435\u0448\u0430\u043d\u043d\u044b\u0439\u00bb \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b, \u043f\u043e\u043a\u0430 \u0446\u0435\u043b\u0435\u0432\u043e\u0439 \u043a\u0430\u043d\u0430\u043b \u043d\u0435 \u043f\u0440\u0438\u0432\u044f\u0437\u0430\u043d.'
              : 'My channel and mixed mode are unavailable until the target channel is connected.'}
          </p>
        ) : null}

        {hasTargetChannel ? (
          <p className="editor-help">
            {isRu
              ? '\u0415\u0441\u043b\u0438 \u043a\u0430\u043d\u0430\u043b \u043d\u043e\u0432\u044b\u0439 \u0438 \u0432 \u043d\u0451\u043c \u043f\u043e\u043a\u0430 \u043d\u0435\u0442 \u043f\u043e\u0441\u0442\u043e\u0432, \u0432\u044b\u0431\u0438\u0440\u0430\u0439 \u0440\u0435\u0436\u0438\u043c \u00ab\u0414\u0440\u0443\u0433\u0438\u0435 \u043a\u0430\u043d\u0430\u043b\u044b \u0438 \u0441\u0430\u0439\u0442\u044b\u00bb.'
              : 'If the channel is new and empty, use the external sources mode.'}
          </p>
        ) : null}
      </section>

      <OnboardingFooter
        backLabel={isRu ? '\u041d\u0430\u0437\u0430\u0434' : 'Back'}
        continueLabel={
          isGenerating
            ? (isRu ? '\u0413\u0435\u043d\u0435\u0440\u0438\u0440\u0443\u0435\u043c...' : 'Generating...')
            : (isRu ? '\u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c' : 'Continue')
        }
        continueDisabled={isGenerating || (personaSource === 'sources' && !hasExternalSources)}
        onBack={() => window.location.assign(buildOnboardingUrl('sources', profile.slug))}
        onContinue={handleGenerate}
      />
    </section>
  );
}
