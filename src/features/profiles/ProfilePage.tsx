import { startTransition, useEffect, useMemo, useState, useTransition } from 'react';
import { SelectField } from '../../components/SelectField';
import { api, type Profile } from '../../lib/api';
import { useAppLocale } from '../../lib/appLocale';

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
  const [profileId, setProfileId] = useState('');
  const [profileDetail, setProfileDetail] = useState<Profile | null>(null);
  const [styleDraft, setStyleDraft] = useState('');
  const [isStyleCorrupted, setIsStyleCorrupted] = useState(false);
  const [isBootLoading, setIsBootLoading] = useState(true);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenProgress, setRegenProgress] = useState(0);
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

        if (!profileId && profileItems[0]?.slug) {
          startTransition(() => setProfileId(profileItems[0].slug));
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

        const normalizedStyle = normalizeStyleValue(profile.personaGuideMarkdown);
        setProfileDetail(profile);
        setStyleDraft(normalizedStyle.value);
        setIsStyleCorrupted(normalizedStyle.isLikelyCorrupted);
        setProfiles((currentProfiles) =>
          currentProfiles.map((currentProfile) =>
            currentProfile.slug === profile.slug ? { ...currentProfile, ...profile } : currentProfile
          )
        );
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
    if (!isRegenerating) {
      setRegenProgress(0);
      return;
    }

    setRegenProgress(6);

    const startedAt = Date.now();
    const durationMs = 240000;
    const intervalId = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const nextProgress = Math.min(92, 6 + (elapsed / durationMs) * 86);
      setRegenProgress(nextProgress);
    }, 400);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isRegenerating]);

  async function refreshProfile() {
    if (!profileId) {
      return;
    }

    setFeedback(null);
    setError(null);
    setIsProfileLoading(true);

    try {
      const profile = await api.getProfile(profileId);
      const normalizedStyle = normalizeStyleValue(profile.personaGuideMarkdown);
      setProfileDetail(profile);
      setStyleDraft(normalizedStyle.value);
      setIsStyleCorrupted(normalizedStyle.isLikelyCorrupted);
      setProfiles((currentProfiles) =>
        currentProfiles.map((currentProfile) =>
          currentProfile.slug === profile.slug ? { ...currentProfile, ...profile } : currentProfile
        )
      );
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
    setIsRegenerating(true);

    void (async () => {
      try {
        const result = await api.distillPersona(profileId, { personaSource: 'sources' });
        const normalizedStyle = normalizeStyleValue(result.profile.personaGuideMarkdown);

        setProfileDetail(result.profile);
        setStyleDraft(normalizedStyle.value);
        setIsStyleCorrupted(normalizedStyle.isLikelyCorrupted);
        setProfiles((currentProfiles) =>
          currentProfiles.map((currentProfile) =>
            currentProfile.slug === result.profile.slug
              ? { ...currentProfile, ...result.profile }
              : currentProfile
          )
        );
        setRegenProgress(100);
        setFeedback(isRu ? 'Стиль перегенерирован.' : 'Channel style regenerated from source channels.');
      } catch (regenerateError) {
        setError(
          regenerateError instanceof Error
            ? regenerateError.message
            : isRu
              ? 'Не удалось перегенерировать стиль'
              : 'Failed to regenerate channel style'
        );
      } finally {
        setIsRegenerating(false);
      }
    })();
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
        const normalizedStyle = normalizeStyleValue(result.profile.personaGuideMarkdown);

        setProfileDetail(result.profile);
        setStyleDraft(normalizedStyle.value);
        setIsStyleCorrupted(normalizedStyle.isLikelyCorrupted);
        setProfiles((currentProfiles) =>
          currentProfiles.map((currentProfile) =>
            currentProfile.slug === result.profile.slug
              ? { ...currentProfile, ...result.profile }
              : currentProfile
          )
        );
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

