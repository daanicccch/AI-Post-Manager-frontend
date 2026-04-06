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
        <div className="state-banner">{isRu ? 'Загружаем шаг с генерацией...' : 'Loading style step...'}</div>
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
        <h2 className="setup-header__title">{isRu ? 'Как генерить стиль' : 'How style should be generated'}</h2>
        <div className="setup-header__description">
          <p>
            {isRu
              ? 'Для нового канала лучше обычно брать стиль по внешним источникам.'
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
            <strong>{isRu ? 'Другие каналы и сайты' : 'Other channels and sites'}</strong>
            <p>{isRu ? 'Стиль будет собран только по внешним источникам.' : 'Use only external sources.'}</p>
          </button>

          <button
            className={`setup-select-card${personaSource === 'target' ? ' setup-select-card--active' : ''}`}
            disabled={!hasTargetChannel}
            type="button"
            onClick={() => setPersonaSource('target')}
          >
            <strong>{isRu ? 'Мой канал' : 'My channel'}</strong>
            <p>{isRu ? 'Включай этот режим, если в канале уже есть посты.' : 'Use this only if your channel already has posts.'}</p>
          </button>

          <button
            className={`setup-select-card${personaSource === 'mixed' ? ' setup-select-card--active' : ''}`}
            disabled={!hasTargetChannel || !hasExternalSources}
            type="button"
            onClick={() => setPersonaSource('mixed')}
          >
            <strong>{isRu ? 'Смешанный режим' : 'Mixed mode'}</strong>
            <p>{isRu ? 'Смешивает твой канал с внешними источниками.' : 'Blend your channel with external sources.'}</p>
          </button>
        </div>

        {!hasTargetChannel ? (
          <p className="editor-help">
            {isRu
              ? '«Мой канал» и «Смешанный режим» появятся сразу после привязки target channel.'
              : 'My channel and mixed mode unlock after the target channel is attached.'}
          </p>
        ) : null}

        {hasTargetChannel ? (
          <p className="editor-help">
            {isRu
              ? 'Если канал новый и в нём пока нет постов, выбирай режим «Другие каналы и сайты».'
              : 'If the channel is new and empty, use the external sources mode.'}
          </p>
        ) : null}

        {!hasExternalSources && webSources.length > 0 ? (
          <p className="editor-help">
            {isRu
              ? 'Сейчас стиль генерируется по Telegram-каналам. Сайты сохранятся как источники, но для style distill нужен хотя бы один канал.'
              : 'Style distillation currently uses Telegram channels. Websites are saved as sources, but you still need at least one channel for style generation.'}
          </p>
        ) : null}
      </section>

      <OnboardingFooter
        backLabel={isRu ? 'Назад' : 'Back'}
        continueLabel={
          isGenerating
            ? (isRu ? 'Генерируем...' : 'Generating...')
            : (isRu ? 'Продолжить' : 'Continue')
        }
        continueDisabled={isGenerating || (personaSource === 'sources' && !hasExternalSources)}
        onBack={() => window.location.assign(buildOnboardingUrl('sources', profile.slug))}
        onContinue={handleGenerate}
      />

    </section>
  );
}
