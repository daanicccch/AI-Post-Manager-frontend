import { handleLocalMockRequest, isLocalMockMediaPath, resolveLocalMockMediaUrl } from './localMockApi';
import { normalizeBrokenEncoding } from './encoding';
import { appendTelegramInitData, buildTelegramAuthHeader, getTelegramInitDataRaw } from './telegram';

export interface Profile {
  id: number;
  slug: string;
  title: string;
  telegramChannelId: string | null;
  telegramChannelUsername?: string | null;
  telegramChannelTitle?: string | null;
  writingLanguage: string;
  onboardingStatus?: string | null;
  editorRoleText: string | null;
  rulesPath?: string | null;
  templatesPath?: string | null;
  humanizerPath?: string | null;
  personaGuidePath?: string | null;
  sourceChannelsPath?: string | null;
  webSourcesPath?: string | null;
  baseDir?: string | null;
  updatedAt?: string | null;
  profileConfig?: Record<string, unknown>;
  rulesMarkdown?: string | null;
  templatesMarkdown?: string | null;
  humanizerMarkdown?: string | null;
  personaGuideMarkdown?: string | null;
  sourceChannels?: unknown[];
  sourceChannelsConfig?: unknown;
  webSources?: unknown[];
  webSourcesConfig?: unknown;
  sourcePostsCount?: number;
  recentSourcePosts72hCount?: number;
  sourcePostsWithMediaCount?: number;
  latestSourceDate?: string | null;
  editingDraftsCount?: number;
  scheduledDraftsCount?: number;
  publishedDraftsCount?: number;
  cancelledDraftsCount?: number;
  latestDraftUpdatedAt?: string | null;
  schedule: {
    timezone?: string;
    isEnabled?: boolean;
    config?: Record<string, unknown>;
    updatedAt?: string;
  };
}

export interface SourceChannelOption {
  username: string;
  title?: string;
  name?: string;
  usedForStyle?: boolean;
  usedForMonitoring?: boolean;
  is_check?: boolean;
  origin?: string;
}

export interface WebSourceOption {
  url: string;
  title?: string;
  sourceKind?: string;
  origin?: string;
}

export interface SourcePreset {
  key: string;
  title: string;
  description: string;
  accentColor?: string | null;
  channels: SourceChannelOption[];
  webSources: WebSourceOption[];
}

export interface OnboardingSession {
  id: number;
  status: string;
  profileId?: string | null;
  targetChannelId?: string | null;
  targetChannelUsername?: string | null;
  targetChannelTitle?: string | null;
  payload?: Record<string, unknown>;
  updatedAt?: string | null;
}

export interface OnboardingState {
  session: OnboardingSession | null;
  profile: Profile | null;
  presets: SourcePreset[];
  sourceChannelCatalog: SourceChannelOption[];
  webSourceCatalog: WebSourceOption[];
  sourcePickerUrl?: string | null;
}

export interface OnboardingSourcesResult {
  profile: Profile;
  sourceChannels: SourceChannelOption[];
  webSources: WebSourceOption[];
}

export interface StatusSummary {
  postsToday: number;
  postsTotal: number;
  pendingReview: number;
  scheduledCount: number;
  profilesCount: number;
  aiProvider: string;
}

export interface PersonaGuideDetail {
  profileId: string;
  profileTitle: string;
  personaGuidePath: string | null;
  personaGuideMarkdown: string;
  updatedAt: string | null;
}

export interface DistillPersonaResult {
  profileId: string;
  postsAnalyzed: number;
  outputPath: string;
  profile: Profile;
}

export type PersonaSource = 'sources' | 'target' | 'mixed';

export interface PersonaGenerationJobStatus {
  jobId: string | null;
  profileId: string;
  personaSource: PersonaSource | null;
  status: 'idle' | 'running' | 'completed' | 'failed';
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
  result: {
    postsAnalyzed: number;
    outputPath: string;
    profileUpdatedAt: string | null;
  } | null;
}

export interface ProfileAssetsUpdateResult {
  profileId: string;
  savedFields: string[];
  profile: Profile;
}

export interface InboxItem {
  id: number;
  profileId: string;
  profileTitle: string;
  status: string;
  title: string | null;
  excerpt: string;
  mediaCount?: number;
  mediaPreviewPath?: string | null;
  mediaPreviewUrl?: string | null;
  sources: Array<{
    role?: string;
    sourceChannel?: string | null;
    sourceTelegramPostId?: number | null;
    sourceKey?: string | null;
  }>;
  createdAt: string;
  updatedAt: string;
  scheduledFor: string | null;
  publishedAt: string | null;
  telegramMessageId: number | null;
  publicationStatus: string | null;
}

export interface DraftMediaItem {
  index?: number;
  path?: string;
  previewUrl?: string | null;
  mediaType?: string | null;
  kind?: string | null;
}

export interface DraftSource {
  id?: number;
  role?: string;
  sourceChannel?: string | null;
  sourceTelegramPostId?: number | null;
  sourceKey?: string | null;
  sourcePostId?: number | null;
  draftVersionId?: number | null;
  sourceDate?: string | null;
  views?: number | null;
  text?: string | null;
  excerpt?: string | null;
  mediaCount?: number | null;
  mediaPreviewPath?: string | null;
  mediaPreviewUrl?: string | null;
}

export interface DraftVersion {
  id: number;
  versionNumber: number;
  changeType: string;
  text: string;
  media: DraftMediaItem[];
  sourceState: unknown;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface DraftDetail {
  id: number;
  status: string;
  title: string | null;
  text: string;
  media: DraftMediaItem[];
  sourceState: unknown;
  profileId: string;
  profileTitle: string;
  currentVersionId: number | null;
  scheduledFor: string | null;
  publishedAt: string | null;
  updatedAt: string;
  telegramMessageId: number | null;
  sources: DraftSource[];
  versions: DraftVersion[];
  publications: Array<{
    id: number;
    status: string;
    telegramMessageId: number | null;
    targetChannelId: string | null;
    publishedAt: string | null;
    text: string;
    media: DraftMediaItem[];
    errorText: string | null;
  }>;
}

export interface SourcePost {
  id: number;
  sourceChannel: string;
  telegramPostId: number | null;
  sourceDate: string | null;
  scrapedAt: string;
  text: string;
  excerpt: string;
  entities: Array<Record<string, unknown>>;
  mediaPaths: string[];
  mediaPreviewPath?: string | null;
  mediaPreviewUrl?: string | null;
  mediaCount: number;
  views: number;
  reactions: unknown;
  usedInPosts: unknown;
  hydrationPending?: boolean;
  hydrationStatus?: 'queued' | 'running' | 'completed' | 'failed';
  hydrationError?: string | null;
}

export interface GenerateDraftFromPoolInput {
  type: 'post' | 'alert' | 'weekly';
  lookbackHours?: number | null;
  limit?: number | null;
}

export interface UploadedMediaFile {
  path: string;
  filename: string;
}

export interface GenerateDraftFromManualSourceInput {
  type: 'post' | 'alert' | 'weekly';
  text: string;
  channelTitle?: string;
  channelKey?: string;
  sourcePostId?: number | null;
  sourceTelegramPostId?: number | null;
  sourceLinks?: Array<{
    label: string;
    url: string;
  }>;
  mediaPaths?: string[];
}

export interface HistoryItem {
  id: number;
  profileId: string;
  profileTitle: string;
  status: string;
  title: string | null;
  excerpt: string;
  mediaCount?: number;
  mediaPreviewPath?: string | null;
  mediaPreviewUrl?: string | null;
  versionCount: number;
  sourceCount: number;
  createdAt: string;
  updatedAt: string;
  scheduledFor: string | null;
  publishedAt: string | null;
  publicationStatus: string | null;
  telegramMessageId: number | null;
}

export interface ScheduleDetail {
  profileNumericId: number;
  profileId: string;
  profileTitle: string;
  timezone: string;
  isEnabled: boolean;
  config: Record<string, unknown>;
  updatedAt: string;
}

function getDefaultApiBaseUrl() {
  if (typeof window === 'undefined') {
    return 'http://localhost:3011/api';
  }

  const { hostname, protocol } = window.location;

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:3011/api';
  }

  const normalizedHost = hostname.startsWith('www.') ? hostname.slice(4) : hostname;
  return `${protocol}//api.${normalizedHost}/api`;
}

const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const API_BASE_URL = rawApiBaseUrl
  ? rawApiBaseUrl.replace(/\/$/, '')
  : getDefaultApiBaseUrl();

function shouldUseLocalMockApi() {
  if (typeof window === 'undefined') {
    return false;
  }

  const flag = String(import.meta.env.VITE_LOCAL_MOCK_API || '').trim().toLowerCase();
  if (flag === 'true') {
    return true;
  }
  if (flag === 'false') {
    return false;
  }

  const search = new URLSearchParams(window.location.search);
  const queryValue = search.get('mock');
  if (queryValue === '1' || queryValue === 'true') {
    window.localStorage.setItem('channelbot.local.mock-api', '1');
    return true;
  }
  if (queryValue === '0' || queryValue === 'false') {
    window.localStorage.setItem('channelbot.local.mock-api', '0');
    return false;
  }

  const persisted = window.localStorage.getItem('channelbot.local.mock-api');
  if (persisted === '1') {
    return true;
  }
  if (persisted === '0') {
    return false;
  }

  const host = window.location.hostname;
  const isLocalHost = host === 'localhost' || host === '127.0.0.1';
  return isLocalHost && !getTelegramInitDataRaw();
}

const USE_LOCAL_MOCK_API = shouldUseLocalMockApi();

export function getMediaPreviewUrl(mediaPath: string | null | undefined, directUrl?: string | null | undefined) {
  const normalizedDirectUrl = String(directUrl || '').trim();
  if (normalizedDirectUrl) {
    return normalizedDirectUrl;
  }

  const normalizedPath = String(mediaPath || '').trim();
  if (!normalizedPath) {
    return null;
  }

  if (USE_LOCAL_MOCK_API && isLocalMockMediaPath(normalizedPath)) {
    return resolveLocalMockMediaUrl(normalizedPath);
  }

  return appendTelegramInitData(`${API_BASE_URL}/media-file?path=${encodeURIComponent(normalizedPath)}`);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (USE_LOCAL_MOCK_API) {
    const mockPayload = await handleLocalMockRequest<T>(path, init);
    return normalizeBrokenEncoding(mockPayload);
  }

  const headers = {
    'Content-Type': 'application/json',
    ...buildTelegramAuthHeader(),
    ...((init?.headers as Record<string, string> | undefined) || {})
  };

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null);
    const message = errorPayload?.error?.message || `Request failed: ${response.status}`;
    throw new Error(message);
  }

  const payload = await response.json();
  return normalizeBrokenEncoding(payload.data as T);
}

export const api = {
  listProfiles: () => request<Profile[]>('/profiles'),
  getProfile: (profileId: string) => request<Profile>(`/profiles/${profileId}`),
  listSourcePosts: (
    profileId: string,
    params: {
      lookbackHours?: number | null;
      limit?: number;
      search?: string;
      mediaOnly?: boolean;
      refresh?: boolean;
    } = {}
  ) => {
    const search = new URLSearchParams();
    if (params.lookbackHours) search.set('lookbackHours', String(params.lookbackHours));
    if (params.limit) search.set('limit', String(params.limit));
    if (params.search) search.set('search', params.search);
    if (params.mediaOnly) search.set('mediaOnly', 'true');
    if (params.refresh) search.set('refresh', 'true');
    return request<SourcePost[]>(`/profiles/${profileId}/source-posts?${search.toString()}`);
  },
  getStatus: () => request<StatusSummary>('/status'),
  getPersonaGuide: (profileId: string) => request<PersonaGuideDetail>(`/profiles/${profileId}/persona-guide`),
  generateDraft: (profileId: string, body: GenerateDraftFromPoolInput) =>
    request<DraftDetail>(`/profiles/${profileId}/generate`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),
  generateDraftFromSource: (profileId: string, body: GenerateDraftFromManualSourceInput) =>
    request<DraftDetail>(`/profiles/${profileId}/generate-from-source`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),
  updateProfileAssets: (
    profileId: string,
    body: {
      personaGuideMarkdown?: string;
      rulesMarkdown?: string;
      templatesMarkdown?: string;
      humanizerMarkdown?: string;
      sourceChannelsConfig?: unknown;
      webSourcesConfig?: unknown;
      profileConfig?: Record<string, unknown>;
    }
  ) =>
    request<ProfileAssetsUpdateResult>(`/profiles/${profileId}/assets`, {
      method: 'PUT',
      body: JSON.stringify(body)
    }),
  distillPersona: (profileId: string, body: { personaSource: 'sources' | 'target' | 'mixed' }) =>
    request<PersonaGenerationJobStatus>(`/profiles/${profileId}/distill-persona`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),
  getPersonaDistillStatus: (profileId: string) =>
    request<PersonaGenerationJobStatus>(`/profiles/${profileId}/distill-persona-status`),
  getOnboarding: (profileId?: string) => {
    const search = new URLSearchParams();
    if (profileId) search.set('profileId', profileId);
    return request<OnboardingState>(`/onboarding?${search.toString()}`);
  },
  applyOnboardingPreset: (
    profileId: string,
    body: {
      presetKey: string;
      includeTargetChannel: boolean;
    }
  ) =>
    request<OnboardingSourcesResult>(`/onboarding/${profileId}/preset`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),
  saveOnboardingSources: (
    profileId: string,
    body: {
      channels: SourceChannelOption[];
      webSources: WebSourceOption[];
      includeTargetChannel: boolean;
    }
  ) =>
    request<OnboardingSourcesResult>(`/onboarding/${profileId}/sources`, {
      method: 'PUT',
      body: JSON.stringify(body)
    }),
  generateOnboardingStyle: (profileId: string, body: { personaSource: PersonaSource }) =>
    request<PersonaGenerationJobStatus>(`/onboarding/${profileId}/generate-style`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),
  confirmOnboardingStyle: (profileId: string) =>
    request<Profile>(`/onboarding/${profileId}/confirm-style`, {
      method: 'POST',
      body: JSON.stringify({})
    }),
  completeOnboarding: (profileId: string) =>
    request<Profile>(`/onboarding/${profileId}/complete`, {
      method: 'POST',
      body: JSON.stringify({})
    }),
  acknowledgeOnboardingSourcePickerReturn: (profileId: string) =>
    request<{ ok: true }>(`/onboarding/${profileId}/source-picker-return`, {
      method: 'POST',
      body: JSON.stringify({})
    }),
  listInbox: (params: { status?: string; profileId?: string }) => {
    const search = new URLSearchParams();
    if (params.status) search.set('status', params.status);
    if (params.profileId) search.set('profileId', params.profileId);
    return request<InboxItem[]>(`/inbox?${search.toString()}`);
  },
  getDraft: (draftId: number) => request<DraftDetail>(`/drafts/${draftId}`),
  getDraftVersions: (draftId: number) => request<DraftVersion[]>(`/drafts/${draftId}/versions`),
  saveDraft: (draftId: number, body: { text: string; mediaState: unknown[]; sourceState: unknown; meta?: Record<string, unknown> }) =>
    request(`/drafts/${draftId}/save`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),
  scheduleDraft: (draftId: number, body: { scheduledFor: string; meta?: Record<string, unknown> }) =>
    request(`/drafts/${draftId}/schedule`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),
  publishDraft: (draftId: number, body: { telegramMessageId?: number | null }) =>
    request(`/drafts/${draftId}/publish`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),
  regenerateDraft: (draftId: number, body: Record<string, never> = {}) =>
    request(`/drafts/${draftId}/regenerate`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),
  replaceDraftSource: (draftId: number, body: { sourcePostId?: number | null } = {}) =>
    request(`/drafts/${draftId}/replace-source`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),
  cancelDraft: (draftId: number, body: { meta?: Record<string, unknown> } = {}) =>
    request(`/drafts/${draftId}/cancel`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),
  deleteDraft: (draftId: number) =>
    request<{ id: number; status: string }>(`/drafts/${draftId}`, {
      method: 'DELETE'
    }),
  listHistory: (params: { profileId?: string; status?: string }) => {
    const search = new URLSearchParams();
    if (params.profileId) search.set('profileId', params.profileId);
    if (params.status) search.set('status', params.status);
    return request<HistoryItem[]>(`/history?${search.toString()}`);
  },
  getSchedule: (profileId: string) => request<ScheduleDetail>(`/profiles/${profileId}/schedule`),
  updateSchedule: (profileId: string, body: { timezone: string; isEnabled: boolean; config: Record<string, unknown> }) =>
    request<ScheduleDetail>(`/profiles/${profileId}/schedule`, {
      method: 'PUT',
      body: JSON.stringify(body)
    }),
  uploadMedia: (body: { filename: string; mimeType: string; contentBase64: string }) =>
    request<UploadedMediaFile>('/media-upload', {
      method: 'POST',
      body: JSON.stringify(body)
    })
};
