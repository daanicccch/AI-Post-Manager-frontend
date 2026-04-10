function extractRetrySeconds(message: string) {
  const raw = String(message || '')
  const retryInMatch = raw.match(/retry in\s+([\d.]+)s/i)
  if (retryInMatch) {
    return Math.max(1, Math.ceil(Number(retryInMatch[1])))
  }

  const retryDelayMatch = raw.match(/"retryDelay":"(\d+)s"/i)
  if (retryDelayMatch) {
    return Math.max(1, Number(retryDelayMatch[1]))
  }

  return null
}

function formatRetryLabel(seconds: number, isRu: boolean) {
  if (seconds < 60) {
    return isRu ? `примерно ${seconds} сек.` : `about ${seconds}s`
  }

  const minutes = Math.ceil(seconds / 60)
  return isRu ? `примерно ${minutes} мин.` : `about ${minutes} min`
}

export function formatAiErrorMessage(
  message: string | null | undefined,
  options: {
    isRu: boolean
    fallbackRu?: string
    fallbackEn?: string
  },
) {
  const { isRu, fallbackRu = 'Не удалось выполнить AI-запрос.', fallbackEn = 'AI request failed.' } = options
  const raw = String(message || '').trim()
  if (!raw) {
    return isRu ? fallbackRu : fallbackEn
  }

  const normalized = raw.toLowerCase()
  const retrySeconds = extractRetrySeconds(raw)
  const retrySuffix = retrySeconds
    ? (isRu ? ` Попробуй снова через ${formatRetryLabel(retrySeconds, true)}` : ` Please retry in ${formatRetryLabel(retrySeconds, false)}.`)
    : ''

  if (
    normalized.includes('429') ||
    normalized.includes('too many requests') ||
    normalized.includes('quota exceeded') ||
    normalized.includes('resource_exhausted') ||
    normalized.includes('rate limit')
  ) {
    return isRu
      ? `Лимит AI-запросов сейчас исчерпан.${retrySuffix}`
      : `The AI request limit is currently exhausted.${retrySuffix}`
  }

  if (
    normalized.includes('503') ||
    normalized.includes('service unavailable') ||
    normalized.includes('high demand')
  ) {
    return isRu
      ? 'AI-сервис сейчас перегружен. Попробуй ещё раз чуть позже.'
      : 'The AI service is temporarily overloaded. Please try again shortly.'
  }

  if (
    normalized.includes('api_key_invalid') ||
    normalized.includes('api key not valid') ||
    normalized.includes('reported as leaked') ||
    normalized.includes('consumer suspended')
  ) {
    return isRu
      ? 'AI-сервис временно недоступен. Попробуй позже.'
      : 'The AI service is temporarily unavailable. Please try again later.'
  }

  if (
    normalized.includes('googlegenerativeai') ||
    normalized.includes('generativelanguage.googleapis.com') ||
    normalized.includes('google.rpc')
  ) {
    return isRu ? fallbackRu : fallbackEn
  }

  return raw
}
