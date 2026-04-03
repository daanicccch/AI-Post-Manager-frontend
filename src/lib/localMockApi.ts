import type {
  DistillPersonaResult,
  DraftDetail,
  DraftMediaItem,
  DraftSource,
  DraftVersion,
  GenerateDraftFromManualSourceInput,
  GenerateDraftFromPoolInput,
  HistoryItem,
  InboxItem,
  OnboardingState,
  OnboardingSourcesResult,
  PersonaSource,
  PersonaGuideDetail,
  Profile,
  ProfileAssetsUpdateResult,
  ScheduleDetail,
  SourceChannelOption,
  SourcePreset,
  SourcePost,
  StatusSummary,
  UploadedMediaFile,
  WebSourceOption
} from './api';
import { normalizeBrokenEncoding } from './encoding';

type MockDb = {
  drafts: DraftDetail[];
  nextDraftId: number;
  nextPublicationId: number;
  nextVersionId: number;
  profiles: Profile[];
  schedules: Record<string, ScheduleDetail>;
  sourcePosts: Record<string, SourcePost[]>;
};

const STORAGE_KEY = 'channelbot.local.mock-db.v1';

const MOCK_SOURCE_PRESETS: SourcePreset[] = [
  {
    key: 'crypto',
    title: 'Crypto',
    description: 'Fast-moving crypto news, market pulse, and commentary.',
    accentColor: '#F59E0B',
    channels: [
      { username: 'cointelegraph', title: 'Cointelegraph', name: 'Cointelegraph', usedForStyle: true, usedForMonitoring: true },
      { username: 'decryptmedia', title: 'Decrypt', name: 'Decrypt', usedForStyle: true, usedForMonitoring: true },
      { username: 'banksta', title: 'Banksta', name: 'Banksta', usedForStyle: true, usedForMonitoring: false },
    ],
    webSources: [
      { url: 'https://www.theblock.co', title: 'The Block', sourceKind: 'website' },
      { url: 'https://www.coindesk.com', title: 'CoinDesk', sourceKind: 'website' },
    ],
  },
  {
    key: 'news',
    title: 'News',
    description: 'General news preset with fast editorial signals.',
    accentColor: '#2563EB',
    channels: [
      { username: 'meduzalive', title: 'Meduza Live', name: 'Meduza Live', usedForStyle: true, usedForMonitoring: true },
      { username: 'rian_ru', title: 'RIA Novosti', name: 'RIA Novosti', usedForStyle: true, usedForMonitoring: false },
    ],
    webSources: [
      { url: 'https://www.reuters.com', title: 'Reuters', sourceKind: 'website' },
      { url: 'https://www.bloomberg.com', title: 'Bloomberg', sourceKind: 'website' },
    ],
  },
];

function delay(ms = 120) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nowIso(offsetMinutes = 0) {
  return new Date(Date.now() + offsetMinutes * 60_000).toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stripHtml(value: string | null | undefined) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function summarize(value: string | null | undefined, maxLength = 180) {
  const plain = stripHtml(value);
  return plain.length > maxLength ? `${plain.slice(0, maxLength).trimEnd()}...` : plain;
}

function deriveDraftTitle(text: string, fallback = 'Untitled draft') {
  const plain = summarize(text, 84);
  return plain || fallback;
}

function buildMockMediaLabel(path: string) {
  return (
    path
      .split('/')
      .pop()
      ?.replace(/\.[a-z0-9]+$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim() || 'preview'
  );
}

export function isLocalMockMediaPath(path: string) {
  return /^mock-media\//i.test(String(path || '').trim());
}

export function resolveLocalMockMediaUrl(path: string) {
  const normalized = String(path || '').trim();
  const label = buildMockMediaLabel(normalized);
  const hue = Array.from(normalized).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="hsl(${hue} 84% 86%)" />
          <stop offset="100%" stop-color="hsl(${(hue + 48) % 360} 88% 72%)" />
        </linearGradient>
      </defs>
      <rect width="1200" height="630" rx="40" fill="url(#bg)" />
      <circle cx="170" cy="160" r="110" fill="rgba(255,255,255,0.35)" />
      <circle cx="1020" cy="120" r="90" fill="rgba(255,255,255,0.24)" />
      <circle cx="1080" cy="560" r="140" fill="rgba(255,255,255,0.18)" />
      <text x="84" y="500" fill="#1d2940" font-family="Arial, sans-serif" font-size="46" font-weight="700">${label}</text>
      <text x="84" y="556" fill="rgba(29,41,64,0.72)" font-family="Arial, sans-serif" font-size="24">Local mock preview</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function clonePresetChannels(presetKey: string) {
  const preset = MOCK_SOURCE_PRESETS.find((item) => item.key === presetKey);
  return clone(preset?.channels || []).map((item) => ({
    ...item,
    origin: 'preset',
    is_check: item.usedForMonitoring !== false,
  }));
}

function clonePresetWebSources(presetKey: string) {
  const preset = MOCK_SOURCE_PRESETS.find((item) => item.key === presetKey);
  return clone(preset?.webSources || []).map((item) => ({
    ...item,
    origin: 'preset',
  }));
}

function normalizeMockSourceChannels(items: unknown[] | undefined): SourceChannelOption[] {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }
      const username = String((item as Record<string, unknown>).username || '').trim().replace(/^@+/, '');
      if (!username) {
        return null;
      }
      return {
        username,
        title: String((item as Record<string, unknown>).title || (item as Record<string, unknown>).name || username).trim() || username,
        name: String((item as Record<string, unknown>).name || (item as Record<string, unknown>).title || username).trim() || username,
        usedForStyle: (item as Record<string, unknown>).usedForStyle !== false,
        usedForMonitoring: (item as Record<string, unknown>).usedForMonitoring !== false,
        is_check: (item as Record<string, unknown>).is_check !== false,
        origin: String((item as Record<string, unknown>).origin || '').trim() || undefined,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function normalizeMockWebSources(items: unknown[] | undefined): WebSourceOption[] {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }
      const url = String((item as Record<string, unknown>).url || '').trim();
      if (!url) {
        return null;
      }
      return {
        url,
        title: String((item as Record<string, unknown>).title || url).trim() || url,
        sourceKind: String((item as Record<string, unknown>).sourceKind || 'website').trim() || 'website',
        origin: String((item as Record<string, unknown>).origin || '').trim() || undefined,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function buildOnboardingState(db: MockDb, requestedProfileId: string | null): OnboardingState {
  const profile =
    (requestedProfileId ? db.profiles.find((item) => item.slug === requestedProfileId) : null)
    || db.profiles.find((item) => item.onboardingStatus && item.onboardingStatus !== 'completed')
    || db.profiles[0]
    || null;

  const sourceChannelCatalog = Array.from(
    new Map(
      MOCK_SOURCE_PRESETS
        .flatMap((preset) => preset.channels)
        .map((item) => [item.username, item])
    ).values()
  );
  const webSourceCatalog = Array.from(
    new Map(
      MOCK_SOURCE_PRESETS
        .flatMap((preset) => preset.webSources)
        .map((item) => [item.url, item])
    ).values()
  );

  return {
    session: profile
      ? {
          id: profile.id,
          status: String(profile.onboardingStatus || 'awaiting_source_setup'),
          profileId: profile.slug,
          targetChannelId: profile.telegramChannelId,
          targetChannelUsername: profile.telegramChannelUsername || null,
          targetChannelTitle: profile.telegramChannelTitle || profile.title,
          payload: isRecord(profile.sourceChannelsConfig) ? (profile.sourceChannelsConfig as Record<string, unknown>) : {},
          updatedAt: profile.updatedAt || nowIso(),
        }
      : null,
    profile: profile ? clone(profile) : null,
    presets: clone(MOCK_SOURCE_PRESETS),
    sourceChannelCatalog: clone(sourceChannelCatalog),
    webSourceCatalog: clone(webSourceCatalog),
    sourcePickerUrl: profile ? `mock://source-picker/${profile.slug}` : null,
  };
}

function createInitialProfiles(): Profile[] {
  return [
    {
      id: 1,
      slug: 'alpha',
      title: 'Alpha Signals',
      telegramChannelId: '@alpha_signals',
      telegramChannelUsername: 'alpha_signals',
      telegramChannelTitle: 'Alpha Signals',
      writingLanguage: 'ru',
      onboardingStatus: 'awaiting_source_setup',
      editorRoleText: 'Rewrite source posts into concise Telegram updates.',
      rulesPath: 'profiles/alpha/rules.md',
      templatesPath: 'profiles/alpha/templates.md',
      humanizerPath: 'profiles/alpha/humanizer.md',
      personaGuidePath: 'profiles/alpha/persona.md',
      sourceChannelsPath: 'profiles/alpha/sourceChannels.json',
      webSourcesPath: 'profiles/alpha/webSources.json',
      baseDir: 'profiles/alpha',
      updatedAt: nowIso(-180),
      profileConfig: { tone: 'calm', audience: 'traders' },
      rulesMarkdown: '# Alpha rules\n\n- Keep it short.\n- Add one clear takeaway.',
      templatesMarkdown: 'Use intro, signal, risk block, CTA.',
      humanizerMarkdown: 'Sound direct, practical, and calm.',
      personaGuideMarkdown: '# Alpha style\n\nWrite as an editor who turns noisy market updates into clean Telegram-ready summaries.',
      sourceChannels: [
        { username: 'marketpulse', name: 'Market Pulse', is_check: true },
        { username: 'chainwire', name: 'Chain Wire', is_check: true },
        { username: 'macrodesk', name: 'Macro Desk', is_check: false }
      ],
      sourceChannelsConfig: { channels: ['marketpulse', 'chainwire', 'macrodesk'] },
      webSources: [{ url: 'https://example.com' }],
      webSourcesConfig: { enabled: true },
      sourcePostsCount: 12,
      recentSourcePosts72hCount: 7,
      sourcePostsWithMediaCount: 5,
      latestSourceDate: nowIso(-45),
      editingDraftsCount: 1,
      scheduledDraftsCount: 1,
      publishedDraftsCount: 1,
      cancelledDraftsCount: 0,
      latestDraftUpdatedAt: nowIso(-30),
      schedule: {
        timezone: 'Europe/Moscow',
        isEnabled: false,
        config: {},
        updatedAt: nowIso(-300)
      }
    },
    {
      id: 2,
      slug: 'digest',
      title: 'Weekly Digest',
      telegramChannelId: '@weekly_digest',
      telegramChannelUsername: 'weekly_digest',
      telegramChannelTitle: 'Weekly Digest',
      writingLanguage: 'ru',
      onboardingStatus: 'completed',
      editorRoleText: 'Prepare digest-ready summaries from selected channels.',
      rulesPath: 'profiles/digest/rules.md',
      templatesPath: 'profiles/digest/templates.md',
      humanizerPath: 'profiles/digest/humanizer.md',
      personaGuidePath: 'profiles/digest/persona.md',
      sourceChannelsPath: 'profiles/digest/sourceChannels.json',
      webSourcesPath: 'profiles/digest/webSources.json',
      baseDir: 'profiles/digest',
      updatedAt: nowIso(-90),
      profileConfig: { tone: 'editorial', audience: 'founders' },
      rulesMarkdown: '# Digest rules\n\n- Keep sections balanced.\n- Focus on what changed.',
      templatesMarkdown: 'Headline, three bullets, why it matters.',
      humanizerMarkdown: 'Warm, editorial, no hype.',
      personaGuideMarkdown: '# Digest style\n\nBlend multiple source notes into one smooth weekly summary.',
      sourceChannels: [
        { username: 'productradar', name: 'Product Radar', is_check: true },
        { username: 'teamnotes', name: 'Team Notes', is_check: true }
      ],
      sourceChannelsConfig: { channels: ['productradar', 'teamnotes'] },
      webSources: [],
      webSourcesConfig: { enabled: false },
      sourcePostsCount: 8,
      recentSourcePosts72hCount: 4,
      sourcePostsWithMediaCount: 2,
      latestSourceDate: nowIso(-120),
      editingDraftsCount: 0,
      scheduledDraftsCount: 0,
      publishedDraftsCount: 0,
      cancelledDraftsCount: 1,
      latestDraftUpdatedAt: nowIso(-240),
      schedule: {
        timezone: 'Europe/Moscow',
        isEnabled: true,
        config: {},
        updatedAt: nowIso(-420)
      }
    }
  ];
}

function createInitialSourcePosts(): Record<string, SourcePost[]> {
  return {
    alpha: [
      {
        id: 101,
        sourceChannel: 'Market Pulse',
        telegramPostId: 9001,
        sourceDate: nowIso(-70),
        scrapedAt: nowIso(-65),
        text: 'BTC held the local support zone overnight. Buyers stepped in near the weekly midpoint and pushed price back above short-term resistance.',
        excerpt: 'BTC held support overnight and reclaimed short-term resistance.',
        entities: [],
        mediaPaths: ['mock-media/alpha-breakout.svg'],
        mediaPreviewPath: 'mock-media/alpha-breakout.svg',
        mediaCount: 1,
        views: 1850,
        reactions: [],
        usedInPosts: []
      },
      {
        id: 102,
        sourceChannel: 'Chain Wire',
        telegramPostId: 9002,
        sourceDate: nowIso(-180),
        scrapedAt: nowIso(-175),
        text: 'Ethereum gas cooled down after the morning spike. Layer-2 flows remained strong and validators saw stable participation across the session.',
        excerpt: 'Gas cooled, L2 flows stayed strong, validator participation remained stable.',
        entities: [],
        mediaPaths: [],
        mediaPreviewPath: null,
        mediaCount: 0,
        views: 940,
        reactions: [],
        usedInPosts: []
      },
      {
        id: 103,
        sourceChannel: 'Macro Desk',
        telegramPostId: 9003,
        sourceDate: nowIso(-260),
        scrapedAt: nowIso(-250),
        text: 'US dollar softened into the close, which gave risk assets some breathing room. Traders are still waiting for fresh macro guidance before adding size.',
        excerpt: 'Dollar softened and risk assets got some room, but positioning stayed cautious.',
        entities: [],
        mediaPaths: ['mock-media/macro-window.svg'],
        mediaPreviewPath: 'mock-media/macro-window.svg',
        mediaCount: 1,
        views: 1120,
        reactions: [],
        usedInPosts: []
      }
    ],
    digest: [
      {
        id: 201,
        sourceChannel: 'Product Radar',
        telegramPostId: 8001,
        sourceDate: nowIso(-210),
        scrapedAt: nowIso(-205),
        text: 'A new onboarding flow improved trial activation by 14%. The team cut friction on the first two steps and simplified plan selection.',
        excerpt: 'New onboarding raised trial activation by 14%.',
        entities: [],
        mediaPaths: ['mock-media/onboarding-lift.svg'],
        mediaPreviewPath: 'mock-media/onboarding-lift.svg',
        mediaCount: 1,
        views: 640,
        reactions: [],
        usedInPosts: []
      },
      {
        id: 202,
        sourceChannel: 'Team Notes',
        telegramPostId: 8002,
        sourceDate: nowIso(-360),
        scrapedAt: nowIso(-355),
        text: 'Support backlog dropped after the team launched better ticket routing and a tighter triage cadence.',
        excerpt: 'Support backlog shrank after routing and triage changes.',
        entities: [],
        mediaPaths: [],
        mediaPreviewPath: null,
        mediaCount: 0,
        views: 430,
        reactions: [],
        usedInPosts: []
      }
    ]
  };
}

function buildVersion(
  id: number,
  versionNumber: number,
  changeType: string,
  text: string,
  media: DraftMediaItem[],
  sourceState: unknown
): DraftVersion {
  return {
    id,
    versionNumber,
    changeType,
    text,
    media: clone(media),
    sourceState: clone(sourceState),
    meta: {},
    createdAt: nowIso(-versionNumber * 10)
  };
}

function createInitialDrafts(): DraftDetail[] {
  const editingMedia = [{ path: 'mock-media/alpha-breakout.svg', mediaType: 'photo', kind: 'photo' }];
  const scheduledMedia = [{ path: 'mock-media/macro-window.svg', mediaType: 'photo', kind: 'photo' }];
  const publishedMedia = [{ path: 'mock-media/onboarding-lift.svg', mediaType: 'photo', kind: 'photo' }];

  return [
    {
      id: 1,
      status: 'editing',
      title: 'BTC reclaims short-term resistance',
      text: '<p>BTC held the local support zone overnight and pushed back above short-term resistance.</p><p><strong>Why it matters:</strong> buyers defended a level that traders were already watching, so momentum stays constructive for now.</p>',
      media: editingMedia,
      sourceState: { mode: 'source_pool' },
      profileId: 'alpha',
      profileTitle: 'Alpha Signals',
      currentVersionId: 1,
      scheduledFor: null,
      publishedAt: null,
      updatedAt: nowIso(-30),
      telegramMessageId: null,
      sources: [
        {
          id: 1,
          role: 'source',
          sourceChannel: 'Market Pulse',
          sourceTelegramPostId: 9001,
          sourceKey: 'marketpulse',
          sourcePostId: 101,
          draftVersionId: 1,
          sourceDate: nowIso(-70),
          views: 1850,
          text: 'BTC held the local support zone overnight.',
          excerpt: 'BTC held support overnight.',
          mediaCount: 1,
          mediaPreviewPath: 'mock-media/alpha-breakout.svg'
        }
      ],
      versions: [
        buildVersion(
          1,
          1,
          'created',
          '<p>BTC held the local support zone overnight and pushed back above short-term resistance.</p><p><strong>Why it matters:</strong> buyers defended a level that traders were already watching, so momentum stays constructive for now.</p>',
          editingMedia,
          { mode: 'source_pool' }
        )
      ],
      publications: []
    },
    {
      id: 2,
      status: 'scheduled',
      title: 'Dollar softens, risk breathes',
      text: '<p>The dollar eased into the close and gave risk assets some room.</p><p>Expect choppy trade until fresh macro guidance resets positioning.</p>',
      media: scheduledMedia,
      sourceState: { mode: 'source_post' },
      profileId: 'alpha',
      profileTitle: 'Alpha Signals',
      currentVersionId: 2,
      scheduledFor: nowIso(180),
      publishedAt: null,
      updatedAt: nowIso(-55),
      telegramMessageId: null,
      sources: [
        {
          id: 2,
          role: 'source',
          sourceChannel: 'Macro Desk',
          sourceTelegramPostId: 9003,
          sourceKey: 'macrodesk',
          sourcePostId: 103,
          draftVersionId: 2,
          sourceDate: nowIso(-260),
          views: 1120,
          text: 'US dollar softened into the close.',
          excerpt: 'Dollar softened and risk got room.',
          mediaCount: 1,
          mediaPreviewPath: 'mock-media/macro-window.svg'
        }
      ],
      versions: [
        buildVersion(
          2,
          1,
          'created',
          '<p>The dollar eased into the close and gave risk assets some room.</p><p>Expect choppy trade until fresh macro guidance resets positioning.</p>',
          scheduledMedia,
          { mode: 'source_post' }
        )
      ],
      publications: []
    },
    {
      id: 3,
      status: 'published',
      title: 'Onboarding lift in the latest sprint',
      text: '<p>The new onboarding flow lifted trial activation by 14%.</p><p>The gain came from simpler first steps and cleaner plan selection.</p>',
      media: publishedMedia,
      sourceState: { mode: 'source_pool' },
      profileId: 'digest',
      profileTitle: 'Weekly Digest',
      currentVersionId: 3,
      scheduledFor: null,
      publishedAt: nowIso(-320),
      updatedAt: nowIso(-310),
      telegramMessageId: 4521,
      sources: [
        {
          id: 3,
          role: 'source',
          sourceChannel: 'Product Radar',
          sourceTelegramPostId: 8001,
          sourceKey: 'productradar',
          sourcePostId: 201,
          draftVersionId: 3,
          sourceDate: nowIso(-210),
          views: 640,
          text: 'A new onboarding flow improved trial activation by 14%.',
          excerpt: 'New onboarding raised trial activation by 14%.',
          mediaCount: 1,
          mediaPreviewPath: 'mock-media/onboarding-lift.svg'
        }
      ],
      versions: [
        buildVersion(
          3,
          1,
          'created',
          '<p>The new onboarding flow lifted trial activation by 14%.</p><p>The gain came from simpler first steps and cleaner plan selection.</p>',
          publishedMedia,
          { mode: 'source_pool' }
        )
      ],
      publications: [
        {
          id: 1,
          status: 'published',
          telegramMessageId: 4521,
          targetChannelId: '@weekly_digest',
          publishedAt: nowIso(-320),
          text: 'The new onboarding flow lifted trial activation by 14%.',
          media: publishedMedia,
          errorText: null
        }
      ]
    },
    {
      id: 4,
      status: 'cancelled',
      title: 'Support backlog recovers',
      text: '<p>Support backlog fell after tighter routing and triage.</p>',
      media: [],
      sourceState: { mode: 'source_pool' },
      profileId: 'digest',
      profileTitle: 'Weekly Digest',
      currentVersionId: 4,
      scheduledFor: null,
      publishedAt: null,
      updatedAt: nowIso(-420),
      telegramMessageId: null,
      sources: [],
      versions: [buildVersion(4, 1, 'created', '<p>Support backlog fell after tighter routing and triage.</p>', [], { mode: 'source_pool' })],
      publications: []
    }
  ];
}

function createInitialSchedules(): Record<string, ScheduleDetail> {
  return {
    alpha: {
      profileNumericId: 1,
      profileId: 'alpha',
      profileTitle: 'Alpha Signals',
      timezone: 'Europe/Moscow',
      isEnabled: true,
      config: {
        channelChecksIntervalMinutes: 30,
        channelCheckUsernames: ['marketpulse', 'chainwire'],
        postIntervals: [
          { label: 'Morning', start: '09:00', end: '10:00' },
          { label: 'Evening', start: '18:00', end: '19:00' }
        ],
        weeklyDigest: {
          enabled: true,
          dayOfWeek: 4,
          interval: { start: '12:00', end: '13:00' }
        }
      },
      updatedAt: nowIso(-300)
    },
    digest: {
      profileNumericId: 2,
      profileId: 'digest',
      profileTitle: 'Weekly Digest',
      timezone: 'Europe/Moscow',
      isEnabled: true,
      config: {
        channelChecksIntervalMinutes: 60,
        channelCheckUsernames: ['productradar', 'teamnotes'],
        postIntervals: [{ label: 'Digest', start: '13:00', end: '14:00' }],
        weeklyDigest: {
          enabled: true,
          dayOfWeek: 4,
          interval: { start: '16:00', end: '17:00' }
        }
      },
      updatedAt: nowIso(-360)
    }
  };
}

function createInitialDb(): MockDb {
  return {
    drafts: createInitialDrafts(),
    nextDraftId: 5,
    nextPublicationId: 2,
    nextVersionId: 5,
    profiles: createInitialProfiles(),
    schedules: createInitialSchedules(),
    sourcePosts: createInitialSourcePosts()
  };
}

function loadDb(): MockDb {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = createInitialDb();
      saveDb(seeded);
      return seeded;
    }

    const parsed = normalizeBrokenEncoding(JSON.parse(raw) as MockDb);
    if (JSON.stringify(parsed) !== raw) {
      saveDb(parsed);
    }

    return parsed;
  } catch {
    const seeded = createInitialDb();
    saveDb(seeded);
    return seeded;
  }
}

function saveDb(db: MockDb) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeBrokenEncoding(db)));
}

function getProfileBySlug(db: MockDb, profileId: string) {
  const profile = db.profiles.find((item) => item.slug === profileId);
  if (!profile) {
    throw new Error(`Profile not found: ${profileId}`);
  }

  return profile;
}

function getDraftById(db: MockDb, draftId: number) {
  const draft = db.drafts.find((item) => item.id === draftId);
  if (!draft) {
    throw new Error(`Draft not found: ${draftId}`);
  }

  return draft;
}

function syncProfileStats(db: MockDb) {
  db.profiles = db.profiles.map((profile) => {
    const profileDrafts = db.drafts.filter((draft) => draft.profileId === profile.slug);
    const sourcePosts = db.sourcePosts[profile.slug] || [];
    const schedule = db.schedules[profile.slug];

    return {
      ...profile,
      sourcePostsCount: sourcePosts.length,
      recentSourcePosts72hCount: sourcePosts.filter((item) => Date.now() - new Date(item.scrapedAt).getTime() < 72 * 60 * 60 * 1000).length,
      sourcePostsWithMediaCount: sourcePosts.filter((item) => item.mediaCount > 0).length,
      latestSourceDate: sourcePosts[0]?.sourceDate || null,
      editingDraftsCount: profileDrafts.filter((draft) => draft.status === 'editing').length,
      scheduledDraftsCount: profileDrafts.filter((draft) => draft.status === 'scheduled').length,
      publishedDraftsCount: profileDrafts.filter((draft) => draft.status === 'published').length,
      cancelledDraftsCount: profileDrafts.filter((draft) => draft.status === 'cancelled').length,
      latestDraftUpdatedAt: profileDrafts.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]?.updatedAt || null,
      updatedAt: schedule?.updatedAt || profile.updatedAt,
      schedule: {
        timezone: schedule?.timezone,
        isEnabled: schedule?.isEnabled,
        config: schedule?.config,
        updatedAt: schedule?.updatedAt
      }
    };
  });
}

function toInboxItem(draft: DraftDetail): InboxItem {
  return {
    id: draft.id,
    profileId: draft.profileId,
    profileTitle: draft.profileTitle,
    status: draft.status,
    title: draft.title,
    excerpt: summarize(draft.text),
    mediaCount: draft.media.length,
    mediaPreviewPath: draft.media[0]?.path || draft.sources[0]?.mediaPreviewPath || null,
    sources: draft.sources.map((source) => ({
      role: source.role,
      sourceChannel: source.sourceChannel || null,
      sourceTelegramPostId: source.sourceTelegramPostId || null,
      sourceKey: source.sourceKey || null
    })),
    createdAt: draft.versions[0]?.createdAt || draft.updatedAt,
    updatedAt: draft.updatedAt,
    scheduledFor: draft.scheduledFor,
    publishedAt: draft.publishedAt,
    telegramMessageId: draft.telegramMessageId,
    publicationStatus: draft.publications[0]?.status || null
  };
}

function toHistoryItem(draft: DraftDetail): HistoryItem {
  return {
    id: draft.id,
    profileId: draft.profileId,
    profileTitle: draft.profileTitle,
    status: draft.status,
    title: draft.title,
    excerpt: summarize(draft.text),
    mediaCount: draft.media.length,
    mediaPreviewPath: draft.media[0]?.path || draft.sources[0]?.mediaPreviewPath || null,
    versionCount: draft.versions.length,
    sourceCount: draft.sources.length,
    createdAt: draft.versions[0]?.createdAt || draft.updatedAt,
    updatedAt: draft.updatedAt,
    scheduledFor: draft.scheduledFor,
    publishedAt: draft.publishedAt,
    publicationStatus: draft.publications[0]?.status || null,
    telegramMessageId: draft.telegramMessageId
  };
}

function appendDraftVersion(db: MockDb, draft: DraftDetail, changeType: string) {
  const versionId = db.nextVersionId++;
  const nextVersion = buildVersion(versionId, draft.versions.length + 1, changeType, draft.text, draft.media, draft.sourceState);
  draft.versions.push(nextVersion);
  draft.currentVersionId = versionId;
}

function normalizeMediaItems(items: unknown): DraftMediaItem[] {
  return Array.isArray(items)
    ? items.map((item, index) => {
        const typed = (item || {}) as DraftMediaItem;
        return {
          index,
          path: typed.path || undefined,
          mediaType: typed.mediaType || 'photo',
          kind: typed.kind || typed.mediaType || 'photo'
        };
      })
    : [];
}

function createDraftFromText(
  db: MockDb,
  profile: Profile,
  text: string,
  media: DraftMediaItem[],
  sources: DraftSource[],
  sourceState: unknown
) {
  const draftId = db.nextDraftId++;
  const draft: DraftDetail = {
    id: draftId,
    status: 'editing',
    title: deriveDraftTitle(text),
    text,
    media,
    sourceState,
    profileId: profile.slug,
    profileTitle: profile.title,
    currentVersionId: null,
    scheduledFor: null,
    publishedAt: null,
    updatedAt: nowIso(),
    telegramMessageId: null,
    sources,
    versions: [],
    publications: []
  };

  appendDraftVersion(db, draft, 'created');
  db.drafts.unshift(draft);
  syncProfileStats(db);
  return draft;
}

function buildMockStatus(db: MockDb): StatusSummary {
  syncProfileStats(db);
  return {
    postsToday: db.drafts.filter((draft) => draft.publishedAt && Date.now() - new Date(draft.publishedAt).getTime() < 24 * 60 * 60 * 1000).length,
    postsTotal: db.drafts.filter((draft) => draft.status === 'published').length,
    pendingReview: db.drafts.filter((draft) => draft.status === 'editing').length,
    scheduledCount: db.drafts.filter((draft) => draft.status === 'scheduled').length,
    profilesCount: db.profiles.length,
    aiProvider: 'local-mock'
  };
}

function buildPersonaGuide(profile: Profile): PersonaGuideDetail {
  return {
    profileId: profile.slug,
    profileTitle: profile.title,
    personaGuidePath: profile.personaGuidePath || null,
    personaGuideMarkdown: profile.personaGuideMarkdown || '',
    updatedAt: profile.updatedAt || null
  };
}

function parseBody(init?: RequestInit) {
  if (!init?.body || typeof init.body !== 'string') {
    return {};
  }

  try {
    return JSON.parse(init.body) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function handleProfilesGet(db: MockDb) {
  syncProfileStats(db);
  return clone(db.profiles);
}

function handleSourcePostsGet(db: MockDb, profileId: string, url: URL) {
  const search = url.searchParams.get('search')?.trim().toLowerCase() || '';
  const mediaOnly = url.searchParams.get('mediaOnly') === 'true';
  const limit = Number(url.searchParams.get('limit') || 0);
  const lookbackHours = Number(url.searchParams.get('lookbackHours') || 0);
  const threshold = lookbackHours > 0 ? Date.now() - lookbackHours * 60 * 60 * 1000 : 0;

  let items = [...(db.sourcePosts[profileId] || [])];
  if (search) {
    items = items.filter((item) => `${item.sourceChannel} ${item.text} ${item.excerpt}`.toLowerCase().includes(search));
  }
  if (mediaOnly) {
    items = items.filter((item) => item.mediaCount > 0);
  }
  if (threshold) {
    items = items.filter((item) => new Date(item.scrapedAt).getTime() >= threshold);
  }
  if (limit > 0) {
    items = items.slice(0, limit);
  }

  return clone(items);
}

export async function handleLocalMockRequest<T>(path: string, init?: RequestInit): Promise<T> {
  await delay();

  const db = loadDb();
  const url = new URL(path, 'https://channelbot.local');
  const method = String(init?.method || 'GET').toUpperCase();
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  if (method === 'GET' && pathname === '/profiles') {
    return handleProfilesGet(db) as T;
  }

  const profileMatch = pathname.match(/^\/profiles\/([^/]+)$/);
  if (method === 'GET' && profileMatch) {
    syncProfileStats(db);
    return clone(getProfileBySlug(db, decodeURIComponent(profileMatch[1]))) as T;
  }

  const sourcePostsMatch = pathname.match(/^\/profiles\/([^/]+)\/source-posts$/);
  if (method === 'GET' && sourcePostsMatch) {
    return handleSourcePostsGet(db, decodeURIComponent(sourcePostsMatch[1]), url) as T;
  }

  if (method === 'GET' && pathname === '/status') {
    return buildMockStatus(db) as T;
  }

  if (method === 'GET' && pathname === '/onboarding') {
    const requestedProfileId = url.searchParams.get('profileId');
    return buildOnboardingState(db, requestedProfileId) as T;
  }

  const onboardingPresetMatch = pathname.match(/^\/onboarding\/([^/]+)\/preset$/);
  if (method === 'POST' && onboardingPresetMatch) {
    const profile = getProfileBySlug(db, decodeURIComponent(onboardingPresetMatch[1]));
    const body = parseBody(init);
    const presetKey = String(body.presetKey || '').trim();
    const includeTargetChannel = body.includeTargetChannel !== false;
    const presetChannels = clonePresetChannels(presetKey);
    const presetWebSources = clonePresetWebSources(presetKey);

    profile.sourceChannels = includeTargetChannel && profile.telegramChannelUsername
      ? [
          ...presetChannels,
          {
            username: String(profile.telegramChannelUsername).replace(/^@+/, ''),
            title: profile.telegramChannelTitle || profile.title,
            name: profile.telegramChannelTitle || profile.title,
            origin: 'target',
            usedForStyle: true,
            usedForMonitoring: false,
            is_check: false,
          },
        ]
      : presetChannels;
    profile.webSources = presetWebSources;
    profile.sourceChannelsConfig = {
      mode: 'preset',
      presetKey,
      includeTargetChannel,
    };
    profile.webSourcesConfig = {
      mode: 'preset',
      presetKey,
    };
    profile.onboardingStatus = 'awaiting_style_generation';
    profile.updatedAt = nowIso();
    syncProfileStats(db);
    saveDb(db);

    const result: OnboardingSourcesResult = {
      profile: clone(profile),
      sourceChannels: clone(normalizeMockSourceChannels(profile.sourceChannels)),
      webSources: clone(normalizeMockWebSources(profile.webSources)),
    };
    return result as T;
  }

  const onboardingSourcesMatch = pathname.match(/^\/onboarding\/([^/]+)\/sources$/);
  if (method === 'PUT' && onboardingSourcesMatch) {
    const profile = getProfileBySlug(db, decodeURIComponent(onboardingSourcesMatch[1]));
    const body = parseBody(init);
    const includeTargetChannel = body.includeTargetChannel === true;
    const channels = Array.from(
      new Map(
        (Array.isArray(body.channels) ? body.channels : [])
          .map((item) => ({
            username: String((item as Record<string, unknown>).username || '').trim().replace(/^@+/, ''),
            title: String((item as Record<string, unknown>).title || (item as Record<string, unknown>).name || '').trim(),
            name: String((item as Record<string, unknown>).title || (item as Record<string, unknown>).name || '').trim(),
            origin: 'custom',
            usedForStyle: true,
            usedForMonitoring: true,
            is_check: true,
          }))
          .filter((item) => item.username)
          .map((item) => [item.username.toLowerCase(), item])
      ).values()
    );
    const targetChannel = includeTargetChannel && profile.telegramChannelUsername
      ? [{
          username: String(profile.telegramChannelUsername).replace(/^@+/, ''),
          title: profile.telegramChannelTitle || profile.title,
          name: profile.telegramChannelTitle || profile.title,
          origin: 'target',
          usedForStyle: true,
          usedForMonitoring: false,
          is_check: false,
        }]
      : [];
    const webSources = Array.from(
      new Map(
        (Array.isArray(body.webSources) ? body.webSources : [])
          .map((item) => ({
            url: String((item as Record<string, unknown>).url || '').trim(),
            title: String((item as Record<string, unknown>).title || '').trim(),
            sourceKind: String((item as Record<string, unknown>).sourceKind || 'website').trim() || 'website',
            origin: 'custom',
          }))
          .filter((item) => item.url)
          .map((item) => [item.url.toLowerCase(), item])
      ).values()
    );

    profile.sourceChannels = [...channels, ...targetChannel];
    profile.webSources = webSources;
    profile.sourceChannelsConfig = {
      mode: 'custom',
      includeTargetChannel,
    };
    profile.webSourcesConfig = {
      mode: 'custom',
    };
    profile.onboardingStatus = 'awaiting_style_generation';
    profile.updatedAt = nowIso();
    syncProfileStats(db);
    saveDb(db);

    const result: OnboardingSourcesResult = {
      profile: clone(profile),
      sourceChannels: clone(normalizeMockSourceChannels(profile.sourceChannels)),
      webSources: clone(normalizeMockWebSources(profile.webSources)),
    };
    return result as T;
  }

  const onboardingGenerateStyleMatch = pathname.match(/^\/onboarding\/([^/]+)\/generate-style$/);
  if (method === 'POST' && onboardingGenerateStyleMatch) {
    const profile = getProfileBySlug(db, decodeURIComponent(onboardingGenerateStyleMatch[1]));
    const body = parseBody(init);
    const personaSource = (['sources', 'target', 'mixed'].includes(String(body.personaSource))
      ? String(body.personaSource)
      : 'sources') as PersonaSource;
    const sources = normalizeMockSourceChannels(profile.sourceChannels);
    const webSources = normalizeMockWebSources(profile.webSources);
    const personaSourceLabel =
      personaSource === 'target'
        ? 'target channel'
        : personaSource === 'mixed'
          ? 'target channel + external sources'
          : 'external sources';
    profile.personaGuideMarkdown = `# ${profile.title} style\n\nThis style guide was regenerated from ${personaSourceLabel}.\n\n## Core voice\n- Short opening with one strong takeaway.\n- Calm, editorial tone.\n- No filler and no promo language.\n\n## Source blend\n- Channels: ${sources.map((item) => `@${item.username}`).join(', ') || 'none'}\n- Web: ${webSources.map((item) => item.title || item.url).join(', ') || 'none'}\n- Generation mode: ${personaSource}\n\n## Post rhythm\n- Lead with the signal.\n- Explain why it matters.\n- Close with one next action or implication.`;
    profile.onboardingStatus = 'awaiting_style_review';
    profile.updatedAt = nowIso();
    syncProfileStats(db);
    saveDb(db);
    const result: DistillPersonaResult = {
      profileId: profile.slug,
      postsAnalyzed: (db.sourcePosts[profile.slug] || []).length,
      outputPath: profile.personaGuidePath || `profiles/${profile.slug}/persona.md`,
      profile: clone(profile),
    };
    return result as T;
  }

  const onboardingConfirmStyleMatch = pathname.match(/^\/onboarding\/([^/]+)\/confirm-style$/);
  if (method === 'POST' && onboardingConfirmStyleMatch) {
    const profile = getProfileBySlug(db, decodeURIComponent(onboardingConfirmStyleMatch[1]));
    profile.onboardingStatus = 'awaiting_schedule_setup';
    profile.updatedAt = nowIso();
    syncProfileStats(db);
    saveDb(db);
    return clone(profile) as T;
  }

  const onboardingCompleteMatch = pathname.match(/^\/onboarding\/([^/]+)\/complete$/);
  if (method === 'POST' && onboardingCompleteMatch) {
    const profile = getProfileBySlug(db, decodeURIComponent(onboardingCompleteMatch[1]));
    profile.onboardingStatus = 'completed';
    profile.updatedAt = nowIso();
    syncProfileStats(db);
    saveDb(db);
    return clone(profile) as T;
  }

  const personaMatch = pathname.match(/^\/profiles\/([^/]+)\/persona-guide$/);
  if (method === 'GET' && personaMatch) {
    return buildPersonaGuide(getProfileBySlug(db, decodeURIComponent(personaMatch[1]))) as T;
  }

  const generateMatch = pathname.match(/^\/profiles\/([^/]+)\/generate$/);
  if (method === 'POST' && generateMatch) {
    const profile = getProfileBySlug(db, decodeURIComponent(generateMatch[1]));
    const body = parseBody(init) as unknown as GenerateDraftFromPoolInput;
    const selected = (db.sourcePosts[profile.slug] || []).slice(0, Math.max(1, Number(body.limit) || 2));
    const text = selected.length
      ? `<p>${selected.map((item) => item.text).join(' ')}</p><p><strong>Mock note:</strong> this draft was generated locally without Telegram auth.</p>`
      : '<p>Local mock draft generated from the source pool.</p>';
    const sources = selected.map((item, index) => ({
      id: index + 1,
      role: 'source',
      sourceChannel: item.sourceChannel,
      sourceTelegramPostId: item.telegramPostId,
      sourceKey: item.sourceChannel.toLowerCase().replace(/\s+/g, '-'),
      sourcePostId: item.id,
      draftVersionId: null,
      sourceDate: item.sourceDate,
      views: item.views,
      text: item.text,
      excerpt: item.excerpt,
      mediaCount: item.mediaCount,
      mediaPreviewPath: item.mediaPreviewPath || null
    }));
    const media = normalizeMediaItems(selected.flatMap((item) => item.mediaPaths).map((mediaPath) => ({ path: mediaPath, mediaType: 'photo', kind: 'photo' })));
    const created = createDraftFromText(db, profile, text, media, sources, { mode: 'source_pool', body });
    saveDb(db);
    return clone(created) as T;
  }

  const generateFromSourceMatch = pathname.match(/^\/profiles\/([^/]+)\/generate-from-source$/);
  if (method === 'POST' && generateFromSourceMatch) {
    const profile = getProfileBySlug(db, decodeURIComponent(generateFromSourceMatch[1]));
    const body = parseBody(init) as unknown as GenerateDraftFromManualSourceInput;
    const sourceText = String(body.text || '').trim() || 'Local mock source text.';
    const sourceLinks = Array.isArray(body.sourceLinks) ? body.sourceLinks : [];
    const linkBlock = sourceLinks.length ? `<p>Sources: ${sourceLinks.map((item) => item.label || item.url).join(', ')}</p>` : '';
    const text = `<p>${sourceText}</p>${linkBlock}<p><strong>Mock note:</strong> created locally for UI development.</p>`;
    const media = normalizeMediaItems((body.mediaPaths || []).map((mediaPath) => ({ path: mediaPath, mediaType: 'photo', kind: 'photo' })));
    const sources: DraftSource[] = [
      {
        id: 1,
        role: 'source',
        sourceChannel: body.channelTitle || 'Manual source',
        sourceTelegramPostId: body.sourceTelegramPostId || null,
        sourceKey: body.channelKey || 'manual',
        sourceDate: nowIso(-10),
        text: sourceText,
        excerpt: summarize(sourceText),
        mediaCount: media.length,
        mediaPreviewPath: media[0]?.path || null
      }
    ];
    const created = createDraftFromText(db, profile, text, media, sources, { mode: 'manual_source', body });
    saveDb(db);
    return clone(created) as T;
  }

  const profileAssetsMatch = pathname.match(/^\/profiles\/([^/]+)\/assets$/);
  if (method === 'PUT' && profileAssetsMatch) {
    const profile = getProfileBySlug(db, decodeURIComponent(profileAssetsMatch[1]));
    const body = parseBody(init);
    Object.assign(profile, body, { updatedAt: nowIso() });
    syncProfileStats(db);
    saveDb(db);
    const result: ProfileAssetsUpdateResult = {
      profileId: profile.slug,
      savedFields: Object.keys(body),
      profile: clone(profile)
    };
    return result as T;
  }

  const distillMatch = pathname.match(/^\/profiles\/([^/]+)\/distill-persona$/);
  if (method === 'POST' && distillMatch) {
    const profile = getProfileBySlug(db, decodeURIComponent(distillMatch[1]));
    profile.personaGuideMarkdown = `# ${profile.title} style\n\nLocal mock regenerated this style from the attached source channels.\n\n- Keep the lead short\n- Clarify why the update matters\n- End with one next-step takeaway`;
    profile.updatedAt = nowIso();
    syncProfileStats(db);
    saveDb(db);
    const result: DistillPersonaResult = {
      profileId: profile.slug,
      postsAnalyzed: (db.sourcePosts[profile.slug] || []).length,
      outputPath: profile.personaGuidePath || `profiles/${profile.slug}/persona.md`,
      profile: clone(profile)
    };
    return result as T;
  }

  if (method === 'GET' && pathname === '/inbox') {
    const status = url.searchParams.get('status');
    const profileId = url.searchParams.get('profileId');
    const items = db.drafts
      .filter((draft) => (status ? draft.status === status : draft.status === 'editing' || draft.status === 'scheduled'))
      .filter((draft) => (profileId ? draft.profileId === profileId : true))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .map(toInboxItem);
    return clone(items) as T;
  }

  const draftMatch = pathname.match(/^\/drafts\/(\d+)$/);
  if (method === 'GET' && draftMatch) {
    return clone(getDraftById(db, Number(draftMatch[1]))) as T;
  }

  const draftVersionsMatch = pathname.match(/^\/drafts\/(\d+)\/versions$/);
  if (method === 'GET' && draftVersionsMatch) {
    return clone(getDraftById(db, Number(draftVersionsMatch[1])).versions) as T;
  }

  const saveDraftMatch = pathname.match(/^\/drafts\/(\d+)\/save$/);
  if (method === 'POST' && saveDraftMatch) {
    const draft = getDraftById(db, Number(saveDraftMatch[1]));
    const body = parseBody(init);
    draft.text = String(body.text || draft.text);
    draft.title = deriveDraftTitle(draft.text, draft.title || 'Untitled draft');
    draft.media = normalizeMediaItems(body.mediaState);
    draft.sourceState = body.sourceState ?? draft.sourceState;
    draft.updatedAt = nowIso();
    if (draft.status !== 'published' && draft.status !== 'cancelled') {
      draft.status = draft.scheduledFor ? 'scheduled' : 'editing';
    }
    appendDraftVersion(db, draft, 'saved');
    syncProfileStats(db);
    saveDb(db);
    return clone({ ok: true }) as T;
  }

  const scheduleDraftMatch = pathname.match(/^\/drafts\/(\d+)\/schedule$/);
  if (method === 'POST' && scheduleDraftMatch) {
    const draft = getDraftById(db, Number(scheduleDraftMatch[1]));
    const body = parseBody(init);
    draft.scheduledFor = String(body.scheduledFor || '');
    draft.status = draft.scheduledFor ? 'scheduled' : 'editing';
    draft.updatedAt = nowIso();
    appendDraftVersion(db, draft, 'scheduled');
    syncProfileStats(db);
    saveDb(db);
    return clone({ ok: true }) as T;
  }

  const publishDraftMatch = pathname.match(/^\/drafts\/(\d+)\/publish$/);
  if (method === 'POST' && publishDraftMatch) {
    const draft = getDraftById(db, Number(publishDraftMatch[1]));
    draft.status = 'published';
    draft.publishedAt = nowIso();
    draft.scheduledFor = null;
    draft.telegramMessageId = draft.telegramMessageId || 5000 + draft.id;
    draft.updatedAt = nowIso();
    draft.publications.unshift({
      id: db.nextPublicationId++,
      status: 'published',
      telegramMessageId: draft.telegramMessageId,
      targetChannelId: getProfileBySlug(db, draft.profileId).telegramChannelId,
      publishedAt: draft.publishedAt,
      text: stripHtml(draft.text),
      media: clone(draft.media),
      errorText: null
    });
    appendDraftVersion(db, draft, 'published');
    syncProfileStats(db);
    saveDb(db);
    return clone({ ok: true }) as T;
  }

  const regenerateDraftMatch = pathname.match(/^\/drafts\/(\d+)\/regenerate$/);
  if (method === 'POST' && regenerateDraftMatch) {
    const draft = getDraftById(db, Number(regenerateDraftMatch[1]));
    draft.text = `<p><strong>Regenerated locally.</strong></p>${draft.text}`;
    draft.title = deriveDraftTitle(draft.text, draft.title || 'Untitled draft');
    draft.updatedAt = nowIso();
    if (draft.status !== 'published' && draft.status !== 'cancelled') {
      draft.status = draft.scheduledFor ? 'scheduled' : 'editing';
    }
    appendDraftVersion(db, draft, 'regenerated');
    syncProfileStats(db);
    saveDb(db);
    return clone({ ok: true }) as T;
  }

  const cancelDraftMatch = pathname.match(/^\/drafts\/(\d+)\/cancel$/);
  if (method === 'POST' && cancelDraftMatch) {
    const draft = getDraftById(db, Number(cancelDraftMatch[1]));
    draft.status = 'cancelled';
    draft.scheduledFor = null;
    draft.updatedAt = nowIso();
    appendDraftVersion(db, draft, 'cancelled');
    syncProfileStats(db);
    saveDb(db);
    return clone({ ok: true }) as T;
  }

  const deleteDraftMatch = pathname.match(/^\/drafts\/(\d+)$/);
  if (method === 'DELETE' && deleteDraftMatch) {
    const draftId = Number(deleteDraftMatch[1]);
    const draftIndex = db.drafts.findIndex((draft) => draft.id === draftId);
    if (draftIndex < 0) {
      throw new Error(`Draft ${draftId} not found`);
    }

    const draft = db.drafts[draftIndex];
    if (draft.status !== 'published' && draft.status !== 'cancelled') {
      throw new Error('Only history posts can be deleted');
    }

    db.drafts.splice(draftIndex, 1);
    syncProfileStats(db);
    saveDb(db);
    return clone({ id: draftId, status: draft.status }) as T;
  }

  if (method === 'GET' && pathname === '/history') {
    const profileId = url.searchParams.get('profileId');
    const status = url.searchParams.get('status');
    const items = db.drafts
      .filter((draft) => draft.status === 'published' || draft.status === 'cancelled')
      .filter((draft) => (profileId ? draft.profileId === profileId : true))
      .filter((draft) => (status ? draft.status === status : true))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .map(toHistoryItem);
    return clone(items) as T;
  }

  const scheduleMatch = pathname.match(/^\/profiles\/([^/]+)\/schedule$/);
  if (scheduleMatch && method === 'GET') {
    return clone(db.schedules[decodeURIComponent(scheduleMatch[1])]) as T;
  }

  if (scheduleMatch && method === 'PUT') {
    const profileId = decodeURIComponent(scheduleMatch[1]);
    const body = parseBody(init);
    const current = db.schedules[profileId];
    const nextSchedule: ScheduleDetail = {
      ...current,
      timezone: String(body.timezone || current.timezone),
      isEnabled: Boolean(body.isEnabled),
      config: clone((body.config || {}) as Record<string, unknown>),
      updatedAt: nowIso()
    };
    db.schedules[profileId] = nextSchedule;
    syncProfileStats(db);
    saveDb(db);
    return clone(nextSchedule) as T;
  }

  if (method === 'POST' && pathname === '/media-upload') {
    const body = parseBody(init);
    const uploaded: UploadedMediaFile = {
      path: `mock-media/${String(body.filename || 'upload').replace(/\s+/g, '-').toLowerCase() || 'upload'}.png`,
      filename: String(body.filename || 'upload.png')
    };
    return uploaded as T;
  }

  throw new Error(`Mock route is not implemented: ${method} ${pathname}`);
}
