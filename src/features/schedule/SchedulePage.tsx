import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SchedulePageSkeleton } from '../../components/LoadingSkeleton';
import { SelectField } from '../../components/SelectField';
import { api, type Profile, type ScheduleDetail } from '../../lib/api';
import { useAppLocale } from '../../lib/appLocale';

type PlannerSlot = {
  id: string;
  label: string;
  start: string;
  end: string;
};

type SourceChannelOption = {
  key: string;
  label: string;
  username: string;
  isCheck: boolean;
};

const MIN_CHANNEL_CHECK_INTERVAL_MINUTES = 10;

const weekDayOptions = [
  { value: 0, label: 'Monday' },
  { value: 1, label: 'Tuesday' },
  { value: 2, label: 'Wednesday' },
  { value: 3, label: 'Thursday' },
  { value: 4, label: 'Friday' },
  { value: 5, label: 'Saturday' },
  { value: 6, label: 'Sunday' }
];

const commonTimezones = [
  'Europe/Moscow',
  'UTC',
  'Europe/Berlin',
  'Europe/London',
  'Asia/Dubai',
  'Asia/Tbilisi',
  'Asia/Bangkok',
  'Asia/Singapore',
  'America/New_York',
  'America/Los_Angeles'
];

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
    end: '10:00'
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSourceChannels(channels: unknown[] | undefined) {
  return (Array.isArray(channels) ? channels : [])
    .map((channel, index): SourceChannelOption | null => {
      if (!isRecord(channel)) {
        return null;
      }

      const username = String(channel.username || '').trim().replace(/^@/, '');
      const name = String(channel.name || channel.title || username || `Channel ${index + 1}`).trim();
      if (!username) {
        return null;
      }

      return {
        key: username,
        username,
        label: name,
        isCheck: channel.usedForMonitoring !== false || Boolean(channel.is_check)
      };
    })
    .filter((channel): channel is SourceChannelOption => Boolean(channel));
}

function parsePlannerConfig(config: Record<string, unknown>, sourceChannels: SourceChannelOption[]) {
  const rawSlots = Array.isArray(config.postIntervals) ? config.postIntervals : [];
  const slots =
    rawSlots.length > 0
      ? rawSlots.map((slot, index) => {
          const typedSlot = slot as { label?: string; start?: string; end?: string };
          return {
            id: `slot-${index}`,
            label: String(typedSlot.label || `Slot ${index + 1}`),
            start: normalizeTime(typedSlot.start, '09:00'),
            end: normalizeTime(typedSlot.end, '10:00')
          };
        })
      : [createPlannerSlot(0)];

  const weeklyDigest = (config.weeklyDigest || {}) as {
    enabled?: boolean;
    dayOfWeek?: number;
    interval?: { start?: string; end?: string };
  };

  return {
    channelChecksIntervalMinutes: Math.max(
      MIN_CHANNEL_CHECK_INTERVAL_MINUTES,
      Number(config.channelChecksIntervalMinutes) || MIN_CHANNEL_CHECK_INTERVAL_MINUTES
    ),
    channelCheckUsernames: Array.isArray(config.channelCheckUsernames)
      ? config.channelCheckUsernames.map((item) => String(item || '').trim()).filter(Boolean)
      : sourceChannels.filter((channel) => channel.isCheck).map((channel) => channel.username),
    slots,
    weeklyDigestEnabled: weeklyDigest.enabled !== false,
    weeklyDigestDayOfWeek: Math.max(0, Math.min(6, Number(weeklyDigest.dayOfWeek) || 0)),
    weeklyDigestStart: normalizeTime(weeklyDigest.interval?.start, '12:00'),
    weeklyDigestEnd: normalizeTime(weeklyDigest.interval?.end, '13:00')
  };
}

function buildPlannerConfig({
  channelChecksIntervalMinutes,
  slots,
  weeklyDigestEnabled,
  weeklyDigestDayOfWeek,
  weeklyDigestStart,
  weeklyDigestEnd,
  channelCheckUsernames
}: {
  channelChecksIntervalMinutes: number;
  slots: PlannerSlot[];
  weeklyDigestEnabled: boolean;
  weeklyDigestDayOfWeek: number;
  weeklyDigestStart: string;
  weeklyDigestEnd: string;
  channelCheckUsernames: string[];
}) {
  return {
    channelChecksIntervalMinutes,
    channelCheckUsernames,
    postIntervals: slots
      .filter((slot) => slot.start < slot.end)
      .map((slot) => ({
        label: slot.label.trim() || 'Slot',
        start: normalizeTime(slot.start, '09:00'),
        end: normalizeTime(slot.end, '10:00')
      })),
    weeklyDigest: {
      enabled: weeklyDigestEnabled,
      dayOfWeek: weeklyDigestDayOfWeek,
      interval: {
        start: normalizeTime(weeklyDigestStart, '12:00'),
        end: normalizeTime(weeklyDigestEnd, '13:00')
      }
    }
  };
}

export function SchedulePage() {
  const { language } = useAppLocale();
  const isRu = language === 'ru';
  const [searchParams] = useSearchParams();
  const requestedProfileId = String(searchParams.get('profileId') || '').trim();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState<string>('');
  const [schedule, setSchedule] = useState<ScheduleDetail | null>(null);
  const [timezone, setTimezone] = useState('Europe/Moscow');
  const [isEnabled, setIsEnabled] = useState(true);
  const [channelChecksIntervalMinutes, setChannelChecksIntervalMinutes] = useState(
    MIN_CHANNEL_CHECK_INTERVAL_MINUTES
  );
  const [channelCheckUsernames, setChannelCheckUsernames] = useState<string[]>([]);
  const [slots, setSlots] = useState<PlannerSlot[]>([]);
  const [weeklyDigestEnabled, setWeeklyDigestEnabled] = useState(true);
  const [weeklyDigestDayOfWeek, setWeeklyDigestDayOfWeek] = useState(0);
  const [weeklyDigestStart, setWeeklyDigestStart] = useState('12:00');
  const [weeklyDigestEnd, setWeeklyDigestEnd] = useState('13:00');
  const [isDigestDayPickerOpen, setIsDigestDayPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isChannelPickerOpen, setIsChannelPickerOpen] = useState(false);
  const [isMonitoringInfoOpen, setIsMonitoringInfoOpen] = useState(false);

  const digestDayPickerRef = useRef<HTMLDivElement | null>(null);

  const weekDayOptionsLocalized = useMemo(
    () =>
      weekDayOptions.map((item) => ({
        ...item,
        label: isRu
          ? ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'][
              item.value
            ]
          : item.label
      })),
    [isRu]
  );

  const activeProfileLabel = useMemo(
    () => profiles.find((profile) => profile.slug === profileId)?.title ?? (isRu ? 'Профиль' : 'Profile'),
    [isRu, profileId, profiles]
  );

  const activeSourceChannels = useMemo(
    () => normalizeSourceChannels(profiles.find((profile) => profile.slug === profileId)?.sourceChannels),
    [profileId, profiles]
  );

  const selectedChannels = useMemo(
    () => activeSourceChannels.filter((channel) => channelCheckUsernames.includes(channel.username)),
    [activeSourceChannels, channelCheckUsernames]
  );

  const selectedWeekDayLabel = useMemo(
    () =>
      weekDayOptionsLocalized.find((item) => item.value === weeklyDigestDayOfWeek)?.label ??
      (isRu ? 'Понедельник' : 'Monday'),
    [isRu, weekDayOptionsLocalized, weeklyDigestDayOfWeek]
  );

  const profileSelectOptions = useMemo(
    () =>
      profiles.map((profile) => ({
        value: profile.slug,
        label: profile.title
      })),
    [profiles]
  );

  const monitoringSummary = useMemo(
    () =>
      isRu
        ? `Бот будет раз в ${channelChecksIntervalMinutes} мин искать новые посты в выбранных каналах. Как только появится новый пост, он сразу подготовит переписанную версию и отправит её на апрув.`
        : `The bot will look for new posts in the selected channels every ${channelChecksIntervalMinutes} minutes. As soon as a new post appears, it will prepare a rewritten version and send it for approval.`,
    [channelChecksIntervalMinutes, isRu]
  );

  useEffect(() => {
    api
      .listProfiles()
      .then((items) => {
        setProfiles(items);
        const preferredProfileId =
          (requestedProfileId && items.some((profile) => profile.slug === requestedProfileId) && requestedProfileId)
          || items[0]?.slug
          || '';
        setProfileId(preferredProfileId);
      })
      .catch((loadError: Error) => {
        setError(loadError.message);
      });
  }, [requestedProfileId]);

  useEffect(() => {
    if (!profileId) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setNotice(null);

    api
      .getSchedule(profileId)
      .then((data) => {
        setSchedule(data);
        setTimezone(data.timezone);
        setIsEnabled(data.isEnabled);

        const parsed = parsePlannerConfig(data.config || {}, activeSourceChannels);
        setChannelChecksIntervalMinutes(parsed.channelChecksIntervalMinutes);
        setChannelCheckUsernames(parsed.channelCheckUsernames);
        setSlots(parsed.slots);
        setWeeklyDigestEnabled(parsed.weeklyDigestEnabled);
        setWeeklyDigestDayOfWeek(parsed.weeklyDigestDayOfWeek);
        setWeeklyDigestStart(parsed.weeklyDigestStart);
        setWeeklyDigestEnd(parsed.weeklyDigestEnd);
      })
      .catch((loadError: Error) => {
        setError(loadError.message);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [activeSourceChannels, profileId]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!digestDayPickerRef.current?.contains(event.target as Node)) {
        setIsDigestDayPickerOpen(false);
      }
    }

    if (isDigestDayPickerOpen) {
      window.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDigestDayPickerOpen]);

  const invalidSlotCount = useMemo(() => slots.filter((slot) => slot.start >= slot.end).length, [slots]);

  const plannerPreview = useMemo(
    () =>
      buildPlannerConfig({
        channelChecksIntervalMinutes,
        slots,
        weeklyDigestEnabled,
        weeklyDigestDayOfWeek,
        weeklyDigestStart,
        weeklyDigestEnd,
        channelCheckUsernames
      }),
    [
      channelCheckUsernames,
      channelChecksIntervalMinutes,
      slots,
      weeklyDigestDayOfWeek,
      weeklyDigestEnabled,
      weeklyDigestEnd,
      weeklyDigestStart
    ]
  );
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      if (invalidSlotCount > 0) {
        throw new Error(
          isRu
            ? 'Каждый слот публикации должен заканчиваться позже, чем начинается.'
            : 'Each publishing slot must end later than it starts.'
        );
      }

      if (weeklyDigestEnabled && weeklyDigestStart >= weeklyDigestEnd) {
        throw new Error(
          isRu
            ? 'Время окончания недельного дайджеста должно быть позже времени начала.'
            : 'Weekly digest end time must be later than start time.'
        );
      }

      const saved = await api.updateSchedule(profileId, {
        timezone: timezone.trim() || 'Europe/Moscow',
        isEnabled,
        config: plannerPreview
      });

      setSchedule(saved);
      setNotice(isRu ? 'Расписание сохранено.' : 'Planner saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : isRu ? 'Не удалось сохранить расписание' : 'Failed to save schedule');
    } finally {
      setIsSaving(false);
    }
  }

  function updateSlot(slotId: string, patch: Partial<PlannerSlot>) {
    setSlots((currentSlots) =>
      currentSlots.map((slot) => (slot.id === slotId ? { ...slot, ...patch } : slot))
    );
  }

  function addSlot() {
    setSlots((currentSlots) => [
      ...currentSlots,
      {
        ...createPlannerSlot(currentSlots.length),
        label: isRu ? `Слот ${currentSlots.length + 1}` : `Slot ${currentSlots.length + 1}`
      }
    ]);
  }

  function removeSlot(slotId: string) {
    setSlots((currentSlots) => currentSlots.filter((slot) => slot.id !== slotId));
  }

  function toggleChannelCheck(username: string) {
    setChannelCheckUsernames((current) =>
      current.includes(username) ? current.filter((item) => item !== username) : [...current, username]
    );
  }

  if (isLoading && !schedule) {
    return <SchedulePageSkeleton />;
  }

  return (
    <section className="page-stack page-stack--schedule">
      <section className="queue-control-card queue-control-card--schedule">
        <details className="create-filter-drawer queue-filter-drawer" open>
          <summary className="create-filter-drawer__summary">
            <span>{isRu ? 'Настройка расписания' : 'Planner setup'}</span>
            <small>{activeProfileLabel}</small>
          </summary>

          <div className="create-filter-drawer__content">
            <SelectField
              label={isRu ? 'Профиль' : 'Profile'}
              options={profileSelectOptions}
              value={profileId}
              onChange={setProfileId}
            />
          </div>
        </details>
      </section>

      {error && <div className="state-banner state-banner--error">{error}</div>}
      {notice && <div className="state-banner state-banner--success">{notice}</div>}
      {isLoading && <div className="state-banner">{isRu ? 'Загружаем расписание...' : 'Loading planner...'}</div>}

      {schedule && !isLoading && (
        <div className="schedule-layout schedule-layout--compact">
          <form className="editor-panel editor-panel--schedule" onSubmit={handleSubmit}>
            <div className="panel-heading panel-heading--tight">
              <div>
                <span className="eyebrow">{isRu ? 'Расписание' : 'Planner'}</span>
                <h3>{schedule.profileTitle}</h3>
              </div>
            </div>

            <div className="create-form-grid create-form-grid--dual">
              <label className="field-block">
                <span>{isRu ? 'Часовой пояс' : 'Timezone'}</span>
                <input
                  list="schedule-timezones"
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                />
                <datalist id="schedule-timezones">
                  {commonTimezones.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
              </label>
            </div>

            <label className="toggle-row create-toggle-card create-toggle-card--schedule">
              <input
                checked={isEnabled}
                type="checkbox"
                onChange={(event) => setIsEnabled(event.target.checked)}
              />
              <span>{isRu ? 'Расписание включено' : 'Planner enabled'}</span>
            </label>

            <section className="context-section context-section--tight schedule-monitoring-card">
              <div className="panel-heading panel-heading--tight schedule-monitoring-card__head">
                <div>
                  <span className="eyebrow">{isRu ? 'Мониторинг' : 'Monitoring'}</span>
                  <h3>{isRu ? 'Проверка источников' : 'Source checks'}</h3>
                </div>

                <button
                  aria-expanded={isMonitoringInfoOpen}
                  aria-label={isRu ? 'Как работает мониторинг' : 'How monitoring works'}
                  className={`schedule-info-button${isMonitoringInfoOpen ? ' schedule-info-button--active' : ''}`}
                  type="button"
                  onClick={() => setIsMonitoringInfoOpen((current) => !current)}
                >
                  i
                </button>
              </div>

              {isMonitoringInfoOpen && (
                <div className="schedule-monitoring-note">
                  <p>{monitoringSummary}</p>
                </div>
              )}

              <div className="schedule-monitoring-stack">
                <label className="field-block">
                  <span>{isRu ? 'Интервал проверки, мин' : 'Check interval, min'}</span>
                  <input
                    inputMode="numeric"
                    min={MIN_CHANNEL_CHECK_INTERVAL_MINUTES}
                    value={String(channelChecksIntervalMinutes)}
                    onChange={(event) =>
                      setChannelChecksIntervalMinutes(
                        Math.max(
                          MIN_CHANNEL_CHECK_INTERVAL_MINUTES,
                          Number(event.target.value) || MIN_CHANNEL_CHECK_INTERVAL_MINUTES
                        )
                      )
                    }
                  />
                </label>

                <div className="schedule-channel-picker">
                  <div className="schedule-channel-picker__head">
                    <strong>{isRu ? 'Каналы для мониторинга' : 'Channels to monitor'}</strong>
                    <span>{`${channelCheckUsernames.length} ${isRu ? 'выбрано' : 'selected'}`}</span>
                  </div>

                  {activeSourceChannels.length === 0 ? (
                    <p className="editor-help">
                      {isRu
                        ? 'У этого профиля пока нет привязанных каналов-источников.'
                        : 'No source channels are attached to this profile yet.'}
                    </p>
                  ) : (
                    <div className="schedule-channel-dropdown">
                      <button
                        aria-expanded={isChannelPickerOpen}
                        className="schedule-channel-trigger"
                        type="button"
                        onClick={() => setIsChannelPickerOpen((current) => !current)}
                      >
                        <span>
                          {selectedChannels.length > 0
                            ? isRu
                              ? `Выбрано каналов: ${selectedChannels.length}`
                              : `Selected ${selectedChannels.length} channel${selectedChannels.length > 1 ? 's' : ''}`
                            : isRu
                              ? 'Выбрать каналы'
                              : 'Choose channels'}
                        </span>
                      </button>

                      {!isChannelPickerOpen && (
                        <div className="schedule-selected-chips">
                          {selectedChannels.length > 0 ? (
                            selectedChannels.map((channel) => (
                              <span className="schedule-selected-chip" key={channel.key}>
                                <span>{channel.label}</span>
                                <button
                                  aria-label={isRu ? `Удалить ${channel.label}` : `Remove ${channel.label}`}
                                  type="button"
                                  onClick={() => toggleChannelCheck(channel.username)}
                                >
                                  x
                                </button>
                              </span>
                            ))
                          ) : (
                            <p className="editor-help">{isRu ? 'Каналы пока не выбраны.' : 'No channels selected yet.'}</p>
                          )}
                        </div>
                      )}

                      {isChannelPickerOpen && (
                        <div className="schedule-channel-dropdown__menu">
                          <div className="schedule-channel-list">
                            {activeSourceChannels.map((channel) => {
                              const isSelected = channelCheckUsernames.includes(channel.username);
                              return (
                                <label
                                  className={`schedule-channel-chip${isSelected ? ' schedule-channel-chip--active' : ''}`}
                                  key={channel.key}
                                >
                                  <input
                                    checked={isSelected}
                                    type="checkbox"
                                    onChange={() => toggleChannelCheck(channel.username)}
                                  />
                                  <span>{channel.label}</span>
                                  <small>@{channel.username}</small>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="context-section context-section--tight">
              <div className="panel-heading panel-heading--tight">
                <div>
                  <span className="eyebrow">{isRu ? 'Слоты постов' : 'Post slots'}</span>
                  <h3>{isRu ? 'Когда можно выпускать обычные посты' : 'When regular posts may go out'}</h3>
                </div>

                <button className="secondary-button secondary-button--small schedule-add-button" type="button" onClick={addSlot}>
                  {isRu ? 'Добавить слот' : 'Add slot'}
                </button>
              </div>

              <div className="schedule-slot-list">
                {slots.map((slot, index) => (
                  <article className="schedule-slot-card" key={slot.id}>
                    <div className="schedule-slot-card__top">
                      <label className="field-block">
                        <span>{isRu ? 'Название' : 'Label'}</span>
                        <input
                          value={slot.label}
                          onChange={(event) => updateSlot(slot.id, { label: event.target.value })}
                        />
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
                        <input
                          type="time"
                          value={slot.start}
                          onChange={(event) => updateSlot(slot.id, { start: event.target.value })}
                        />
                      </label>

                      <label className="field-block">
                        <span>{isRu ? 'Конец' : 'End'}</span>
                        <input
                          type="time"
                          value={slot.end}
                          onChange={(event) => updateSlot(slot.id, { end: event.target.value })}
                        />
                      </label>
                    </div>

                    {slot.start >= slot.end && (
                      <div className="draft-row__meta schedule-slot-card__meta">
                        <span>{isRu ? 'Конец должен быть позже начала' : 'End must be later than start'}</span>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>

            <section className="context-section context-section--tight">
              <div className="panel-heading panel-heading--tight">
                <div>
                  <span className="eyebrow">{isRu ? 'Недельный дайджест' : 'Weekly digest'}</span>
                  <h3>{isRu ? 'Окно дайджеста' : 'Digest window'}</h3>
                </div>
              </div>

              <label className="toggle-row create-toggle-card create-toggle-card--schedule">
                <input
                  checked={weeklyDigestEnabled}
                  type="checkbox"
                  onChange={(event) => setWeeklyDigestEnabled(event.target.checked)}
                />
                <span>{isRu ? 'Публиковать недельный дайджест' : 'Publish the weekly digest'}</span>
              </label>

              <div className="schedule-digest-grid">
                <div className="field-block schedule-custom-select" ref={digestDayPickerRef}>
                  <span>{isRu ? 'День' : 'Day'}</span>
                  <button
                    aria-expanded={isDigestDayPickerOpen}
                    className="schedule-custom-select__trigger"
                    type="button"
                    onClick={() => setIsDigestDayPickerOpen((current) => !current)}
                  >
                    <span>{selectedWeekDayLabel}</span>
                  </button>

                  {isDigestDayPickerOpen && (
                    <div className="schedule-custom-select__menu">
                      {weekDayOptionsLocalized.map((item) => (
                        <button
                          className={`schedule-custom-select__option${
                            weeklyDigestDayOfWeek === item.value ? ' schedule-custom-select__option--active' : ''
                          }`}
                          key={item.value}
                          type="button"
                          onClick={() => {
                            setWeeklyDigestDayOfWeek(item.value);
                            setIsDigestDayPickerOpen(false);
                          }}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <label className="field-block">
                  <span>{isRu ? 'Начало' : 'Start'}</span>
                  <input
                    type="time"
                    value={weeklyDigestStart}
                    onChange={(event) => setWeeklyDigestStart(event.target.value)}
                  />
                </label>

                <label className="field-block">
                  <span>{isRu ? 'Конец' : 'End'}</span>
                  <input
                    type="time"
                    value={weeklyDigestEnd}
                    onChange={(event) => setWeeklyDigestEnd(event.target.value)}
                  />
                </label>
              </div>
            </section>

            <button className="primary-button primary-button--create" disabled={isSaving} type="submit">
              {isSaving ? (isRu ? 'Сохраняем...' : 'Saving...') : isRu ? 'Сохранить расписание' : 'Save planner'}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
