interface DraftCustomEmojiImportCardProps {
  hasSuccess: boolean;
  isRefreshing: boolean;
  isRu: boolean;
  isStarting: boolean;
  onStart: () => void;
}

export function DraftCustomEmojiImportCard({
  hasSuccess,
  isRefreshing,
  isRu,
  isStarting,
  onStart,
}: DraftCustomEmojiImportCardProps) {
  const title = isRu ? 'Premium emoji' : 'Premium emoji';
  const eyebrow = isRu ? 'Telegram import' : 'Telegram import';
  const description = isRu
    ? 'Добавь premium emoji в чате с ботом.'
    : 'Add premium emoji in the bot chat.';
  const successText = isRu
    ? 'Черновик обновился. Preview уже использует подкачанные premium emoji.'
    : 'The draft has been updated. The preview now uses the fetched premium emoji assets.';

  return (
    <section className={`emoji-import-card${hasSuccess ? ' emoji-import-card--success' : ''}`}>
      <div className="emoji-import-card__glow" aria-hidden="true" />

      <div className="emoji-import-card__header">
        <div className="emoji-import-card__title-group">
          <span className="emoji-import-card__mark" aria-hidden="true" />
          <div>
            <span className="emoji-import-card__eyebrow">{eyebrow}</span>
            <h4>{title}</h4>
          </div>
        </div>
        <div className="emoji-import-card__meta">
          {hasSuccess && (
            <span className="emoji-import-card__status">
              {isRu ? 'Preview готов' : 'Preview ready'}
            </span>
          )}
        </div>
      </div>

      <p className="emoji-import-card__description">{description}</p>

      <div className="emoji-import-card__idle">
        <button
          className="primary-button emoji-import-card__launch"
          disabled={isStarting || isRefreshing}
          onClick={onStart}
          type="button"
        >
          {isStarting
            ? (isRu ? 'Копируем и открываем бота...' : 'Copying and opening the bot...')
            : isRu ? 'Скопировать текст' : 'Copy text'}
        </button>
        <p className="emoji-import-card__hint">
          {isRu
            ? 'После нажатия mini app скопирует текст, свернётся и сразу откроет бота.'
            : 'After tapping, the mini app copies the text, closes, and opens the bot immediately.'}
        </p>
      </div>

      {(hasSuccess || isRefreshing) && (
        <div className="emoji-import-card__success-banner">
          <strong>{isRefreshing ? (isRu ? 'Обновляем превью...' : 'Refreshing preview...') : successText}</strong>
        </div>
      )}
    </section>
  );
}
