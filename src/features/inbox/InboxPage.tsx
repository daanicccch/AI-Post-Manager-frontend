import { useEffect, useMemo, useState, useTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import { FeedListSkeleton } from '../../components/LoadingSkeleton';
import { SelectField } from '../../components/SelectField';
import { TelegramRichTextPreview } from '../../components/TelegramRichTextPreview';
import { api, getMediaPreviewUrl, type InboxItem, type Profile } from '../../lib/api';
import { useAppLocale } from '../../lib/appLocale';
import { formatCompactPostMeta, isImagePath, stripHtml } from '../../lib/formatters';

const ACTIVE_INBOX_STATUSES = new Set(['editing', 'scheduled', 'publishing']);
const CUSTOM_EMOJI_HTML_PATTERN = /<tg-emoji\b[^>]*emoji-id="\d+"[^>]*>/i;

function hasCustomEmojiMarkup(value: string | null | undefined) {
  return CUSTOM_EMOJI_HTML_PATTERN.test(String(value || ''));
}

export function InboxPage() {
  const { language } = useAppLocale();
  const isRu = language === 'ru';
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [drafts, setDrafts] = useState<InboxItem[]>([]);
  const [profileId, setProfileId] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startListTransition] = useTransition();
  const [expandedPreview, setExpandedPreview] = useState<{ src: string; alt: string } | null>(null);

  const statuses = useMemo(
    () => [
      { value: 'all', label: isRu ? 'Все' : 'All' },
      { value: 'editing', label: isRu ? 'В работе' : 'Editing' },
      { value: 'scheduled', label: isRu ? 'Запланировано' : 'Scheduled' }
    ],
    [isRu]
  );

  const activeStatusLabel = useMemo(
    () => statuses.find((item) => item.value === status)?.label ?? (isRu ? 'Все' : 'All'),
    [isRu, status, statuses]
  );

  const activeProfileLabel = useMemo(
    () =>
      profileId === 'all'
        ? (isRu ? 'Все профили' : 'All profiles')
        : profiles.find((profile) => profile.slug === profileId)?.title ?? (isRu ? 'Профиль' : 'Profile'),
    [isRu, profileId, profiles]
  );

  const profileOptions = useMemo(
    () => [
      { value: 'all', label: isRu ? 'Все профили' : 'All profiles' },
      ...profiles.map((profile) => ({
        value: profile.slug,
        label: profile.title
      }))
    ],
    [isRu, profiles]
  );

  const getStatusLabel = (value: string) =>
    statuses.find((item) => item.value === value)?.label ?? value;

  useEffect(() => {
    api.listProfiles().then(setProfiles).catch((loadError: Error) => {
      setError(loadError.message);
    });
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    document.body.classList.toggle('app-lightbox-open', Boolean(expandedPreview));
    return () => {
      document.body.classList.remove('app-lightbox-open');
    };
  }, [expandedPreview]);

  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);
    setError(null);

    api
      .listInbox({
        status: status === 'all' ? undefined : status,
        profileId: profileId === 'all' ? undefined : profileId
      })
      .then((items) => {
        if (!isCancelled) {
          setDrafts(items.filter((item) => ACTIVE_INBOX_STATUSES.has(item.status)));
        }
      })
      .catch((loadError: Error) => {
        if (!isCancelled) {
          setError(loadError.message);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [profileId, status]);

  useEffect(() => {
    const draftsNeedingEmojiPreview = drafts.filter(
      (item) => !Array.isArray(item.customEmojiPreviews) || item.customEmojiPreviews.length === 0
    );

    if (draftsNeedingEmojiPreview.length === 0) {
      return;
    }

    let cancelled = false;

    void Promise.all(
      draftsNeedingEmojiPreview.map(async (item) => {
        const customEmojiPreviews = await api.getDraftCustomEmojiPreviews(item.id).catch(() => []);
        if (customEmojiPreviews.length === 0) {
          return null;
        }

        if (hasCustomEmojiMarkup(item.text)) {
          return {
            id: item.id,
            text: item.text,
            customEmojiPreviews,
          };
        }

        const detail = await api.getDraft(item.id).catch(() => null);
        return {
          id: item.id,
          text: detail?.text || item.text,
          customEmojiPreviews,
        };
      })
    ).then((results) => {
      if (cancelled) {
        return;
      }

      const resolvedResults = results.filter((result): result is NonNullable<typeof result> => {
        if (!result) {
          return false;
        }

        return result.customEmojiPreviews.length > 0;
      });
      const previewsByDraftId = new Map(
        resolvedResults.map((result) => [result.id, result])
      );

      if (previewsByDraftId.size === 0) {
        return;
      }

      setDrafts((currentDrafts) =>
        currentDrafts.map((item) => {
          const nextPayload = previewsByDraftId.get(item.id);
          return nextPayload
            ? {
                ...item,
                text: nextPayload.text || item.text,
                customEmojiPreviews: nextPayload.customEmojiPreviews,
              }
            : item;
        })
      );
    });

    return () => {
      cancelled = true;
    };
  }, [drafts]);

  if (isLoading && drafts.length === 0) {
    return <FeedListSkeleton />;
  }

  return (
    <section className="page-stack page-stack--queue">
      <section className="queue-control-card">
        <details className="create-filter-drawer queue-filter-drawer">
          <summary className="create-filter-drawer__summary">
            <span>{isRu ? 'Фильтры активных' : 'Active filters'}</span>
            <small>{`${activeStatusLabel} - ${activeProfileLabel}`}</small>
          </summary>

          <div className="create-filter-drawer__content">
            <div className="chip-group chip-group--queue">
              {statuses.map((item) => (
                <button
                  key={item.value}
                  className={`chip${status === item.value ? ' chip--active' : ''}`}
                  type="button"
                  onClick={() => startListTransition(() => setStatus(item.value))}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <SelectField
              label={isRu ? 'Профиль' : 'Profile'}
              options={profileOptions}
              value={profileId}
              onChange={(nextValue) => {
                startListTransition(() => setProfileId(nextValue));
              }}
            />
          </div>
        </details>
      </section>

      {error && <div className="state-banner state-banner--error">{error}</div>}
      {(isLoading || isPending) && (
        <div className="state-banner">{isRu ? 'Загружаем активные посты...' : 'Loading active drafts...'}</div>
      )}

      <div className="feed-list">
        {drafts.map((draft) => (
          <article
            className="feed-card feed-card--interactive"
            key={draft.id}
            role="link"
            tabIndex={0}
            onClick={() => navigate(`/drafts/${draft.id}`)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                navigate(`/drafts/${draft.id}`);
              }
            }}
          >
            {draft.mediaPreviewPath && isImagePath(draft.mediaPreviewPath) ? (
              <div className="feed-card__visual">
                <button
                  className="source-visual-button"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    const previewUrl = getMediaPreviewUrl(draft.mediaPreviewPath, draft.mediaPreviewUrl);
                    if (previewUrl) {
                      setExpandedPreview({
                        src: previewUrl,
                        alt: stripHtml(draft.title) || (isRu ? 'Превью черновика' : 'Draft preview')
                      });
                    }
                  }}
                >
                  <img
                    alt={stripHtml(draft.title) || (isRu ? 'Превью черновика' : 'Draft preview')}
                    className="feed-card__image"
                    loading="lazy"
                    src={getMediaPreviewUrl(draft.mediaPreviewPath, draft.mediaPreviewUrl) || undefined}
                  />
                </button>
                <span className={`feed-status-badge feed-status-badge--${draft.status}`}>{getStatusLabel(draft.status)}</span>
              </div>
            ) : (
              <span className={`feed-status-badge feed-status-badge--${draft.status} feed-status-badge--floating`}>
                {getStatusLabel(draft.status)}
              </span>
            )}

            <div className="feed-card__body">
              <div className="feed-card__head">
                <div>
                  <strong>{draft.profileTitle}</strong>
                </div>
              </div>

              <div className="feed-card__meta">
                <span>{formatCompactPostMeta(draft.scheduledFor || draft.updatedAt, draft.mediaCount, language)}</span>
              </div>

              <div className="feed-card__excerpt feed-card__excerpt--rich">
                <TelegramRichTextPreview
                  customEmojiPreviews={draft.customEmojiPreviews || []}
                  html={draft.text || draft.excerpt}
                />
              </div>
            </div>
          </article>
        ))}

        {!isLoading && drafts.length === 0 && (
          <div className="empty-state">
            <h3>{isRu ? 'Пока нет активных постов' : 'No active drafts yet'}</h3>
            <p>
              {isRu
                ? 'Здесь остаются только посты в работе и запланированные. Опубликованные и отменённые переходят в историю.'
                : 'Only editing and scheduled drafts stay here. Published and cancelled items move to history.'}
            </p>
          </div>
        )}
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
  );
}
