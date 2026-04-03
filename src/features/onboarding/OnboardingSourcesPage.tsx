import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAppLocale } from '../../lib/appLocale';
import {
  buildOnboardingUrl,
  buildPresetMap,
  getConfigValue,
  matchesChannelQuery,
  matchesWebQuery,
  normalizeSourceChannels,
  normalizeWebSources,
  useOnboardingData,
} from './onboardingShared';

export function OnboardingSourcesPage() {
  const { language } = useAppLocale();
  const isRu = language === 'ru';
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const profileId = String(searchParams.get('profileId') || '').trim();
  const { data, error, isLoading, profile, presets, sourceChannelCatalog, webSourceCatalog, reload, setError } =
    useOnboardingData(profileId);

  const [mode, setMode] = useState<'preset' | 'custom'>('preset');
  const [selectedPresetKey, setSelectedPresetKey] = useState('');
  const [includeTargetChannel, setIncludeTargetChannel] = useState(false);
  const [selectedChannelUsernames, setSelectedChannelUsernames] = useState<string[]>([]);
  const [selectedWebUrls, setSelectedWebUrls] = useState<string[]>([]);
  const [channelQuery, setChannelQuery] = useState('');
  const [webQuery, setWebQuery] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const presetMap = useMemo(() => buildPresetMap(presets), [presets]);
  const selectedPreset = selectedPresetKey ? presetMap.get(selectedPresetKey) || null : null;
  const filteredChannelCatalog = useMemo(
    () => sourceChannelCatalog.filter((item) => matchesChannelQuery(item, channelQuery)),
    [channelQuery, sourceChannelCatalog]
  );
  const filteredWebCatalog = useMemo(
    () => webSourceCatalog.filter((item) => matchesWebQuery(item, webQuery)),
    [webQuery, webSourceCatalog]
  );

  useEffect(() => {
    if (!data?.profile) {
      return;
    }

    const nextProfile = data.profile;
    const nextPresetKey = String(getConfigValue(nextProfile.sourceChannelsConfig, 'presetKey') || '').trim();
    const nextMode =
      String(getConfigValue(nextProfile.sourceChannelsConfig, 'mode') || '').trim() === 'custom' ? 'custom' : 'preset';
    const nextIncludeTarget = getConfigValue(nextProfile.sourceChannelsConfig, 'includeTargetChannel');

    setMode(nextMode);
    setSelectedPresetKey(nextPresetKey || presets[0]?.key || '');
    setIncludeTargetChannel(nextIncludeTarget === true);
    setSelectedChannelUsernames(normalizeSourceChannels(nextProfile.sourceChannels).map((item) => item.username));
    setSelectedWebUrls(normalizeWebSources(nextProfile.webSources).map((item) => item.url));
  }, [data, presets]);

  async function handleApplyPreset() {
    if (!profile?.slug || !selectedPresetKey) {
      return;
    }

    setIsSaving(true);
    setNotice(null);
    setError(null);

    try {
      await api.applyOnboardingPreset(profile.slug, {
        presetKey: selectedPresetKey,
        includeTargetChannel,
      });
      await reload();
      navigate(buildOnboardingUrl('style', profile.slug));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save preset');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveCustomSources() {
    if (!profile?.slug) {
      return;
    }

    setIsSaving(true);
    setNotice(null);
    setError(null);

    try {
      const channels = sourceChannelCatalog
        .filter((item) => selectedChannelUsernames.includes(item.username))
        .map((item) => ({
          username: item.username,
          title: item.title || item.name || item.username,
          usedForStyle: true,
          usedForMonitoring: true,
        }));
      const selectedWebSources = webSourceCatalog
        .filter((item) => selectedWebUrls.includes(item.url))
        .map((item) => ({
          url: item.url,
          title: item.title || item.url,
          sourceKind: item.sourceKind || 'website',
        }));

      await api.saveOnboardingSources(profile.slug, {
        channels,
        webSources: selectedWebSources,
        includeTargetChannel,
      });
      await reload();
      navigate(buildOnboardingUrl('style', profile.slug));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save sources');
    } finally {
      setIsSaving(false);
    }
  }

  function toggleChannel(username: string) {
    setSelectedChannelUsernames((current) =>
      current.includes(username) ? current.filter((item) => item !== username) : [...current, username]
    );
  }

  function toggleWebSource(url: string) {
    setSelectedWebUrls((current) =>
      current.includes(url) ? current.filter((item) => item !== url) : [...current, url]
    );
  }

  if (isLoading && !profile) {
    return (
      <section className="page-stack">
        <div className="state-banner">{isRu ? '\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043c \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438...' : 'Loading sources...'}</div>
      </section>
    );
  }

  if (!profile?.slug) {
    return (
      <section className="page-stack">
        <section className="queue-control-card queue-control-card--profile">
          <div className="queue-control-card__top">
            <div className="queue-control-card__title">
              <h2>{isRu ? '\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u0432\u044b\u0431\u0435\u0440\u0438 \u043a\u0430\u043d\u0430\u043b \u0432 \u0431\u043e\u0442\u0435' : 'Choose a channel in the bot first'}</h2>
            </div>
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="page-stack">
      <section className="setup-header">
        <div className="setup-progress" aria-label="Onboarding progress">
          <span className="setup-progress__segment setup-progress__segment--active" />
          <span className="setup-progress__segment" />
          <span className="setup-progress__segment" />
          <span className="setup-progress__segment" />
        </div>
        <span className="eyebrow">{isRu ? '\u0428\u0430\u0433 1 \u0438\u0437 4' : 'Step 1 of 4'}</span>
        <h2 className="setup-header__title">{isRu ? '\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438 \u0434\u043b\u044f \u043a\u0430\u043d\u0430\u043b\u0430' : 'Sources for your channel'}</h2>
        <div className="setup-header__description">
          <p>
            {isRu
              ? '\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u0432\u044b\u0431\u0435\u0440\u0438, \u043e\u0442\u043a\u0443\u0434\u0430 \u0431\u0440\u0430\u0442\u044c \u0441\u0442\u0438\u043b\u044c \u0438 \u0438\u0441\u0445\u043e\u0434\u043d\u044b\u0435 \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438.'
              : 'First choose the channels and websites that will shape this profile.'}
          </p>
        </div>
      </section>

      {error && <div className="state-banner state-banner--error">{error}</div>}
      {notice && <div className="state-banner state-banner--success">{notice}</div>}

      <section className="summary-grid">
        <article className="summary-card">
          <span>{isRu ? '\u041a\u0430\u043d\u0430\u043b' : 'Channel'}</span>
          <strong>{profile.telegramChannelTitle || profile.title}</strong>
        </article>
        <article className="summary-card">
          <span>{isRu ? '\u041f\u0440\u0438\u0432\u044f\u0437\u043a\u0430' : 'Handle'}</span>
          <strong>
            {profile.telegramChannelUsername
              ? `@${String(profile.telegramChannelUsername).replace(/^@+/, '')}`
              : profile.telegramChannelId || '—'}
          </strong>
        </article>
      </section>

      <section className="queue-control-card queue-control-card--profile">
        <div className="action-row action-row--wrap">
          <button
            className={`secondary-button secondary-button--small${mode === 'preset' ? ' setup-choice-button--active' : ''}`}
            type="button"
            onClick={() => setMode('preset')}
          >
            {isRu ? '\u0413\u043e\u0442\u043e\u0432\u044b\u0439 \u043f\u0440\u0435\u0441\u0435\u0442' : 'Preset'}
          </button>
          <button
            className={`secondary-button secondary-button--small${mode === 'custom' ? ' setup-choice-button--active' : ''}`}
            type="button"
            onClick={() => setMode('custom')}
          >
            {isRu ? '\u0421\u0432\u043e\u0438 \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438' : 'Custom'}
          </button>
        </div>

        <label className="toggle-row create-toggle-card">
          <input
            checked={includeTargetChannel}
            type="checkbox"
            onChange={(event) => setIncludeTargetChannel(event.target.checked)}
          />
          <span>
            {isRu
              ? '\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u043c\u043e\u0439 \u043a\u0430\u043d\u0430\u043b \u0432 \u0441\u043f\u0438\u0441\u043e\u043a \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u043e\u0432'
              : 'Include my target channel in the source set'}
          </span>
        </label>

        {mode === 'preset' ? (
          <div className="setup-choice-grid">
            {presets.map((preset) => (
              <button
                className={`setup-select-card${selectedPresetKey === preset.key ? ' setup-select-card--active' : ''}`}
                key={preset.key}
                type="button"
                onClick={() => setSelectedPresetKey(preset.key)}
              >
                <strong>{preset.title}</strong>
                <p>{preset.description}</p>
                <span>{`${preset.channels.length} / ${preset.webSources.length}`}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="setup-columns">
            <section className="context-section context-section--tight">
              <label className="field-block">
                <span>{isRu ? '\u041f\u043e\u0438\u0441\u043a \u043a\u0430\u043d\u0430\u043b\u0430' : 'Search channel'}</span>
                <input value={channelQuery} onChange={(event) => setChannelQuery(event.target.value)} />
              </label>
              <div className="setup-list">
                {filteredChannelCatalog.map((item) => {
                  const isSelected = selectedChannelUsernames.includes(item.username);
                  return (
                    <button
                      className={`setup-list-card${isSelected ? ' setup-list-card--active' : ''}`}
                      key={item.username}
                      type="button"
                      onClick={() => toggleChannel(item.username)}
                    >
                      <strong>{item.title || item.name || item.username}</strong>
                      <span>@{item.username}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="context-section context-section--tight">
              <label className="field-block">
                <span>{isRu ? '\u041f\u043e\u0438\u0441\u043a \u0441\u0430\u0439\u0442\u0430' : 'Search website'}</span>
                <input value={webQuery} onChange={(event) => setWebQuery(event.target.value)} />
              </label>
              <div className="setup-list">
                {filteredWebCatalog.map((item) => {
                  const isSelected = selectedWebUrls.includes(item.url);
                  return (
                    <button
                      className={`setup-list-card${isSelected ? ' setup-list-card--active' : ''}`}
                      key={item.url}
                      type="button"
                      onClick={() => toggleWebSource(item.url)}
                    >
                      <strong>{item.title || item.url}</strong>
                      <span>{item.url}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        <div className="action-row action-row--wrap">
          <button
            className="primary-button primary-button--profile"
            disabled={isSaving || (mode === 'preset' && !selectedPresetKey)}
            type="button"
            onClick={mode === 'preset' ? handleApplyPreset : handleSaveCustomSources}
          >
            {isSaving
              ? (isRu ? '\u0421\u043e\u0445\u0440\u0430\u043d\u044f\u0435\u043c...' : 'Saving...')
              : (isRu ? '\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0438 \u0434\u0430\u043b\u044c\u0448\u0435' : 'Save and continue')}
          </button>
        </div>
      </section>

      {selectedPreset && mode === 'preset' ? (
        <section className="context-section context-section--tight">
          <h4>{isRu ? '\u041f\u0440\u0435\u0432\u044c\u044e \u043f\u0440\u0435\u0441\u0435\u0442\u0430' : 'Preset preview'}</h4>
          <p>{selectedPreset.channels.map((item) => `@${item.username}`).join(', ') || '—'}</p>
          <p>{selectedPreset.webSources.map((item) => item.title || item.url).join(', ') || '—'}</p>
        </section>
      ) : null}
    </section>
  );
}
