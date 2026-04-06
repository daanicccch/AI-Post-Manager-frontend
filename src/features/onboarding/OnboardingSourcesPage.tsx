import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useAppLocale } from '../../lib/appLocale';
import { openTelegramLinkAndClose } from '../../lib/telegram';
import { buildOnboardingUrl, getConfigValue, normalizeSourceChannels, normalizeWebSources, useOnboardingData } from './onboardingShared';
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

type PresetPresentation = {
  description: string;
  category: string;
};

const PRESET_PRESENTATIONS: Array<{
  match: string;
  descriptionRu: string;
  descriptionEn: string;
  categoryRu: string;
  categoryEn: string;
}> = [
  {
    match: 'маркетинг и pr',
    descriptionRu: 'Идеи, кейсы, запуски и сильные ходы из мира брендов, коммуникаций и роста аудитории.',
    descriptionEn: 'Campaigns, case studies, launches, and standout moves from branding, communications, and audience growth.',
    categoryRu: 'Бренды и кейсы',
    categoryEn: 'Brands and cases',
  },
  {
    match: 'киберспорт',
    descriptionRu: 'Новости сцены, трансферы, матчи, инсайды и яркие сюжеты по Dota 2 и CS2.',
    descriptionEn: 'Scene news, roster moves, match stories, insider notes, and standout moments across Dota 2 and CS2.',
    categoryRu: 'Турниры и сцена',
    categoryEn: 'Tournaments and scene',
  },
  {
    match: 'новости медицины',
    descriptionRu: 'Важные медицинские открытия, исследования, практика врачей и апдейты здравоохранения без жёлтой подачи.',
    descriptionEn: 'Major medical discoveries, research updates, clinical practice insights, and healthcare changes without tabloid framing.',
    categoryRu: 'Наука и здоровье',
    categoryEn: 'Science and health',
  },
  {
    match: 'фондовый рынок',
    descriptionRu: 'Движения акций, отчёты компаний, секторы роста и понятный разбор рыночных трендов.',
    descriptionEn: 'Stock moves, earnings, sector shifts, and accessible breakdowns of market trends and catalysts.',
    categoryRu: 'Рынок и компании',
    categoryEn: 'Markets and companies',
  },
  {
    match: 'новости нейросет',
    descriptionRu: 'Запуски моделей, инструменты, апдейты лабораторий и практические сюжеты по AI.',
    descriptionEn: 'Model launches, new tools, lab updates, and practical AI stories worth repackaging for a broad audience.',
    categoryRu: 'Технологии и AI',
    categoryEn: 'Technology and AI',
  },
  {
    match: 'психология отношений',
    descriptionRu: 'Разбор сценариев в паре, эмоций, границ, привязанности и понятных советов без нравоучений.',
    descriptionEn: 'Relationship dynamics, emotions, boundaries, attachment patterns, and practical advice without a preachy tone.',
    categoryRu: 'Эмоции и границы',
    categoryEn: 'Emotions and boundaries',
  },
  {
    match: 'матрица судьбы',
    descriptionRu: 'Контент по матрице судьбы, числам, личным расшифровкам и вовлекающим интерпретациям.',
    descriptionEn: 'Destiny matrix, number meanings, personal readings, and engaging interpretations for numerology-driven content.',
    categoryRu: 'Символы и числа',
    categoryEn: 'Symbols and numbers',
  },
  {
    match: 'астрологические прогнозы',
    descriptionRu: 'Ежедневные и недельные прогнозы, аспекты, лунные сюжеты и мягкая эзотеричная подача.',
    descriptionEn: 'Daily and weekly forecasts, aspects, lunar stories, and a softer astrology editorial tone.',
    categoryRu: 'Прогнозы и ритмы',
    categoryEn: 'Forecasts and rhythms',
  },
  {
    match: 'личные финансы',
    descriptionRu: 'Бюджет, накопления, инвестиции, финансовые привычки и понятный тон без сложного жаргона.',
    descriptionEn: 'Budgeting, savings, investing, money habits, and practical finance explained without heavy jargon.',
    categoryRu: 'Деньги и привычки',
    categoryEn: 'Money and habits',
  },
];

function getPresetPresentation(
  title: string,
  description: string,
  isRu: boolean,
): PresetPresentation {
  const normalizedTitle = String(title || '').trim().toLowerCase();
  const matchedPreset = PRESET_PRESENTATIONS.find((preset) => normalizedTitle.includes(preset.match));

  if (matchedPreset) {
    return {
      description: String(description || '').trim() || (isRu ? matchedPreset.descriptionRu : matchedPreset.descriptionEn),
      category: isRu ? matchedPreset.categoryRu : matchedPreset.categoryEn,
    };
  }

  return {
    description: String(description || '').trim() || (isRu
      ? 'Подборка источников для быстрого старта канала в выбранной теме.'
      : 'A curated source pack to launch the channel faster in this niche.'),
    category: isRu ? 'Готовая подборка' : 'Curated pack',
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
    ? 'Каналы добавляются через Telegram-бота нативным пикером. Подходят публичные каналы с username.'
    : 'Channels are added in the Telegram bot using the native picker. Public channels with usernames are supported.';
  const websiteHint = isRu
    ? 'Сайты сохраняются как дополнительные источники.'
    : 'Websites are saved as additional sources.';

  const decoratedPresets = useMemo(
    () => presets.map((preset) => ({
      ...preset,
      presentation: getPresetPresentation(preset.title, preset.description, isRu),
    })),
    [isRu, presets],
  );

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
      openTelegramLinkAndClose(sourcePickerUrl);
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
        <div className="state-banner">{isRu ? 'Загружаем источники...' : 'Loading sources...'}</div>
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
        <h2 className="setup-header__title">{isRu ? 'Источники для канала' : 'Sources for your channel'}</h2>
        <div className="setup-header__description">
          <p>
            {isRu
              ? 'Выбери готовый пресет или задай свои источники вручную.'
              : 'Choose a preset or add your own sources manually.'}
          </p>
        </div>
      </section>

      {error && <div className="state-banner state-banner--error">{error}</div>}

      <section className="setup-panel setup-panel--fill setup-sources-panel">
        <div className="queue-control-card queue-control-card--profile setup-sources-card">
        <div className="setup-tabs">
          <button
            className={`secondary-button secondary-button--small${mode === 'preset' ? ' setup-choice-button--active' : ''}`}
            type="button"
            onClick={() => setMode('preset')}
          >
            {isRu ? 'Пресет' : 'Preset'}
          </button>
          <button
            className={`secondary-button secondary-button--small${mode === 'custom' ? ' setup-choice-button--active' : ''}`}
            type="button"
            onClick={() => setMode('custom')}
          >
            {isRu ? 'Свои источники' : 'Custom'}
          </button>
        </div>

        {mode === 'preset' ? (
          <div className="setup-preset-layout">
            <div className="setup-preset-grid" role="list">
              {decoratedPresets.map((preset) => (
              <button
                className={`setup-select-card setup-select-card--preset${selectedPresetKey === preset.key ? ' setup-select-card--active' : ''}`}
                key={preset.key}
                type="button"
                onClick={() => setSelectedPresetKey(preset.key)}
                style={preset.accentColor ? { ['--preset-accent' as string]: preset.accentColor } : undefined}
              >
                {selectedPresetKey === preset.key ? (
                  <span className="setup-select-card__topline">
                    <span className="setup-select-card__pill">
                      {isRu ? 'Выбран' : 'Selected'}
                    </span>
                  </span>
                ) : null}
                <strong>{preset.title}</strong>
                <p>{preset.presentation.description}</p>
                <span className="setup-select-card__accent" aria-hidden="true" />
              </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="setup-source-stack">
            <section className="context-section context-section--tight setup-source-section">
              <span className="setup-field-label">{isRu ? 'Каналы-источники' : 'Source channels'}</span>
              <p className="editor-help">{channelHint}</p>
              <button className="secondary-button secondary-button--small" type="button" onClick={handleOpenSourcePicker}>{isRu ? 'Добавить канал в боте' : 'Add channel in bot'}</button>
              <div className="setup-chip-list" aria-live="polite">
                {customChannels.map((item) => (
                  <span className="setup-chip" key={item.username}>
                    {item.title}
                    <button aria-label={isRu ? 'Удалить' : 'Remove'} type="button" onClick={() => removeChannel(item.username)}>&times;</button>
                  </span>
                ))}
              </div>
            </section>

            <section className="context-section context-section--tight setup-source-section">
              <span className="setup-field-label">{isRu ? 'Ссылка на сайт' : 'Website link'}</span>
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
                  {isRu ? 'Готово' : 'Add'}
                </button>
              </div>
              <div className="setup-chip-list" aria-live="polite">
                {customWebSources.map((item) => (
                  <span className="setup-chip" key={item.url}>
                    {item.title}
                    <button aria-label={isRu ? 'Удалить' : 'Remove'} type="button" onClick={() => removeWebsite(item.url)}>&times;</button>
                  </span>
                ))}
              </div>
            </section>
          </div>
        )}
        </div>
      </section>

      <OnboardingFooter
        backDisabled
        backLabel={isRu ? 'Назад' : 'Back'}
        continueLabel={
          isSaving
            ? (isRu ? 'Сохраняем...' : 'Saving...')
            : (isRu ? 'Продолжить' : 'Continue')
        }
        continueDisabled={isSaving || (mode === 'preset' && !selectedPresetKey)}
        onBack={() => {}}
        onContinue={mode === 'preset' ? handleApplyPreset : handleSaveCustomSources}
      />

    </section>
  );
}
