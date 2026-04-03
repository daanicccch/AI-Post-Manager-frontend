import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, type Profile } from '../../lib/api';
import { useAppLocale } from '../../lib/appLocale';

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
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const profileId = String(searchParams.get('profileId') || '').trim();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [timezone, setTimezone] = useState('Europe/Moscow');
  const [slots, setSlots] = useState<PlannerSlot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const invalidSlotCount = useMemo(() => slots.filter((slot) => slot.start >= slot.end).length, [slots]);
  const coachmark = useMemo(() => {
    if (slots.length === 0) {
      return 'add-slot';
    }
    if (slots.some((slot) => slot.start === '09:00' && slot.end === '10:00')) {
      return 'set-time';
    }
    return 'save-plan';
  }, [slots]);

  useEffect(() => {
    if (!profileId) {
      setError(isRu ? 'Не найден профиль для onboarding-плана.' : 'No profile selected for onboarding planner.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    Promise.all([api.getProfile(profileId), api.getSchedule(profileId)])
      .then(([nextProfile, nextSchedule]) => {
        setProfile(nextProfile);
        setTimezone(String(nextSchedule.timezone || 'Europe/Moscow').trim() || 'Europe/Moscow');
        const scheduleSlots = Array.isArray(nextSchedule.config?.postIntervals)
          ? nextSchedule.config.postIntervals
          : [];
        setSlots(
          scheduleSlots.map((slot, index) => {
            const typedSlot = slot as { label?: string; start?: string; end?: string };
            return {
              id: `slot-${index}`,
              label: String(typedSlot.label || `Slot ${index + 1}`),
              start: normalizeTime(typedSlot.start, '09:00'),
              end: normalizeTime(typedSlot.end, '10:00'),
            };
          })
        );
      })
      .catch((loadError) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : isRu
              ? 'Не удалось загрузить onboarding-план'
              : 'Failed to load onboarding planner'
        );
      })
      .finally(() => setIsLoading(false));
  }, [isRu, profileId]);

  function addSlot() {
    setSlots((current) => [
      ...current,
      {
        ...createPlannerSlot(current.length),
        label: isRu ? `Слот ${current.length + 1}` : `Slot ${current.length + 1}`,
      },
    ]);
  }

  function updateSlot(slotId: string, patch: Partial<PlannerSlot>) {
    setSlots((current) => current.map((slot) => (slot.id === slotId ? { ...slot, ...patch } : slot)));
  }

  function removeSlot(slotId: string) {
    setSlots((current) => current.filter((slot) => slot.id !== slotId));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      if (slots.length === 0) {
        throw new Error(isRu ? 'Добавь хотя бы один слот публикации.' : 'Add at least one publishing slot.');
      }
      if (invalidSlotCount > 0) {
        throw new Error(
          isRu
            ? 'Каждый слот публикации должен заканчиваться позже, чем начинается.'
            : 'Each publishing slot must end later than it starts.'
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
      setNotice(isRu ? 'План сохранен, канал готов к работе.' : 'Planner saved. Your channel is ready.');
      navigate(`/schedule?profileId=${encodeURIComponent(profileId)}`, { replace: true });
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : isRu
            ? 'Не удалось сохранить onboarding-план'
            : 'Failed to save onboarding planner'
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <section className="page-stack"><div className="state-banner">{isRu ? 'Загружаем план...' : 'Loading planner...'}</div></section>;
  }

  return (
    <section className="page-stack page-stack--onboarding">
      <section className="onboarding-hero">
        <span className="eyebrow">{isRu ? 'План' : 'Planner'}</span>
        <h2>{isRu ? 'Настрой слоты публикации' : 'Set your publishing slots'}</h2>
        <p>
          {isRu
            ? 'Остался последний шаг: укажи, когда PostiX может выпускать посты.'
            : 'Final step: tell PostiX when it may publish posts.'}
        </p>
      </section>

      <div className="state-banner state-banner--info onboarding-plan-banner">
        {coachmark === 'add-slot'
          ? (isRu ? 'Добавь первый слот. Кнопка уже подсвечена.' : 'Add your first slot. The button is highlighted.')
          : coachmark === 'set-time'
            ? (isRu ? 'Теперь выставь время слота. Мы подсветили карточку со временем.' : 'Now adjust the slot time. The time card is highlighted.')
            : (isRu ? 'Все готово. Осталось сохранить план.' : 'Everything is ready. Save the planner to finish.')}
      </div>

      {error && <div className="state-banner state-banner--error">{error}</div>}
      {notice && <div className="state-banner state-banner--success">{notice}</div>}

      <form className="onboarding-plan-form" onSubmit={handleSubmit}>
        <section className="onboarding-section onboarding-section--summary">
          <div className="panel-heading panel-heading--tight">
            <div>
              <span className="eyebrow">{isRu ? 'Канал' : 'Channel'}</span>
              <h3>{profile?.title || profileId}</h3>
            </div>
          </div>

          <label className="field-block">
            <span>{isRu ? 'Таймзона' : 'Timezone'}</span>
            <input value={timezone} onChange={(event) => setTimezone(event.target.value)} />
          </label>
        </section>

        <section className={`onboarding-section${coachmark === 'set-time' ? ' schedule-spotlight schedule-spotlight--pulse' : ''}`}>
          <div className="panel-heading panel-heading--tight">
            <div>
              <span className="eyebrow">{isRu ? 'Слоты' : 'Slots'}</span>
              <h3>{isRu ? 'Когда можно публиковать посты' : 'When posts can go live'}</h3>
            </div>

            <button
              className={`secondary-button secondary-button--small schedule-add-button${coachmark === 'add-slot' ? ' schedule-spotlight schedule-spotlight--pulse' : ''}`}
              type="button"
              onClick={addSlot}
            >
              {isRu ? 'Добавить слот' : 'Add slot'}
            </button>
          </div>

          <div className="schedule-slot-list">
            {slots.length === 0 ? (
              <div className="editor-help">{isRu ? 'Пока нет ни одного слота.' : 'No slots yet.'}</div>
            ) : (
              slots.map((slot, index) => (
                <article className="schedule-slot-card" key={slot.id}>
                  <div className="schedule-slot-card__top">
                    <label className="field-block">
                      <span>{isRu ? 'Название' : 'Label'}</span>
                      <input value={slot.label} onChange={(event) => updateSlot(slot.id, { label: event.target.value })} />
                    </label>

                    <button
                      aria-label={isRu ? `Удалить слот ${index + 1}` : `Remove slot ${index + 1}`}
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
                      <span>{isRu ? 'Начало' : 'Start'}</span>
                      <input type="time" value={slot.start} onChange={(event) => updateSlot(slot.id, { start: event.target.value })} />
                    </label>

                    <label className="field-block">
                      <span>{isRu ? 'Конец' : 'End'}</span>
                      <input type="time" value={slot.end} onChange={(event) => updateSlot(slot.id, { end: event.target.value })} />
                    </label>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <button className={`primary-button primary-button--create${coachmark === 'save-plan' ? ' schedule-spotlight schedule-spotlight--pulse' : ''}`} disabled={isSaving} type="submit">
          {isSaving ? (isRu ? 'Сохраняем...' : 'Saving...') : isRu ? 'Сохранить план' : 'Save planner'}
        </button>
      </form>
    </section>
  );
}
