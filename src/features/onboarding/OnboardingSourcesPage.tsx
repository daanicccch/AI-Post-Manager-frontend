import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useAppLocale } from '../../lib/appLocale';
import { buildOnboardingUrl, buildPresetMap, getConfigValue, normalizeSourceChannels, normalizeWebSources, useOnboardingData } from './onboardingShared';
import { OnboardingFooter } from './OnboardingFooter';

function splitMultilineInput(value: string) {
  return String(value || '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseChannelValue(value: string) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed
    .replace(/^https?:\/\/(www\.)?t\.me\//i, '')
    .replace(/^@+/, '')
    .trim();

  if (!normalized) {
    return null;
  }

  return {
    username: normalized,
    title: trimmed,
    usedForStyle: true,
    usedForMonitoring: true,
  };
}

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
  const { data, error, isLoading, profile, presets, reload, setError } = useOnboardingData(profileId);

  const [mode, setMode] = useState<'preset' | 'custom'>('preset');
  const [selectedPresetKey, setSelectedPresetKey] = useState('');
  const [customChannelsText, setCustomChannelsText] = useState('');
  const [customWebSourcesText, setCustomWebSourcesText] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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
    setCustomChannelsText(
      normalizeSourceChannels(nextProfile.sourceChannels)
        .filter((item) => item.origin !== 'target')
        .map((item) => item.title || item.username)
        .join('\n')
    );
    setCustomWebSourcesText(
      normalizeWebSources(nextProfile.webSources)
        .map((item) => item.title || item.url)
        .join('\n')
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
          splitMultilineInput(customChannelsText)
            .map(parseChannelValue)
            .filter((item): item is NonNullable<typeof item> => Boolean(item))
            .map((item) => [String(item.username).toLowerCase(), item])
        ).values()
      );
      const webSources = Array.from(
        new Map(
          splitMultilineInput(customWebSourcesText)
            .map(parseWebSourceValue)
            .filter((item): item is NonNullable<typeof item> => Boolean(item))
            .map((item) => [String(item.url).toLowerCase(), item])
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
        </div>
      </section>

      {error && <div className="state-banner state-banner--error">{error}</div>}

      <section className="queue-control-card queue-control-card--profile setup-panel">
        <div className="action-row action-row--wrap">
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
              </button>
            ))}
          </div>
        ) : (
          <div className="setup-columns setup-columns--single">
            <section className="context-section context-section--tight">
              <label className="field-block">
                <span>{isRu ? '\u041a\u0430\u043d\u0430\u043b\u044b' : 'Channels'}</span>
                <textarea
                  className="config-editor config-editor--setup"
                  value={customChannelsText}
                  onChange={(event) => setCustomChannelsText(event.target.value)}
                />
              </label>
              <p className="editor-help">
                {isRu
                  ? '\u041f\u043e \u043e\u0434\u043d\u043e\u043c\u0443 \u043a\u0430\u043d\u0430\u043b\u0443 \u043d\u0430 \u0441\u0442\u0440\u043e\u043a\u0443. \u041c\u043e\u0436\u043d\u043e \u0432\u0441\u0442\u0430\u0432\u0438\u0442\u044c @username \u0438\u043b\u0438 \u0441\u0441\u044b\u043b\u043a\u0443.'
                  : 'One channel per line. You can paste @username or a t.me link.'}
              </p>
            </section>

            <section className="context-section context-section--tight">
              <label className="field-block">
                <span>{isRu ? '\u0421\u0430\u0439\u0442\u044b' : 'Websites'}</span>
                <textarea
                  className="config-editor config-editor--setup"
                  value={customWebSourcesText}
                  onChange={(event) => setCustomWebSourcesText(event.target.value)}
                />
              </label>
              <p className="editor-help">
                {isRu
                  ? '\u041f\u043e \u043e\u0434\u043d\u043e\u043c\u0443 \u0441\u0430\u0439\u0442\u0443 \u043d\u0430 \u0441\u0442\u0440\u043e\u043a\u0443.'
                  : 'One website per line.'}
              </p>
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
