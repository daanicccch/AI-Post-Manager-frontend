import { api, type PersonaGenerationJobStatus, type PersonaSource } from '../../lib/api';

type StoredProfileRegeneration = {
  profileId: string;
  startedAt: number;
  jobId: string | null;
};

const PROFILE_REGENERATION_STORAGE_KEY = 'channelbot.profile-regeneration';

function normalizeStartedAt(value: number | string | null | undefined) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value).getTime();
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return Date.now();
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
      jobId: typeof parsedValue.jobId === 'string' ? parsedValue.jobId : null,
    };
  } catch {
    return null;
  }
}

export function storeProfileRegeneration(profileId: string, startedAt: number | string | null | undefined, jobId?: string | null) {
  if (typeof window === 'undefined') {
    return;
  }

  const payload: StoredProfileRegeneration = {
    profileId,
    startedAt: normalizeStartedAt(startedAt),
    jobId: typeof jobId === 'string' && jobId.trim() ? jobId : null,
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

export function ensureProfileRegeneration(profileId: string, personaSource: PersonaSource): Promise<PersonaGenerationJobStatus> {
  return api.distillPersona(profileId, { personaSource });
}
