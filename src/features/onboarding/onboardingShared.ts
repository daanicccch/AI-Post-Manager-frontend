import { useEffect, useState } from 'react';
import {
  api,
  type OnboardingState,
  type PersonaSource,
  type Profile,
  type SourceChannelOption,
  type SourcePreset,
  type WebSourceOption,
} from '../../lib/api';

export type OnboardingStepKey = 'sources' | 'style' | 'style-review' | 'plan';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeSourceChannels(items: unknown[] | undefined): SourceChannelOption[] {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const username = String(item.username || '').trim().replace(/^@+/, '');
      if (!username) {
        return null;
      }

      return {
        username,
        title: String(item.title || item.name || username).trim() || username,
        name: String(item.name || item.title || username).trim() || username,
        usedForStyle: item.usedForStyle !== false,
        usedForMonitoring: item.usedForMonitoring !== false,
        origin: String(item.origin || '').trim() || undefined,
        is_check: item.is_check === true,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

export function normalizeWebSources(items: unknown[] | undefined): WebSourceOption[] {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const url = String(item.url || '').trim();
      if (!url) {
        return null;
      }

      return {
        url,
        title: String(item.title || url).trim() || url,
        sourceKind: String(item.sourceKind || 'website').trim() || 'website',
        origin: String(item.origin || '').trim() || undefined,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

export function matchesChannelQuery(option: SourceChannelOption, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return [option.username, option.title, option.name]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalizedQuery));
}

export function matchesWebQuery(option: WebSourceOption, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return [option.url, option.title, option.sourceKind]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalizedQuery));
}

export function getConfigValue(config: unknown, key: string) {
  return isRecord(config) ? config[key] : undefined;
}

export function buildPresetMap(presets: SourcePreset[]) {
  return new Map(presets.map((preset) => [preset.key, preset]));
}

export function buildOnboardingUrl(step: OnboardingStepKey, profileId: string) {
  const params = new URLSearchParams();
  params.set('profileId', profileId);

  if (typeof window !== 'undefined') {
    const current = new URLSearchParams(window.location.search);
    const mock = current.get('mock');
    const persistedMock = window.localStorage.getItem('channelbot.local.mock-api');
    if (mock === '1' || mock === 'true' || persistedMock === '1') {
      params.set('mock', '1');
    }
  }

  return `/onboarding/${step}?${params.toString()}`;
}

export function getOnboardingStepFromStatus(status: string | null | undefined): OnboardingStepKey {
  const normalizedStatus = String(status || '').trim();
  if (normalizedStatus === 'awaiting_style_review') {
    return 'style-review';
  }
  if (normalizedStatus === 'awaiting_schedule_setup' || normalizedStatus === 'completed') {
    return 'plan';
  }
  if (normalizedStatus === 'awaiting_style_generation') {
    return 'style';
  }
  return 'sources';
}

export function getDefaultPersonaSource(profile: Profile | null): PersonaSource {
  const sourceChannels = normalizeSourceChannels(profile?.sourceChannels);
  const hasExternalChannels = sourceChannels.some((item) => item.origin !== 'target' && item.usedForStyle !== false);
  const hasTargetChannel = sourceChannels.some((item) => item.origin === 'target')
    || Boolean(String(profile?.telegramChannelId || '').trim());

  if (hasExternalChannels && hasTargetChannel) {
    return 'sources';
  }
  if (hasExternalChannels) {
    return 'sources';
  }
  if (hasTargetChannel) {
    return 'target';
  }
  return 'sources';
}

export function useOnboardingData(profileId: string) {
  const [data, setData] = useState<OnboardingState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setIsLoading(true);
    setError(null);

    try {
      const nextState = await api.getOnboarding(profileId || undefined);
      setData(nextState);
      return nextState;
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Failed to load onboarding';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [profileId]);

  return {
    data,
    error,
    isLoading,
    profile: data?.profile ?? null,
    presets: data?.presets ?? [],
    sourceChannelCatalog: data?.sourceChannelCatalog ?? [],
    webSourceCatalog: data?.webSourceCatalog ?? [],
    reload,
    setError,
  };
}
