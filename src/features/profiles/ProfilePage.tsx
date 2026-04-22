import { useEffect, useMemo, useState, useTransition } from 'react';
import { ProfilePageSkeleton } from '../../components/LoadingSkeleton';
import { PostFooterLinksEditor } from '../../components/PostFooterLinksEditor';
import { SelectField } from '../../components/SelectField';
import { api, type Profile, type ProfileSourceSettings } from '../../lib/api';
import { useAppLocale } from '../../lib/appLocale';
import { configureTelegramBackButton } from '../../lib/telegram';
import { getConfigValue, normalizeSourceChannels, normalizeWebSources } from '../onboarding/onboardingShared';
import {
  buildSourceSettingsPayload,
  SourceSettingsEditor,
  type EditableSourceChannel,
  type EditableWebSource,
  type SourceSettingsMode,
} from '../sources/SourceSettingsEditor';
import {
  getVisiblePostFooterLinks,
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
const EXTRA_RULE_MAX_LENGTH = 500;
const PROFILE_SUBSCREEN_BODY_CLASS = 'profile-subscreen-open';

type ProfileSection = 'main' | 'style' | 'rules' | 'sources' | 'links' | 'language';

interface RuleEditorState {
  index: number | null;
  value: string;
}

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

function normalizeExtraRules(value: unknown): string[] {
  return (Array.isArray(value) ? value : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .map((item) => item.slice(0, EXTRA_RULE_MAX_LENGTH))
    .slice(0, 20);
}

function countLabel(count: number, forms: [string, string, string]) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return `${count} ${forms[0]}`;
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} ${forms[1]}`;
  }
  return `${count} ${forms[2]}`;
}

function getProfileAvatarUrl(profile: Profile | null) {
  const profileRecord = profile as (Profile & Record<string, unknown>) | null;
  const candidates = [
    profileRecord?.avatarUrl,
    profileRecord?.channelAvatarUrl,
    profileRecord?.channelPhotoUrl,
    profileRecord?.telegramChannelPhotoUrl,
    profileRecord?.telegramChannelAvatarUrl,
  ];
  const storedAvatarUrl = candidates.find((item): item is string => typeof item === 'string' && item.trim().length > 0)?.trim();
  if (storedAvatarUrl) {
    return storedAvatarUrl;
  }
  return '';
}

function getProfileHandle(profile: Profile | null) {
  const username = String(profile?.telegramChannelUsername || '').trim().replace(/^@+/, '');
  return username ? `@${username}` : String(profile?.slug || '').trim();
}

function getProfileInitials(profile: Profile | null) {
  const source = String(profile?.telegramChannelTitle || profile?.title || profile?.slug || 'CB').trim();
  const words = source.split(/\s+/).filter(Boolean);
  const initials = words.length > 1
    ? `${words[0]?.[0] || ''}${words[1]?.[0] || ''}`
    : source.slice(0, 2);
  return initials.toUpperCase();
}

function ProfileChannelAvatar({ profile }: { profile: Profile | null }) {
  const avatarUrl = getProfileAvatarUrl(profile);
  const initials = getProfileInitials(profile);
  const profileSlug = String(profile?.slug || '').trim();
  const [fetchedAvatarUrl, setFetchedAvatarUrl] = useState('');
  const [failedAvatarUrl, setFailedAvatarUrl] = useState('');

  useEffect(() => {
    setFailedAvatarUrl('');
  }, [avatarUrl]);

  useEffect(() => {
    if (avatarUrl || !profileSlug) {
      setFetchedAvatarUrl('');
      return undefined;
    }

    let objectUrl = '';
    let cancelled = false;
    void api.getProfileAvatar(profileSlug)
      .then((blob) => {
        if (cancelled || !blob || blob.size === 0) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setFetchedAvatarUrl(objectUrl);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      setFetchedAvatarUrl('');
    };
  }, [avatarUrl, profileSlug]);

  const resolvedAvatarUrl = avatarUrl || fetchedAvatarUrl;
  const shouldShowAvatar = resolvedAvatarUrl && failedAvatarUrl !== resolvedAvatarUrl;

  return (
    <span className="profile-mobile-avatar" aria-hidden="true">
      {shouldShowAvatar ? <img alt="" onError={() => setFailedAvatarUrl(resolvedAvatarUrl)} src={resolvedAvatarUrl} /> : <span>{initials}</span>}
    </span>
  );
}

function ProfileSettingIcon({ icon }: { icon: string }) {
  if (icon === 'style') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M4 20l4.3-1 9.9-9.9a2.1 2.1 0 0 0 0-3l-.3-.3a2.1 2.1 0 0 0-3 0L5 15.7 4 20Z" />
        <path d="M13.5 7.2l3.3 3.3" />
      </svg>
    );
  }

  if (icon === 'rules') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M8 6h11" />
        <path d="M8 12h11" />
        <path d="M8 18h11" />
        <path d="m3.5 6 1 1 2-2" />
        <path d="m3.5 12 1 1 2-2" />
        <path d="m3.5 18 1 1 2-2" />
      </svg>
    );
  }

  if (icon === 'sources') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M3.5 12h17" />
        <path d="M12 3a13 13 0 0 1 0 18" />
        <path d="M12 3a13 13 0 0 0 0 18" />
      </svg>
    );
  }

  if (icon === 'links') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M9.5 14.5 14.5 9.5" />
        <path d="M8.7 10.8 7.5 12a3.8 3.8 0 0 0 5.4 5.4l1.2-1.2" />
        <path d="M15.3 13.2 16.5 12a3.8 3.8 0 0 0-5.4-5.4L9.9 7.8" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 6h8" />
      <path d="M8 4v2c0 4-1.3 7-4 9" />
      <path d="M5 10c1.5 2.5 3.4 4.2 6 5" />
      <path d="M14 20l4-10 4 10" />
      <path d="M15.5 16h5" />
    </svg>
  );
}

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="profile-mobile-detail-head">
      <div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
    </header>
  );
}

function SettingRow({
  icon,
  title,
  value,
  onClick,
}: {
  icon: string;
  title: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button className="profile-mobile-row" onClick={onClick} type="button">
      <span aria-hidden="true" className={`profile-mobile-row__icon profile-mobile-row__icon--${icon}`}>
        <ProfileSettingIcon icon={icon} />
      </span>
      <span className="profile-mobile-row__copy">
        <strong>{title}</strong>
        <small>{value}</small>
      </span>
      <span aria-hidden="true" className="profile-mobile-row__chevron" />
    </button>
  );
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
  const [activeSection, setActiveSection] = useState<ProfileSection>('main');
  const [styleDraft, setStyleDraft] = useState('');
  const [extraRulesDraft, setExtraRulesDraft] = useState<string[]>([]);
  const [ruleEditor, setRuleEditor] = useState<RuleEditorState | null>(null);
  const [ruleActionIndex, setRuleActionIndex] = useState<number | null>(null);
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
  const savedExtraRulesValue = useMemo(
    () => normalizeExtraRules(profileDetail?.extraGenerationRules),
    [profileDetail?.extraGenerationRules]
  );
  const postFooterLinksDraftSignature = useMemo(
    () => serializePostFooterLinksConfig(postFooterLinksDraft),
    [postFooterLinksDraft]
  );
  const savedPostFooterLinksSignature = useMemo(
    () => serializePostFooterLinksConfig(savedPostFooterLinksValue),
    [savedPostFooterLinksValue]
  );
  const extraRulesDraftSignature = useMemo(
    () => JSON.stringify(extraRulesDraft),
    [extraRulesDraft]
  );
  const savedExtraRulesSignature = useMemo(
    () => JSON.stringify(savedExtraRulesValue),
    [savedExtraRulesValue]
  );
  const hasDirtyChanges = styleDraft !== savedStyleValue
    || postFooterLinksDraftSignature !== savedPostFooterLinksSignature
    || extraRulesDraftSignature !== savedExtraRulesSignature;
  const sourceCurrentSignature = useMemo(
    () => buildSourceSignature(sourceMode, selectedSourcePresetKey, customSourceChannels, customWebSources),
    [customSourceChannels, customWebSources, selectedSourcePresetKey, sourceMode]
  );
  const hasSourceDirtyChanges = sourceCurrentSignature !== sourceBaselineSignature;
  const sourceChannelCount = normalizeSourceChannels(sourceSettings?.profile.sourceChannels).filter((item) => item.origin !== 'target').length;
  const webSourceCount = normalizeWebSources(sourceSettings?.profile.webSources).length;
  const selectedSourcePresetTitle = useMemo(
    () => sourceSettings?.presets.find((preset) => preset.key === selectedSourcePresetKey)?.title || '',
    [selectedSourcePresetKey, sourceSettings?.presets]
  );
  const sourceModeLabel = sourceMode === 'custom'
    ? (isRu ? '\u0421\u0432\u043e\u0438' : 'Custom')
    : (selectedSourcePresetTitle || (isRu ? '\u041f\u0440\u0435\u0441\u0435\u0442' : 'Preset'));
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
      { value: 'ru', label: '\u0420\u0443\u0441\u0441\u043a\u0438\u0439' },
      { value: 'en', label: 'English' }
    ],
    []
  );

  const styleSummary = useMemo(() => {
    const wordCount = styleDraft.trim() ? styleDraft.trim().split(/\s+/).length : 0;
    if (wordCount === 0) {
      return isRu ? '\u041d\u0435 \u0437\u0430\u0434\u0430\u043d' : 'Not set';
    }
    return isRu ? `Markdown, ${countLabel(wordCount, ['\u0441\u043b\u043e\u0432\u043e', '\u0441\u043b\u043e\u0432\u0430', '\u0441\u043b\u043e\u0432'])}` : `Markdown, ${wordCount} words`;
  }, [isRu, styleDraft]);
  const rulesSummary = useMemo(() => {
    const count = extraRulesDraft.length;
    if (count === 0) {
      return isRu ? '\u041d\u0435 \u0437\u0430\u0434\u0430\u043d\u044b' : 'Not set';
    }
    return isRu ? countLabel(count, ['\u043f\u0440\u0430\u0432\u0438\u043b\u043e', '\u043f\u0440\u0430\u0432\u0438\u043b\u0430', '\u043f\u0440\u0430\u0432\u0438\u043b']) : `${count} rules`;
  }, [extraRulesDraft.length, isRu]);
  const sourceSummary = useMemo(() => {
    if (sourceMode === 'preset') {
      return selectedSourcePresetTitle || (isRu ? '\u041f\u0440\u0435\u0441\u0435\u0442' : 'Preset');
    }
    if (isRu) {
      return `${sourceModeLabel}: ${sourceChannelCount} \u043a\u0430\u043d., ${webSourceCount} \u0441\u0430\u0439\u0442.`;
    }
    return `${sourceModeLabel}: ${sourceChannelCount} channels, ${webSourceCount} sites`;
  }, [isRu, selectedSourcePresetTitle, sourceChannelCount, sourceMode, sourceModeLabel, webSourceCount]);
  const footerLinksSummary = useMemo(() => {
    const visibleCount = getVisiblePostFooterLinks(postFooterLinksDraft).length;
    if (!postFooterLinksDraft.enabled || visibleCount === 0) {
      return isRu ? '\u0412\u044b\u043a\u043b\u044e\u0447\u0435\u043d\u044b' : 'Off';
    }
    return isRu ? countLabel(visibleCount, ['\u0441\u0441\u044b\u043b\u043a\u0430', '\u0441\u0441\u044b\u043b\u043a\u0438', '\u0441\u0441\u044b\u043b\u043e\u043a']) : `${visibleCount} links`;
  }, [isRu, postFooterLinksDraft]);

  function applyProfileDetail(nextProfile: Profile) {
    const normalizedStyle = normalizeStyleValue(nextProfile.personaGuideMarkdown);
    setProfileDetail(nextProfile);
    setStyleDraft(normalizedStyle.value);
    setExtraRulesDraft(normalizeExtraRules(nextProfile.extraGenerationRules));
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
      ? '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u0435\u0440\u0435\u0433\u0435\u043d\u0435\u0440\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0441\u0442\u0438\u043b\u044c'
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
          startProfileTransition(() => setProfileId(preferredProfileId));
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
    if (typeof document === 'undefined') {
      return undefined;
    }

    document.body.classList.toggle(PROFILE_SUBSCREEN_BODY_CLASS, activeSection !== 'main');
    const cleanupBackButton = activeSection === 'main'
      ? configureTelegramBackButton()
      : configureTelegramBackButton(() => {
        if (ruleActionIndex !== null) {
          setRuleActionIndex(null);
          return;
        }
        if (ruleEditor) {
          setRuleEditor(null);
          return;
        }
        closeSection();
      });

    return () => {
      document.body.classList.remove(PROFILE_SUBSCREEN_BODY_CLASS);
      cleanupBackButton();
    };
  }, [activeSection, ruleActionIndex, ruleEditor]);

  useEffect(() => {
    if (!profileId) {
      return;
    }

    let cancelled = false;
    setIsProfileLoading(true);
    setIsSourceLoading(true);
    setError(null);
    setRuleEditor(null);
    setRuleActionIndex(null);
    setActiveSection('main');

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
          setFeedback(isRu ? '\u0421\u0442\u0438\u043b\u044c \u043f\u0435\u0440\u0435\u0433\u0435\u043d\u0435\u0440\u0438\u0440\u043e\u0432\u0430\u043d.' : 'Channel style regenerated from source channels.');
          setIsRegenerating(false);
          setRegenStartedAt(null);
          return;
        }

        if (status.status === 'failed') {
          clearStoredProfileRegeneration(profileId);
          setIsRegenerating(false);
          setRegenStartedAt(null);
          setError(status.errorMessage || (isRu ? '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u0435\u0440\u0435\u0433\u0435\u043d\u0435\u0440\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0441\u0442\u0438\u043b\u044c' : 'Failed to regenerate channel style'));
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
          postFooterLinks: postFooterLinksDraft,
          extraGenerationRules: extraRulesDraft,
        });
        applyProfileDetail(result.profile);
        setFeedback(isRu ? '\u041f\u0440\u043e\u0444\u0438\u043b\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0451\u043d.' : 'Profile saved.');
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : isRu
              ? '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u043f\u0440\u043e\u0444\u0438\u043b\u044c'
              : 'Failed to save profile'
        );
      } finally {
        setIsSaving(false);
      }
    })();
  }

  function closeSection() {
    setRuleEditor(null);
    setRuleActionIndex(null);
    setActiveSection('main');
  }

  function applySavedExtraRules(nextRules: string[]) {
    const normalizedRules = normalizeExtraRules(nextRules);
    setExtraRulesDraft(normalizedRules);
    setProfileDetail((currentProfile) =>
      currentProfile ? { ...currentProfile, extraGenerationRules: normalizedRules } : currentProfile
    );
    setProfiles((currentProfiles) =>
      currentProfiles.map((currentProfile) =>
        currentProfile.slug === profileId ? { ...currentProfile, extraGenerationRules: normalizedRules } : currentProfile
      )
    );
  }

  function persistExtraRules(nextRules: string[]) {
    if (!profileId) {
      return;
    }

    const normalizedRules = normalizeExtraRules(nextRules);
    setExtraRulesDraft(normalizedRules);
    setFeedback(null);
    setError(null);
    setIsSaving(true);

    void (async () => {
      try {
        const result = await api.updateProfileAssets(profileId, {
          extraGenerationRules: normalizedRules,
        });
        applySavedExtraRules(result.profile.extraGenerationRules ?? normalizedRules);
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : isRu
              ? '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0434\u043e\u043f. \u043f\u0440\u0430\u0432\u0438\u043b\u0430'
              : 'Failed to save extra rules'
        );
      } finally {
        setIsSaving(false);
      }
    })();
  }

  function saveRuleEditor() {
    if (!ruleEditor) {
      return;
    }
    const normalizedRule = ruleEditor.value.trim().slice(0, EXTRA_RULE_MAX_LENGTH);
    if (!normalizedRule) {
      setRuleEditor(null);
      setRuleActionIndex(null);
      return;
    }

    const nextRules = ruleEditor.index === null
      ? [...extraRulesDraft, normalizedRule].slice(0, 20)
      : extraRulesDraft.map((rule, index) => (index === ruleEditor.index ? normalizedRule : rule));
    persistExtraRules(nextRules);
    setRuleActionIndex(null);
    setRuleEditor(null);
  }

  function removeRule(indexToRemove: number) {
    persistExtraRules(extraRulesDraft.filter((_, index) => index !== indexToRemove));
    setRuleActionIndex(null);
  }

  if ((isBootLoading || isProfileLoading) && !activeProfile && !profileDetail) {
    return <ProfilePageSkeleton />;
  }

  const isBusy = isProfileLoading || isProfilePending;
  const mainTitle = isRu ? '\u041f\u0440\u043e\u0444\u0438\u043b\u044c' : 'Profile';

  function renderSaveBar() {
    if (!hasDirtyChanges || activeSection === 'main' || activeSection === 'sources' || activeSection === 'rules') {
      return null;
    }

    return (
      <div className="profile-mobile-savebar">
        <button className="secondary-button secondary-button--small" disabled={isSaving} onClick={() => applyProfileDetail(profileDetail as Profile)} type="button">
          {isRu ? '\u0421\u0431\u0440\u043e\u0441\u0438\u0442\u044c' : 'Reset'}
        </button>
        <button className="primary-button primary-button--profile" disabled={isSaving || isRegenerating} onClick={handleSave} type="button">
          {isSaving ? (isRu ? '\u0421\u043e\u0445\u0440\u0430\u043d\u044f\u0435\u043c...' : 'Saving...') : isRu ? '\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c' : 'Save'}
        </button>
      </div>
    );
  }

  function renderMain() {
    const profileHandle = getProfileHandle(activeProfile);

    return (
      <>
        <section className="profile-mobile-card profile-mobile-card--hero">
          <div className="profile-mobile-hero">
            <ProfileChannelAvatar profile={activeProfile} />
            <div className="profile-mobile-title">
              <div>
                <span>{mainTitle}</span>
                <h2>{activeProfile?.title || mainTitle}</h2>
                {profileHandle ? <small>{profileHandle}</small> : null}
              </div>
              <span className="profile-mobile-status">
                <i aria-hidden="true" />
                {isRu ? '\u041d\u0430\u0441\u0442\u0440\u043e\u0435\u043d' : 'Ready'}
              </span>
            </div>
          </div>
          <SelectField
            label={isRu ? '\u041a\u0430\u043d\u0430\u043b' : 'Channel'}
            options={profileOptions}
            value={profileId}
            onChange={(nextValue) => {
              setFeedback(null);
              startProfileTransition(() => setProfileId(nextValue));
            }}
          />
        </section>

        <section className="profile-mobile-list" aria-label={isRu ? '\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u043f\u0440\u043e\u0444\u0438\u043b\u044f' : 'Profile settings'}>
          <SettingRow icon="style" title={isRu ? '\u0421\u0442\u0438\u043b\u044c \u043a\u0430\u043d\u0430\u043b\u0430' : 'Channel style'} value={styleSummary} onClick={() => setActiveSection('style')} />
          <SettingRow icon="rules" title={isRu ? '\u0414\u043e\u043f. \u043f\u0440\u0430\u0432\u0438\u043b\u0430' : 'Extra rules'} value={rulesSummary} onClick={() => setActiveSection('rules')} />
          <SettingRow icon="sources" title={isRu ? '\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438' : 'Sources'} value={sourceSummary} onClick={() => setActiveSection('sources')} />
          <SettingRow icon="links" title={isRu ? '\u0421\u0441\u044b\u043b\u043a\u0438 \u043f\u043e\u0434 \u043f\u043e\u0441\u0442\u043e\u043c' : 'Post links'} value={footerLinksSummary} onClick={() => setActiveSection('links')} />
          <SettingRow icon="language" title={isRu ? '\u042f\u0437\u044b\u043a \u0438\u043d\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u0430' : 'Interface language'} value={languageOptions.find((item) => item.value === language)?.label || language} onClick={() => setActiveSection('language')} />
        </section>
      </>
    );
  }

  function renderStyle() {
    return (
      <>
        <SectionHeader
          title={isRu ? '\u0421\u0442\u0438\u043b\u044c \u043a\u0430\u043d\u0430\u043b\u0430' : 'Channel style'}
          subtitle={isRu ? '\u0411\u043e\u043b\u044c\u0448\u043e\u0439 markdown-\u0433\u0430\u0439\u0434 \u043e \u0433\u043e\u043b\u043e\u0441\u0435 \u043a\u0430\u043d\u0430\u043b\u0430.' : 'The main markdown guide for channel voice.'}
        />
        <div className="profile-mobile-card">
          <div className="profile-mobile-toolbar">
            <div className="profile-mobile-toolbar__copy">
              <strong>{isRu ? '\u0422\u0435\u043a\u0443\u0449\u0438\u0439 \u0441\u0442\u0438\u043b\u044c' : 'Current style'}</strong>
              <span>{styleSummary}</span>
            </div>
            <button
              className="secondary-button secondary-button--small"
              disabled={isProfileLoading || isRegenerating || isSaving}
              onClick={() => {
                void handleRegenerateStyle();
              }}
              type="button"
            >
              {isRegenerating ? (isRu ? '\u0413\u0435\u043d\u0435\u0440\u0438\u0440\u0443\u0435\u043c...' : 'Regenerating...') : isRu ? '\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u0441\u0442\u0438\u043b\u044c' : 'Refresh style'}
            </button>
          </div>
          {isRegenerating && (
            <div className="state-banner state-banner--info profile-busy-banner">
              <div className="profile-busy-copy">
                <strong>{isRu ? '\u041f\u0435\u0440\u0435\u0433\u0435\u043d\u0435\u0440\u0438\u0440\u0443\u0435\u043c \u0441\u0442\u0438\u043b\u044c...' : 'Rebuilding channel style...'}</strong>
                <span>
                  {isRu
                    ? `\u041e\u0441\u0442\u0430\u043b\u043e\u0441\u044c ~${regenRemainingMinutes} \u043c\u0438\u043d.`
                    : `Estimated time left: about ${regenRemainingMinutes} min.`}
                </span>
              </div>
              <div aria-hidden="true" className="profile-progress-bar">
                <span className="profile-progress-bar__fill" style={{ width: `${regenProgress}%` }} />
              </div>
            </div>
          )}
          {isStyleCorrupted && !isRegenerating && (
            <div className="state-banner state-banner--info">
              {isRu
                ? '\u0421\u0442\u0438\u043b\u044c \u0432\u044b\u0433\u043b\u044f\u0434\u0438\u0442 \u0441\u043b\u043e\u043c\u0430\u043d\u043d\u044b\u043c. \u041e\u0431\u043d\u043e\u0432\u0438 \u0435\u0433\u043e, \u0447\u0442\u043e\u0431\u044b \u0441\u043e\u0431\u0440\u0430\u0442\u044c \u0447\u0438\u0441\u0442\u0443\u044e \u0432\u0435\u0440\u0441\u0438\u044e.'
                : 'Saved style looks broken. Regenerate it to rebuild a clean version.'}
            </div>
          )}
          <textarea
            aria-label={isRu ? '\u0421\u0442\u0438\u043b\u044c \u043a\u0430\u043d\u0430\u043b\u0430' : 'Channel style'}
            className="draft-editor config-editor profile-mobile-textarea"
            disabled={isRegenerating}
            id="profile-channel-style"
            name="profileChannelStyle"
            placeholder={isRu ? '\u0421\u0442\u0438\u043b\u044f \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.' : 'No channel style yet.'}
            spellCheck
            value={styleDraft}
            onChange={(event) => setStyleDraft(event.target.value)}
          />
        </div>
      </>
    );
  }

  function renderRules() {
    if (ruleEditor) {
      return (
        <>
          <SectionHeader
            title={ruleEditor.index === null ? (isRu ? '\u041d\u043e\u0432\u043e\u0435 \u043f\u0440\u0430\u0432\u0438\u043b\u043e' : 'New rule') : (isRu ? '\u0414\u043e\u043f. \u043f\u0440\u0430\u0432\u0438\u043b\u043e' : 'Extra rule')}
            subtitle={isRu ? '\u0418\u0418 \u043f\u043e\u043b\u0443\u0447\u0438\u0442 \u044d\u0442\u043e \u043e\u0442\u0434\u0435\u043b\u044c\u043d\u044b\u043c \u0432\u0430\u0436\u043d\u044b\u043c \u0431\u043b\u043e\u043a\u043e\u043c.' : 'AI receives this as a separate important profile rule.'}
          />
          <div className="profile-mobile-card">
            <label className="field-block">
              <span>{isRu ? '\u041f\u0440\u0430\u0432\u0438\u043b\u043e' : 'Rule'}</span>
              <textarea
                className="draft-editor profile-rule-textarea"
                id="profile-extra-rule"
                maxLength={EXTRA_RULE_MAX_LENGTH}
                name="profileExtraRule"
                placeholder={isRu ? '\u041d\u0430\u043f\u0440\u0438\u043c\u0435\u0440: \u043d\u0435 \u043e\u0441\u0442\u0430\u0432\u043b\u044f\u0439 \u0441\u0441\u044b\u043b\u043a\u0443 \u043d\u0430 \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a \u0432 \u043a\u043e\u043d\u0446\u0435 \u043f\u043e\u0441\u0442\u0430' : 'Example: do not leave a source link at the end of the post'}
                value={ruleEditor.value}
                onChange={(event) => setRuleEditor((current) => current ? { ...current, value: event.target.value } : current)}
              />
            </label>
            <div className="profile-rule-counter">{ruleEditor.value.length}/{EXTRA_RULE_MAX_LENGTH}</div>
          </div>
          <div className="profile-mobile-savebar profile-mobile-savebar--static">
            <button className="secondary-button secondary-button--small" onClick={() => setRuleEditor(null)} type="button">
              {isRu ? '\u041e\u0442\u043c\u0435\u043d\u0430' : 'Cancel'}
            </button>
            <button className="primary-button primary-button--profile" disabled={!ruleEditor.value.trim() || isSaving} onClick={saveRuleEditor} type="button">
              {isRu ? '\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c' : 'Save'}
            </button>
          </div>
        </>
      );
    }

    return (
      <>
        <SectionHeader
          title={isRu ? '\u0414\u043e\u043f. \u043f\u0440\u0430\u0432\u0438\u043b\u0430' : 'Extra rules'}
          subtitle={isRu ? '\u041a\u043e\u0440\u043e\u0442\u043a\u0438\u0435 \u043f\u0440\u0430\u0432\u0438\u043b\u0430, \u043a\u043e\u0442\u043e\u0440\u044b\u0435 \u0440\u0430\u0431\u043e\u0442\u0430\u044e\u0442 \u043f\u043e\u0432\u0435\u0440\u0445 \u0441\u0442\u0438\u043b\u044f.' : 'Short rules applied on top of channel style.'}
        />
        <section className="profile-rules-screen">
          <div className="profile-rules-summary">
            <strong className="profile-rules-summary__count">{extraRulesDraft.length}</strong>
            <div className="profile-rules-summary__copy">
              <strong>{isRu ? '\u0410\u043a\u0442\u0438\u0432\u043d\u044b\u0435 \u043f\u0440\u0430\u0432\u0438\u043b\u0430' : 'Active rules'}</strong>
              <span>{isRu ? '\u0411\u0443\u0434\u0443\u0442 \u043f\u043e\u0434\u0441\u0432\u0435\u0447\u0435\u043d\u044b \u043e\u0442\u0434\u0435\u043b\u044c\u043d\u044b\u043c \u0431\u043b\u043e\u043a\u043e\u043c \u0432 \u043f\u0440\u043e\u043c\u043f\u0442\u0435' : 'Highlighted as a separate prompt block'}</span>
            </div>
            <button
              aria-label={isRu ? '\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u043f\u0440\u0430\u0432\u0438\u043b\u043e' : 'Add rule'}
              className="profile-rules-summary__add"
              disabled={extraRulesDraft.length >= 20}
              onClick={() => {
                setRuleActionIndex(null);
                setRuleEditor({ index: null, value: '' });
              }}
              type="button"
            >
              <span aria-hidden="true" />
            </button>
          </div>
          {extraRulesDraft.length === 0 ? (
            <div className="profile-mobile-empty">
              <strong>{isRu ? '\u041f\u0440\u0430\u0432\u0438\u043b \u043f\u043e\u043a\u0430 \u043d\u0435\u0442' : 'No rules yet'}</strong>
              <span>{isRu ? '\u0414\u043e\u0431\u0430\u0432\u044c \u0442\u043e, \u0447\u0442\u043e AI \u0434\u043e\u043b\u0436\u0435\u043d \u0443\u0447\u0438\u0442\u044b\u0432\u0430\u0442\u044c \u0432\u0441\u0435\u0433\u0434\u0430.' : 'Add what AI should always consider.'}</span>
            </div>
          ) : (
            extraRulesDraft.map((rule, index) => (
              <article className="profile-rule-card" key={`${rule}-${index}`}>
                <button
                  className="profile-rule-card__body"
                  onClick={() => {
                    setRuleActionIndex(null);
                    setRuleEditor({ index, value: rule });
                  }}
                  type="button"
                >
                  <span className="profile-rule-card__badge">{index + 1}</span>
                  <span className="profile-rule-card__copy">
                    <small>{isRu ? `\u041f\u0440\u0430\u0432\u0438\u043b\u043e ${index + 1}` : `Rule ${index + 1}`}</small>
                    <strong>{rule}</strong>
                  </span>
                </button>
                <button
                  aria-expanded={ruleActionIndex === index}
                  aria-label={isRu ? '\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044f \u043f\u0440\u0430\u0432\u0438\u043b\u0430' : 'Rule actions'}
                  className="profile-rule-card__menu"
                  onClick={() => setRuleActionIndex((currentIndex) => currentIndex === index ? null : index)}
                  type="button"
                >
                  <span aria-hidden="true" />
                  <span aria-hidden="true" />
                  <span aria-hidden="true" />
                </button>
                {ruleActionIndex === index ? (
                  <div className="profile-rule-actions" role="menu">
                    <button
                      onClick={() => {
                        setRuleActionIndex(null);
                        setRuleEditor({ index, value: rule });
                      }}
                      role="menuitem"
                      type="button"
                    >
                      {isRu ? '\u0420\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c' : 'Edit'}
                    </button>
                    <button className="profile-rule-actions__danger" onClick={() => removeRule(index)} role="menuitem" type="button">
                      {isRu ? '\u0423\u0434\u0430\u043b\u0438\u0442\u044c' : 'Delete'}
                    </button>
                  </div>
                ) : null}
              </article>
            ))
          )}
        </section>
      </>
    );
  }

  function renderSources() {
    return (
      <>
        <SectionHeader title={isRu ? '\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438' : 'Sources'} subtitle={sourceSummary} />
        <section className="profile-mobile-card">
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
              <span>{isRu ? '\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u044b. \u041e\u0431\u043d\u043e\u0432\u0438 \u0441\u0442\u0438\u043b\u044c, \u0447\u0442\u043e\u0431\u044b AI \u0443\u0447\u0435\u043b \u043d\u043e\u0432\u0443\u044e \u043f\u043e\u0434\u0431\u043e\u0440\u043a\u0443.' : 'Sources are saved. Refresh the style so AI uses the new mix.'}</span>
              <button className="primary-button primary-button--profile" disabled={isProfileLoading || isRegenerating || isSaving} onClick={() => { void handleRegenerateStyle(); }} type="button">
                {isRu ? '\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u0441\u0442\u0438\u043b\u044c' : 'Update style'}
              </button>
            </div>
          ) : null}
        </section>
      </>
    );
  }

  function renderLinks() {
    return (
      <>
        <SectionHeader title={isRu ? '\u0421\u0441\u044b\u043b\u043a\u0438 \u043f\u043e\u0434 \u043f\u043e\u0441\u0442\u043e\u043c' : 'Post links'} subtitle={footerLinksSummary} />
        <section className="profile-mobile-card">
          <PostFooterLinksEditor
            disabled={isProfileLoading || isRegenerating || isSaving}
            isRu={isRu}
            value={postFooterLinksDraft}
            onChange={setPostFooterLinksDraft}
          />
        </section>
      </>
    );
  }

  function renderLanguage() {
    return (
      <>
        <SectionHeader title={isRu ? '\u042f\u0437\u044b\u043a \u0438\u043d\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u0430' : 'Interface language'} />
        <section className="profile-mobile-card profile-language-list" role="radiogroup" aria-label={isRu ? '\u042f\u0437\u044b\u043a' : 'Language'}>
          {languageOptions.map((item) => {
            const isSelected = item.value === language;
            return (
              <button
                key={item.value}
                aria-checked={isSelected}
                className={`profile-language-option${isSelected ? ' profile-language-option--active' : ''}`}
                onClick={() => setLanguage(item.value as 'ru' | 'en')}
                role="radio"
                type="button"
              >
                <span>{item.label}</span>
                <i aria-hidden="true" />
              </button>
            );
          })}
        </section>
      </>
    );
  }

  return (
    <section className={`page-stack page-stack--profile profile-mobile profile-mobile--${activeSection}`}>
      {error && <div className="state-banner state-banner--error">{error}</div>}
      {feedback && <div className="state-banner state-banner--success">{feedback}</div>}
      {isBusy && <div className="state-banner">{isRu ? '\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043c \u043f\u0440\u043e\u0444\u0438\u043b\u044c...' : 'Loading profile...'}</div>}

      {activeProfile && profileDetail && (
        <>
          {activeSection === 'main' ? renderMain() : null}
          {activeSection === 'style' ? renderStyle() : null}
          {activeSection === 'rules' ? renderRules() : null}
          {activeSection === 'sources' ? renderSources() : null}
          {activeSection === 'links' ? renderLinks() : null}
          {activeSection === 'language' ? renderLanguage() : null}
          {renderSaveBar()}
        </>
      )}
    </section>
  );
}
