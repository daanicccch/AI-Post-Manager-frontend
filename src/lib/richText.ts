function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function normalizeText(value: string): string {
  return String(value || '').replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n');
}

function sanitizeHref(value: string | null): string | null {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed, window.location.origin);
    if (!['http:', 'https:', 'mailto:', 'tg:'].includes(url.protocol)) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function sanitizeLanguageClass(value: string | null): string | null {
  const match = String(value || '')
    .split(/\s+/)
    .find((className) => /^language-[a-z0-9_-]+$/i.test(className));

  return match || null;
}

function sanitizeTimeFormat(value: string | null): string | null {
  const trimmed = String(value || '').trim();
  return /^[A-Za-z]+$/.test(trimmed) ? trimmed : null;
}

function sanitizeTextNodeToTelegram(value: string): string {
  return escapeHtml(normalizeText(value));
}

function sanitizeTextNodeToEditor(value: string): string {
  return escapeHtml(normalizeText(value)).replace(/\n/g, '<br />');
}

function cleanTelegramParagraph(value: string): string {
  return value.replace(/\n{3,}/g, '\n\n').trim();
}

function splitTelegramParagraphs(value: string): string[] {
  return cleanTelegramParagraph(value)
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function cleanEditorParagraph(value: string): string {
  return value
    .replace(/^(?:\s*<br \/>\s*)+/g, '')
    .replace(/(?:\s*<br \/>\s*)+$/g, '')
    .trim();
}

function splitEditorParagraphs(value: string): string[] {
  return value
    .split(/(?:\s*<br \/>\s*){2,}/)
    .map(cleanEditorParagraph)
    .filter(Boolean);
}

function sanitizeInlineElementToTelegram(element: HTMLElement): string {
  const tagName = element.tagName.toLowerCase();

  switch (tagName) {
    case 'a': {
      const href = sanitizeHref(element.getAttribute('href'));
      const content = sanitizeInlineNodesToTelegram(Array.from(element.childNodes));
      if (!href) {
        return content;
      }

      return `<a href="${escapeAttribute(href)}">${content || escapeHtml(href)}</a>`;
    }
    case 'b':
    case 'strong':
      return `<strong>${sanitizeInlineNodesToTelegram(Array.from(element.childNodes))}</strong>`;
    case 'i':
    case 'em':
      return `<em>${sanitizeInlineNodesToTelegram(Array.from(element.childNodes))}</em>`;
    case 'u':
    case 'ins':
      return `<u>${sanitizeInlineNodesToTelegram(Array.from(element.childNodes))}</u>`;
    case 's':
    case 'strike':
    case 'del':
      return `<s>${sanitizeInlineNodesToTelegram(Array.from(element.childNodes))}</s>`;
    case 'tg-spoiler':
      return `<tg-spoiler>${sanitizeInlineNodesToTelegram(Array.from(element.childNodes))}</tg-spoiler>`;
    case 'span':
      if (element.classList.contains('tg-spoiler')) {
        return `<tg-spoiler>${sanitizeInlineNodesToTelegram(Array.from(element.childNodes))}</tg-spoiler>`;
      }

      return sanitizeInlineNodesToTelegram(Array.from(element.childNodes));
    case 'code':
      return `<code>${escapeHtml(normalizeText(element.textContent || ''))}</code>`;
    case 'br':
      return '\n';
    case 'tg-emoji': {
      const emojiId = String(element.getAttribute('emoji-id') || '').trim();
      const fallback = escapeHtml(normalizeText(element.textContent || ''));
      return /^\d+$/.test(emojiId) && fallback
        ? `<tg-emoji emoji-id="${emojiId}">${fallback}</tg-emoji>`
        : fallback;
    }
    case 'tg-time': {
      const unix = String(element.getAttribute('unix') || '').trim();
      const format = sanitizeTimeFormat(element.getAttribute('format'));
      const label = escapeHtml(normalizeText(element.textContent || ''));
      if (!/^\d+$/.test(unix) || !label) {
        return label;
      }

      return `<tg-time unix="${unix}"${format ? ` format="${format}"` : ''}>${label}</tg-time>`;
    }
    default:
      return sanitizeInlineNodesToTelegram(Array.from(element.childNodes));
  }
}

function sanitizeInlineNodesToTelegram(nodes: ChildNode[]): string {
  return nodes
    .map((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        return sanitizeTextNodeToTelegram(node.textContent || '');
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return '';
      }

      return sanitizeInlineElementToTelegram(node as HTMLElement);
    })
    .join('');
}

function sanitizePreToTelegram(element: HTMLElement): string {
  const codeChild =
    element.firstElementChild instanceof HTMLElement && element.firstElementChild.tagName.toLowerCase() === 'code'
      ? element.firstElementChild
      : null;
  const languageClass = sanitizeLanguageClass(codeChild?.getAttribute('class') || element.getAttribute('class'));
  const content = escapeHtml(normalizeText(codeChild?.textContent || element.textContent || ''));

  if (!content.trim()) {
    return '';
  }

  return languageClass
    ? `<pre><code class="${languageClass}">${content}</code></pre>`
    : `<pre>${content}</pre>`;
}

function collectTelegramBlocks(nodes: ChildNode[]): string[] {
  const blocks: string[] = [];
  let inlineBuffer = '';

  const flushInlineBuffer = () => {
    if (!inlineBuffer) {
      return;
    }

    blocks.push(...splitTelegramParagraphs(inlineBuffer));
    inlineBuffer = '';
  };

  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      inlineBuffer += sanitizeTextNodeToTelegram(node.textContent || '');
      continue;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      continue;
    }

    const element = node as HTMLElement;
    const tagName = element.tagName.toLowerCase();

    if (tagName === 'br') {
      inlineBuffer += '\n';
      continue;
    }

    if (tagName === 'p' || tagName === 'div' || tagName === 'section' || tagName === 'article') {
      flushInlineBuffer();
      const paragraph = cleanTelegramParagraph(sanitizeInlineNodesToTelegram(Array.from(element.childNodes)));
      if (paragraph) {
        blocks.push(...splitTelegramParagraphs(paragraph));
      }

      continue;
    }

    if (tagName === 'ul' || tagName === 'ol') {
      flushInlineBuffer();
      const listItems = Array.from(element.children).filter(
        (child): child is HTMLElement => child instanceof HTMLElement && child.tagName.toLowerCase() === 'li'
      );

      listItems.forEach((item, index) => {
        const prefix = tagName === 'ol' ? `${index + 1}. ` : '• ';
        const content = cleanTelegramParagraph(sanitizeInlineNodesToTelegram(Array.from(item.childNodes)));
        if (content) {
          blocks.push(`${prefix}${content}`);
        }
      });
      continue;
    }

    if (tagName === 'blockquote') {
      flushInlineBuffer();
      const quoteContent = collectTelegramBlocks(Array.from(element.childNodes)).join('\n');
      if (quoteContent.trim()) {
        blocks.push(`<blockquote${element.hasAttribute('expandable') ? ' expandable' : ''}>${quoteContent}</blockquote>`);
      }

      continue;
    }

    if (tagName === 'pre') {
      flushInlineBuffer();
      const preformatted = sanitizePreToTelegram(element);
      if (preformatted) {
        blocks.push(preformatted);
      }

      continue;
    }

    inlineBuffer += sanitizeInlineElementToTelegram(element);
  }

  flushInlineBuffer();
  return blocks;
}

function sanitizeInlineElementToEditor(element: HTMLElement): string {
  const tagName = element.tagName.toLowerCase();

  switch (tagName) {
    case 'a': {
      const href = sanitizeHref(element.getAttribute('href'));
      const content = sanitizeInlineNodesToEditor(Array.from(element.childNodes));
      if (!href) {
        return content;
      }

      return `<a href="${escapeAttribute(href)}">${content || escapeHtml(href)}</a>`;
    }
    case 'b':
    case 'strong':
      return `<strong>${sanitizeInlineNodesToEditor(Array.from(element.childNodes))}</strong>`;
    case 'i':
    case 'em':
      return `<em>${sanitizeInlineNodesToEditor(Array.from(element.childNodes))}</em>`;
    case 'u':
    case 'ins':
      return `<u>${sanitizeInlineNodesToEditor(Array.from(element.childNodes))}</u>`;
    case 's':
    case 'strike':
    case 'del':
      return `<s>${sanitizeInlineNodesToEditor(Array.from(element.childNodes))}</s>`;
    case 'tg-spoiler':
      return `<tg-spoiler>${sanitizeInlineNodesToEditor(Array.from(element.childNodes))}</tg-spoiler>`;
    case 'span':
      if (element.classList.contains('tg-spoiler')) {
        return `<tg-spoiler>${sanitizeInlineNodesToEditor(Array.from(element.childNodes))}</tg-spoiler>`;
      }

      return sanitizeInlineNodesToEditor(Array.from(element.childNodes));
    case 'code':
      return `<code>${escapeHtml(normalizeText(element.textContent || ''))}</code>`;
    case 'br':
      return '<br />';
    case 'tg-emoji': {
      const emojiId = String(element.getAttribute('emoji-id') || '').trim();
      const fallback = escapeHtml(normalizeText(element.textContent || ''));
      return /^\d+$/.test(emojiId) && fallback
        ? `<tg-emoji emoji-id="${emojiId}">${fallback}</tg-emoji>`
        : fallback;
    }
    case 'tg-time': {
      const unix = String(element.getAttribute('unix') || '').trim();
      const format = sanitizeTimeFormat(element.getAttribute('format'));
      const label = escapeHtml(normalizeText(element.textContent || ''));
      if (!/^\d+$/.test(unix) || !label) {
        return label;
      }

      return `<tg-time unix="${unix}"${format ? ` format="${format}"` : ''}>${label}</tg-time>`;
    }
    default:
      return sanitizeInlineNodesToEditor(Array.from(element.childNodes));
  }
}

function sanitizeInlineNodesToEditor(nodes: ChildNode[]): string {
  return nodes
    .map((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        return sanitizeTextNodeToEditor(node.textContent || '');
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return '';
      }

      return sanitizeInlineElementToEditor(node as HTMLElement);
    })
    .join('');
}

function sanitizePreToEditor(element: HTMLElement): string {
  const codeChild =
    element.firstElementChild instanceof HTMLElement && element.firstElementChild.tagName.toLowerCase() === 'code'
      ? element.firstElementChild
      : null;
  const languageClass = sanitizeLanguageClass(codeChild?.getAttribute('class') || element.getAttribute('class'));
  const content = escapeHtml(normalizeText(codeChild?.textContent || element.textContent || ''));

  if (!content.trim()) {
    return '';
  }

  return languageClass
    ? `<pre><code class="${languageClass}">${content}</code></pre>`
    : `<pre>${content}</pre>`;
}

function collectEditorBlocks(nodes: ChildNode[]): string[] {
  const blocks: string[] = [];
  let inlineBuffer = '';

  const flushInlineBuffer = () => {
    if (!inlineBuffer) {
      return;
    }

    const paragraphs = splitEditorParagraphs(inlineBuffer);
    if (paragraphs.length === 0) {
      inlineBuffer = '';
      return;
    }

    blocks.push(...paragraphs.map((paragraph) => `<p>${paragraph}</p>`));
    inlineBuffer = '';
  };

  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      inlineBuffer += sanitizeTextNodeToEditor(node.textContent || '');
      continue;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      continue;
    }

    const element = node as HTMLElement;
    const tagName = element.tagName.toLowerCase();

    if (tagName === 'br') {
      inlineBuffer += '<br />';
      continue;
    }

    if (tagName === 'p' || tagName === 'div' || tagName === 'section' || tagName === 'article') {
      flushInlineBuffer();
      const content = sanitizeInlineNodesToEditor(Array.from(element.childNodes));
      const paragraphs = splitEditorParagraphs(content);
      blocks.push(...paragraphs.map((paragraph) => `<p>${paragraph}</p>`));
      continue;
    }

    if (tagName === 'blockquote') {
      flushInlineBuffer();
      const quoteBlocks = collectEditorBlocks(Array.from(element.childNodes));
      if (quoteBlocks.length > 0) {
        blocks.push(`<blockquote${element.hasAttribute('expandable') ? ' expandable' : ''}>${quoteBlocks.join('')}</blockquote>`);
      }

      continue;
    }

    if (tagName === 'pre') {
      flushInlineBuffer();
      const preformatted = sanitizePreToEditor(element);
      if (preformatted) {
        blocks.push(preformatted);
      }

      continue;
    }

    if (tagName === 'ul' || tagName === 'ol') {
      flushInlineBuffer();
      const listItems = Array.from(element.children).filter(
        (child): child is HTMLElement => child instanceof HTMLElement && child.tagName.toLowerCase() === 'li'
      );
      blocks.push(
        ...listItems.map((item, index) => {
          const prefix = tagName === 'ol' ? `${index + 1}. ` : '• ';
          const content = cleanEditorParagraph(sanitizeInlineNodesToEditor(Array.from(item.childNodes)));
          return `<p>${prefix}${content}</p>`;
        })
      );
      continue;
    }

    inlineBuffer += sanitizeInlineElementToEditor(element);
  }

  flushInlineBuffer();
  return blocks;
}

export function normalizeRichTextHtml(value: string | null | undefined): string {
  const normalizedValue = normalizeText(String(value || '')).trim();
  if (!normalizedValue) {
    return '';
  }

  const parser = new DOMParser();
  const documentBody = parser.parseFromString(`<body>${normalizedValue}</body>`, 'text/html').body;
  return collectTelegramBlocks(Array.from(documentBody.childNodes)).join('\n\n').trim();
}

export function richTextToEditorHtml(value: string | null | undefined): string {
  const telegramHtml = normalizeRichTextHtml(value);
  if (!telegramHtml) {
    return '<p></p>';
  }

  const parser = new DOMParser();
  const documentBody = parser.parseFromString(`<body>${telegramHtml}</body>`, 'text/html').body;
  const blocks = collectEditorBlocks(Array.from(documentBody.childNodes));
  return blocks.join('') || '<p></p>';
}
