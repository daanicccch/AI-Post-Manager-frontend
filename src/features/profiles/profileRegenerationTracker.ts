import { api, type DistillPersonaResult } from '../../lib/api';

type PendingProfileRegeneration = {
  profileId: string;
  startedAt: number;
  promise: Promise<DistillPersonaResult>;
};

type StoredProfileRegeneration = {
  profileId: string;
  startedAt: number;
  baselineUpdatedAt: string | null;
};

const pendingProfileRegenerations = new Map<string, PendingProfileRegeneration>();
const PROFILE_REGENERATION_STORAGE_KEY = 'channelbot.profile-regeneration';

export function getPendingProfileRegeneration(profileId: string) {
  return pendingProfileRegenerations.get(profileId) || null;
}

export function getStoredProfileRegeneration(profileId: string) {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(PROFILE_REGENERATION_STORAGE_KEY);
    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue) as StoredProfileRegeneration | null;
    if (
      !parsedValue
      || parsedValue.profileId !== profileId
      || !Number.isFinite(parsedValue.startedAt)
      || parsedValue.startedAt <= 0
    ) {
      return null;
    }

    return {
      profileId: parsedValue.profileId,
      startedAt: parsedValue.startedAt,
      baselineUpdatedAt: typeof parsedValue.baselineUpdatedAt === 'string'
        ? parsedValue.baselineUpdatedAt
        : null,
    };
  } catch {
    return null;
  }
}

export function storeProfileRegeneration(profileId: string, startedAt: number, baselineUpdatedAt: string | null | undefined) {
  if (typeof window === 'undefined') {
    return;
  }

  const payload: StoredProfileRegeneration = {
    profileId,
    startedAt,
    baselineUpdatedAt: typeof baselineUpdatedAt === 'string' && baselineUpdatedAt.trim()
      ? baselineUpdatedAt
      : null,
  };

  window.localStorage.setItem(PROFILE_REGENERATION_STORAGE_KEY, JSON.stringify(payload));
}

export function clearStoredProfileRegeneration(profileId?: string) {
  if (typeof window === 'undefined') {
    return;
  }

  if (!profileId) {
    window.localStorage.removeItem(PROFILE_REGENERATION_STORAGE_KEY);
    return;
  }

  const storedValue = getStoredProfileRegeneration(profileId);
  if (storedValue) {
    window.localStorage.removeItem(PROFILE_REGENERATION_STORAGE_KEY);
  }
}

export function ensureProfileRegeneration(profileId: string, personaSource: 'sources' | 'target') {
  const existingJob = pendingProfileRegenerations.get(profileId);
  if (existingJob) {
    return existingJob;
  }

  const startedAt = Date.now();
  const promise = api
    .distillPersona(profileId, { personaSource })
    .finally(() => {
      pendingProfileRegenerations.delete(profileId);
    });

  const job = {
    profileId,
    startedAt,
    promise,
  };

  pendingProfileRegenerations.set(profileId, job);
  return job;
}
