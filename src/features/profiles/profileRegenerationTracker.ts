import { api, type DistillPersonaResult } from '../../lib/api';

type PendingProfileRegeneration = {
  profileId: string;
  startedAt: number;
  promise: Promise<DistillPersonaResult>;
};

const pendingProfileRegenerations = new Map<string, PendingProfileRegeneration>();

export function getPendingProfileRegeneration(profileId: string) {
  return pendingProfileRegenerations.get(profileId) || null;
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
