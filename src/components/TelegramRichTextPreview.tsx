import { useEffect, useMemo, useRef } from 'react';
import type { DraftCustomEmojiPreview } from '../lib/api';

interface TelegramRichTextPreviewProps {
  customEmojiPreviews?: DraftCustomEmojiPreview[];
  html: string;
}

export function TelegramRichTextPreview({
  customEmojiPreviews = [],
  html,
}: TelegramRichTextPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previewMap = useMemo(
    () => new Map(customEmojiPreviews.map((preview) => [preview.customEmojiId, preview])),
    [customEmojiPreviews]
  );

  useEffect(() => {
    const root = containerRef.current;
    if (!root) {
      return;
    }

    const customEmojiNodes = Array.from(root.querySelectorAll('tg-emoji'));
    for (const node of customEmojiNodes) {
      const emojiId = String(node.getAttribute('emoji-id') || '').trim();
      const preview = previewMap.get(emojiId);
      const fallbackText = String(
        node.getAttribute('data-fallback-text') || node.textContent || ''
      );

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
  }, [html, previewMap]);

  return <div ref={containerRef} className="telegram-render" dangerouslySetInnerHTML={{ __html: html }} />;
}
