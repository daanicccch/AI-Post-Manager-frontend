import { startTransition, useEffect, useMemo, useState, useTransition } from 'react';
import { ProfilePageSkeleton } from '../../components/LoadingSkeleton';
import { PostFooterLinksEditor } from '../../components/PostFooterLinksEditor';
import { SelectField } from '../../components/SelectField';
import { api, type Profile, type ProfileSourceSettings } from '../../lib/api';
import { useAppLocale } from '../../lib/appLocale';
import { getConfigValue, normalizeSourceChannels, normalizeWebSources } from '../onboarding/onboardingShared';
import {
  buildSourceSettingsPayload,
  SourceSettingsEditor,
  type EditableSourceChannel,
  type EditableWebSource,
  type SourceSettingsMode,
} from '../sources/SourceSettingsEditor';
import {
  normalizePostFooterLinksConfig,
  serializePostFooterLinksConfig,
  type PostFooterLinksConfig,
} from '../../lib/postFooterLinks';
import {
  clearStoredProfileRegeneration,
  ensureProfileRegeneration,
  getStoredProfileRegeneration,
  storeProfileRegeneration,
} from './profileRegenerationTracker';

const PROFILE_STORAGE_KEY = 'channelbot.selected-profile-id';
const PROFILE_REGENERATION_TIMEOUT_MS = 10 * 60 * 1000;

function getStoredProfileId() {
  if (typeof window === 'undefined') {
    return '';
  }

  return String(window.localStorage.getItem(PROFILE_STORAGE_KEY) || '').trim();
}

function storeProfileId(profileId: string) {
  if (typeof window === 'undefined') {
    return;
  }

  const normalizedProfileId = String(profileId || '').trim();
  if (!normalizedProfileId) {
    window.localStorage.removeItem(PROFILE_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(PROFILE_STORAGE_KEY, normalizedProfileId);
}

function getRequestedProfileId() {
  if (typeof window === 'undefined') {
    return '';
  }

  return String(new URLSearchParams(window.location.search).get('profileId') || '').trim();
}

function toEditableSourceChannels(profile: Profile | null): EditableSourceChannel[] {
  return normalizeSourceChannels(profile?.sourceChannels)
    .filter((item) => item.origin !== 'target')
    .map((item) => ({
      username: item.username,
      title: item.title || item.username,
    }));
}

function toEditableWebSources(profile: Profile | null): EditableWebSource[] {
  return normalizeWebSources(profile?.webSources)
    .map((item) => ({
      url: item.url,
      title: item.title || item.url,
    }));
}

function getProfileSourceMode(profile: Profile | null): SourceSettingsMode {
  const configuredMode = String(getConfigValue(profile?.sourceChannelsConfig, 'mode') || '').trim();
  if (configuredMode === 'custom') {
    return 'custom';
  }
  if (configuredMode === 'preset') {
    return 'preset';
  }

  const configuredPresetKey = String(getConfigValue(profile?.sourceChannelsConfig, 'presetKey') || '').trim();
  const legacyCustomChannels = Array.isArray(getConfigValue(profile?.sourceChannelsConfig, 'channels'))
    || toEditableSourceChannels(profile).length > 0
    || toEditableWebSources(profile).length > 0;

  return configuredPresetKey || !legacyCustomChannels ? 'preset' : 'custom';
}

function getProfilePresetKey(profile: Profile | null, fallbackPresetKey = '') {
  return String(getConfigValue(profile?.sourceChannelsConfig, 'presetKey') || '').trim() || fallbackPresetKey;
}

function buildSourceSignature(
  mode: SourceSettingsMode,
  selectedPresetKey: string,
  customChannels: EditableSourceChannel[],
  customWebSources: EditableWebSource[],
) {
  return JSON.stringify({
    mode,
    presetKey: mode === 'preset' ? selectedPresetKey : '',
    channels: customChannels.map((item) => ({
      username: item.username,
      title: item.title,
    })),
    webSources: customWebSources.map((item) => ({
      url: item.url,
      title: item.title,
    })),
  });
}

function normalizeStyleValue(rawValue: string | null | undefined) {
  const nextValue = String(rawValue || '');
  const suspiciousChunks = nextValue.match(/\?{3,}/g) || [];
  const questionMarks = (nextValue.match(/\?/g) || []).length;
  const isLikelyCorrupted = suspiciousChunks.length >= 3 || questionMarks >= 40;

  return {
    value: isLikelyCorrupted ? '' : nextValue,
    isLikelyCorrupted
  };
}

export function ProfilePage() {
  const { language, setLanguage } = useAppLocale();
  const isRu = language === 'ru';
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState(() => getRequestedProfileId() || getStoredProfileId());
  const [profileDetail, setProfileDetail] = useState<Profile | null>(null);
  const [sourceSettings, setSourceSettings] = useState<ProfileSourceSettings | null>(null);
  const [sourceMode, setSourceMode] = useState<SourceSettingsMode>('preset');
  const [selectedSourcePresetKey, setSelectedSourcePresetKey] = useState('');
  const [customSourceChannels, setCustomSourceChannels] = useState<EditableSourceChannel[]>([]);
  const [customWebSources, setCustomWebSources] = useState<EditableWebSource[]>([]);
  const [sourceBaselineSignature, setSourceBaselineSignature] = useState('');
  const [styleDraft, setStyleDraft] = useState('');
  const [postFooterLinksDraft, setPostFooterLinksDraft] = useState<PostFooterLinksConfig>(() =>
    normalizePostFooterLinksConfig(null)
  );
  const [isStyleCorrupted, setIsStyleCorrupted] = useState(false);
  const [isBootLoading, setIsBootLoading] = useState(true);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isSourceLoading, setIsSourceLoading] = useState(false);
  const [isSourceSaving, setIsSourceSaving] = useState(false);
  const [sourceNeedsStyleRefresh, setSourceNeedsStyleRefresh] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenProgress, setRegenProgress] = useState(0);
  const [regenStartedAt, setRegenStartedAt] = useState<number | null>(null);
  const [regenSyncNonce, setRegenSyncNonce] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isProfilePending, startProfileTransition] = useTransition();

  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.slug === profileId) ?? profileDetail,
    [profileDetail, profileId, profiles]
  );

  const savedStyleValue = useMemo(
    () => normalizeStyleValue(profileDetail?.personaGuideMarkdown).value,
    [profileDetail?.personaGuideMarkdown]
  );
  const savedPostFooterLinksValue = useMemo(
    () => normalizePostFooterLinksConfig(profileDetail?.postFooterLinks),
    [profileDetail?.postFooterLinks]
  );
  const postFooterLinksDraftSignature = useMemo(
    () => serializePostFooterLinksConfig(postFooterLinksDraft),
    [postFooterLinksDraft]
  );
  const savedPostFooterLinksSignature = useMemo(
    () => serializePostFooterLinksConfig(savedPostFooterLinksValue),
    [savedPostFooterLinksValue]
  );
  const hasDirtyChanges = styleDraft !== savedStyleValue || postFooterLinksDraftSignature !== savedPostFooterLinksSignature;
  const sourceCurrentSignature = useMemo(
    () => buildSourceSignature(sourceMode, selectedSourcePresetKey, customSourceChannels, customWebSources),
    [customSourceChannels, customWebSources, selectedSourcePresetKey, sourceMode]
  );
  const hasSourceDirtyChanges = sourceCurrentSignature !== sourceBaselineSignature;
  const sourceChannelCount = normalizeSourceChannels(sourceSettings?.profile.sourceChannels).filter((item) => item.origin !== 'target').length;
  const webSourceCount = normalizeWebSources(sourceSettings?.profile.webSources).length;
  const sourceModeLabel = sourceMode === 'custom'
    ? (isRu ? '\u0421\u0432\u043e\u0438' : 'Custom')
    : (isRu ? '\u041f\u0440\u0435\u0441\u0435\u0442' : 'Preset');
  const regenRemainingMinutes = useMemo(() => {
    const remainingRatio = Math.max(0, 1 - regenProgress / 100);
    const estimatedSeconds = Math.max(15, Math.round(remainingRatio * 120));
    return Math.max(1, Math.ceil(estimatedSeconds / 60));
  }, [regenProgress]);
  const profileOptions = useMemo(
    () =>
      profiles.map((profile) => ({
        value: profile.slug,
        label: profile.title
      })),
    [profiles]
  );
  const channelStyleLabel = useMemo(
    () => (isRu ? '\u0421\u0442\u0438\u043b\u044c \u043a\u0430\u043d\u0430\u043b\u0430' : 'Channel style'),
    [isRu]
  );
  const styleSummary = useMemo(() => {
    const wordCount = styleDraft.trim() ? styleDraft.trim().split(/\s+/).length : 0;
    return wordCount > 0 ? `${wordCount} · Markdown` : 'Markdown';
  }, [styleDraft]);
  const languageOptions = useMemo(
    () => [
      { value: 'ru', label: 'Русский' },
      { value: 'en', label: 'English' }
    ],
    []
  );

  function applyProfileDetail(nextProfile: Profile) {
    const normalizedStyle = normalizeStyleValue(nextProfile.personaGuideMarkdown);
    setProfileDetail(nextProfile);
    setStyleDraft(normalizedStyle.value);
    setPostFooterLinksDraft(normalizePostFooterLinksConfig(nextProfile.postFooterLinks));
    setIsStyleCorrupted(normalizedStyle.isLikelyCorrupted);
    setProfiles((currentProfiles) =>
      currentProfiles.map((currentProfile) =>
        currentProfile.slug === nextProfile.slug ? { ...currentProfile, ...nextProfile } : currentProfile
      )
    );
  }

  function applySourceSettings(nextSettings: ProfileSourceSettings) {
    const nextProfile = nextSettings.profile;
    const nextMode = getProfileSourceMode(nextProfile);
    const nextPresetKey = getProfilePresetKey(nextProfile, nextSettings.presets[0]?.key || '');
    const nextChannels = toEditableSourceChannels(nextProfile);
    const nextWebSources = toEditableWebSources(nextProfile);

    setSourceSettings(nextSettings);
    setSourceMode(nextMode);
    setSelectedSourcePresetKey(nextPresetKey);
    setCustomSourceChannels(nextChannels);
    setCustomWebSources(nextWebSources);
    setSourceBaselineSignature(buildSourceSignature(nextMode, nextPresetKey, nextChannels, nextWebSources));
  }

  async function reloadSourceSettings(nextProfileId = profileId) {
    if (!nextProfileId) {
      return null;
    }

    setIsSourceLoading(true);
    try {
      const nextSettings = await api.getProfileSourceSettings(nextProfileId);
      applySourceSettings(nextSettings);
      return nextSettings;
    } finally {
      setIsSourceLoading(false);
    }
  }

  function getRegenerationErrorMessage(regenerateError: unknown) {
    if (regenerateError instanceof Error) {
      return regenerateError.message;
    }

    return isRu
      ? 'Не удалось перегенерировать стиль'
      : 'Failed to regenerate channel style';
  }

  useEffect(() => {
    let cancelled = false;
    setIsBootLoading(true);
    setError(null);

    api
      .listProfiles()
      .then((profileItems) => {
        if (cancelled) {
          return;
        }

        setProfiles(profileItems);

        const requestedProfileId = getRequestedProfileId();
        const storedProfileId = getStoredProfileId();
        const preferredProfileId =
          (requestedProfileId && profileItems.some((profile) => profile.slug === requestedProfileId) && requestedProfileId)
          || (storedProfileId && profileItems.some((profile) => profile.slug === storedProfileId) && storedProfileId)
          || (profileId && profileItems.some((profile) => profile.slug === profileId) && profileId)
          || profileItems[0]?.slug
          || '';

        if (preferredProfileId && preferredProfileId !== profileId) {
          startTransition(() => setProfileId(preferredProfileId));
        }
      })
      .catch((loadError: Error) => {
        if (!cancelled) {
          setError(loadError.message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsBootLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    storeProfileId(profileId);
  }, [profileId]);

  useEffect(() => {
    if (!profileId) {
      return;
    }

    let cancelled = false;
    setIsProfileLoading(true);
    setIsSourceLoading(true);
    setError(null);

    Promise.all([
      api.getProfile(profileId),
      api.getProfileSourceSettings(profileId),
    ])
      .then(([profile, nextSourceSettings]) => {
        if (cancelled) {
          return;
        }

        applyProfileDetail(profile);
        applySourceSettings(nextSourceSettings);
      })
      .catch((loadError: Error) => {
        if (!cancelled) {
          setError(loadError.message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsProfileLoading(false);
          setIsSourceLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [profileId]);

  useEffect(() => {
    if (!profileId || typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('sourcePickerReturn') !== '1') {
      return;
    }

    void api.acknowledgeProfileSourcePickerReturn(profileId)
      .then(() => reloadSourceSettings(profileId))
      .then(() => {
        setSourceNeedsStyleRefresh(true);
        setFeedback(isRu
          ? '\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a \u0434\u043e\u0431\u0430\u0432\u043b\u0435\u043d. \u041e\u0431\u043d\u043e\u0432\u0438 \u0441\u0442\u0438\u043b\u044c, \u0447\u0442\u043e\u0431\u044b \u0443\u0447\u0435\u0441\u0442\u044c \u0435\u0433\u043e.'
          : 'Source added. Update the style to include it.');
      })
      .catch((returnError: Error) => {
        setError(returnError.message);
      })
      .finally(() => {
        params.delete('sourcePickerReturn');
        const nextQuery = params.toString();
        window.history.replaceState({}, '', `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`);
      });
  }, [isRu, profileId]);

  useEffect(() => {
    if (!isRegenerating || !regenStartedAt) {
      setRegenProgress(0);
      return;
    }

    const durationMs = 240000;
    const getProgress = () => {
      const elapsed = Date.now() - regenStartedAt;
      return Math.min(92, 6 + (elapsed / durationMs) * 86);
    };

    setRegenProgress(getProgress());

    const intervalId = window.setInterval(() => {
      setRegenProgress(getProgress());
    }, 400);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isRegenerating, regenStartedAt]);

  useEffect(() => {
    if (!profileId) {
      setIsRegenerating(false);
      setRegenStartedAt(null);
      return;
    }

    let cancelled = false;
    let pollTimer = 0;
    let attempt = 0;

    const storedRegeneration = getStoredProfileRegeneration(profileId);
    if (!storedRegeneration) {
      setIsRegenerating(false);
      setRegenStartedAt(null);
      return;
    }

    if (Date.now() - storedRegeneration.startedAt > PROFILE_REGENERATION_TIMEOUT_MS) {
      clearStoredProfileRegeneration(profileId);
      setIsRegenerating(false);
      setRegenStartedAt(null);
      return;
    }

    setIsRegenerating(true);
    setRegenStartedAt(storedRegeneration.startedAt);

    const scheduleNextPoll = () => {
      const delays = [1500, 3000, 5000, 8000, 12000];
      const nextDelay = delays[Math.min(attempt, delays.length - 1)];
      attempt += 1;
      pollTimer = window.setTimeout(() => {
        void pollStatus();
      }, nextDelay);
    };

    const pollStatus = async () => {
      try {
        const status = await api.getPersonaDistillStatus(profileId);
        if (cancelled) {
          return;
        }

        if (status.status === 'completed') {
          const profile = await api.getProfile(profileId);
          if (cancelled) {
            return;
          }

          clearStoredProfileRegeneration(profileId);
          applyProfileDetail(profile);
          setRegenProgress(100);
          setFeedback(isRu ? 'Стиль перегенерирован.' : 'Channel style regenerated from source channels.');
          setIsRegenerating(false);
          setRegenStartedAt(null);
          return;
        }

        if (status.status === 'failed') {
          clearStoredProfileRegeneration(profileId);
          setIsRegenerating(false);
          setRegenStartedAt(null);
          setError(status.errorMessage || (isRu ? 'Не удалось перегенерировать стиль' : 'Failed to regenerate channel style'));
          return;
        }

        if (status.status === 'idle') {
          clearStoredProfileRegeneration(profileId);
          setIsRegenerating(false);
          setRegenStartedAt(null);
          return;
        }

        if (Date.now() - storedRegeneration.startedAt > PROFILE_REGENERATION_TIMEOUT_MS) {
          clearStoredProfileRegeneration(profileId);
          setIsRegenerating(false);
          setRegenStartedAt(null);
          return;
        }

        scheduleNextPoll();
      } catch (statusError) {
        if (!cancelled && Date.now() - storedRegeneration.startedAt > PROFILE_REGENERATION_TIMEOUT_MS) {
          clearStoredProfileRegeneration(profileId);
          setIsRegenerating(false);
          setRegenStartedAt(null);
          setError(getRegenerationErrorMessage(statusError));
          return;
        }

        if (!cancelled) {
          scheduleNextPoll();
        }
      }
    };

    void pollStatus();

    return () => {
      cancelled = true;
      if (pollTimer) {
        window.clearTimeout(pollTimer);
      }
    };
  }, [isRu, profileId, regenSyncNonce]);

  async function handleRegenerateStyle() {
    if (!profileId) {
      return;
    }

    setFeedback(null);
    setError(null);

    try {
      const job = await ensureProfileRegeneration(profileId, 'sources');
      storeProfileRegeneration(profileId, job.startedAt, job.jobId);
      setIsRegenerating(true);
      setSourceNeedsStyleRefresh(false);
      setRegenStartedAt(job.startedAt ? new Date(job.startedAt).getTime() : Date.now());
      setRegenSyncNonce((currentNonce) => currentNonce + 1);
    } catch (regenerateError) {
      setIsRegenerating(false);
      setRegenStartedAt(null);
      setError(getRegenerationErrorMessage(regenerateError));
    }
  }

  async function handleSaveSources() {
    if (!profileId) {
      return;
    }

    setFeedback(null);
    setError(null);
    setIsSourceSaving(true);

    try {
      if (sourceMode === 'preset') {
        await api.applyProfileSourcePreset(profileId, {
          presetKey: selectedSourcePresetKey,
          includeTargetChannel: false,
        });
      } else {
        const payload = buildSourceSettingsPayload(customSourceChannels, customWebSources);
        await api.saveProfileSources(profileId, {
          ...payload,
          includeTargetChannel: false,
        });
      }

      const nextSettings = await reloadSourceSettings(profileId);
      if (nextSettings?.profile) {
        applyProfileDetail(nextSettings.profile);
      }
      setSourceNeedsStyleRefresh(true);
      setFeedback(isRu
        ? '\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u044b. \u041e\u0431\u043d\u043e\u0432\u0438 \u0441\u0442\u0438\u043b\u044c, \u0447\u0442\u043e\u0431\u044b \u043d\u043e\u0432\u044b\u0435 \u043a\u0430\u043d\u0430\u043b\u044b \u0432\u043b\u0438\u044f\u043b\u0438 \u043d\u0430 \u043f\u043e\u0441\u0442\u044b.'
        : 'Sources saved. Update the style so the new channels shape future posts.');
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : isRu
            ? '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438'
            : 'Failed to save sources'
      );
    } finally {
      setIsSourceSaving(false);
    }
  }

  function handleSave() {
    if (!profileId) {
      return;
    }

    setFeedback(null);
    setError(null);
    setIsSaving(true);

    void (async () => {
      try {
        const result = await api.updateProfileAssets(profileId, {
          personaGuideMarkdown: styleDraft,
          postFooterLinks: postFooterLinksDraft
        });
        applyProfileDetail(result.profile);
        setFeedback(isRu ? 'Стиль сохранён.' : 'Channel style saved.');
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : isRu
              ? 'Не удалось сохранить стиль'
              : 'Failed to save channel style'
        );
      } finally {
        setIsSaving(false);
      }
    })();
  }

  if ((isBootLoading || isProfileLoading) && !activeProfile && !profileDetail) {
    return <ProfilePageSkeleton />;
  }

  return (
    <section className="page-stack page-stack--profile">
      <section className="queue-control-card queue-control-card--profile">
        <details className="create-filter-drawer queue-filter-drawer">
          <summary className="create-filter-drawer__summary">
            <span>{isRu ? 'Профиль' : 'Profile'}</span>
            <small>{activeProfile?.title || (isRu ? 'Профиль' : 'Profile')}</small>
          </summary>

          <div className="create-filter-drawer__content">
            <div className="create-form-grid create-form-grid--dual">
              <SelectField
                label={isRu ? 'Профиль' : 'Profile'}
                options={profileOptions}
                value={profileId}
                onChange={(nextValue) => {
                  setFeedback(null);
                  startProfileTransition(() => setProfileId(nextValue));
                }}
              />

              <SelectField
                label={isRu ? 'Язык интерфейса' : 'Interface language'}
                options={languageOptions}
                value={language}
                onChange={(nextValue) => setLanguage(nextValue as 'ru' | 'en')}
              />
            </div>
          </div>
        </details>
      </section>

      {error && <div className="state-banner state-banner--error">{error}</div>}
      {feedback && <div className="state-banner state-banner--success">{feedback}</div>}
      {(isBootLoading || isProfileLoading || isProfilePending) && (
        <div className="state-banner">{isRu ? 'Загружаем стиль канала...' : 'Loading channel style...'}</div>
      )}

      {activeProfile && profileDetail && (
        <div className="profile-layout profile-layout--single">
          <section className="editor-panel editor-panel--main editor-panel--profile">
            <details className="create-filter-drawer profile-source-drawer">
              <summary className="create-filter-drawer__summary">
                <span>{isRu ? '\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438' : 'Sources'}</span>
              </summary>

              <div className="create-filter-drawer__content profile-source-drawer__content">
                {isSourceLoading && !sourceSettings ? (
                  <div className="state-banner">{isRu ? '\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043c \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438...' : 'Loading sources...'}</div>
                ) : (
                  <SourceSettingsEditor
                    customChannels={customSourceChannels}
                    customWebSources={customWebSources}
                    disabled={isProfileLoading || isRegenerating}
                    isRu={isRu}
                    isSaving={isSourceSaving}
                    mode={sourceMode}
                    presets={sourceSettings?.presets || []}
                    saveDisabled={!hasSourceDirtyChanges}
                    saveLabel={isRu ? '\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438' : 'Save sources'}
                    savingLabel={isRu ? '\u0421\u043e\u0445\u0440\u0430\u043d\u044f\u0435\u043c...' : 'Saving...'}
                    selectedPresetKey={selectedSourcePresetKey}
                    sourcePickerUrl={sourceSettings?.sourcePickerUrl}
                    onCustomChannelsChange={setCustomSourceChannels}
                    onCustomWebSourcesChange={setCustomWebSources}
                    onModeChange={setSourceMode}
                    onSave={() => {
                      void handleSaveSources();
                    }}
                    onSelectedPresetKeyChange={setSelectedSourcePresetKey}
                  />
                )}

                {sourceNeedsStyleRefresh && !isRegenerating ? (
                  <div className="state-banner state-banner--info profile-source-refresh">
                    <span>
                      {isRu
                        ? '\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438 \u0443\u0436\u0435 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u044b. \u041e\u0431\u043d\u043e\u0432\u0438 \u0441\u0442\u0438\u043b\u044c, \u0447\u0442\u043e\u0431\u044b AI \u0443\u0447\u0435\u043b \u043d\u043e\u0432\u0443\u044e \u043f\u043e\u0434\u0431\u043e\u0440\u043a\u0443.'
                        : 'Sources are saved. Refresh the style so AI uses the new mix.'}
                    </span>
                    <button
                      className="primary-button primary-button--profile"
                      disabled={isProfileLoading || isRegenerating || isSaving}
                      type="button"
                      onClick={() => {
                        void handleRegenerateStyle();
                      }}
                    >
                      {isRu ? '\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u0441\u0442\u0438\u043b\u044c' : 'Update style'}
                    </button>
                  </div>
                ) : null}
              </div>
            </details>

            <div className="action-row action-row--wrap profile-actions-row">
              <button
                className="secondary-button secondary-button--small"
                type="button"
                disabled={isProfileLoading || isRegenerating || isSaving}
                onClick={() => {
                  void handleRegenerateStyle();
                }}
              >
                {isRegenerating ? (isRu ? 'Генерируем...' : 'Regenerating...') : isRu ? 'Обновить стиль' : 'Refresh style'}
              </button>
              <button
                className="primary-button primary-button--profile"
                disabled={!hasDirtyChanges || isSaving || isRegenerating}
                type="button"
                onClick={handleSave}
              >
                {isSaving ? (isRu ? 'Сохраняем...' : 'Saving...') : isRu ? 'Сохранить' : 'Save style'}
              </button>
            </div>

            {isRegenerating && (
              <div className="state-banner state-banner--info profile-busy-banner">
                <div className="profile-busy-copy">
                  <strong>{isRu ? 'Перегенерируем стиль...' : 'Rebuilding channel style...'}</strong>
                  <span>
                    {isRu
                      ? `Займёт пару минут. Осталось ~${regenRemainingMinutes} мин.`
                      : `Usually takes a few minutes. Estimated time left: about ${regenRemainingMinutes} min.`}
                  </span>
                </div>
                <div
                  aria-hidden="true"
                  className="profile-progress-bar"
                >
                  <span className="profile-progress-bar__fill" style={{ width: `${regenProgress}%` }} />
                </div>
              </div>
            )}

            {isStyleCorrupted && !isRegenerating && (
              <div className="state-banner state-banner--info">
                {isRu
                  ? 'Файл стиля выглядит сломанным. Перегенерируй, чтобы собрать чистую версию.'
                  : 'Saved style file looks broken for this channel. Regenerate it to rebuild a clean version.'}
              </div>
            )}

            <details className={`create-filter-drawer profile-style-drawer${isRegenerating ? ' profile-style-drawer--busy' : ''}`}>
              <summary className="create-filter-drawer__summary">
                <span>{channelStyleLabel}</span>
                <small>{styleSummary}</small>
              </summary>

              <div className="create-filter-drawer__content profile-style-drawer__content">
                <div className="editor-meta editor-meta--profile">
                  <div>
                  <h4>{isRu ? 'Стиль канала' : 'Channel style'}</h4>
                  <p>
                    {isRu
                      ? 'Markdown поддерживается. Здесь храним заметки о голосе и стиле канала.'
                      : 'Markdown supported. Keep only the editable channel voice and style notes here.'}
                  </p>
                </div>
              </div>

              <textarea
                aria-label={isRu ? 'Стиль канала' : 'Channel style'}
                className="draft-editor config-editor profile-style-editor"
                disabled={isRegenerating}
                placeholder={
                  isRu
                    ? 'Стиля пока нет. Нажми «Обновить стиль», чтобы собрать его из последних постов.'
                    : 'No channel style yet. Tap "Refresh style" to build it from recent source posts.'
                }
                spellCheck
                value={styleDraft}
                onChange={(event) => setStyleDraft(event.target.value)}
              />
              </div>
            </details>

            <div className="context-section context-section--tight profile-editor-surface">
              <PostFooterLinksEditor
                disabled={isProfileLoading || isRegenerating || isSaving}
                isRu={isRu}
                value={postFooterLinksDraft}
                onChange={setPostFooterLinksDraft}
              />
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

