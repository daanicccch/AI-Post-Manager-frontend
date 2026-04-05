import { useEffect, useMemo, useState } from 'react';
import { api, type PersonaSource } from '../../lib/api';
import { useAppLocale } from '../../lib/appLocale';
import { storeProfileRegeneration } from '../profiles/profileRegenerationTracker';
import { buildOnboardingUrl, getDefaultPersonaSource, normalizeSourceChannels, normalizeWebSources, useOnboardingData } from './onboardingShared';
import { OnboardingFooter } from './OnboardingFooter';

function formatStyleError(message: string, isRu: boolean, personaSource: PersonaSource) {
  const normalized = String(message || '').toLowerCase();
  if (normalized.includes('not enough posts to distill style')) {
    if (personaSource === 'target') {
      return isRu
        ? 'В целевом канале пока не хватает постов для генерации стиля. Выбери режим с другими каналами или смешанный режим.'
        : 'There are not enough posts in the target channel yet. Try external sources or mixed mode.';
    }

    if (personaSource === 'mixed') {
      return isRu
        ? 'Для смешанного режима пока не хватает постов. Проверь, что в целевом канале и добавленных каналах уже есть публикации.'
        : 'There are not enough posts for mixed mode yet. Make sure the target and added channels already have publications.';
    }

    return isRu
      ? 'В выбранных каналах пока не хватает постов для генерации стиля. Добавь каналы с уже опубликованными постами.'
      : 'There are not enough posts in the selected channels yet. Add channels that already have published posts.';
  }

  return message;
}

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
  const externalStyleChannels = useMemo(
    () => sourceChannels.filter((item) => item.origin !== 'target' && item.usedForStyle !== false),
    [sourceChannels]
  );
  const webSources = useMemo(() => normalizeWebSources(profile?.webSources), [profile?.webSources]);
  const hasExternalSources = externalStyleChannels.length > 0;
  const hasTargetChannel = Boolean(String(profile?.telegramChannelId || '').trim());

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
      const job = await api.generateOnboardingStyle(profile.slug, { personaSource });
      storeProfileRegeneration(profile.slug, job.startedAt, job.jobId);
      window.location.assign(buildOnboardingUrl('style-review', profile.slug));
    } catch (generationError) {
      const rawMessage = generationError instanceof Error ? generationError.message : 'Failed to generate style';
      setError(formatStyleError(rawMessage, isRu, personaSource));
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

      {error && <div className="state-banner state-banner--error setup-error-banner">{error}</div>}

      <section className="queue-control-card queue-control-card--profile setup-panel setup-panel--fill">
        <div className="setup-choice-grid setup-choice-grid--style">
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
              ? '\u00ab\u041c\u043e\u0439 \u043a\u0430\u043d\u0430\u043b\u00bb \u0438 \u00ab\u0421\u043c\u0435\u0448\u0430\u043d\u043d\u044b\u0439 \u0440\u0435\u0436\u0438\u043c\u00bb \u043f\u043e\u044f\u0432\u044f\u0442\u0441\u044f \u0441\u0440\u0430\u0437\u0443 \u043f\u043e\u0441\u043b\u0435 \u043f\u0440\u0438\u0432\u044f\u0437\u043a\u0438 target channel.'
              : 'My channel and mixed mode unlock after the target channel is attached.'}
          </p>
        ) : null}

        {hasTargetChannel ? (
          <p className="editor-help">
            {isRu
              ? '\u0415\u0441\u043b\u0438 \u043a\u0430\u043d\u0430\u043b \u043d\u043e\u0432\u044b\u0439 \u0438 \u0432 \u043d\u0451\u043c \u043f\u043e\u043a\u0430 \u043d\u0435\u0442 \u043f\u043e\u0441\u0442\u043e\u0432, \u0432\u044b\u0431\u0438\u0440\u0430\u0439 \u0440\u0435\u0436\u0438\u043c \u00ab\u0414\u0440\u0443\u0433\u0438\u0435 \u043a\u0430\u043d\u0430\u043b\u044b \u0438 \u0441\u0430\u0439\u0442\u044b\u00bb.'
              : 'If the channel is new and empty, use the external sources mode.'}
          </p>
        ) : null}

        {!hasExternalSources && webSources.length > 0 ? (
          <p className="editor-help">
            {isRu
              ? '\u0421\u0435\u0439\u0447\u0430\u0441 \u0441\u0442\u0438\u043b\u044c \u0433\u0435\u043d\u0435\u0440\u0438\u0440\u0443\u0435\u0442\u0441\u044f \u043f\u043e Telegram-\u043a\u0430\u043d\u0430\u043b\u0430\u043c. \u0421\u0430\u0439\u0442\u044b \u0441\u043e\u0445\u0440\u0430\u043d\u044f\u0442\u0441\u044f \u043a\u0430\u043a \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438, \u043d\u043e \u0434\u043b\u044f style distill \u043d\u0443\u0436\u0435\u043d \u0445\u043e\u0442\u044f \u0431\u044b \u043e\u0434\u0438\u043d \u043a\u0430\u043d\u0430\u043b.'
              : 'Style distillation currently uses Telegram channels. Websites are saved as sources, but you still need at least one channel for style generation.'}
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
