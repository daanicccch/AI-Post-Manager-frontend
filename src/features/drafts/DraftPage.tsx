import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DraftPageSkeleton, EditorComposerSkeleton } from '../../components/LoadingSkeleton';
import { StatusPill } from '../../components/StatusPill';
import { CreateMediaManager } from '../create/CreateMediaManager';
import {
  api,
  getMediaPreviewUrl,
  type DraftDetail,
  type DraftMediaItem
} from '../../lib/api';
import { useAppLocale } from '../../lib/appLocale';
import { formatDate, isImagePath, isVideoPath, summarizeRichText, toDateTimeLocalInput } from '../../lib/formatters';
import { normalizeRichTextHtml } from '../../lib/richText';

const reviewSectionKeys = ['preview', 'compose'] as const;
const RichTextEditor = lazy(() =>
  import('../../components/RichTextEditor').then((module) => ({ default: module.RichTextEditor }))
);

type ReviewSectionKey = (typeof reviewSectionKeys)[number];

function formatTelegramClock(value?: string | null, isRu = false) {
  if (!value) {
    return isRu ? 'сейчас' : 'now';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return isRu ? 'сейчас' : 'now';
  }

  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function formatTelegramDayLabel(value?: string | null, isRu = false) {
  if (!value) {
    return isRu ? 'Сегодня' : 'Today';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return isRu ? 'Сегодня' : 'Today';
  }

  const now = new Date();
  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isSameDay) {
    return isRu ? 'Сегодня' : 'Today';
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long'
  }).format(date);
}

function getAvatarLabel(value: string) {
  const parts = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return 'TG';
  }

  return parts
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function inferMediaTypeFromPath(filePath: string) {
  const normalizedPath = String(filePath || '').toLowerCase();

  if (/\.(mp4|mov|webm|mkv|avi)$/i.test(normalizedPath)) {
    return 'video';
  }

  if (/\.(jpg|jpeg|png|gif|webp)$/i.test(normalizedPath)) {
    return 'photo';
  }

  return 'file';
}

function renderMediaPreview(path: string | undefined, mediaType?: string | null, alt = 'Draft media') {
  const previewUrl = getMediaPreviewUrl(path);
  if (!previewUrl) {
    return null;
  }

  const normalizedType = String(mediaType || '').toLowerCase();
  if (normalizedType === 'video' || isVideoPath(path)) {
    return (
      <video className="draft-media-preview" controls preload="metadata">
        <source src={previewUrl} />
      </video>
    );
  }

  if (normalizedType === 'photo' || isImagePath(path)) {
    return <img alt={alt} className="draft-media-preview" loading="lazy" src={previewUrl} />;
  }

  return null;
}

function renderTelegramMediaGallery(items: DraftMediaItem[], title: string) {
  if (items.length === 0) {
    return null;
  }

  const visibleItems = items.slice(0, 4);
  const extraItemsCount = items.length - visibleItems.length;

  return (
    <div
      className={`telegram-media-grid telegram-media-grid--${Math.min(visibleItems.length, 4)}`}
    >
      {visibleItems.map((item, index) => {
        const showMoreOverlay = extraItemsCount > 0 && index === visibleItems.length - 1;

        return (
          <div
            className={`telegram-media-grid__item${showMoreOverlay ? ' telegram-media-grid__item--more' : ''}`}
            key={`${item.path || 'preview-media'}-${index}`}
          >
            {renderMediaPreview(item.path, item.mediaType, `${title} media ${index + 1}`)}
            {showMoreOverlay && <span className="telegram-media-grid__more">+{extraItemsCount}</span>}
          </div>
        );
      })}
    </div>
  );
}

function normalizeMediaState(items: DraftMediaItem[]) {
  return items.map((item, index) => ({
    ...item,
    index
  }));
}

export function DraftPage() {
  const { language } = useAppLocale();
  const isRu = language === 'ru';
  const navigate = useNavigate();
  const { draftId } = useParams();
  const numericDraftId = Number(draftId);
  const [draft, setDraft] = useState<DraftDetail | null>(null);
  const [draftText, setDraftText] = useState('');
  const [mediaDraft, setMediaDraft] = useState<DraftMediaItem[]>([]);
  const [scheduleValue, setScheduleValue] = useState('');
  const [activeSection, setActiveSection] = useState<ReviewSectionKey>('preview');
  const [mediaOverrideEnabled, setMediaOverrideEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latestPublicationError = draft?.publications.find((publication) => publication.status === 'failed')?.errorText || null;
  const canEditDraft =
    draft?.status !== 'cancelled' &&
    draft?.status !== 'published' &&
    draft?.status !== 'publishing';
  const normalizedSavedText = useMemo(() => normalizeRichTextHtml(draft?.text), [draft?.text]);

  const reviewSections = useMemo(
    () => {
      const sections: Array<{
        key: ReviewSectionKey;
        label: string;
        description: string;
      }> = [
        {
          key: 'preview',
          label: isRu ? 'Превью' : 'Preview',
          description: isRu ? 'Проверь, как пост будет выглядеть в канале.' : 'Check the post exactly the way it is about to look.'
        }
      ];

      if (canEditDraft) {
        sections.push({
          key: 'compose',
          label: isRu ? 'Редактировать' : 'Edit',
          description: isRu ? 'Подправь текст, медиа и перегенерацию в одном месте.' : 'Adjust the copy, media, and regeneration in one place.'
        });
      }

      return sections;
    },
    [canEditDraft, isRu]
  );
  const deferredText = useDeferredValue(draftText);
  const previewHtml = useMemo(() => normalizeRichTextHtml(deferredText), [deferredText]);
  const mediaDraftSignature = useMemo(() => JSON.stringify(mediaDraft), [mediaDraft]);
  const draftMediaSignature = useMemo(() => JSON.stringify(draft?.media || []), [draft?.media]);
  const currentSection = reviewSections.find((section) => section.key === activeSection) ?? reviewSections[0];
  const isLocked =
    draft?.status === 'published' ||
    draft?.status === 'cancelled' ||
    draft?.status === 'publishing';
  const canDeleteFromHistory = draft?.status === 'published' || draft?.status === 'cancelled';
  const isDirty = Boolean(draft && (draftText !== normalizedSavedText || mediaDraftSignature !== draftMediaSignature));
  const isWorking = activeAction !== null;
  const previewTimestamp = draft?.publishedAt || draft?.scheduledFor || draft?.updatedAt || null;
  const previewDayLabel = formatTelegramDayLabel(previewTimestamp, isRu);
  const previewTimeLabel = formatTelegramClock(previewTimestamp, isRu);
  const previewAvatarLabel = getAvatarLabel(draft?.profileTitle || '');
  const previewStatusLabel =
    draft?.publishedAt && draft.telegramMessageId
      ? isRu ? 'Отправлен' : 'Sent'
      : draft?.status === 'publishing'
        ? isRu ? 'Отправляется' : 'Publishing'
      : draft?.scheduledFor
        ? isRu ? 'Запланирован' : 'Scheduled'
        : isRu ? 'Черновик' : 'Draft';

  useEffect(() => {
    if (!canEditDraft && activeSection !== 'preview') {
      setActiveSection('preview');
    }
  }, [activeSection, canEditDraft]);

  async function loadDraft() {
    setIsLoading(true);
    setError(null);

    try {
      const detail = await api.getDraft(numericDraftId);
      const normalizedText = normalizeRichTextHtml(detail.text);
      setDraft(detail);
      setDraftText(normalizedText);
      setMediaDraft(normalizeMediaState(detail.media));
      setScheduleValue(toDateTimeLocalInput(detail.scheduledFor));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : isRu ? 'Не удалось загрузить черновик' : 'Failed to load draft');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!Number.isFinite(numericDraftId)) {
      setError(isRu ? 'Некорректный идентификатор черновика' : 'Invalid draft id');
      setIsLoading(false);
      return;
    }

    void loadDraft();
  }, [numericDraftId]);

  async function persistDraftStateIfNeeded(currentDraft: DraftDetail) {
    const normalizedMediaDraft = normalizeMediaState(mediaDraft);
    const hasTextChange = draftText !== normalizeRichTextHtml(currentDraft.text);
    const hasMediaChange = JSON.stringify(normalizedMediaDraft) !== JSON.stringify(currentDraft.media || []);

    if (!hasTextChange && !hasMediaChange) {
      return;
    }

    await api.saveDraft(currentDraft.id, {
      text: draftText,
      mediaState: normalizedMediaDraft,
      sourceState: currentDraft.sourceState
    });
  }

  async function runDraftAction(actionName: string, action: () => Promise<void>, successMessage: string) {
    setActiveAction(actionName);
    setError(null);
    setNotice(null);

    try {
      await action();
      await loadDraft();
      setNotice(successMessage);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : isRu ? 'Не удалось выполнить действие с черновиком' : 'Draft action failed');
    } finally {
      setActiveAction(null);
    }
  }

  async function handleSave() {
    if (!draft || isLocked) return;
    await runDraftAction('save', async () => {
      await api.saveDraft(draft.id, {
        text: draftText,
        mediaState: normalizeMediaState(mediaDraft),
        sourceState: draft.sourceState
      });
      if (scheduleValue) {
        await api.scheduleDraft(draft.id, {
          scheduledFor: new Date(scheduleValue).toISOString()
        });
      }
    }, scheduleValue
      ? isRu ? 'Черновик и время отправки сохранены' : 'Draft and schedule saved'
      : isRu ? 'Черновик сохранён' : 'Draft saved');
  }

  async function handlePublish() {
    if (!draft || isLocked) return;
    await runDraftAction('publish', async () => {
      await persistDraftStateIfNeeded(draft);
      await api.publishDraft(draft.id, {
        telegramMessageId: draft.telegramMessageId
      });
    }, isRu ? 'Пост отправлен' : 'Draft published');
  }

  async function handleCancel() {
    if (!draft || isLocked) return;
    if (!window.confirm(isRu ? 'Отменить этот черновик? Он останется в истории, но уйдёт из активной очереди.' : 'Cancel this draft? It will stay in history but leave the active review queue.')) {
      return;
    }

    await runDraftAction('cancel', async () => {
      await api.cancelDraft(draft.id, {
        meta: {
          reason: 'cancelled_from_mini_app'
        }
      });
    }, isRu ? 'Черновик отменён' : 'Draft cancelled');
  }

  async function handleDelete() {
    if (!draft || !canDeleteFromHistory || isWorking) return;
    if (!window.confirm(
      isRu
        ? 'Удалить этот пост из истории? Это действие нельзя отменить.'
        : 'Delete this post from history? This action cannot be undone.'
    )) {
      return;
    }

    setActiveAction('delete');
    setError(null);
    setNotice(null);

    try {
      await api.deleteDraft(draft.id);
      navigate('/history', { replace: true });
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : isRu ? 'Не удалось удалить пост' : 'Failed to delete post');
      setActiveAction(null);
    }
  }

  async function handleRegenerate() {
    if (!draft || isLocked) return;
    if (isDirty && !window.confirm(isRu ? 'Несохранённые изменения будут заменены новой сгенерированной версией. Продолжить?' : 'Unsaved edits will be replaced by a freshly generated version. Continue?')) {
      return;
    }

    await runDraftAction('regenerate', async () => {
      await api.regenerateDraft(draft.id);
    }, isRu ? 'Новая версия сгенерирована' : 'New version generated');
  }
  if (isLoading) {
    return <DraftPageSkeleton />;
  }


  if (!draft) {
    return <div className="state-banner state-banner--error">{error || (isRu ? 'Черновик не найден' : 'Draft not found')}</div>;
  }

  return (
    <section className="page-stack page-stack--editor">
      <header className="page-hero page-hero--editor page-hero--review-compact page-hero--review-minimal">
        <div className="review-hero-grid">
          <div className="review-hero-copy">
            <span className="eyebrow">{isRu ? 'Проверка' : 'Review'}</span>
            <h2>{summarizeRichText(draft.title, 140) || (isRu ? 'Черновик без названия' : 'Untitled draft')}</h2>
          </div>

          <div className="hero-inline hero-inline--compact">
            <StatusPill status={draft.status} />
            {!isLocked && (
              <button
                className="review-nav-button review-nav-button--danger"
                disabled={isWorking}
                onClick={handleCancel}
                type="button"
              >
                {activeAction === 'cancel' ? (isRu ? 'Отмена...' : 'Cancelling...') : isRu ? 'Отменить' : 'Cancel'}
              </button>
            )}
            {canDeleteFromHistory && (
              <button
                className="review-nav-button review-nav-button--danger"
                disabled={isWorking}
                onClick={handleDelete}
                type="button"
              >
                {activeAction === 'delete' ? (isRu ? 'Удаляем...' : 'Deleting...') : isRu ? 'Удалить' : 'Delete'}
              </button>
            )}
          </div>
        </div>
      </header>

      {notice && <div className="state-banner state-banner--success">{notice}</div>}
      {error && <div className="state-banner state-banner--error">{error}</div>}
      {draft.status === 'publishing' && latestPublicationError && (
        <div className="state-banner state-banner--error">
          {isRu
            ? `Публикация остановилась после захвата черновика: ${latestPublicationError}`
            : `Publishing stopped after the draft was claimed: ${latestPublicationError}`}
        </div>
      )}
      {draft.status === 'publishing' && !latestPublicationError && (
        <div className="state-banner">
          {isRu
            ? 'Черновик уже отправляется в Telegram. Повторная отправка заблокирована, чтобы не создать дубль.'
            : 'This draft is already being sent to Telegram. Repeat publishing is locked to avoid duplicates.'}
        </div>
      )}

      <section className="editor-tabs editor-tabs--section editor-tabs--review" role="tablist" aria-label={isRu ? 'Разделы черновика' : 'Draft workspace sections'}>
        {reviewSections.map((section) => (
          <button
            key={section.key}
            aria-selected={activeSection === section.key}
            className={`editor-tab${activeSection === section.key ? ' editor-tab--active' : ''}`}
            role="tab"
            type="button"
            onClick={() => setActiveSection(section.key)}
          >
            <span>{section.label}</span>
          </button>
        ))}
      </section>

      <section className="editor-panel editor-panel--main workspace-section">
        {activeSection !== 'preview' && (
          <>
            <div className="panel-heading panel-heading--tight">
              <div>
                <span className="eyebrow">{isRu ? 'Раздел' : 'Section'}</span>
                <h3>{currentSection.label}</h3>
              </div>
            </div>

            <p className="section-intro">{currentSection.description}</p>
          </>
        )}

        {activeSection === 'compose' && (
          <div className="context-section">
            <CreateMediaManager
              description=""
              embedded
              emptyText={isRu ? 'Добавь изображения или видео перед публикацией.' : 'Add images or video before publishing.'}
              items={mediaDraft}
              overrideEnabled={mediaOverrideEnabled}
              uploadButtonCompact
              uploadButtonLabel="+"
              showClearAllButton={false}
              setItems={setMediaDraft}
              setOverrideEnabled={setMediaOverrideEnabled}
              title={isRu ? 'Медиа' : 'Media'}
              onError={setError}
              onNotice={setNotice}
            />

            <div className="field-block">
              <div className="field-label-row">
                <span>{isRu ? 'Текст поста' : 'Draft text'}</span>
                {!isLocked && (
                  <button
                    className="secondary-button secondary-button--small review-regenerate-button"
                    disabled={isWorking}
                    onClick={handleRegenerate}
                    type="button"
                  >
                    {activeAction === 'regenerate' ? (isRu ? 'Генерируем...' : 'Regenerating...') : isRu ? 'Перегенерировать' : 'Regenerate'}
                  </button>
                )}
              </div>
              <Suspense fallback={<EditorComposerSkeleton />}>
                <RichTextEditor
                  ariaLabel={isRu ? 'Текст поста' : 'Draft text'}
                  isRu={isRu}
                  placeholder={isRu ? 'Напиши пост и выделяй важные места кнопками сверху.' : 'Write the post and use the buttons above for emphasis.'}
                  readOnly={isLocked}
                  value={draftText}
                  onChange={setDraftText}
                />
              </Suspense>
            </div>
          </div>
        )}

        {activeSection === 'preview' && (
          <div className="telegram-stage">
            <div className="telegram-phone">
              <div className="telegram-phone__topbar">
                <div className="telegram-phone__back" aria-hidden="true">
                  <span />
                </div>
                <div className="telegram-phone__channel">
                  <strong>{draft.profileTitle}</strong>
                  <span>{isRu ? 'канал · превью' : 'channel В· preview'}</span>
                </div>
                <div className="telegram-phone__icons" aria-hidden="true">
                  <span className="telegram-phone__icon telegram-phone__icon--search" />
                  <span className="telegram-phone__icon telegram-phone__icon--more" />
                </div>
              </div>

              <div className="telegram-phone__screen">
                <div className="telegram-day-pill">{previewDayLabel}</div>

                <article className="telegram-post">
                  <div className="telegram-post__header">
                    <div className="telegram-post__avatar">{previewAvatarLabel}</div>
                    <div className="telegram-post__channel-meta">
                      <strong>{draft.profileTitle}</strong>
                      <span>{isRu ? 'Пост канала' : 'Channel post'}</span>
                    </div>
                  </div>

                  {renderTelegramMediaGallery(mediaDraft, draft.profileTitle)}

                  <div className="telegram-post__body">
                    <div className="telegram-render" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                  </div>

                  <div className="telegram-post__footer">
                    <span>{previewTimeLabel}</span>
                    <span>{previewStatusLabel}</span>
                  </div>
                </article>
              </div>
            </div>

          </div>
        )}

      </section>

      {!isLocked && (
        <div className="sticky-review-bar sticky-review-bar--editor">
          <div className="review-dock">
            <label className="field-inline field-inline--grow review-schedule-field">
              <span>{isRu ? 'Время отправки' : 'Schedule'}</span>
              <input
                disabled={isWorking}
                type="datetime-local"
                value={scheduleValue}
                onChange={(event) => setScheduleValue(event.target.value)}
              />
            </label>

            <div className="action-cluster">
              <button
                className="secondary-button"
                disabled={isWorking}
                onClick={handleSave}
                type="button"
              >
                {activeAction === 'save' ? (isRu ? 'Сохраняем...' : 'Saving...') : isRu ? 'Сохранить' : 'Save'}
              </button>
              <button
                className="primary-button"
                disabled={isWorking}
                onClick={handlePublish}
                type="button"
              >
                {activeAction === 'publish' ? (isRu ? 'Отправляем...' : 'Publishing...') : isRu ? 'Опубликовать сейчас' : 'Publish now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
