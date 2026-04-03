import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, type Profile } from '../../lib/api';
import { useAppLocale } from '../../lib/appLocale';
import { buildOnboardingUrl } from './onboardingShared';
import { OnboardingFooter } from './OnboardingFooter';

type PlannerSlot = {
  id: string;
  label: string;
  start: string;
  end: string;
};

const MIN_CHANNEL_CHECK_INTERVAL_MINUTES = 10;

function normalizeTime(value: string | null | undefined, fallback: string) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return fallback;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return fallback;
  }

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function createPlannerSlot(index: number): PlannerSlot {
  return {
    id: `slot-${Date.now()}-${index}-${Math.random().toString(16).slice(2, 8)}`,
    label: `Slot ${index + 1}`,
    start: '09:00',
    end: '10:00',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readChannelCheckUsernames(profile: Profile | null) {
  return (Array.isArray(profile?.sourceChannels) ? profile.sourceChannels : [])
    .map((item) => {
      if (!isRecord(item) || !item.is_check) {
        return '';
      }
      return String(item.username || '').trim().replace(/^@+/, '');
    })
    .filter(Boolean);
}

export function OnboardingPlanPage() {
  const { language } = useAppLocale();
  const isRu = language === 'ru';
  const profileId = typeof window === 'undefined'
    ? ''
    : String(new URLSearchParams(window.location.search).get('profileId') || '').trim();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [timezone, setTimezone] = useState('Europe/Moscow');
  const [slots, setSlots] = useState<PlannerSlot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const invalidSlotCount = useMemo(() => slots.filter((slot) => slot.start >= slot.end).length, [slots]);

  useEffect(() => {
    if (!profileId) {
      setError(isRu ? '\u041d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d \u043f\u0440\u043e\u0444\u0438\u043b\u044c.' : 'No onboarding profile selected.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    Promise.all([api.getProfile(profileId), api.getSchedule(profileId)])
      .then(([nextProfile, nextSchedule]) => {
        setProfile(nextProfile);
        setTimezone(String(nextSchedule.timezone || 'Europe/Moscow').trim() || 'Europe/Moscow');
        const scheduleSlots = Array.isArray(nextSchedule.config?.postIntervals) ? nextSchedule.config.postIntervals : [];
        setSlots(
          scheduleSlots.length > 0
            ? scheduleSlots.map((slot, index) => {
                const typedSlot = slot as { label?: string; start?: string; end?: string };
                return {
                  id: `slot-${index}`,
                  label: String(typedSlot.label || `Slot ${index + 1}`),
                  start: normalizeTime(typedSlot.start, '09:00'),
                  end: normalizeTime(typedSlot.end, '10:00'),
                };
              })
            : []
        );
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load planner');
      })
      .finally(() => setIsLoading(false));
  }, [isRu, profileId]);

  function addSlot() {
    setSlots((current) => [
      ...current,
      {
        ...createPlannerSlot(current.length),
        label: isRu ? `\u0421\u043b\u043e\u0442 ${current.length + 1}` : `Slot ${current.length + 1}`,
      },
    ]);
  }

  function updateSlot(slotId: string, patch: Partial<PlannerSlot>) {
    setSlots((current) => current.map((slot) => (slot.id === slotId ? { ...slot, ...patch } : slot)));
  }

  function removeSlot(slotId: string) {
    setSlots((current) => current.filter((slot) => slot.id !== slotId));
  }

  async function submit() {
    setIsSaving(true);
    setError(null);

    try {
      if (slots.length === 0) {
        throw new Error(isRu ? '\u0414\u043e\u0431\u0430\u0432\u044c \u0445\u043e\u0442\u044f \u0431\u044b \u043e\u0434\u0438\u043d \u0441\u043b\u043e\u0442.' : 'Add at least one publishing slot.');
      }
      if (invalidSlotCount > 0) {
        throw new Error(
          isRu
            ? '\u0412 \u043a\u0430\u0436\u0434\u043e\u043c \u0441\u043b\u043e\u0442\u0435 \u0432\u0440\u0435\u043c\u044f \u043e\u043a\u043e\u043d\u0447\u0430\u043d\u0438\u044f \u0434\u043e\u043b\u0436\u043d\u043e \u0431\u044b\u0442\u044c \u043f\u043e\u0437\u0436\u0435 \u0441\u0442\u0430\u0440\u0442\u0430.'
            : 'Each slot must end later than it starts.'
        );
      }

      await api.updateSchedule(profileId, {
        timezone,
        isEnabled: true,
        config: {
          channelChecksIntervalMinutes: MIN_CHANNEL_CHECK_INTERVAL_MINUTES,
          channelCheckUsernames: readChannelCheckUsernames(profile),
          postIntervals: slots.map((slot) => ({
            label: slot.label.trim() || 'Slot',
            start: slot.start,
            end: slot.end,
          })),
          weeklyDigest: {
            enabled: false,
            dayOfWeek: 0,
            interval: {
              start: '12:00',
              end: '13:00',
            },
          },
        },
      });

      await api.completeOnboarding(profileId);
      window.location.assign(`/schedule?profileId=${encodeURIComponent(profileId)}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save planner');
    } finally {
      setIsSaving(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  if (isLoading) {
    return (
      <section className="page-stack">
        <div className="state-banner">{isRu ? '\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043c \u043f\u043b\u0430\u043d...' : 'Loading planner...'}</div>
      </section>
    );
  }

  return (
    <section className="page-stack page-stack--setup">
      <section className="setup-header">
        <div className="setup-progress" aria-label="Onboarding progress">
          <span className="setup-progress__segment setup-progress__segment--done" />
          <span className="setup-progress__segment setup-progress__segment--done" />
          <span className="setup-progress__segment setup-progress__segment--done" />
          <span className="setup-progress__segment setup-progress__segment--active" />
        </div>
        <h2 className="setup-header__title">{isRu ? '\u041f\u043b\u0430\u043d \u043f\u0443\u0431\u043b\u0438\u043a\u0430\u0446\u0438\u0439' : 'Publishing plan'}</h2>
      </section>

      {error && <div className="state-banner state-banner--error setup-error-banner">{error}</div>}

      <form className="setup-panel setup-panel--grow setup-panel--fill setup-plan-form" onSubmit={handleSubmit}>
        <section className="context-section context-section--tight">
          <label className="field-block">
            <span>{isRu ? '\u0422\u0430\u0439\u043c\u0437\u043e\u043d\u0430' : 'Timezone'}</span>
            <input value={timezone} onChange={(event) => setTimezone(event.target.value)} />
          </label>
        </section>

        <section className="context-section context-section--tight setup-plan-slots">
          <div className="panel-heading panel-heading--tight setup-plan-heading">
            <div>
              <span className="eyebrow">{isRu ? '\u0421\u043b\u043e\u0442\u044b' : 'Slots'}</span>
              <h3>{isRu ? '\u041a\u043e\u0433\u0434\u0430 \u043c\u043e\u0436\u043d\u043e \u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u0442\u044c \u043f\u043e\u0441\u0442\u044b' : 'When posts may be published'}</h3>
            </div>

            <button className="secondary-button secondary-button--small schedule-add-button" type="button" onClick={addSlot}>
              {isRu ? '\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0441\u043b\u043e\u0442' : 'Add slot'}
            </button>
          </div>

          <div className="schedule-slot-list">
            {slots.length === 0 ? (
              <div className="empty-state setup-plan-empty">
                <p>{isRu ? '\u041f\u043e\u043a\u0430 \u043d\u0435\u0442 \u043d\u0438 \u043e\u0434\u043d\u043e\u0433\u043e \u0441\u043b\u043e\u0442\u0430.' : 'No slots yet.'}</p>
              </div>
            ) : (
              slots.map((slot, index) => (
                <article className="schedule-slot-card" key={slot.id}>
                  <div className="schedule-slot-card__top">
                    <label className="field-block">
                      <span>{isRu ? '\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435' : 'Label'}</span>
                      <input value={slot.label} onChange={(event) => updateSlot(slot.id, { label: event.target.value })} />
                    </label>
                    <button
                      aria-label={isRu ? `\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0441\u043b\u043e\u0442 ${index + 1}` : `Remove slot ${index + 1}`}
                      className="schedule-remove-button"
                      disabled={slots.length === 1}
                      type="button"
                      onClick={() => removeSlot(slot.id)}
                    >
                      x
                    </button>
                  </div>

                  <div className="schedule-slot-card__times">
                    <label className="field-block">
                      <span>{isRu ? '\u041d\u0430\u0447\u0430\u043b\u043e' : 'Start'}</span>
                      <input type="time" value={slot.start} onChange={(event) => updateSlot(slot.id, { start: event.target.value })} />
                    </label>

                    <label className="field-block">
                      <span>{isRu ? '\u041a\u043e\u043d\u0435\u0446' : 'End'}</span>
                      <input type="time" value={slot.end} onChange={(event) => updateSlot(slot.id, { end: event.target.value })} />
                    </label>
                  </div>

                  {slot.start >= slot.end ? (
                    <div className="draft-row__meta schedule-slot-card__meta">
                      <span>{isRu ? '\u041a\u043e\u043d\u0435\u0446 \u0434\u043e\u043b\u0436\u0435\u043d \u0431\u044b\u0442\u044c \u043f\u043e\u0437\u0436\u0435 \u043d\u0430\u0447\u0430\u043b\u0430' : 'End must be later than start'}</span>
                    </div>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </section>
      </form>

      <OnboardingFooter
        backLabel={isRu ? '\u041d\u0430\u0437\u0430\u0434' : 'Back'}
        continueLabel={
          isSaving
            ? (isRu ? '\u0421\u043e\u0445\u0440\u0430\u043d\u044f\u0435\u043c...' : 'Saving...')
            : (isRu ? '\u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c' : 'Continue')
        }
        continueDisabled={isSaving}
        onBack={() => window.location.assign(buildOnboardingUrl('style-review', profileId))}
        onContinue={() => void submit()}
      />
    </section>
  );
}
