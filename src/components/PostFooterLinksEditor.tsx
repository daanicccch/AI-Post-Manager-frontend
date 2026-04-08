import { useEffect, useState } from 'react';
import {
  getPostFooterLinksLayoutLabel,
  getVisiblePostFooterLinks,
  normalizePostFooterLinksConfig,
  type PostFooterLink,
  type PostFooterLinksConfig,
  type PostFooterLinksLayout
} from '../lib/postFooterLinks';

interface PostFooterLinksEditorProps {
  compact?: boolean;
  disabled?: boolean;
  isRu: boolean;
  value: PostFooterLinksConfig;
  onChange: (value: PostFooterLinksConfig) => void;
}

interface EditingLinkState {
  index: number;
  link: PostFooterLink;
}

const layoutOptions: PostFooterLinksLayout[] = ['two_columns', 'one_column', 'inline'];

function getDefaultSlotCount(layout: PostFooterLinksLayout) {
  if (layout === 'one_column') {
    return 3;
  }

  return 4;
}

function createEmptyLink(index: number): PostFooterLink {
  return {
    id: `link-${Date.now()}-${index}`,
    label: '',
    url: '',
    enabled: true,
  };
}

function getSlotTitle(index: number, isRu: boolean) {
  return isRu ? `Ссылка ${index + 1}` : `Link ${index + 1}`;
}

function updateConfig(
  value: PostFooterLinksConfig,
  patch: Partial<PostFooterLinksConfig>
): PostFooterLinksConfig {
  return normalizePostFooterLinksConfig({
    ...value,
    ...patch,
  });
}

function ensureLayoutSlots(value: PostFooterLinksConfig, layout: PostFooterLinksLayout) {
  const normalizedValue = updateConfig(value, { enabled: true, layout });
  const links = [...normalizedValue.links];
  const targetSlots = getDefaultSlotCount(layout);

  while (links.length < targetSlots && links.length < 12) {
    links.push(createEmptyLink(links.length));
  }

  return updateConfig(normalizedValue, { links });
}

export function PostFooterLinksPreview({
  config,
  isRu
}: {
  config: PostFooterLinksConfig;
  isRu: boolean;
}) {
  const links = getVisiblePostFooterLinks(config);

  if (!config.enabled || links.length === 0) {
    return (
      <div className="post-links-preview post-links-preview--empty">
        {isRu ? 'Ссылки под постом выключены или ещё не заполнены.' : 'Post links are off or not filled yet.'}
      </div>
    );
  }

  return (
    <div className={`post-links-preview post-links-preview--${config.layout}`}>
      {links.map((link, index) => (
        <a href={link.url} key={`${link.id || link.url}-${index}`} rel="noreferrer" target="_blank">
          {link.label}
        </a>
      ))}
    </div>
  );
}

export function PostFooterLinksEditor({
  compact = false,
  disabled = false,
  isRu,
  value,
  onChange
}: PostFooterLinksEditorProps) {
  const normalizedValue = normalizePostFooterLinksConfig(value);
  const [editingLink, setEditingLink] = useState<EditingLinkState | null>(null);
  const previewSlotCount = Math.min(
    Math.max(normalizedValue.links.length, getDefaultSlotCount(normalizedValue.layout)),
    12
  );
  const previewSlotIndexes = Array.from({ length: previewSlotCount }, (_, index) => index);

  useEffect(() => {
    if (!editingLink) {
      return;
    }

    if (editingLink.index >= 12) {
      setEditingLink(null);
    }
  }, [editingLink]);

  function openLinkEditor(index: number) {
    const currentLink = normalizedValue.links[index] || createEmptyLink(index);
    setEditingLink({
      index,
      link: {
        ...currentLink,
        id: currentLink.id || `link-${index + 1}`,
        enabled: true,
      },
    });
  }

  function updateLayout(layout: PostFooterLinksLayout) {
    onChange(ensureLayoutSlots(normalizedValue, layout));
  }

  function addLink() {
    const nextIndex = Math.min(
      Math.max(normalizedValue.links.length, getDefaultSlotCount(normalizedValue.layout)),
      11
    );
    openLinkEditor(nextIndex);
  }

  function saveEditingLink() {
    if (!editingLink) {
      return;
    }

    const nextLinks = [...normalizedValue.links];
    while (nextLinks.length <= editingLink.index && nextLinks.length < 12) {
      nextLinks.push(createEmptyLink(nextLinks.length));
    }

    nextLinks[editingLink.index] = {
      ...editingLink.link,
      label: editingLink.link.label.trim(),
      url: editingLink.link.url.trim(),
      enabled: true,
    };
    onChange(updateConfig(normalizedValue, { enabled: true, links: nextLinks }));
    setEditingLink(null);
  }

  function removeEditingLink() {
    if (!editingLink) {
      return;
    }

    if (editingLink.index < normalizedValue.links.length) {
      onChange(updateConfig(normalizedValue, {
        links: normalizedValue.links.filter((_, currentIndex) => currentIndex !== editingLink.index),
      }));
    }
    setEditingLink(null);
  }

  function updateEditingLink(patch: Partial<PostFooterLink>) {
    setEditingLink((current) => (
      current
        ? { ...current, link: { ...current.link, ...patch } }
        : current
    ));
  }

  return (
    <section className={`post-links-editor${compact ? ' post-links-editor--compact' : ''}`}>
      <div className="post-links-editor__head">
        <div>
          <h4>{isRu ? 'Ссылки под постом' : 'Post links'}</h4>
          <p>
            {isRu
              ? 'Выбери раскладку, а сами ссылки заполни через компактные ячейки.'
              : 'Choose a layout and fill each compact slot in a popup.'}
          </p>
        </div>

        <label className="post-links-switch">
          <input
            checked={normalizedValue.enabled}
            disabled={disabled}
            type="checkbox"
            onChange={(event) => onChange(updateConfig(normalizedValue, { enabled: event.target.checked }))}
          />
          <span>{normalizedValue.enabled ? (isRu ? 'Включено' : 'On') : (isRu ? 'Выключено' : 'Off')}</span>
        </label>
      </div>

      <div className="post-links-layout-row" role="radiogroup" aria-label={isRu ? 'Раскладка ссылок' : 'Post links layout'}>
        {layoutOptions.map((layout) => (
          <button
            aria-checked={normalizedValue.layout === layout}
            className={`post-links-layout-chip${normalizedValue.layout === layout ? ' post-links-layout-chip--active' : ''}`}
            disabled={disabled}
            key={layout}
            role="radio"
            type="button"
            onClick={() => updateLayout(layout)}
          >
            {getPostFooterLinksLayoutLabel(layout, isRu)}
          </button>
        ))}
      </div>

      <div className="post-links-editor__footer">
        <div
          aria-label={isRu ? 'Превью ссылок под постом' : 'Post links preview'}
          className={`post-links-edit-preview post-links-edit-preview--${normalizedValue.layout}${normalizedValue.enabled ? '' : ' post-links-edit-preview--disabled'}`}
        >
          {previewSlotIndexes.map((index) => {
            const link = normalizedValue.links[index];
            const label = link?.label.trim() || getSlotTitle(index, isRu);
            const isFilled = Boolean(link?.label.trim() || link?.url.trim());

            return (
              <button
                className={`post-links-preview-link${isFilled ? '' : ' post-links-preview-link--empty'}`}
                disabled={disabled}
                key={link?.id || index}
                type="button"
                onClick={() => openLinkEditor(index)}
              >
                {label}
              </button>
            );
          })}

          <button
            className="post-links-preview-link post-links-preview-link--add"
            disabled={disabled || normalizedValue.links.length >= 12}
            type="button"
            onClick={addLink}
          >
            {isRu ? '+ ссылка' : '+ link'}
          </button>
        </div>
      </div>

      {editingLink ? (
        <div
          className="post-links-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setEditingLink(null);
            }
          }}
        >
          <form
            aria-labelledby="post-links-modal-title"
            className="post-links-modal"
            role="dialog"
            aria-modal="true"
            onSubmit={(event) => {
              event.preventDefault();
              saveEditingLink();
            }}
          >
            <div className="post-links-modal__head">
              <div>
                <h4 id="post-links-modal-title">{getSlotTitle(editingLink.index, isRu)}</h4>
                <p>{isRu ? 'Введи текст, который будет виден под постом, и сам URL.' : 'Enter the visible text and the URL.'}</p>
              </div>
              <button
                aria-label={isRu ? 'Закрыть' : 'Close'}
                className="post-links-modal__close"
                type="button"
                onClick={() => setEditingLink(null)}
              >
                ×
              </button>
            </div>

            <label className="field-block">
              <span>{isRu ? 'Текст ссылки' : 'Link text'}</span>
              <input
                autoFocus
                disabled={disabled}
                placeholder={isRu ? 'Gift News 🎁' : 'Gift News 🎁'}
                value={editingLink.link.label}
                onChange={(event) => updateEditingLink({ label: event.target.value })}
              />
            </label>

            <label className="field-block">
              <span>URL</span>
              <input
                disabled={disabled}
                inputMode="url"
                placeholder="https://t.me/..."
                value={editingLink.link.url}
                onChange={(event) => updateEditingLink({ url: event.target.value })}
              />
            </label>

            <div className="post-links-modal__actions">
              <button
                className="secondary-button secondary-button--small secondary-button--danger"
                disabled={disabled}
                type="button"
                onClick={removeEditingLink}
              >
                {isRu ? 'Удалить' : 'Remove'}
              </button>
              <button className="primary-button primary-button--small" disabled={disabled} type="submit">
                {isRu ? 'Сохранить' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
