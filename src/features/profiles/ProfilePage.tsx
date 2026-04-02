import { startTransition, useEffect, useMemo, useState, useTransition } from 'react';
import { ProfilePageSkeleton } from '../../components/LoadingSkeleton';
import { SelectField } from '../../components/SelectField';
import { api, type DistillPersonaResult, type Profile } from '../../lib/api';
import { useAppLocale } from '../../lib/appLocale';
import {
  clearStoredProfileRegeneration,
  ensureProfileRegeneration,
  getPendingProfileRegeneration,
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
  const [profileId, setProfileId] = useState(() => getStoredProfileId());
  const [profileDetail, setProfileDetail] = useState<Profile | null>(null);
  const [styleDraft, setStyleDraft] = useState('');
  const [isStyleCorrupted, setIsStyleCorrupted] = useState(false);
  const [isBootLoading, setIsBootLoading] = useState(true);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
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
  const hasDirtyChanges = styleDraft !== savedStyleValue;
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
    setIsStyleCorrupted(normalizedStyle.isLikelyCorrupted);
    setProfiles((currentProfiles) =>
      currentProfiles.map((currentProfile) =>
        currentProfile.slug === nextProfile.slug ? { ...currentProfile, ...nextProfile } : currentProfile
      )
    );
  }

  function applyDistillResult(result: DistillPersonaResult) {
    applyProfileDetail(result.profile);
    setRegenProgress(100);
    setFeedback(isRu ? 'Стиль перегенерирован.' : 'Channel style regenerated from source channels.');
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

        const storedProfileId = getStoredProfileId();
        const preferredProfileId =
          (storedProfileId && profileItems.some((profile) => profile.slug === storedProfileId) && storedProfileId)
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
    setError(null);

    api
      .getProfile(profileId)
      .then((profile) => {
        if (cancelled) {
          return;
        }

        applyProfileDetail(profile);
      })
      .catch((loadError: Error) => {
        if (!cancelled) {
          setError(loadError.message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsProfileLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [profileId]);

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

    const pendingJob = getPendingProfileRegeneration(profileId);
    let cancelled = false;
    let pollTimer = 0;

    if (pendingJob) {
      setIsRegenerating(true);
      setRegenStartedAt(pendingJob.startedAt);

      pendingJob.promise
        .then((result) => {
          if (cancelled || result.profile.slug !== profileId) {
            return;
          }

          clearStoredProfileRegeneration(profileId);
          applyDistillResult(result);
        })
        .catch((regenerateError) => {
          if (!cancelled) {
            clearStoredProfileRegeneration(profileId);
            setError(getRegenerationErrorMessage(regenerateError));
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsRegenerating(false);
            setRegenStartedAt(null);
          }
        });

      return () => {
        cancelled = true;
      };
    }

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

    const pollProfile = async () => {
      try {
        const profile = await api.getProfile(profileId);
        if (cancelled) {
          return;
        }

        const baselineUpdatedAt = storedRegeneration.baselineUpdatedAt;
        const isCompleted = baselineUpdatedAt
          ? profile.updatedAt !== baselineUpdatedAt
          : Boolean(String(profile.personaGuideMarkdown || '').trim());

        if (isCompleted) {
          clearStoredProfileRegeneration(profileId);
          applyProfileDetail(profile);
          setRegenProgress(100);
          setFeedback(isRu ? 'Стиль перегенерирован.' : 'Channel style regenerated from source channels.');
          setIsRegenerating(false);
          setRegenStartedAt(null);
          return;
        }

        if (Date.now() - storedRegeneration.startedAt > PROFILE_REGENERATION_TIMEOUT_MS) {
          clearStoredProfileRegeneration(profileId);
          setIsRegenerating(false);
          setRegenStartedAt(null);
        }
      } catch {
        if (!cancelled && Date.now() - storedRegeneration.startedAt > PROFILE_REGENERATION_TIMEOUT_MS) {
          clearStoredProfileRegeneration(profileId);
          setIsRegenerating(false);
          setRegenStartedAt(null);
        }
      }
    };

    void pollProfile();
    pollTimer = window.setInterval(() => {
      void pollProfile();
    }, 3000);

    return () => {
      cancelled = true;
      if (pollTimer) {
        window.clearInterval(pollTimer);
      }
    };
  }, [isRu, profileId, regenSyncNonce]);

  async function refreshProfile() {
    if (!profileId) {
      return;
    }

    setFeedback(null);
    setError(null);
    setIsProfileLoading(true);

    try {
      const profile = await api.getProfile(profileId);
      applyProfileDetail(profile);
      setFeedback(isRu ? 'Стиль загружен.' : 'Saved channel style reloaded.');
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : isRu
            ? 'Не удалось обновить профиль'
            : 'Failed to refresh profile'
      );
    } finally {
      setIsProfileLoading(false);
    }
  }

  function handleRegenerateStyle() {
    if (!profileId) {
      return;
    }

    setFeedback(null);
    setError(null);
    const pendingJob = ensureProfileRegeneration(profileId, 'sources');
    storeProfileRegeneration(profileId, pendingJob.startedAt, profileDetail?.updatedAt ?? null);
    setIsRegenerating(true);
    setRegenStartedAt(pendingJob.startedAt);
    setRegenSyncNonce((currentNonce) => currentNonce + 1);
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
          personaGuideMarkdown: styleDraft
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
        <details className="create-filter-drawer queue-filter-drawer" open>
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
            <div className="action-row action-row--wrap profile-actions-row">
              <button
                className="secondary-button secondary-button--small"
                type="button"
                disabled={isProfileLoading || isRegenerating || isSaving}
                onClick={refreshProfile}
              >
                {isRu ? 'Загрузить' : 'Reload saved'}
              </button>
              <button
                className="secondary-button secondary-button--small"
                type="button"
                disabled={isProfileLoading || isRegenerating || isSaving}
                onClick={handleRegenerateStyle}
              >
                {isRegenerating ? (isRu ? 'Генерируем...' : 'Regenerating...') : isRu ? 'Перегенерировать' : 'Regenerate style'}
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

            <div
              className={`context-section context-section--tight profile-editor-surface${isRegenerating ? ' profile-editor-surface--busy' : ''}`}
            >
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
                    ? 'Стиля пока нет. Нажми «Перегенерировать», чтобы собрать его из последних постов.'
                    : 'No channel style yet. Tap "Regenerate style" to build it from recent source posts.'
                }
                spellCheck
                value={styleDraft}
                onChange={(event) => setStyleDraft(event.target.value)}
              />
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

