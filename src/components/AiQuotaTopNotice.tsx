import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useAppLocale } from '../lib/appLocale';
import {
  dismissAiQuotaNotice,
  getAiQuotaNoticeSnapshot,
  subscribeToAiQuotaNotice,
} from '../lib/aiQuotaNotice';

function padTime(value: number) {
  return String(Math.max(0, value)).padStart(2, '0');
}

function formatCountdown(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${padTime(hours)}:${padTime(minutes)}:${padTime(seconds)}`;
}

function formatUsageLabel(used?: number, limit?: number, isRu?: boolean) {
  if (!Number.isFinite(used) || !Number.isFinite(limit)) {
    return null;
  }

  return isRu ? `Использовано ${used} из ${limit}` : `Used ${used} of ${limit}`;
}

function formatTimerLabel(resetAtMs: number | null, now: number, isRu: boolean) {
  if (typeof resetAtMs !== 'number') {
    return null;
  }

  const countdown = formatCountdown(resetAtMs - now);
  return isRu ? `Сброс через ${countdown}` : `Resets in ${countdown}`;
}

function getHint(action: string | undefined, isRu: boolean) {
  if (action === 'generate_style') {
    return isRu
      ? 'Генерация стиля и генерация постов расходуют один общий дневной лимит.'
      : 'Style generation and post generation share the same daily limit.';
  }

  return isRu
    ? 'Посты и генерация стиля расходуют один общий дневной лимит.'
    : 'Posts and style generation share the same daily limit.';
}

export function AiQuotaTopNotice() {
  const notice = useSyncExternalStore(
    subscribeToAiQuotaNotice,
    getAiQuotaNoticeSnapshot,
    getAiQuotaNoticeSnapshot
  );
  const { language } = useAppLocale();
  const [now, setNow] = useState(() => Date.now());
  const isRu = language === 'ru';
  const resetAtMs = useMemo(() => {
    const timestamp = Date.parse(String(notice.resetAt || ''));
    return Number.isFinite(timestamp) ? timestamp : null;
  }, [notice.resetAt]);

  useEffect(() => {
    if (!notice.visible || typeof resetAtMs !== 'number') {
      return;
    }

    const tick = () => {
      const nextNow = Date.now();
      if (nextNow >= resetAtMs) {
        dismissAiQuotaNotice();
        return;
      }

      setNow(nextNow);
    };

    tick();
    const timerId = window.setInterval(tick, 1000);
    return () => window.clearInterval(timerId);
  }, [notice.visible, notice.publishedAt, resetAtMs]);

  if (!notice.visible) {
    return null;
  }

  const usageLabel = formatUsageLabel(notice.used, notice.limit, isRu);
  const timerLabel = formatTimerLabel(resetAtMs, now, isRu);
  const title = isRu ? 'Лимит AI на сегодня исчерпан' : 'Daily AI limit reached';
  const eyebrow = isRu ? 'Дневной лимит AI' : 'Daily AI quota';
  const hint = getHint(notice.action, isRu);
  const dismissLabel = isRu ? 'Закрыть уведомление' : 'Dismiss notice';

  return (
    <section className="quota-top-notice" aria-live="polite" role="status">
      <div className="quota-top-notice__content">
        <div className="quota-top-notice__pulse" aria-hidden="true" />

        <div className="quota-top-notice__head">
          <div className="quota-top-notice__copy">
            <span className="quota-top-notice__eyebrow">{eyebrow}</span>
            <strong className="quota-top-notice__title">{title}</strong>
            <p className="quota-top-notice__message">{notice.message}</p>
          </div>

          <button
            aria-label={dismissLabel}
            className="quota-top-notice__dismiss"
            onClick={dismissAiQuotaNotice}
            type="button"
          >
            &times;
          </button>
        </div>

        {usageLabel || timerLabel ? (
          <div className="quota-top-notice__meta">
            {usageLabel ? <span className="quota-top-notice__pill">{usageLabel}</span> : null}
            {timerLabel ? (
              <span className="quota-top-notice__pill quota-top-notice__pill--timer">{timerLabel}</span>
            ) : null}
          </div>
        ) : null}

        <p className="quota-top-notice__hint">{hint}</p>
      </div>
    </section>
  );
}
