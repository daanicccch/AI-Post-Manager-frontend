import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useAppLocale } from '../../lib/appLocale';
import { closeTelegramMiniApp, openTelegramLink } from '../../lib/telegram';
import { buildOnboardingUrl, buildPresetMap, getConfigValue, normalizeSourceChannels, normalizeWebSources, useOnboardingData } from './onboardingShared';
import { OnboardingFooter } from './OnboardingFooter';

function parseWebSourceValue(value: string) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return null;
  }

  return {
    url: /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    title: trimmed,
    sourceKind: 'website',
  };
}

export function OnboardingSourcesPage() {
  const { language } = useAppLocale();
  const isRu = language === 'ru';
  const profileId = typeof window === 'undefined'
    ? ''
    : String(new URLSearchParams(window.location.search).get('profileId') || '').trim();
  const { data, error, isLoading, profile, presets, reload, setError, sourcePickerUrl } = useOnboardingData(profileId);

  const [mode, setMode] = useState<'preset' | 'custom'>('preset');
  const [selectedPresetKey, setSelectedPresetKey] = useState('');
  const [customChannels, setCustomChannels] = useState<Array<{ username: string; title: string }>>([]);
  const [customWebSources, setCustomWebSources] = useState<Array<{ url: string; title: string }>>([]);
  const [websiteInput, setWebsiteInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const channelHint = isRu
    ? '\u041a\u0430\u043d\u0430\u043b\u044b \u0434\u043e\u0431\u0430\u0432\u043b\u044f\u044e\u0442\u0441\u044f \u0447\u0435\u0440\u0435\u0437 Telegram-\u0431\u043e\u0442\u0430 \u043d\u0430\u0442\u0438\u0432\u043d\u044b\u043c \u043f\u0438\u043a\u0435\u0440\u043e\u043c. \u041f\u043e\u0434\u0445\u043e\u0434\u044f\u0442 \u043f\u0443\u0431\u043b\u0438\u0447\u043d\u044b\u0435 \u043a\u0430\u043d\u0430\u043b\u044b \u0441 username.'
    : 'Channels are added in the Telegram bot using the native picker. Public channels with usernames are supported.';
  const websiteHint = isRu
    ? '\u0421\u0430\u0439\u0442\u044b \u0441\u043e\u0445\u0440\u0430\u043d\u044f\u044e\u0442\u0441\u044f \u043a\u0430\u043a \u0434\u043e\u043f\u043e\u043b\u043d\u0438\u0442\u0435\u043b\u044c\u043d\u044b\u0435 \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438.'
    : 'Websites are saved as additional sources.';

  const presetMap = useMemo(() => buildPresetMap(presets), [presets]);
  const selectedPreset = selectedPresetKey ? presetMap.get(selectedPresetKey) || null : null;

  useEffect(() => {
    if (!data?.profile) {
      return;
    }

    const nextProfile = data.profile;
    const nextPresetKey = String(getConfigValue(nextProfile.sourceChannelsConfig, 'presetKey') || '').trim();
    const nextMode =
      String(getConfigValue(nextProfile.sourceChannelsConfig, 'mode') || '').trim() === 'custom' ? 'custom' : 'preset';

    setMode(nextMode);
    setSelectedPresetKey(nextPresetKey || presets[0]?.key || '');
    setCustomChannels(
      normalizeSourceChannels(nextProfile.sourceChannels)
        .filter((item) => item.origin !== 'target')
        .map((item) => ({
          username: item.username,
          title: item.title || item.username,
        }))
    );
    setCustomWebSources(
      normalizeWebSources(nextProfile.webSources)
        .map((item) => ({
          url: item.url,
          title: item.title || item.url,
        }))
    );
  }, [data, presets]);

  async function handleApplyPreset() {
    if (!profile?.slug || !selectedPresetKey) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await api.applyOnboardingPreset(profile.slug, {
        presetKey: selectedPresetKey,
        includeTargetChannel: false,
      });
      await reload();
      window.location.assign(buildOnboardingUrl('style', profile.slug));
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
    setError(null);

    try {
      const channels = Array.from(
        new Map(
          customChannels.map((item) => [String(item.username).toLowerCase(), {
            username: item.username,
            title: item.title,
            usedForStyle: true,
            usedForMonitoring: true,
          }])
        ).values()
      );
      const webSources = Array.from(
        new Map(
          customWebSources.map((item) => [String(item.url).toLowerCase(), {
            url: item.url,
            title: item.title,
            sourceKind: 'website',
          }])
        ).values()
      );

      await api.saveOnboardingSources(profile.slug, {
        channels,
        webSources,
        includeTargetChannel: false,
      });
      await reload();
      window.location.assign(buildOnboardingUrl('style', profile.slug));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save sources');
    } finally {
      setIsSaving(false);
    }
  }

  function addWebsite() {
    const nextItem = parseWebSourceValue(websiteInput);
    if (!nextItem) {
      return;
    }

    setCustomWebSources((current) => {
      const nextMap = new Map(current.map((item) => [item.url.toLowerCase(), item]));
      nextMap.set(nextItem.url.toLowerCase(), {
        url: nextItem.url,
        title: nextItem.title,
      });
      return Array.from(nextMap.values());
    });
    setWebsiteInput('');
  }

  function removeChannel(username: string) {
    setCustomChannels((current) => current.filter((item) => item.username !== username));
  }

  function removeWebsite(url: string) {
    setCustomWebSources((current) => current.filter((item) => item.url !== url));
  }

  function handleOpenSourcePicker() {
    if (String(sourcePickerUrl || '').startsWith('mock://source-picker/')) {
      const mockUsername = `source${customChannels.length + 1}`;
      setCustomChannels((current) => {
        const nextMap = new Map(current.map((item) => [item.username.toLowerCase(), item]));
        nextMap.set(mockUsername, {
          username: mockUsername,
          title: `@${mockUsername}`,
        });
        return Array.from(nextMap.values());
      });
      return;
    }

    if (sourcePickerUrl) {
      openTelegramLink(sourcePickerUrl);
      closeTelegramMiniApp();
    }
  }

  useEffect(() => {
    if (!profileId || typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('sourcePickerReturn') !== '1') {
      return;
    }

    void api.acknowledgeOnboardingSourcePickerReturn(profileId).finally(() => {
      params.delete('sourcePickerReturn');
      const nextQuery = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`);
    });
  }, [profileId]);

  useEffect(() => {
    if (mode !== 'custom') {
      return undefined;
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void reload();
      }
    };

    const handleFocus = () => {
      void reload();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [mode, reload]);

  if (isLoading && !profile) {
    return (
      <section className="page-stack">
        <div className="state-banner">{isRu ? '\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043c \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438...' : 'Loading sources...'}</div>
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
          <span className="setup-progress__segment setup-progress__segment--active" />
          <span className="setup-progress__segment" />
          <span className="setup-progress__segment" />
          <span className="setup-progress__segment" />
        </div>
        <h2 className="setup-header__title">{isRu ? '\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438 \u0434\u043b\u044f \u043a\u0430\u043d\u0430\u043b\u0430' : 'Sources for your channel'}</h2>
        <div className="setup-header__description">
          <p>
            {isRu
              ? '\u0412\u044b\u0431\u0435\u0440\u0438 \u0433\u043e\u0442\u043e\u0432\u044b\u0439 \u043f\u0440\u0435\u0441\u0435\u0442 \u0438\u043b\u0438 \u0437\u0430\u0434\u0430\u0439 \u0441\u0432\u043e\u0438 \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438 \u0432\u0440\u0443\u0447\u043d\u0443\u044e.'
              : 'Choose a preset or add your own sources manually.'}
          </p>
          {mode === 'preset' ? (
            <p>
              {isRu
                ? '\u041f\u0440\u0435\u0441\u0435\u0442\u043e\u0432 \u0431\u0443\u0434\u0435\u0442 \u043c\u043d\u043e\u0433\u043e, \u043f\u043e\u044d\u0442\u043e\u043c\u0443 \u0441\u043f\u0438\u0441\u043e\u043a \u043c\u043e\u0436\u043d\u043e \u043b\u0438\u0441\u0442\u0430\u0442\u044c.'
                : 'You can scroll through a long preset list here.'}
            </p>
          ) : null}
        </div>
      </section>

      {error && <div className="state-banner state-banner--error">{error}</div>}

      <section className="queue-control-card queue-control-card--profile setup-panel setup-panel--fill">
        <div className="setup-tabs">
          <button
            className={`secondary-button secondary-button--small${mode === 'preset' ? ' setup-choice-button--active' : ''}`}
            type="button"
            onClick={() => setMode('preset')}
          >
            {isRu ? '\u041f\u0440\u0435\u0441\u0435\u0442' : 'Preset'}
          </button>
          <button
            className={`secondary-button secondary-button--small${mode === 'custom' ? ' setup-choice-button--active' : ''}`}
            type="button"
            onClick={() => setMode('custom')}
          >
            {isRu ? '\u0421\u0432\u043e\u0438 \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438' : 'Custom'}
          </button>
        </div>

        {mode === 'preset' ? (
          <div className="setup-preset-list setup-preset-list--dense" role="list">
            {presets.map((preset) => (
              <button
                className={`setup-select-card${selectedPresetKey === preset.key ? ' setup-select-card--active' : ''}`}
                key={preset.key}
                type="button"
                onClick={() => setSelectedPresetKey(preset.key)}
              >
                <strong>{preset.title}</strong>
                <p>{preset.description}</p>
              </button>
            ))}
          </div>
        ) : (
          <div className="setup-source-stack">
            <section className="context-section context-section--tight setup-source-section">
              <span className="setup-field-label">{isRu ? '\u041a\u0430\u043d\u0430\u043b\u044b-\u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438' : 'Source channels'}</span>
              <p className="editor-help">{channelHint}</p>
              <button className="secondary-button secondary-button--small" type="button" onClick={handleOpenSourcePicker}>{isRu ? '\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u043a\u0430\u043d\u0430\u043b \u0432 \u0431\u043e\u0442\u0435' : 'Add channel in bot'}</button>
              <div className="setup-chip-list" aria-live="polite">
                {customChannels.map((item) => (
                  <span className="setup-chip" key={item.username}>
                    {item.title}
                    <button aria-label={isRu ? '\u0423\u0434\u0430\u043b\u0438\u0442\u044c' : 'Remove'} type="button" onClick={() => removeChannel(item.username)}>&times;</button>
                  </span>
                ))}
              </div>
            </section>

            <section className="context-section context-section--tight setup-source-section">
              <span className="setup-field-label">{isRu ? '\u0421\u0441\u044b\u043b\u043a\u0430 \u043d\u0430 \u0441\u0430\u0439\u0442' : 'Website link'}</span>
              <p className="editor-help">{websiteHint}</p>
              <div className="setup-inline-input">
                <input
                  placeholder={isRu ? 'site.com или https://site.com' : 'site.com or https://site.com'}
                  value={websiteInput}
                  onChange={(event) => setWebsiteInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addWebsite();
                    }
                  }}
                />
                <button className="secondary-button secondary-button--small" type="button" onClick={addWebsite}>
                  {isRu ? '\u0413\u043e\u0442\u043e\u0432\u043e' : 'Add'}
                </button>
              </div>
              <div className="setup-chip-list" aria-live="polite">
                {customWebSources.map((item) => (
                  <span className="setup-chip" key={item.url}>
                    {item.title}
                    <button aria-label={isRu ? '\u0423\u0434\u0430\u043b\u0438\u0442\u044c' : 'Remove'} type="button" onClick={() => removeWebsite(item.url)}>&times;</button>
                  </span>
                ))}
              </div>
            </section>
          </div>
        )}
      </section>

      <OnboardingFooter
        backDisabled
        backLabel={isRu ? '\u041d\u0430\u0437\u0430\u0434' : 'Back'}
        continueLabel={
          isSaving
            ? (isRu ? '\u0421\u043e\u0445\u0440\u0430\u043d\u044f\u0435\u043c...' : 'Saving...')
            : (isRu ? '\u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c' : 'Continue')
        }
        continueDisabled={isSaving || (mode === 'preset' && !selectedPresetKey)}
        onBack={() => {}}
        onContinue={mode === 'preset' ? handleApplyPreset : handleSaveCustomSources}
      />
    </section>
  );
}
