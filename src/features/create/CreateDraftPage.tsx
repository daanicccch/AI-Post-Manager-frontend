import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  api,
  getMediaPreviewUrl,
  type DraftDetail,
  type DraftMediaItem,
  type Profile,
  type SourcePost
} from '../../lib/api';
import { SelectField } from '../../components/SelectField';
import { useAppLocale } from '../../lib/appLocale';
import { formatCompactPostMeta, isImagePath, summarizeRichText } from '../../lib/formatters';
import {
  buildDraftMediaFromPaths,
  CreateMediaManager,
  normalizeMediaState
} from './CreateMediaManager';
import { CreatePageSkeleton, SourceListSkeleton } from '../../components/LoadingSkeleton';
import { useBusyOverlay } from '../../lib/busyOverlay';

const postTypeOptions = [
  { value: 'post', label: 'Post' },
  { value: 'alert', label: 'Alert' },
  { value: 'weekly', label: 'Weekly' }
] as const;

const SOURCE_POSTS_PAGE_SIZE = 5;
const sourceLookbackOptions = ['1', '3', '6', '12', '24', '48', '72', '168'];
const sourceLimitOptions = ['10', '20', '40', '80', '120'];

const creationModes = [
  {
    value: 'source_pool',
    label: 'Pool',
    title: 'Start from recent sources',
    description: 'Best for the normal daily flow. The app picks from recent sources for this profile.'
  },
  {
    value: 'source_post',
    label: 'Pick',
    title: 'Start from one chosen source',
    description: 'Best when you already know which scraped post should become the lead source.'
  },
  {
    value: 'manual_source',
    label: 'Manual',
    title: 'Paste a source manually',
    description: 'Best for reply or import flows when the source is not already in the store.'
  }
] as const;

function getDefaultSourcePoolWindow(postType: 'post' | 'alert' | 'weekly') {
  if (postType === 'weekly') {
    return { lookbackHours: 168, limit: 150 };
  }

  if (postType === 'alert') {
    return { lookbackHours: 24, limit: 80 };
  }

  return { lookbackHours: 48, limit: 80 };
}

function parseOptionalPositiveInt(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return Number.NaN;
  }

  return parsed;
}

function parseSourceLinks(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [labelPart, urlPart] = line.includes('|')
        ? line.split('|', 2).map((part) => part.trim())
        : [`Link ${index + 1}`, line];

      return {
        label: labelPart || `Link ${index + 1}`,
        url: urlPart || ''
      };
    });
}

function extractSourceLinks(sourcePost: SourcePost) {
  const links = (Array.isArray(sourcePost.entities) ? sourcePost.entities : [])
    .flatMap((entity, index) => {
      const url = typeof entity?.url === 'string' ? entity.url.trim() : '';
      if (!url) {
        return [];
      }

      return [{
        label: `Link ${index + 1}`,
        url
      }];
    });

  return links.filter((item, index, items) => items.findIndex((candidate) => candidate.url === item.url) === index);
}

function getSourcePostLabel(sourcePost: SourcePost) {
  if (sourcePost.telegramPostId) {
    return `post ${sourcePost.telegramPostId}`;
  }

  return `source ${sourcePost.id}`;
}

function normalizeTelegramChannel(value: string | null | undefined) {
  const normalized = String(value || '').trim().replace(/^@/, '');
  return /^[A-Za-z0-9_]{4,}$/.test(normalized) ? normalized : null;
}

function getTelegramEntityUrls(sourcePost: SourcePost) {
  return (Array.isArray(sourcePost.entities) ? sourcePost.entities : [])
    .flatMap((entity) => {
      const url = typeof entity?.url === 'string' ? entity.url.trim() : '';
      return url ? [url] : [];
    });
}

function getSourcePostUrl(sourcePost: SourcePost) {
  const entityUrls = getTelegramEntityUrls(sourcePost);
  const directPostUrl = entityUrls.find((url) => /^https?:\/\/t\.me\/[^/]+\/\d+/i.test(url));
  if (directPostUrl) {
    return directPostUrl;
  }

  const channel = normalizeTelegramChannel(sourcePost.sourceChannel);
  if (channel && sourcePost.telegramPostId) {
    return `https://t.me/${channel}/${sourcePost.telegramPostId}`;
  }

  return null;
}

function getSourcePreviewTitle(sourcePost: SourcePost) {
  const urls = [
    ...sourcePost.mediaPaths,
    ...getTelegramEntityUrls(sourcePost),
    sourcePost.text
  ].filter(Boolean);

  for (const item of urls) {
    const match = String(item).match(/t\.me\/nft\/([A-Za-z0-9_-]+)/i);
    if (match?.[1]) {
      return match[1].replace(/-/g, ' ');
    }
  }

  return sourcePost.sourceChannel || getSourcePostLabel(sourcePost);
}

function SourceVisual({
  sourcePost,
  onExpand
}: {
  sourcePost: SourcePost;
  onExpand?: (src: string, alt: string) => void;
}) {
  const previewUrl = getMediaPreviewUrl(sourcePost.mediaPreviewPath, sourcePost.mediaPreviewUrl);

  if (previewUrl && sourcePost.mediaPreviewPath && isImagePath(sourcePost.mediaPreviewPath)) {
    return (
      <button
        className="source-visual-button"
        type="button"
        onClick={() => onExpand?.(previewUrl, sourcePost.sourceChannel || 'Source preview')}
      >
        <img
          alt={sourcePost.sourceChannel}
          className="source-card__image"
          loading="lazy"
          src={previewUrl}
        />
      </button>
    );
  }

  return (
    <div className="source-fallback-visual" aria-hidden="true">
      <span className="source-fallback-visual__eyebrow">Source</span>
      <strong>{getSourcePreviewTitle(sourcePost)}</strong>
    </div>
  );
}

function getSourcePoolPresets(postType: 'post' | 'alert' | 'weekly') {
  if (postType === 'weekly') {
    return [
      { label: 'Recommended', helper: '7 days, 150 sources', lookbackHours: '', limit: '' },
      { label: 'Focused', helper: '5 days, 90 sources', lookbackHours: '120', limit: '90' },
      { label: 'Wide', helper: '10 days, 220 sources', lookbackHours: '240', limit: '220' }
    ];
  }

  if (postType === 'alert') {
    return [
      { label: 'Recommended', helper: '24 hours, 80 sources', lookbackHours: '', limit: '' },
      { label: 'Fast', helper: '12 hours, 40 sources', lookbackHours: '12', limit: '40' },
      { label: 'Wide', helper: '36 hours, 120 sources', lookbackHours: '36', limit: '120' }
    ];
  }

  return [
    { label: 'Recommended', helper: '48 hours, 80 sources', lookbackHours: '', limit: '' },
    { label: 'Focused', helper: '24 hours, 40 sources', lookbackHours: '24', limit: '40' },
    { label: 'Wide', helper: '72 hours, 120 sources', lookbackHours: '72', limit: '120' }
  ];
}

function formatCreateError(message: string, mode: 'source_pool' | 'source_post' | 'manual_source') {
  if (
    mode === 'source_pool' &&
    (message.includes('Source pool is empty') || message.includes('No recent source posts found'))
  ) {
    return 'No recent sources were found in the selected window. Try a larger lookback window or pick a specific source post.';
  }

  return message;
}

export function CreateDraftPage() {
  const { language } = useAppLocale();
  const isRu = language === 'ru';
  const navigate = useNavigate();
  const { hideBusyOverlay, showBusyOverlay } = useBusyOverlay();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState('');
  const [mode, setMode] = useState<'source_pool' | 'source_post' | 'manual_source'>('source_pool');
  const [postType, setPostType] = useState<'post' | 'alert' | 'weekly'>('post');
  const [lookbackHours, setLookbackHours] = useState('');
  const [limit, setLimit] = useState('');
  const [manualText, setManualText] = useState('');
  const channelTitle = 'manual';
  const channelKey = 'manual';
  const sourceTelegramPostId = '';
  const [sourceLinks, setSourceLinks] = useState('');
  const [sourcePosts, setSourcePosts] = useState<SourcePost[]>([]);
  const [sourceSearch, setSourceSearch] = useState('');
  const [sourceLookbackHours, setSourceLookbackHours] = useState('72');
  const [sourceLimit, setSourceLimit] = useState('20');
  const [sourceMediaOnly, setSourceMediaOnly] = useState(false);
  const [sourceRefreshNonce, setSourceRefreshNonce] = useState(0);
  const [selectedSourcePostId, setSelectedSourcePostId] = useState<number | null>(null);
  const [poolMediaDraft, setPoolMediaDraft] = useState<DraftMediaItem[]>([]);
  const [pickMediaDraft, setPickMediaDraft] = useState<DraftMediaItem[]>([]);
  const [manualMediaDraft, setManualMediaDraft] = useState<DraftMediaItem[]>([]);
  const [poolMediaOverrideEnabled, setPoolMediaOverrideEnabled] = useState(false);
  const [pickMediaOverrideEnabled, setPickMediaOverrideEnabled] = useState(false);
  const [manualMediaOverrideEnabled, setManualMediaOverrideEnabled] = useState(false);
  const [visibleSourceCount, setVisibleSourceCount] = useState(SOURCE_POSTS_PAGE_SIZE);
  const [creatingSourcePostId, setCreatingSourcePostId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSourceLoading, setIsSourceLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [expandedPreview, setExpandedPreview] = useState<{ src: string; alt: string } | null>(null);

  const deferredSourceSearch = useDeferredValue(sourceSearch);
  const selectedSourcePost = useMemo(
    () => sourcePosts.find((sourcePost) => sourcePost.id === selectedSourcePostId) ?? null,
    [selectedSourcePostId, sourcePosts]
  );
  const localizedPostTypeOptions = useMemo(
    () => postTypeOptions.map((option) => ({
      ...option,
      label:
        option.value === 'post'
          ? isRu ? 'Пост' : 'Post'
          : option.value === 'alert'
            ? isRu ? 'Алерт' : 'Alert'
            : isRu ? 'Недельный' : 'Weekly'
    })),
    [isRu]
  );
  const localizedCreationModes = useMemo(
    () => creationModes.map((item) => ({
      ...item,
      label:
        item.value === 'source_pool'
          ? isRu ? 'Пул' : 'Pool'
          : item.value === 'source_post'
            ? isRu ? 'Выбор' : 'Pick'
            : isRu ? 'Вручную' : 'Manual'
    })),
    [isRu]
  );
  const sourcePoolPresets = getSourcePoolPresets(postType);
  const showPoolWindowDetails = lookbackHours.trim() !== '' || limit.trim() !== '';
  const visibleSourcePosts = sourcePosts.slice(0, visibleSourceCount);
  const canShowMoreSources = visibleSourceCount < sourcePosts.length;
  const pickFilterSummary = [
    sourceLookbackHours === '168' ? (isRu ? '7 дней' : '7 days') : `${sourceLookbackHours}${isRu ? 'ч' : 'h'}`,
    `${sourceLimit} ${isRu ? 'постов' : 'posts'}`,
    sourceMediaOnly ? (isRu ? 'только медиа' : 'media only') : null
  ]
    .filter(Boolean)
    .join(' - ');
  const currentMediaDraft =
    mode === 'source_pool' ? poolMediaDraft : mode === 'source_post' ? pickMediaDraft : manualMediaDraft;
  const profileSelectOptions = useMemo(
    () =>
      profiles.map((profile) => ({
        value: profile.slug,
        label: profile.title
      })),
    [profiles]
  );
  const postTypeSelectOptions = useMemo(
    () =>
      localizedPostTypeOptions.map((option) => ({
        value: option.value,
        label: option.label
      })),
    [localizedPostTypeOptions]
  );
  const sourceLookbackSelectOptions = useMemo(
    () =>
      sourceLookbackOptions.map((option) => ({
        value: option,
        label: option === '168' ? '7 days' : `${option} hours`
      })),
    []
  );
  const sourceLimitSelectOptions = useMemo(
    () =>
      sourceLimitOptions.map((option) => ({
        value: option,
        label: `${option} posts`
      })),
    []
  );

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    api
      .listProfiles()
      .then((items) => {
        if (cancelled) return;
        setProfiles(items);

        if (!profileId && items[0]?.slug) {
          startTransition(() => setProfileId(items[0].slug));
        }
      })
      .catch((loadError: Error) => {
        if (!cancelled) {
          setError(loadError.message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (mode !== 'source_post' || !profileId) {
      return;
    }

    let cancelled = false;
    setIsSourceLoading(true);

    const parsedLookbackHours = parseOptionalPositiveInt(sourceLookbackHours);
    const parsedLimit = parseOptionalPositiveInt(sourceLimit);

    api
      .listSourcePosts(profileId, {
        lookbackHours: Number.isNaN(parsedLookbackHours) ? undefined : parsedLookbackHours,
        limit: Number.isNaN(parsedLimit) ? undefined : parsedLimit ?? 20,
        search: deferredSourceSearch.trim() || undefined,
        mediaOnly: sourceMediaOnly,
        refresh: sourceRefreshNonce > 0
      })
      .then((items) => {
        if (!cancelled) {
          setSourcePosts(items);
          setSelectedSourcePostId((currentId) =>
            items.some((sourcePost) => sourcePost.id === currentId) ? currentId : (items[0]?.id ?? null)
          );
          if (sourceRefreshNonce > 0) {
            setSourceRefreshNonce(0);
          }
        }
      })
      .catch((loadError: Error) => {
        if (!cancelled) {
          setError(loadError.message);
          if (sourceRefreshNonce > 0) {
            setSourceRefreshNonce(0);
          }
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsSourceLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [deferredSourceSearch, mode, profileId, sourceLimit, sourceLookbackHours, sourceMediaOnly, sourceRefreshNonce]);

  useEffect(() => {
    if (mode !== 'source_post') {
      return;
    }

    setVisibleSourceCount(SOURCE_POSTS_PAGE_SIZE);
  }, [mode, profileId, deferredSourceSearch, sourceLimit, sourceLookbackHours, sourceMediaOnly]);

  useEffect(() => {
    if (!selectedSourcePost) {
      setPickMediaDraft([]);
      setPickMediaOverrideEnabled(false);
      return;
    }

    setPickMediaDraft(buildDraftMediaFromPaths(selectedSourcePost.mediaPaths || []));
    setPickMediaOverrideEnabled((selectedSourcePost.mediaPaths || []).length > 0);
  }, [selectedSourcePost]);

  function getCurrentMediaPaths() {
    return normalizeMediaState(currentMediaDraft)
      .map((item) => item.path)
      .filter((path): path is string => Boolean(path));
  }

  async function persistCreatedDraftMedia(draft: DraftDetail, nextMediaPaths: string[], shouldOverride: boolean) {
    if (!shouldOverride) {
      return draft;
    }

    const normalizedNextMedia = buildDraftMediaFromPaths(nextMediaPaths);
    const currentDraftSignature = JSON.stringify(normalizeMediaState(draft.media || []));
    const nextDraftSignature = JSON.stringify(normalizedNextMedia);

    if (currentDraftSignature === nextDraftSignature) {
      return draft;
    }

    await api.saveDraft(draft.id, {
      text: draft.text,
      mediaState: normalizedNextMedia,
      sourceState: draft.sourceState
    });

    return {
      ...draft,
      media: normalizedNextMedia
    };
  }

  function handleCreate() {
    if (!profileId) {
      setError(isRu ? 'Сначала выберите профиль.' : 'Choose a profile first.');
      return;
    }

    setError(null);
    setNotice(null);
    setIsCreating(true);
    showBusyOverlay({
      caption: isRu ? 'Генерация поста' : 'Draft generation',
      title: isRu ? 'Собираем черновик' : 'Building the draft',
      message: isRu
        ? 'Держим экран занятым, пока собираем текст и материалы. Как только всё будет готово, сразу откроем ревью.'
        : 'Keeping the workspace locked while text and source materials are prepared. Review opens automatically when the draft is ready.'
    });

    void (async () => {
      try {
        const currentMediaPaths = getCurrentMediaPaths();

        if (mode === 'source_pool') {
          const parsedLookback = parseOptionalPositiveInt(lookbackHours);
          const parsedLimit = parseOptionalPositiveInt(limit);
          const hasOverride = lookbackHours.trim() !== '' || limit.trim() !== '';
          const defaults = getDefaultSourcePoolWindow(postType);

          if (Number.isNaN(parsedLookback)) {
            throw new Error('Lookback hours must be a positive integer.');
          }

          if (Number.isNaN(parsedLimit)) {
            throw new Error('Limit must be a positive integer.');
          }

          const createdDraft = await api.generateDraft(profileId, {
            type: postType,
            lookbackHours: hasOverride ? (parsedLookback ?? defaults.lookbackHours) : undefined,
            limit: hasOverride ? (parsedLimit ?? defaults.limit) : undefined
          });
          const draft = await persistCreatedDraftMedia(
            createdDraft,
            currentMediaPaths,
            poolMediaOverrideEnabled
          );

          hideBusyOverlay();
          setNotice(isRu ? 'Черновик создан из пула источников.' : 'Draft created from the source pool.');
          navigate(`/drafts/${draft.id}`);
          return;
        }

        if (!manualText.trim() && !(manualMediaOverrideEnabled && currentMediaPaths.length > 0)) {
          throw new Error('Add source text or attach at least one media file.');
        }

        const parsedTelegramPostId = parseOptionalPositiveInt(sourceTelegramPostId);
        if (Number.isNaN(parsedTelegramPostId)) {
          throw new Error('Source Telegram post id must be a positive integer.');
        }

        const parsedLinks = parseSourceLinks(sourceLinks);
        for (const item of parsedLinks) {
          try {
            new URL(item.url);
          } catch {
            throw new Error(`Invalid URL in source links: ${item.url}`);
          }
        }

        const createdDraft = await api.generateDraftFromSource(profileId, {
          type: postType,
          text: manualText.trim(),
          channelTitle: channelTitle.trim() || 'manual',
          channelKey: channelKey.trim() || 'manual',
          sourceTelegramPostId: parsedTelegramPostId,
          sourceLinks: parsedLinks,
          mediaPaths: manualMediaOverrideEnabled ? currentMediaPaths : []
        });
        const draft = await persistCreatedDraftMedia(
          createdDraft,
          currentMediaPaths,
          manualMediaOverrideEnabled
        );

        hideBusyOverlay();
        setNotice(isRu ? 'Черновик создан из ручного источника.' : 'Draft created from the manual source.');
        navigate(`/drafts/${draft.id}`);
      } catch (createError) {
        setError(
          createError instanceof Error
            ? formatCreateError(createError.message, mode)
            : isRu
              ? 'Не удалось создать черновик.'
              : 'Failed to create draft'
        );
      } finally {
        hideBusyOverlay();
        setIsCreating(false);
      }
    })();
  }

  function handleCreateFromSourcePost(sourcePost: SourcePost) {
    if (!profileId) {
      setError(isRu ? 'Сначала выберите профиль.' : 'Choose a profile first.');
      return;
    }

    setError(null);
    setNotice(null);
    setCreatingSourcePostId(sourcePost.id);
    setIsCreating(true);
    showBusyOverlay({
      caption: isRu ? 'Выбранный источник' : 'Selected source',
      title: isRu ? 'Готовим черновик' : 'Preparing the draft',
      message: isRu
        ? 'Собираем пост из выбранного источника и сразу переведём вас в ревью, когда версия будет готова.'
        : 'Preparing the post from the chosen source and switching to review as soon as the version is ready.'
    });

    void (async () => {
      try {
        const currentMediaPaths = normalizeMediaState(pickMediaDraft)
          .map((item) => item.path)
          .filter((path): path is string => Boolean(path));

        const createdDraft = await api.generateDraftFromSource(profileId, {
          type: postType,
          text: sourcePost.text,
          channelTitle: sourcePost.sourceChannel,
          channelKey: sourcePost.sourceChannel,
          sourceTelegramPostId: sourcePost.telegramPostId,
          sourceLinks: extractSourceLinks(sourcePost),
          mediaPaths: pickMediaOverrideEnabled ? currentMediaPaths : sourcePost.mediaPaths
        });
        const draft = await persistCreatedDraftMedia(
          createdDraft,
          currentMediaPaths,
          pickMediaOverrideEnabled
        );

        hideBusyOverlay();
        setNotice(isRu ? 'Черновик создан из выбранного источника.' : 'Draft created from the selected source.');
        navigate(`/drafts/${draft.id}`);
      } catch (createError) {
        setError(
          createError instanceof Error
            ? formatCreateError(createError.message, mode)
            : isRu
              ? 'Не удалось создать черновик из выбранного источника.'
              : 'Failed to create draft from source post'
        );
      } finally {
        hideBusyOverlay();
        setCreatingSourcePostId(null);
        setIsCreating(false);
      }
    })();
  }

  function renderMediaManager() {
    return (
      <CreateMediaManager
        description=""
        emptyText={
          isRu
            ? 'Добавьте изображения или видео только если черновик должен выйти с вашими собственными медиа.'
            : 'Add images or video only if this draft should go out with your own media.'
        }
        items={manualMediaDraft}
        overrideEnabled={manualMediaOverrideEnabled}
        title={isRu ? 'Вложения' : 'Attachments'}
        onError={setError}
        onNotice={setNotice}
        onReset={() => {
          setManualMediaDraft([]);
          setManualMediaOverrideEnabled(false);
        }}
        setItems={setManualMediaDraft}
        setOverrideEnabled={setManualMediaOverrideEnabled}
      />
    );
  }

  if (isLoading && profiles.length === 0) {
    return <CreatePageSkeleton />;
  }

  return (
    <section className="page-stack page-stack--create">
      <section className="editor-panel editor-panel--main create-flow">
        <div className="create-compact-stack">
          <section className="create-compact-block create-flow-step create-flow-step--setup">
            <div className="create-compact-head create-flow-step__head create-flow-step__head--compact">
              <div>
                <span className="eyebrow">{isRu ? 'Настройка' : 'Setup'}</span>
              </div>
            </div>

            <div className="create-form-grid create-form-grid--compact">
              <SelectField
                label={isRu ? 'Профиль' : 'Profile'}
                options={profileSelectOptions}
                value={profileId}
                onChange={setProfileId}
              />

              <SelectField
                label={isRu ? 'Тип' : 'Type'}
                options={postTypeSelectOptions}
                value={postType}
                onChange={(nextValue) => setPostType(nextValue as 'post' | 'alert' | 'weekly')}
              />
            </div>

          </section>

          <section className="create-compact-block create-compact-block--surface create-flow-step">
            <div className="create-compact-head create-flow-step__head create-flow-step__head--compact">
              <div>
                <span className="eyebrow">{isRu ? 'Режим старта' : 'Start mode'}</span>
              </div>
            </div>

            <div className="create-mode-choices" role="tablist" aria-label={isRu ? 'Режим создания' : 'Create mode'}>
              {localizedCreationModes.map((item) => (
                <button
                  key={item.value}
                  aria-selected={mode === item.value}
                  className={`create-mode-choice${mode === item.value ? ' create-mode-choice--active' : ''}`}
                  type="button"
                  onClick={() => setMode(item.value)}
                >
                  <span>{item.label}</span>
                </button>
                ))}
              </div>

            {mode === 'source_pool' && (
              <div className="context-section context-section--tight create-selected-panel">
                <div className="create-preset-row">
                  {sourcePoolPresets.map((preset) => (
                    <button
                      key={preset.label}
                      className={`create-preset-chip${
                        lookbackHours === preset.lookbackHours && limit === preset.limit ? ' mode-card--active' : ''
                      }`}
                      type="button"
                      onClick={() => {
                        setLookbackHours(preset.lookbackHours);
                        setLimit(preset.limit);
                      }}
                    >
                      <strong>
                        {isRu
                          ? (
                              preset.label === 'Recommended'
                                ? 'Рекомендовано'
                                : preset.label === 'Focused'
                                  ? 'Фокус'
                                  : preset.label === 'Fast'
                                    ? 'Быстро'
                                    : preset.label === 'Wide'
                                      ? 'Широко'
                                      : preset.label
                            )
                          : preset.label}
                      </strong>
                      <p>
                        {isRu
                          ? preset.helper
                              .replace(' days', ' дней')
                              .replace(' day', ' день')
                              .replace(' hours', ' часов')
                              .replace(' hour', ' час')
                              .replace(' sources', ' источников')
                          : preset.helper}
                      </p>
                    </button>
                  ))}
                </div>

                <details className="details-block details-block--subtle" open={showPoolWindowDetails}>
                  <summary>{isRu ? 'Настроить окно источников' : 'Adjust source window'}</summary>
                  <div className="details-block__content">
                    <div className="create-form-grid create-form-grid--dual">
                      <label className="field-block">
                        <span>{isRu ? 'Глубина, часов' : 'Lookback hours'}</span>
                        <input
                          inputMode="numeric"
                          placeholder={postType === 'weekly' ? '168' : postType === 'alert' ? '24' : '48'}
                          value={lookbackHours}
                          onChange={(event) => setLookbackHours(event.target.value)}
                        />
                      </label>

                      <label className="field-block">
                        <span>{isRu ? 'Лимит источников' : 'Source limit'}</span>
                        <input
                          inputMode="numeric"
                          placeholder={postType === 'weekly' ? '150' : '80'}
                          value={limit}
                          onChange={(event) => setLimit(event.target.value)}
                        />
                      </label>
                    </div>
                  </div>
                </details>

                <p className="editor-help">
                  {isRu ? 'Оставьте оба поля пустыми, чтобы использовать рекомендованное окно.' : 'Leave both fields empty to use the recommended window.'}
                </p>
              </div>
            )}

            {mode === 'source_post' && (
              <div className="context-section context-section--tight create-selected-panel">
                <details className="create-filter-drawer">
                  <summary className="create-filter-drawer__summary">
                    <span>{isRu ? 'Фильтры выбора' : 'Pick filters'}</span>
                    <small>{pickFilterSummary}</small>
                  </summary>

                  <div className="create-filter-drawer__content">
                    <div className="create-source-rail create-source-rail--compact">
                      <div className="create-source-rail__actions">
                        <button
                          aria-pressed={sourceMediaOnly}
                          className={`create-filter-pill${sourceMediaOnly ? ' create-filter-pill--active' : ''}`}
                          type="button"
                          onClick={() => setSourceMediaOnly((current) => !current)}
                        >
                          {isRu ? 'Только медиа' : 'Media only'}
                        </button>

                        <button
                          className="secondary-button secondary-button--small"
                          disabled={isSourceLoading}
                          type="button"
                          onClick={() => setSourceRefreshNonce((current) => current + 1)}
                        >
                          {isSourceLoading ? (isRu ? 'Обновляем...' : 'Refreshing...') : isRu ? 'Обновить' : 'Refresh'}
                        </button>
                      </div>
                    </div>

                    <div className="create-picker-filters create-picker-filters--drawer">
                      <SelectField
                        label={isRu ? 'Глубина' : 'Lookback'}
                        options={sourceLookbackSelectOptions}
                        value={sourceLookbackHours}
                        onChange={setSourceLookbackHours}
                      />

                      <SelectField
                        label={isRu ? 'Лимит' : 'Limit'}
                        options={sourceLimitSelectOptions}
                        value={sourceLimit}
                        onChange={setSourceLimit}
                      />
                    </div>
                  </div>
                </details>

                {!isSourceLoading && sourcePosts.length > 0 && (
                  <div className="create-list-meta">
                    <p className="editor-help">
                      {isRu
                        ? `Показано ${visibleSourcePosts.length} из ${sourcePosts.length} источников.`
                        : `Showing ${visibleSourcePosts.length} of ${sourcePosts.length} sources.`}
                    </p>
                  </div>
                )}

                <label className="field-block create-search-field create-search-field--inline">
                  <span>{isRu ? 'Поиск по постам' : 'Search posts'}</span>
                  <input
                    placeholder={isRu ? 'канал или текст' : 'channel or text'}
                    value={sourceSearch}
                    onChange={(event) => setSourceSearch(event.target.value)}
                  />
                </label>

                {isSourceLoading ? (
                  <SourceListSkeleton />
                ) : (
                  <div className="source-pick-list source-pick-list--mobile">
                    {visibleSourcePosts.map((sourcePost) => {
                      const isSelected = selectedSourcePostId === sourcePost.id;
                      const sourceDateLabel = formatCompactPostMeta(
                        sourcePost.sourceDate || sourcePost.scrapedAt,
                        sourcePost.mediaCount,
                        language
                      );

                      return (
                        <article
                          key={sourcePost.id}
                          className={`create-source-card${isSelected ? ' create-source-card--active' : ''}`}
                        >
                          <div className="create-source-card__visual">
                            <SourceVisual
                              sourcePost={sourcePost}
                              onExpand={(src, alt) => setExpandedPreview({ src, alt })}
                            />
                            <button
                              aria-pressed={isSelected}
                              className={`source-select-badge${isSelected ? ' source-select-badge--active' : ''}`}
                              type="button"
                              onClick={() => setSelectedSourcePostId(sourcePost.id)}
                            >
                              <span className="source-select-badge__dot" aria-hidden="true" />
                            </button>
                          </div>

                          <div className="create-source-card__body">
                            <div className="create-source-card__header">
                              <strong>{sourcePost.sourceChannel}</strong>
                              <span>{sourceDateLabel}</span>
                            </div>

                            <div className="create-source-card__actions">
                              {getSourcePostUrl(sourcePost) && (
                                <a
                                  className="source-inline-link source-inline-link--subtle"
                                  href={getSourcePostUrl(sourcePost) || undefined}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  {isRu ? 'Открыть источник' : 'Open source'}
                                </a>
                              )}
                            </div>

                            <p className="create-source-card__excerpt">
                              {summarizeRichText(sourcePost.excerpt || sourcePost.text, 140) || (isRu ? 'Текст источника не найден.' : 'No source text captured.')}
                            </p>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}

                {canShowMoreSources && (
                  <button
                    className="secondary-button secondary-button--small create-show-more-button"
                    type="button"
                    onClick={() => setVisibleSourceCount((current) => current + SOURCE_POSTS_PAGE_SIZE)}
                  >
                    {isRu ? 'Показать ещё 5' : 'Show 5 more'}
                  </button>
                )}

                {!isSourceLoading && sourcePosts.length === 0 && (
                  <div className="empty-state">
                    <h3>{isRu ? 'Нет недавних постов-источников' : 'No recent source posts'}</h3>
                    <p>{isRu ? 'Увеличьте окно поиска или отключите фильтр «только медиа».' : 'Try a larger lookback window or disable the media-only filter.'}</p>
                  </div>
                )}
              </div>
            )}

            {mode === 'manual_source' && (
              <div className="context-section context-section--tight create-manual-stack create-selected-panel">
                <label className="field-block">
                  <span>{isRu ? 'Текст источника' : 'Source text'}</span>
                  <textarea
                    className="draft-editor config-editor"
                    placeholder={isRu ? 'Вставьте сюда текст исходного поста' : 'Paste the source post text here'}
                    value={manualText}
                    onChange={(event) => setManualText(event.target.value)}
                  />
                </label>

                <details className="details-block details-block--subtle">
                  <summary>{isRu ? 'Ссылки на источник' : 'Source links'}</summary>
                  <div className="details-block__content details-block__content--stack">
                    <label className="field-block">
                      <span>{isRu ? 'Ссылки на источник' : 'Source links'}</span>
                      <textarea
                        className="json-editor create-textarea--compact"
                        placeholder={isRu ? 'По одной на строку. Используйте "Метка|https://url" или просто "https://url"' : 'One per line. Use "Label|https://url" or just "https://url"'}
                        value={sourceLinks}
                        onChange={(event) => setSourceLinks(event.target.value)}
                      />
                    </label>
                  </div>
                </details>
              </div>
            )}

            {mode === 'manual_source' && renderMediaManager()}
          </section>
        </div>

        {error && <div className="state-banner state-banner--error">{error}</div>}
        {notice && <div className="state-banner state-banner--success">{notice}</div>}
        {isLoading && <div className="state-banner">{isRu ? 'Загружаем профили...' : 'Loading profiles...'}</div>}
        {isCreating && (
          <div className="state-banner state-banner--info">
            {isRu ? 'Создаём черновик и открываем ревью. Это может занять немного времени.' : 'Creating the draft and opening review. This can take a little while.'}
          </div>
        )}

        <div className="sticky-review-bar sticky-review-bar--create">
          <div className="sticky-review-bar__controls">
            {mode === 'source_post' ? (
              <button
                className="primary-button primary-button--create"
                disabled={isLoading || isCreating || !profileId || !selectedSourcePost}
                type="button"
                onClick={() => selectedSourcePost && handleCreateFromSourcePost(selectedSourcePost)}
              >
                {creatingSourcePostId && selectedSourcePostId === creatingSourcePostId
                  ? isRu ? 'Создаём...' : 'Creating...'
                  : isRu ? 'Создать из выбранного источника' : 'Create from selected source'}
              </button>
            ) : (
              <button
                className="primary-button primary-button--create"
                disabled={isLoading || isCreating || !profileId}
                type="button"
                onClick={handleCreate}
              >
                {isCreating ? (isRu ? 'Создаём...' : 'Creating...') : isRu ? 'Создать черновик' : 'Create draft'}
              </button>
            )}
          </div>
        </div>

        {expandedPreview && (
          <div className="image-lightbox" role="dialog" aria-modal="true" onClick={() => setExpandedPreview(null)}>
            <button
              className="image-lightbox__close"
              type="button"
              onClick={() => setExpandedPreview(null)}
            >
              {isRu ? 'Закрыть' : 'Close'}
            </button>
            <img
              alt={expandedPreview.alt}
              className="image-lightbox__image"
              src={expandedPreview.src}
              onClick={(event) => event.stopPropagation()}
            />
          </div>
        )}
      </section>
    </section>
  );
}
