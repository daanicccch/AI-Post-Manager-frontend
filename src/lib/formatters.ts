export function formatDate(value: string | null | undefined, language: 'ru' | 'en' = 'ru') {
  if (!value) return '-';
  return new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-US', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

export function toDateTimeLocalInput(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function stripHtml(value: string | null | undefined) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }

  const withoutTags = normalized
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  return withoutTags.replace(/\s+/g, ' ').trim();
}

export function summarizeRichText(value: string | null | undefined, maxLength = 180) {
  const plainText = stripHtml(value);
  if (plainText.length <= maxLength) {
    return plainText;
  }

  return `${plainText.slice(0, maxLength).trimEnd()}...`;
}

export function isImagePath(value: string | null | undefined) {
  return /\.(jpg|jpeg|png|webp|gif|bmp|svg)$/i.test(String(value || '').trim());
}

export function isVideoPath(value: string | null | undefined) {
  return /\.(mp4|mov|webm)$/i.test(String(value || '').trim());
}
