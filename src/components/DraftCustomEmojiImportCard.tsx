interface DraftCustomEmojiImportCardProps {
  copyText: string;
  hasSuccess: boolean;
  isRefreshing: boolean;
  isRu: boolean;
  isSessionReady: boolean;
  isStarting: boolean;
  onCopy: () => void;
  onOpenBot: () => void;
  onStart: () => void;
}

export function DraftCustomEmojiImportCard({
  copyText,
  hasSuccess,
  isRefreshing,
  isRu,
  isSessionReady,
  isStarting,
  onCopy,
  onOpenBot,
  onStart,
}: DraftCustomEmojiImportCardProps) {
  const title = isRu ? 'Premium emoji' : 'Premium emoji';
  const description = isRu
    ? 'Импортируй premium emoji через бота и сразу возвращайся в mini app с готовым preview.'
    : 'Import premium emoji through the bot and come back to the mini app with the preview ready.';
  const warningText = isRu
    ? 'Не переписывай текст в боте: добавь emoji в нужные места и отправь сообщение как есть.'
    : 'Do not rewrite the text in the bot: only place emoji where you need them and send it back.';
  const successText = isRu
    ? 'Черновик обновился. Preview уже использует подкачанные premium emoji.'
    : 'The draft has been updated. The preview now uses the fetched premium emoji assets.';

  return (
    <section className={`emoji-import-card${isSessionReady ? ' emoji-import-card--active' : ''}${hasSuccess ? ' emoji-import-card--success' : ''}`}>
      <div className="emoji-import-card__glow" aria-hidden="true" />

      <div className="emoji-import-card__header">
        <div>
          <span className="emoji-import-card__eyebrow">{isRu ? 'Telegram flow' : 'Telegram flow'}</span>
          <h4>{title}</h4>
        </div>
        {hasSuccess && (
          <span className="emoji-import-card__status">
            {isRu ? 'Preview готов' : 'Preview ready'}
          </span>
        )}
      </div>

      <p className="emoji-import-card__description">{description}</p>

      {!isSessionReady && (
        <div className="emoji-import-card__idle">
          <button
            className="secondary-button secondary-button--small emoji-import-card__launch"
            disabled={isStarting || isRefreshing}
            onClick={onStart}
            type="button"
          >
            {isStarting
              ? (isRu ? 'Готовим...' : 'Preparing...')
              : isRu ? 'Добавить premium emoji' : 'Add premium emoji'}
          </button>
          <p className="emoji-import-card__hint">
            {isRu
              ? 'Mini app подготовит текст для копирования и откроет бота отдельным шагом.'
              : 'The mini app will prepare the text for copying and open the bot in a separate step.'}
          </p>
        </div>
      )}

      {isSessionReady && (
        <>
          <div className="emoji-import-card__steps" aria-label={isRu ? 'Шаги импорта' : 'Import steps'}>
            <span>{isRu ? '1. Скопируй текст' : '1. Copy the text'}</span>
            <span>{isRu ? '2. Открой бота' : '2. Open the bot'}</span>
            <span>{isRu ? '3. Добавь emoji и отправь' : '3. Add emoji and send'}</span>
          </div>

          <div className="emoji-import-card__preview-shell">
            <div className="emoji-import-card__preview-head">
              <strong>{isRu ? 'Текст для копирования' : 'Text to copy'}</strong>
              <span>{isRu ? `${copyText.length} символов` : `${copyText.length} chars`}</span>
            </div>
            <pre className="emoji-import-card__preview">{copyText}</pre>
          </div>

          <div className="emoji-import-card__actions">
            <button className="primary-button emoji-import-card__primary" onClick={onCopy} type="button">
              {isRu ? 'Скопировать текст' : 'Copy text'}
            </button>
            <button className="secondary-button emoji-import-card__secondary" onClick={onOpenBot} type="button">
              {isRu ? 'Открыть бота' : 'Open bot'}
            </button>
          </div>

          <p className="emoji-import-card__warning">{warningText}</p>
        </>
      )}

      {(hasSuccess || isRefreshing) && (
        <div className="emoji-import-card__success-banner">
          <strong>{isRefreshing ? (isRu ? 'Обновляем превью...' : 'Refreshing preview...') : successText}</strong>
        </div>
      )}
    </section>
  );
}
