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
    ? '\u041e\u0442\u043a\u0440\u043e\u0439 \u0431\u043e\u0442\u0430 \u0438 \u0441\u043a\u043e\u043f\u0438\u0440\u0443\u0439 \u0442\u0435\u043a\u0443\u0449\u0443\u044e \u0432\u0435\u0440\u0441\u0438\u044e \u0443\u0436\u0435 \u0438\u0437 Telegram.'
    : 'Open the bot and copy the current version right inside Telegram.';
  const successText = isRu
    ? '\u0427\u0435\u0440\u043d\u043e\u0432\u0438\u043a \u043e\u0431\u043d\u043e\u0432\u0438\u043b\u0441\u044f. Preview \u0443\u0436\u0435 \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0435\u0442 \u043f\u043e\u0434\u043a\u0430\u0447\u0430\u043d\u043d\u044b\u0435 premium emoji.'
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
              {isRu ? 'Preview \u0433\u043e\u0442\u043e\u0432' : 'Preview ready'}
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
            ? (isRu ? '\u041e\u0442\u043a\u0440\u044b\u0432\u0430\u0435\u043c \u0431\u043e\u0442\u0430...' : 'Opening the bot...')
            : isRu ? '\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u0431\u043e\u0442\u0430' : 'Open bot'}
        </button>
        <p className="emoji-import-card__hint">
          {isRu
            ? '\u0411\u043e\u0442 \u0441\u0440\u0430\u0437\u0443 \u043f\u0440\u0438\u0448\u043b\u0451\u0442 \u0442\u0435\u043a\u0443\u0449\u0438\u0439 \u0442\u0435\u043a\u0441\u0442 \u0441 \u0443\u0436\u0435 \u043f\u043e\u0434\u0442\u044f\u043d\u0443\u0442\u044b\u043c\u0438 premium emoji, \u0435\u0441\u043b\u0438 \u043e\u043d\u0438 \u0442\u0430\u043c \u0443\u0436\u0435 \u0435\u0441\u0442\u044c.'
            : 'The bot immediately sends the current text with any fetched premium emoji already inside Telegram.'}
        </p>
      </div>

      {(hasSuccess || isRefreshing) && (
        <div className="emoji-import-card__success-banner">
          <strong>{isRefreshing ? (isRu ? '\u041e\u0431\u043d\u043e\u0432\u043b\u044f\u0435\u043c preview...' : 'Refreshing preview...') : successText}</strong>
        </div>
      )}
    </section>
  );
}
