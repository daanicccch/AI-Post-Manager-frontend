import { useEffect, useRef, useState, type ChangeEvent, type Dispatch, type DragEvent, type SetStateAction } from 'react';
import { api, getMediaPreviewUrl, type DraftMediaItem } from '../../lib/api';
import { useAppLocale } from '../../lib/appLocale';
import { isImagePath, isVideoPath } from '../../lib/formatters';

export function inferMediaTypeFromPath(filePath: string) {
  const normalizedPath = String(filePath || '').toLowerCase();

  if (/\.(mp4|mov|webm|mkv|avi)$/i.test(normalizedPath)) {
    return 'video';
  }

  if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(normalizedPath)) {
    return 'photo';
  }

  return 'file';
}

export function normalizeMediaState(items: DraftMediaItem[]) {
  return items.map((item, index) => ({
    ...item,
    index
  }));
}

export function reorderMediaItems(items: DraftMediaItem[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
    return items;
  }

  const nextItems = [...items];
  const [item] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, item);

  return normalizeMediaState(nextItems);
}

export function buildDraftMediaFromPaths(paths: string[]) {
  return normalizeMediaState(
    paths
      .filter(Boolean)
      .map((mediaPath) => ({
        path: mediaPath,
        mediaType: inferMediaTypeFromPath(mediaPath)
      }))
  );
}

function getMediaLabel(item: DraftMediaItem, index: number) {
  const fileName = item.path?.split(/[\\/]/).pop();
  return fileName || `${item.mediaType || item.kind || 'media'} ${index + 1}`;
}

function renderMediaPreview(path: string | undefined, mediaType?: string | null, alt = 'Media preview') {
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

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.onload = () => {
      const result = String(reader.result || '');
      const [, base64Payload = ''] = result.split(',', 2);
      resolve(base64Payload);
    };
    reader.readAsDataURL(file);
  });
}

function AddMediaIcon() {
  return (
    <svg aria-hidden="true" className="create-upload-button__icon" viewBox="0 0 16 16">
      <path d="M8 3.25v9.5" />
      <path d="M3.25 8h9.5" />
    </svg>
  );
}

type CreateMediaManagerProps = {
  description: string;
  emptyText: string;
  items: DraftMediaItem[];
  overrideEnabled: boolean;
  embedded?: boolean;
  title?: string;
  uploadButtonLabel?: string;
  uploadButtonCompact?: boolean;
  showClearAllButton?: boolean;
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
  onReset?: () => void;
  setItems: Dispatch<SetStateAction<DraftMediaItem[]>>;
  setOverrideEnabled: Dispatch<SetStateAction<boolean>>;
};

export function CreateMediaManager({
  description,
  emptyText,
  items,
  overrideEnabled,
  embedded = false,
  title = 'Attachments',
  uploadButtonLabel,
  uploadButtonCompact = false,
  showClearAllButton = true,
  onError,
  onNotice,
  onReset,
  setItems,
  setOverrideEnabled
}: CreateMediaManagerProps) {
  const { language } = useAppLocale();
  const isRu = language === 'ru';
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  useEffect(() => {
    const shouldOverride = items.length > 0;
    if (overrideEnabled !== shouldOverride) {
      setOverrideEnabled(shouldOverride);
    }
  }, [items.length, overrideEnabled, setOverrideEnabled]);

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files || []);
    if (selectedFiles.length === 0) {
      return;
    }

    setIsUploading(true);
    onError(null);
    onNotice(null);

    try {
      const uploadedItems: DraftMediaItem[] = [];

      for (const file of selectedFiles) {
        const contentBase64 = await readFileAsBase64(file);
        const uploaded = await api.uploadMedia({
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          contentBase64
        });

        uploadedItems.push({
          path: uploaded.path,
          mediaType: inferMediaTypeFromPath(uploaded.path)
        });
      }

      setItems((currentItems) => {
        const existingPaths = new Set(currentItems.map((item) => item.path).filter(Boolean));
        const nextItems = [
          ...currentItems,
          ...uploadedItems.filter((item) => item.path && !existingPaths.has(item.path))
        ];
        return normalizeMediaState(nextItems);
      });

      onNotice(
        isRu
          ? `Добавлено медиафайлов: ${uploadedItems.length}.`
          : `${uploadedItems.length} media file(s) added.`
      );
    } catch (uploadError) {
      onError(uploadError instanceof Error ? uploadError.message : isRu ? 'Не удалось загрузить медиа' : 'Failed to upload media');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  function handleRemove(index: number) {
    setItems((currentItems) =>
      normalizeMediaState(currentItems.filter((_, currentIndex) => currentIndex !== index))
    );
  }

  function handleClearAll() {
    onError(null);
    onNotice(null);
    onReset?.();
    setItems([]);
    setOverrideEnabled(false);
  }

  function handleDragStart(event: DragEvent<HTMLElement>, index: number) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
    setDraggedIndex(index);
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }

  function handleDropOnCard(event: DragEvent<HTMLElement>, targetIndex: number) {
    event.preventDefault();

    const fallbackIndex = Number.parseInt(event.dataTransfer.getData('text/plain'), 10);
    const sourceIndex = draggedIndex ?? (Number.isFinite(fallbackIndex) ? fallbackIndex : null);
    if (sourceIndex === null) {
      return;
    }

    setItems((currentItems) => normalizeMediaState(reorderMediaItems(currentItems, sourceIndex, targetIndex)));
    setDraggedIndex(null);
  }

  const uploadLabel = isUploading
    ? (isRu ? 'Загружаем...' : 'Uploading...')
    : uploadButtonCompact
      ? null
      : uploadButtonLabel || (isRu ? 'Добавить медиа' : 'Add media');

  return (
    <section className={`context-section context-section--tight create-media-panel${embedded ? ' create-media-panel--embedded' : ''}`}>
      {!embedded && (
        <>
          <div className="panel-heading panel-heading--tight">
            <div>
              <span className="eyebrow">Media</span>
              <h3>{title}</h3>
            </div>
          </div>

          {description.trim() ? <p className="section-intro">{description}</p> : null}
        </>
      )}

      <div className="action-row action-row--wrap">
        <label className={`secondary-button create-upload-button${uploadButtonCompact ? ' create-upload-button--compact' : ''}`}>
          <input
            ref={fileInputRef}
            accept="image/*,video/*"
            hidden
            multiple
            type="file"
            onChange={handleUpload}
          />
          {uploadButtonCompact && !isUploading ? <AddMediaIcon /> : uploadLabel}
        </label>

        {showClearAllButton && (
          <button
            className="secondary-button secondary-button--small"
            disabled={items.length === 0}
            type="button"
            onClick={handleClearAll}
          >
            {isRu ? 'Очистить всё' : 'Clear all'}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="empty-state empty-state--compact">
          <h3>{isRu ? 'Медиа не выбрано' : 'No media selected'}</h3>
          <p>{emptyText}</p>
        </div>
      ) : (
        <>
          {items.length > 1 && <p className="editor-help">{isRu ? 'Перетаскивайте для изменения порядка.' : 'Drag to reorder.'}</p>}

          <div className="media-editor-list media-editor-list--draggable">
            {items.map((item, index) => (
              <article
                className={`media-editor-card media-editor-card--draggable${
                  draggedIndex === index ? ' media-editor-card--dragging' : ''
                }`}
                draggable
                key={`${item.path || 'media'}-${index}`}
                onDragEnd={() => setDraggedIndex(null)}
                onDragOver={handleDragOver}
                onDragStart={(event) => handleDragStart(event, index)}
                onDrop={(event) => handleDropOnCard(event, index)}
              >
                {renderMediaPreview(item.path, item.mediaType, `${getMediaLabel(item, index)} preview`) || (
                  <div className="create-media-placeholder">
                    <strong>{getMediaLabel(item, index)}</strong>
                    <span>{item.mediaType || item.kind || 'media'}</span>
                  </div>
                )}

                <div className="media-editor-tile__overlay">
                  <span className="media-editor-order-badge">{index + 1}</span>
                  <span className="media-editor-drag-handle" aria-hidden="true" />
                  <button
                    aria-label={isRu ? `Удалить ${getMediaLabel(item, index)}` : `Remove ${getMediaLabel(item, index)}`}
                    className="media-editor-remove-button"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleRemove(index);
                    }}
                  >
                    x
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
