import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, type PersonaSource } from '../../lib/api';
import { useAppLocale } from '../../lib/appLocale';
import {
  buildOnboardingUrl,
  getDefaultPersonaSource,
  normalizeSourceChannels,
  normalizeWebSources,
  useOnboardingData,
} from './onboardingShared';

export function OnboardingStylePage() {
  const { language } = useAppLocale();
  const isRu = language === 'ru';
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const profileId = String(searchParams.get('profileId') || '').trim();
  const { error, isLoading, profile, setError } = useOnboardingData(profileId);
  const [notice, setNotice] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [personaSource, setPersonaSource] = useState<PersonaSource>('sources');

  const sourceChannels = useMemo(() => normalizeSourceChannels(profile?.sourceChannels), [profile?.sourceChannels]);
  const webSources = useMemo(() => normalizeWebSources(profile?.webSources), [profile?.webSources]);
  const hasExternalSources = sourceChannels.some((item) => item.origin !== 'target') || webSources.length > 0;
  const hasTargetChannel = sourceChannels.some((item) => item.origin === 'target')
    || Boolean(String(profile?.telegramChannelUsername || '').trim());

  useEffect(() => {
    setPersonaSource(getDefaultPersonaSource(profile));
  }, [profile]);

  async function handleGenerate() {
    if (!profile?.slug) {
      return;
    }

    setIsGenerating(true);
    setNotice(null);
    setError(null);

    try {
      await api.generateOnboardingStyle(profile.slug, { personaSource });
      navigate(buildOnboardingUrl('style-review', profile.slug));
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Failed to generate style');
    } finally {
      setIsGenerating(false);
    }
  }

  if (isLoading && !profile) {
    return (
      <section className="page-stack">
        <div className="state-banner">{isRu ? '\u0413\u043e\u0442\u043e\u0432\u0438\u043c \u0448\u0430\u0433 \u0441\u043e \u0441\u0442\u0438\u043b\u0435\u043c...' : 'Loading style step...'}</div>
      </section>
    );
  }

  if (!profile?.slug) {
    return null;
  }

  return (
    <section className="page-stack">
      <section className="queue-control-card queue-control-card--profile">
        <div className="queue-control-card__top">
          <div className="queue-control-card__title">
            <h2>{isRu ? '\u0428\u0430\u0433 2. \u0413\u0435\u043d\u0435\u0440\u0430\u0446\u0438\u044f \u0441\u0442\u0438\u043b\u044f' : 'Step 2. Generate style'}</h2>
          </div>
        </div>
        <div className="setup-stepbar" aria-label="Onboarding steps">
          <span className="setup-stepbar__item setup-stepbar__item--done">{isRu ? '\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438' : 'Sources'}</span>
          <span className="setup-stepbar__item setup-stepbar__item--active">{isRu ? '\u0421\u0442\u0438\u043b\u044c' : 'Style'}</span>
          <span className="setup-stepbar__item">{isRu ? '\u041f\u0440\u043e\u0441\u043c\u043e\u0442\u0440' : 'Review'}</span>
          <span className="setup-stepbar__item">{isRu ? '\u041f\u043b\u0430\u043d' : 'Plan'}</span>
        </div>
      </section>

      {error && <div className="state-banner state-banner--error">{error}</div>}
      {notice && <div className="state-banner state-banner--success">{notice}</div>}

      <section className="context-section context-section--tight">
        <h4>{isRu ? '\u041d\u0430 \u043e\u0441\u043d\u043e\u0432\u0435 \u0447\u0435\u0433\u043e \u0433\u0435\u043d\u0435\u0440\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0441\u0442\u0438\u043b\u044c' : 'What should style generation use'}</h4>
        <p>
          {isRu
            ? '\u0414\u043b\u044f \u043d\u043e\u0432\u043e\u0433\u043e \u043a\u0430\u043d\u0430\u043b\u0430 \u043e\u0431\u044b\u0447\u043d\u043e \u0431\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u0435\u0435 \u0433\u0435\u043d\u0435\u0440\u0438\u0442\u044c \u0441\u0442\u0438\u043b\u044c \u043f\u043e \u0434\u0440\u0443\u0433\u0438\u043c \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0430\u043c.'
            : 'For a brand-new channel, generating style from external sources is usually the safest option.'}
        </p>
        <div className="setup-choice-grid">
          <button
            className={`setup-select-card${personaSource === 'sources' ? ' setup-select-card--active' : ''}`}
            disabled={!hasExternalSources}
            type="button"
            onClick={() => setPersonaSource('sources')}
          >
            <strong>{isRu ? '\u0414\u0440\u0443\u0433\u0438\u0435 \u043a\u0430\u043d\u0430\u043b\u044b \u0438 \u0441\u0430\u0439\u0442\u044b' : 'External sources'}</strong>
            <p>{isRu ? '\u0421\u0442\u0438\u043b\u044c \u0442\u043e\u043b\u044c\u043a\u043e \u043f\u043e \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u044b\u043c \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0430\u043c.' : 'Use only the selected channels and websites.'}</p>
          </button>
          <button
            className={`setup-select-card${personaSource === 'target' ? ' setup-select-card--active' : ''}`}
            disabled={!hasTargetChannel}
            type="button"
            onClick={() => setPersonaSource('target')}
          >
            <strong>{isRu ? '\u041c\u043e\u0439 \u043a\u0430\u043d\u0430\u043b' : 'My channel'}</strong>
            <p>{isRu ? '\u0411\u0440\u0430\u0442\u044c \u0441\u0442\u0438\u043b\u044c \u0438\u0437 \u0446\u0435\u043b\u0435\u0432\u043e\u0433\u043e \u043a\u0430\u043d\u0430\u043b\u0430.' : 'Use the target channel as the style source.'}</p>
          </button>
          <button
            className={`setup-select-card${personaSource === 'mixed' ? ' setup-select-card--active' : ''}`}
            disabled={!hasTargetChannel || !hasExternalSources}
            type="button"
            onClick={() => setPersonaSource('mixed')}
          >
            <strong>{isRu ? '\u0421\u043c\u0435\u0448\u0430\u043d\u043d\u044b\u0439 \u0440\u0435\u0436\u0438\u043c' : 'Mixed mode'}</strong>
            <p>{isRu ? '\u0421\u043e\u0431\u0440\u0430\u0442\u044c \u0441\u0442\u0438\u043b\u044c \u0438 \u0438\u0437 \u0441\u0432\u043e\u0435\u0433\u043e \u043a\u0430\u043d\u0430\u043b\u0430, \u0438 \u0438\u0437 \u0432\u043d\u0435\u0448\u043d\u0438\u0445 \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u043e\u0432.' : 'Blend your channel with external sources.'}</p>
          </button>
        </div>
      </section>

      <section className="summary-grid">
        <article className="summary-card">
          <span>{isRu ? '\u041a\u0430\u043d\u0430\u043b\u044b' : 'Channels'}</span>
          <strong>{sourceChannels.length}</strong>
        </article>
        <article className="summary-card">
          <span>{isRu ? '\u0421\u0430\u0439\u0442\u044b' : 'Web sources'}</span>
          <strong>{webSources.length}</strong>
        </article>
      </section>

      <section className="context-section context-section--tight">
        <h4>{isRu ? '\u0422\u0435\u043a\u0443\u0449\u0438\u0439 \u043d\u0430\u0431\u043e\u0440' : 'Current source set'}</h4>
        <p>{sourceChannels.length > 0 ? sourceChannels.map((item) => `@${item.username}`).join(', ') : '—'}</p>
        <p>{webSources.length > 0 ? webSources.map((item) => item.title || item.url).join(', ') : '—'}</p>
      </section>

      <div className="action-row action-row--wrap">
        <button
          className="secondary-button secondary-button--small"
          type="button"
          onClick={() => navigate(buildOnboardingUrl('sources', profile.slug))}
        >
          {isRu ? '\u041d\u0430\u0437\u0430\u0434 \u043a \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0430\u043c' : 'Back to sources'}
        </button>
        <button
          className="primary-button primary-button--profile"
          disabled={isGenerating}
          type="button"
          onClick={handleGenerate}
        >
          {isGenerating ? (isRu ? '\u0413\u0435\u043d\u0435\u0440\u0438\u0440\u0443\u0435\u043c...' : 'Generating...') : (isRu ? '\u0421\u0433\u0435\u043d\u0435\u0440\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0441\u0442\u0438\u043b\u044c' : 'Generate style')}
        </button>
      </div>
    </section>
  );
}
