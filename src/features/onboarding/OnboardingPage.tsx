import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  api,
  type OnboardingState,
  type SourceChannelOption,
  type SourcePreset,
  type WebSourceOption,
} from '../../lib/api';
import { useAppLocale } from '../../lib/appLocale';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSourceChannels(items: unknown[] | undefined): SourceChannelOption[] {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const username = String(item.username || '').trim().replace(/^@+/, '');
      if (!username) {
        return null;
      }

      return {
        username,
        title: String(item.title || item.name || username).trim() || username,
        name: String(item.name || item.title || username).trim() || username,
        usedForStyle: item.usedForStyle !== false,
        usedForMonitoring: item.usedForMonitoring !== false,
        origin: String(item.origin || '').trim() || undefined,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function normalizeWebSources(items: unknown[] | undefined): WebSourceOption[] {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const url = String(item.url || '').trim();
      if (!url) {
        return null;
      }

      return {
        url,
        title: String(item.title || url).trim() || url,
        sourceKind: String(item.sourceKind || 'website').trim() || 'website',
        origin: String(item.origin || '').trim() || undefined,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function matchesChannelQuery(option: SourceChannelOption, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return [option.username, option.title, option.name]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalizedQuery));
}

function matchesWebQuery(option: WebSourceOption, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return [option.url, option.title, option.sourceKind]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalizedQuery));
}

function getConfigValue(config: unknown, key: string) {
  return isRecord(config) ? config[key] : undefined;
}

function buildPresetMap(presets: SourcePreset[]) {
  return new Map(presets.map((preset) => [preset.key, preset]));
}

export function OnboardingPage() {
  const { language } = useAppLocale();
  const isRu = language === 'ru';
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryProfileId = String(searchParams.get('profileId') || '').trim();

  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [mode, setMode] = useState<'preset' | 'custom'>('preset');
  const [selectedPresetKey, setSelectedPresetKey] = useState('');
  const [includeTargetChannel, setIncludeTargetChannel] = useState(true);
  const [selectedChannelUsernames, setSelectedChannelUsernames] = useState<string[]>([]);
  const [selectedWebUrls, setSelectedWebUrls] = useState<string[]>([]);
  const [channelQuery, setChannelQuery] = useState('');
  const [webQuery, setWebQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const activeProfile = onboarding?.profile ?? null;
  const presetMap = useMemo(() => buildPresetMap(onboarding?.presets || []), [onboarding?.presets]);
  const currentStatus = String(activeProfile?.onboardingStatus || onboarding?.session?.status || 'awaiting_source_setup');
  const sourceChannels = useMemo(
    () => normalizeSourceChannels(activeProfile?.sourceChannels),
    [activeProfile?.sourceChannels]
  );
  const webSources = useMemo(
    () => normalizeWebSources(activeProfile?.webSources),
    [activeProfile?.webSources]
  );
  const filteredChannelCatalog = useMemo(
    () => (onboarding?.sourceChannelCatalog || []).filter((item) => matchesChannelQuery(item, channelQuery)),
    [channelQuery, onboarding?.sourceChannelCatalog]
  );
  const filteredWebCatalog = useMemo(
    () => (onboarding?.webSourceCatalog || []).filter((item) => matchesWebQuery(item, webQuery)),
    [onboarding?.webSourceCatalog, webQuery]
  );
  const selectedPreset = selectedPresetKey ? presetMap.get(selectedPresetKey) || null : null;

  function hydrateUi(nextState: OnboardingState) {
    const nextProfile = nextState.profile;
    const nextPresetKey = String(getConfigValue(nextProfile?.sourceChannelsConfig, 'presetKey') || '').trim();
    const nextMode = String(getConfigValue(nextProfile?.sourceChannelsConfig, 'mode') || '').trim() === 'custom'
      ? 'custom'
      : 'preset';
    const nextIncludeTarget = getConfigValue(nextProfile?.sourceChannelsConfig, 'includeTargetChannel');

    setMode(nextMode);
    setSelectedPresetKey(nextPresetKey || nextState.presets[0]?.key || '');
    setIncludeTargetChannel(nextIncludeTarget !== false);
    setSelectedChannelUsernames(
      normalizeSourceChannels(nextProfile?.sourceChannels).map((item) => item.username)
    );
    setSelectedWebUrls(
      normalizeWebSources(nextProfile?.webSources).map((item) => item.url)
    );
  }

  async function loadOnboarding(profileId = queryProfileId) {
    setIsLoading(true);
    setError(null);

    try {
      const nextState = await api.getOnboarding(profileId || undefined);
      setOnboarding(nextState);
      hydrateUi(nextState);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : isRu ? 'Не удалось загрузить onboarding' : 'Failed to load onboarding');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadOnboarding();
  }, [queryProfileId]);

  function toggleChannel(username: string) {
    setSelectedChannelUsernames((current) =>
      current.includes(username)
        ? current.filter((item) => item !== username)
        : [...current, username]
    );
  }

  function toggleWebSource(url: string) {
    setSelectedWebUrls((current) =>
      current.includes(url)
        ? current.filter((item) => item !== url)
        : [...current, url]
    );
  }

  async function handleApplyPreset() {
    if (!activeProfile?.slug || !selectedPresetKey) {
      return;
    }

    setIsSaving(true);
    setNotice(null);
    setError(null);

    try {
      await api.applyOnboardingPreset(activeProfile.slug, {
        presetKey: selectedPresetKey,
        includeTargetChannel,
      });
      await loadOnboarding(activeProfile.slug);
      setNotice(isRu ? 'Источники из пресета сохранены.' : 'Preset sources saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : isRu ? 'Не удалось сохранить пресет' : 'Failed to save preset');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveCustomSources() {
    if (!activeProfile?.slug) {
      return;
    }

    setIsSaving(true);
    setNotice(null);
    setError(null);

    try {
      const channels = (onboarding?.sourceChannelCatalog || [])
        .filter((item) => selectedChannelUsernames.includes(item.username))
        .map((item) => ({
          username: item.username,
          title: item.title || item.name || item.username,
          usedForStyle: true,
          usedForMonitoring: true,
        }));
      const selectedWebSources = (onboarding?.webSourceCatalog || [])
        .filter((item) => selectedWebUrls.includes(item.url))
        .map((item) => ({
          url: item.url,
          title: item.title || item.url,
          sourceKind: item.sourceKind || 'website',
        }));

      await api.saveOnboardingSources(activeProfile.slug, {
        channels,
        webSources: selectedWebSources,
        includeTargetChannel,
      });
      await loadOnboarding(activeProfile.slug);
      setNotice(isRu ? 'Кастомные источники сохранены.' : 'Custom sources saved.');
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : isRu
            ? 'Не удалось сохранить источники'
            : 'Failed to save sources'
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleGenerateStyle() {
    if (!activeProfile?.slug) {
      return;
    }

    setIsGenerating(true);
    setNotice(null);
    setError(null);

    try {
      await api.generateOnboardingStyle(activeProfile.slug);
      await loadOnboarding(activeProfile.slug);
      setNotice(isRu ? 'Стиль сгенерирован. Проверь результат и переходи к плану.' : 'Style generated. Review it and continue to the planner.');
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : isRu
            ? 'Не удалось сгенерировать стиль'
            : 'Failed to generate style'
      );
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleConfirmStyle() {
    if (!activeProfile?.slug) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await api.confirmOnboardingStyle(activeProfile.slug);
      navigate(`/onboarding-plan?profileId=${encodeURIComponent(activeProfile.slug)}`, { replace: true });
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : isRu ? 'Не удалось перейти к плану' : 'Failed to continue');
    } finally {
      setIsSaving(false);
    }
  }

  function handleOpenPlanner() {
    if (!activeProfile?.slug) {
      return;
    }

    navigate(`/onboarding-plan?profileId=${encodeURIComponent(activeProfile.slug)}`, { replace: true });
  }

  if (isLoading && !onboarding) {
    return <section className="page-stack"><div className="state-banner">{isRu ? 'Загружаем onboarding...' : 'Loading onboarding...'}</div></section>;
  }

  if (!activeProfile) {
    return (
      <section className="page-stack page-stack--onboarding">
        <section className="onboarding-hero">
          <span className="eyebrow">{isRu ? 'Регистрация' : 'Onboarding'}</span>
          <h2>{isRu ? 'Сначала выбери канал в боте' : 'Choose a channel in the bot first'}</h2>
          <p>
            {isRu
              ? 'Открой чат с ботом, нажми /start и выбери канал через системный Telegram picker.'
              : 'Open the bot chat, press /start, and select your target channel through the native Telegram picker.'}
          </p>
        </section>
      </section>
    );
  }

  return (
    <section className="page-stack page-stack--onboarding">
      <section className="onboarding-hero">
        <span className="eyebrow">{isRu ? 'Регистрация' : 'Onboarding'}</span>
        <h2>{isRu ? 'Подключаем новый канал' : 'Set up your new channel'}</h2>
        <p>
          {isRu
            ? 'Сначала собираем источники и стиль, потом мягко переводим тебя в план публикаций.'
            : 'First we prepare sources and channel style, then we move you into the planner.'}
        </p>
      </section>

      <section className="onboarding-summary-card">
        <div>
          <strong>{activeProfile.telegramChannelTitle || activeProfile.title}</strong>
          <p>
            {activeProfile.telegramChannelUsername
              ? `@${String(activeProfile.telegramChannelUsername).replace(/^@+/, '')}`
              : activeProfile.telegramChannelId || ''}
          </p>
        </div>
        <span className="onboarding-step-pill">{currentStatus}</span>
      </section>

      {error && <div className="state-banner state-banner--error">{error}</div>}
      {notice && <div className="state-banner state-banner--success">{notice}</div>}

      {(currentStatus === 'awaiting_source_setup' || currentStatus === 'awaiting_style_generation') && (
        <>
          <section className="onboarding-section">
            <div className="panel-heading panel-heading--tight">
              <div>
                <span className="eyebrow">{isRu ? 'Шаг 1' : 'Step 1'}</span>
                <h3>{isRu ? 'Выбери источник стиля' : 'Choose style sources'}</h3>
              </div>
            </div>

            <div className="onboarding-mode-switch">
              <button
                className={`secondary-button secondary-button--small${mode === 'preset' ? ' onboarding-chip--active' : ''}`}
                type="button"
                onClick={() => setMode('preset')}
              >
                {isRu ? 'Готовый пресет' : 'Preset'}
              </button>
              <button
                className={`secondary-button secondary-button--small${mode === 'custom' ? ' onboarding-chip--active' : ''}`}
                type="button"
                onClick={() => setMode('custom')}
              >
                {isRu ? 'Свои источники' : 'Custom sources'}
              </button>
            </div>

            <label className="toggle-row create-toggle-card onboarding-toggle-card">
              <input
                checked={includeTargetChannel}
                type="checkbox"
                onChange={(event) => setIncludeTargetChannel(event.target.checked)}
              />
              <span>
                {isRu
                  ? 'Использовать мой канал как один из источников стиля'
                  : 'Use my target channel as one of the style sources'}
              </span>
            </label>

            {mode === 'preset' ? (
              <div className="onboarding-preset-grid">
                {(onboarding?.presets || []).map((preset) => (
                  <button
                    className={`onboarding-preset-card${selectedPresetKey === preset.key ? ' onboarding-preset-card--active' : ''}`}
                    key={preset.key}
                    type="button"
                    onClick={() => setSelectedPresetKey(preset.key)}
                  >
                    <strong>{preset.title}</strong>
                    <p>{preset.description}</p>
                    <span>
                      {`${preset.channels.length} ${isRu ? 'каналов' : 'channels'} · ${preset.webSources.length} ${isRu ? 'сайтов' : 'sites'}`}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="onboarding-custom-grid">
                <div className="onboarding-catalog-panel">
                  <div className="panel-heading panel-heading--tight">
                    <div>
                      <span className="eyebrow">{isRu ? 'Каналы' : 'Channels'}</span>
                      <h3>{isRu ? 'Подбери Telegram-каналы' : 'Pick Telegram channels'}</h3>
                    </div>
                  </div>
                  <input
                    className="onboarding-search"
                    placeholder={isRu ? 'Поиск канала' : 'Search channel'}
                    value={channelQuery}
                    onChange={(event) => setChannelQuery(event.target.value)}
                  />
                  <div className="onboarding-catalog-list">
                    {filteredChannelCatalog.map((item) => {
                      const isSelected = selectedChannelUsernames.includes(item.username);
                      return (
                        <button
                          className={`onboarding-catalog-item${isSelected ? ' onboarding-catalog-item--active' : ''}`}
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
                </div>

                <div className="onboarding-catalog-panel">
                  <div className="panel-heading panel-heading--tight">
                    <div>
                      <span className="eyebrow">{isRu ? 'Web' : 'Web'}</span>
                      <h3>{isRu ? 'Добавь сайты' : 'Add websites'}</h3>
                    </div>
                  </div>
                  <input
                    className="onboarding-search"
                    placeholder={isRu ? 'Поиск сайта' : 'Search website'}
                    value={webQuery}
                    onChange={(event) => setWebQuery(event.target.value)}
                  />
                  <div className="onboarding-catalog-list">
                    {filteredWebCatalog.map((item) => {
                      const isSelected = selectedWebUrls.includes(item.url);
                      return (
                        <button
                          className={`onboarding-catalog-item${isSelected ? ' onboarding-catalog-item--active' : ''}`}
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
                </div>
              </div>
            )}

            <div className="action-row action-row--wrap">
              {mode === 'preset' ? (
                <button className="primary-button primary-button--create" disabled={isSaving || !selectedPresetKey} type="button" onClick={handleApplyPreset}>
                  {isSaving ? (isRu ? 'Сохраняем...' : 'Saving...') : isRu ? 'Применить пресет' : 'Apply preset'}
                </button>
              ) : (
                <button className="primary-button primary-button--create" disabled={isSaving} type="button" onClick={handleSaveCustomSources}>
                  {isSaving ? (isRu ? 'Сохраняем...' : 'Saving...') : isRu ? 'Сохранить свои источники' : 'Save custom sources'}
                </button>
              )}
            </div>
          </section>

          <section className="onboarding-section onboarding-section--summary">
            <div className="panel-heading panel-heading--tight">
              <div>
                <span className="eyebrow">{isRu ? 'Шаг 2' : 'Step 2'}</span>
                <h3>{isRu ? 'Сгенерируй стиль канала' : 'Generate channel style'}</h3>
              </div>
            </div>

            <div className="onboarding-source-summary">
              <div>
                <strong>{isRu ? 'Каналы' : 'Channels'}</strong>
                <p>{sourceChannels.length > 0 ? sourceChannels.map((item) => `@${item.username}`).join(', ') : isRu ? 'Пока не выбраны' : 'Nothing selected yet'}</p>
              </div>
              <div>
                <strong>{isRu ? 'Сайты' : 'Web sources'}</strong>
                <p>{webSources.length > 0 ? webSources.map((item) => item.title || item.url).join(', ') : isRu ? 'Пока не выбраны' : 'Nothing selected yet'}</p>
              </div>
            </div>

            <button className="primary-button primary-button--create" disabled={isGenerating || isSaving || (sourceChannels.length === 0 && webSources.length === 0 && !includeTargetChannel)} type="button" onClick={handleGenerateStyle}>
              {isGenerating ? (isRu ? 'Генерируем...' : 'Generating...') : isRu ? 'Сгенерировать стиль' : 'Generate style'}
            </button>
          </section>
        </>
      )}

      {(currentStatus === 'awaiting_style_review' || currentStatus === 'awaiting_schedule_setup' || currentStatus === 'completed') && (
        <section className="onboarding-section">
          <div className="panel-heading panel-heading--tight">
            <div>
              <span className="eyebrow">{isRu ? 'Шаг 3' : 'Step 3'}</span>
              <h3>{isRu ? 'Проверь стиль и переходи к плану' : 'Review the style and continue'}</h3>
            </div>
          </div>

          <textarea
            className="onboarding-style-preview"
            readOnly
            value={String(activeProfile.personaGuideMarkdown || '')}
          />

          <div className="action-row action-row--wrap">
            {currentStatus === 'awaiting_style_review' ? (
              <>
                <button className="secondary-button secondary-button--small" disabled={isGenerating} type="button" onClick={handleGenerateStyle}>
                  {isRu ? 'Перегенерировать' : 'Regenerate'}
                </button>
                <button className="primary-button primary-button--create" disabled={isSaving} type="button" onClick={handleConfirmStyle}>
                  {isSaving ? (isRu ? 'Переходим...' : 'Continuing...') : isRu ? 'Перейти к плану' : 'Continue to planner'}
                </button>
              </>
            ) : (
              <button className="primary-button primary-button--create" type="button" onClick={handleOpenPlanner}>
                {isRu ? 'Открыть план' : 'Open planner'}
              </button>
            )}
          </div>
        </section>
      )}

      {selectedPreset && mode === 'preset' && (
        <section className="onboarding-section onboarding-section--summary">
          <div className="panel-heading panel-heading--tight">
            <div>
              <span className="eyebrow">{isRu ? 'Превью' : 'Preview'}</span>
              <h3>{isRu ? 'Что войдет в пресет' : 'What this preset includes'}</h3>
            </div>
          </div>
          <div className="onboarding-source-summary">
            <div>
              <strong>{isRu ? 'Каналы' : 'Channels'}</strong>
              <p>{selectedPreset.channels.map((item) => `@${item.username}`).join(', ')}</p>
            </div>
            <div>
              <strong>{isRu ? 'Сайты' : 'Web sources'}</strong>
              <p>{selectedPreset.webSources.map((item) => item.title || item.url).join(', ')}</p>
            </div>
          </div>
        </section>
      )}
    </section>
  );
}
