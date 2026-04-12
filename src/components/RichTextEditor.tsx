import { useEffect, useRef, useState } from 'react';
import { Mark, Node, mergeAttributes } from '@tiptap/core';
import HardBreak from '@tiptap/extension-hard-break';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { DraftCustomEmojiPreview } from '../lib/api';
import { normalizeRichTextHtml, richTextToEditorHtml } from '../lib/richText';

interface RichTextEditorProps {
  ariaLabel: string;
  customEmojiPreviews?: DraftCustomEmojiPreview[];
  isRu: boolean;
  onChange: (value: string) => void;
  placeholder: string;
  readOnly?: boolean;
  value: string;
}

interface LinkDialogState {
  from: number;
  to: number;
}

const TelegramSpoiler = Mark.create({
  name: 'telegramSpoiler',
  parseHTML() {
    return [{ tag: 'tg-spoiler' }, { tag: 'span.tg-spoiler' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['tg-spoiler', mergeAttributes(HTMLAttributes), 0];
  }
});

const ExpandableBlockquote = Node.create({
  name: 'expandableBlockquote',
  group: 'block',
  content: 'block+',
  defining: true,
  parseHTML() {
    return [{ tag: 'blockquote[expandable]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['blockquote', mergeAttributes(HTMLAttributes, { expandable: '' }), 0];
  }
});

const TelegramEmoji = Node.create({
  name: 'telegramEmoji',
  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      emojiId: {
        default: '',
        parseHTML: (element) => String((element as HTMLElement).getAttribute('emoji-id') || '').trim()
      },
      fallback: {
        default: '',
        parseHTML: (element) => String((element as HTMLElement).textContent || '')
      }
    };
  },
  parseHTML() {
    return [{ tag: 'tg-emoji' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['tg-emoji', { 'emoji-id': HTMLAttributes.emojiId }, HTMLAttributes.fallback || ''];
  }
});

const TelegramTime = Node.create({
  name: 'telegramTime',
  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      unix: {
        default: ''
      },
      format: {
        default: null
      },
      label: {
        default: 'time'
      }
    };
  },
  parseHTML() {
    return [{ tag: 'tg-time' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['tg-time', { unix: HTMLAttributes.unix, format: HTMLAttributes.format }, HTMLAttributes.label || 'time'];
  }
});

const TelegramHardBreak = HardBreak.extend({
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        if (this.editor.isActive('codeBlock')) {
          return false;
        }

        return this.editor.commands.setHardBreak();
      },
      'Shift-Enter': () => this.editor.commands.setHardBreak()
    };
  }
});

function ToolbarButton({
  active = false,
  ariaLabel,
  disabled = false,
  label,
  onClick
}: {
  active?: boolean;
  ariaLabel: string;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className={`secondary-button secondary-button--small rich-text-tool${active ? ' rich-text-tool--active' : ''}`}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

export function RichTextEditor({
  ariaLabel,
  customEmojiPreviews = [],
  isRu,
  onChange,
  placeholder,
  readOnly = false,
  value
}: RichTextEditorProps) {
  const normalizedValue = normalizeRichTextHtml(value);
  const editorHtml = richTextToEditorHtml(normalizedValue);
  const [linkDialog, setLinkDialog] = useState<LinkDialogState | null>(null);
  const [linkValue, setLinkValue] = useState('');
  const editorRootRef = useRef<HTMLDivElement | null>(null);
  const linkInputRef = useRef<HTMLInputElement | null>(null);

  const editor = useEditor({
    immediatelyRender: true,
    editable: !readOnly,
    extensions: [
      StarterKit.configure({
        bulletList: false,
        dropcursor: false,
        gapcursor: false,
        heading: false,
        hardBreak: false,
        horizontalRule: false,
        orderedList: false
      }),
      TelegramHardBreak,
      Underline,
      Link.configure({
        autolink: false,
        openOnClick: false
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty'
      }),
      TelegramSpoiler,
      ExpandableBlockquote,
      TelegramEmoji,
      TelegramTime
    ],
    content: editorHtml,
    editorProps: {
      attributes: {
        'aria-label': ariaLabel,
        class: 'rich-text-editor__content'
      }
    },
    onUpdate: ({ editor: currentEditor }) => {
      const nextValue = currentEditor.isEmpty ? '' : normalizeRichTextHtml(currentEditor.getHTML());
      if (nextValue !== normalizedValue) {
        onChange(nextValue);
      }
    }
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const currentValue = editor.isEmpty ? '' : normalizeRichTextHtml(editor.getHTML());
    if (currentValue === normalizedValue) {
      return;
    }

    editor.commands.setContent(editorHtml, { emitUpdate: false });
  }, [editor, editorHtml, normalizedValue]);

  useEffect(() => {
    const root = editorRootRef.current?.querySelector('.rich-text-editor__content');
    if (!(root instanceof HTMLElement)) {
      return;
    }

    const previewMap = new Map(customEmojiPreviews.map((preview) => [preview.customEmojiId, preview]));
    const customEmojiNodes = Array.from(root.querySelectorAll('tg-emoji'));

    for (const node of customEmojiNodes) {
      const emojiId = String(node.getAttribute('emoji-id') || '').trim();
      const preview = previewMap.get(emojiId);
      const fallbackText = String(node.getAttribute('data-fallback-text') || node.textContent || '');

      node.setAttribute('data-fallback-text', fallbackText);

      if (!preview?.previewUrl) {
        node.classList.remove('telegram-custom-emoji');
        node.textContent = fallbackText;
        continue;
      }

      node.classList.add('telegram-custom-emoji');

      const assetContainer = document.createElement('span');
      assetContainer.className = 'telegram-custom-emoji__inner';

      if (preview.previewKind === 'video') {
        const video = document.createElement('video');
        video.autoplay = true;
        video.className = 'telegram-custom-emoji__asset';
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.src = preview.previewUrl;
        assetContainer.append(video);
      } else {
        const image = document.createElement('img');
        image.alt = preview.altText || fallbackText || 'premium emoji';
        image.className = 'telegram-custom-emoji__asset';
        image.decoding = 'async';
        image.loading = 'lazy';
        image.src = preview.previewUrl;
        assetContainer.append(image);
      }

      const accessibleFallback = document.createElement('span');
      accessibleFallback.className = 'telegram-custom-emoji__fallback';
      accessibleFallback.textContent = fallbackText || preview.altText || 'premium emoji';
      assetContainer.append(accessibleFallback);

      node.replaceChildren(assetContainer);
    }
  }, [customEmojiPreviews, normalizedValue]);

  useEffect(() => {
    if (!linkDialog) {
      return;
    }

    window.requestAnimationFrame(() => {
      linkInputRef.current?.focus({ preventScroll: true });
      linkInputRef.current?.select();
    });
  }, [linkDialog]);

  if (!editor) {
    return null;
  }

  function openLinkDialog() {
    const { from, to } = editor.state.selection;
    const href = String(editor.getAttributes('link').href || '').trim();
    setLinkValue(href || 'https://');
    setLinkDialog({ from, to });
  }

  function closeLinkDialog() {
    setLinkDialog(null);
    setLinkValue('');
  }

  function applyLink(nextHref: string) {
    if (!linkDialog) {
      return;
    }

    const chain = editor.chain().focus().setTextSelection({ from: linkDialog.from, to: linkDialog.to }).extendMarkRange('link');
    if (!nextHref) {
      chain.unsetLink().run();
      closeLinkDialog();
      return;
    }

    chain.setLink({ href: nextHref }).run();
    closeLinkDialog();
  }

  return (
    <div className="rich-text-editor-shell">
      <div className="rich-text-toolbar" role="toolbar" aria-label={isRu ? 'Форматирование текста Telegram' : 'Telegram text formatting'}>
        <ToolbarButton active={editor.isActive('bold')} ariaLabel={isRu ? 'Жирный' : 'Bold'} disabled={readOnly} label="B" onClick={() => editor.chain().focus().toggleBold().run()} />
        <ToolbarButton active={editor.isActive('italic')} ariaLabel={isRu ? 'Курсив' : 'Italic'} disabled={readOnly} label="I" onClick={() => editor.chain().focus().toggleItalic().run()} />
        <ToolbarButton active={editor.isActive('underline')} ariaLabel={isRu ? 'Подчеркнутый' : 'Underline'} disabled={readOnly} label="U" onClick={() => editor.chain().focus().toggleUnderline().run()} />
        <ToolbarButton active={editor.isActive('strike')} ariaLabel={isRu ? 'Зачеркнутый' : 'Strikethrough'} disabled={readOnly} label="S" onClick={() => editor.chain().focus().toggleStrike().run()} />
        <ToolbarButton active={editor.isActive('blockquote')} ariaLabel={isRu ? 'Цитата' : 'Quote'} disabled={readOnly} label="Q" onClick={() => editor.chain().focus().toggleBlockquote().run()} />
        <ToolbarButton active={editor.isActive('code')} ariaLabel={isRu ? 'Моноширинный текст' : 'Inline code'} disabled={readOnly} label="<>" onClick={() => editor.chain().focus().toggleCode().run()} />
        <ToolbarButton active={editor.isActive('codeBlock')} ariaLabel={isRu ? 'Блок кода' : 'Code block'} disabled={readOnly} label="PRE" onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
        <ToolbarButton active={editor.isActive('link')} ariaLabel={isRu ? 'Ссылка' : 'Link'} disabled={readOnly} label="LINK" onClick={openLinkDialog} />
      </div>

      <div ref={editorRootRef} className="draft-editor rich-text-editor">
        <EditorContent editor={editor} />
      </div>

      {linkDialog && (
        <div className="rich-text-dialog-backdrop" onClick={closeLinkDialog} role="presentation">
          <div
            aria-modal="true"
            className="rich-text-dialog"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="rich-text-dialog__head">
              <strong>{isRu ? 'Ссылка' : 'Link'}</strong>
              <p>{isRu ? 'Вставь обычный URL или tg://user?id=...' : 'Use a regular URL or tg://user?id=...'}</p>
            </div>

            <label className="field-block rich-text-dialog__field">
              <span>{isRu ? 'Адрес' : 'Address'}</span>
              <input
                ref={linkInputRef}
                placeholder="https://"
                type="text"
                value={linkValue}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    applyLink(linkValue.trim());
                    return;
                  }

                  if (event.key === 'Escape') {
                    event.preventDefault();
                    closeLinkDialog();
                  }
                }}
                onChange={(event) => setLinkValue(event.target.value)}
              />
            </label>

            <div className="rich-text-dialog__actions">
              <button className="secondary-button secondary-button--small" onClick={closeLinkDialog} type="button">
                {isRu ? 'Отмена' : 'Cancel'}
              </button>
              <button className="secondary-button secondary-button--small" onClick={() => applyLink('')} type="button">
                {isRu ? 'Убрать' : 'Remove'}
              </button>
              <button className="primary-button primary-button--profile" onClick={() => applyLink(linkValue.trim())} type="button">
                {isRu ? 'Готово' : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
