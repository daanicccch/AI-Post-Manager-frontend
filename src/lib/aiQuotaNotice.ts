export interface AiQuotaNoticeDetails {
  code?: string;
  action?: string;
  limit?: number;
  used?: number;
  remaining?: number;
  usageDate?: string | null;
  resetAt?: string | null;
  timezone?: string | null;
}

export interface AiQuotaNoticeState extends AiQuotaNoticeDetails {
  visible: boolean;
  message: string;
  publishedAt: number;
}

const listeners = new Set<() => void>();

let currentState: AiQuotaNoticeState = {
  visible: false,
  message: '',
  publishedAt: 0,
};

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

export function publishAiQuotaNotice(message: string, details: AiQuotaNoticeDetails | null = null) {
  currentState = {
    visible: true,
    message: String(message || '').trim() || 'Daily AI limit reached.',
    publishedAt: Date.now(),
    ...(details || {}),
  };

  emitChange();
}

export function dismissAiQuotaNotice() {
  if (!currentState.visible) {
    return;
  }

  currentState = {
    ...currentState,
    visible: false,
  };

  emitChange();
}

export function getAiQuotaNoticeSnapshot() {
  return currentState;
}

export function subscribeToAiQuotaNotice(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
