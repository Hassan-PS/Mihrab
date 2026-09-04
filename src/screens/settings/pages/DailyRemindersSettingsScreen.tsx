/**
 * Settings → Notifications → Daily reminders.
 *
 * The two notifications that are about the Qur'an rather than about a
 * prayer: an ayah each day, and today's khatmah portion. Both are
 * independent of the master prayer-alerts toggle — someone can want a
 * verse in the morning without wanting the adhan — and both ask for
 * notification permission on their own before promising anything.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotificationsSettings } from '../../../context/PrayerSettingsContext';
import { useClockFormatter } from '../../../hooks/useClockFormatter';
import { ensureNotifPermission } from '../../../notifications/ensureNotifPermission';
import {
  activeKhatmah,
  hydrateQuranState,
  useQuranState,
} from '../../../quran/quranState';
import {
  SettingsGroup,
  SettingsLinkRow,
  SettingsToggleRow,
} from '../SettingsGroup';
import { SettingsPage } from '../SettingsPage';
import { TimePickerSheet } from '../TimePickerSheet';

export function DailyRemindersSettingsScreen() {
  const { t } = useTranslation();
  const { slice: settings, update: updateSettings } = useNotificationsSettings();
  const clock = useClockFormatter();
  /** Which of the two times the sheet is editing, or none. */
  const [timeTarget, setTimeTarget] = useState<'ayah' | 'khatmah' | null>(null);

  // The khatmah reminder has nothing to say without a plan — the
  // scheduler returns without writing a single trigger. Reading the plan
  // here is what lets the row say so instead of taking a promise it
  // cannot keep. The hydrate is idempotent; the app root has usually
  // done it already, but this page can be the first thing a deep link
  // opens.
  useEffect(() => {
    void hydrateQuranState();
  }, []);
  const quran = useQuranState();
  const hasKhatmah = activeKhatmah(quran) != null;

  const fmtTime = (h: number, m: number) =>
    clock(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);

  const onToggleAyahOfDay = async (value: boolean) => {
    if (!value) {
      updateSettings({ ayahOfDayEnabled: false });
      return;
    }
    if (!(await ensureNotifPermission())) return;
    updateSettings({ ayahOfDayEnabled: true });
  };

  const onToggleKhatmahReminder = async (value: boolean) => {
    if (!value) {
      updateSettings({ khatmahReminderEnabled: false });
      return;
    }
    if (!(await ensureNotifPermission())) return;
    updateSettings({ khatmahReminderEnabled: true });
  };

  /**
   * The adhkār toggles.
   *
   * No time row underneath either of them, which is the point of the
   * feature: the window these duas belong to is set by the sun, so the
   * app works the time out per day from the prayer times it already has
   * rather than asking someone to keep a clock preference in step with
   * the seasons. The help line says which window, because a notification
   * whose timing you cannot predict is unsettling until you know the
   * rule.
   */
  const onToggleMorningDuas = async (value: boolean) => {
    if (!value) {
      updateSettings({ morningDuaReminderEnabled: false });
      return;
    }
    if (!(await ensureNotifPermission())) return;
    updateSettings({ morningDuaReminderEnabled: true });
  };

  const onToggleEveningDuas = async (value: boolean) => {
    if (!value) {
      updateSettings({ eveningDuaReminderEnabled: false });
      return;
    }
    if (!(await ensureNotifPermission())) return;
    updateSettings({ eveningDuaReminderEnabled: true });
  };

  // Android's back button belongs to the sheet while the sheet is open.
  const deferBack = useRef(false);
  deferBack.current = timeTarget != null;

  const editingKhatmah = timeTarget === 'khatmah';
  const pickerHour = editingKhatmah
    ? settings.khatmahReminderHour
    : settings.ayahOfDayHour;
  const pickerMinute = editingKhatmah
    ? settings.khatmahReminderMinute
    : settings.ayahOfDayMinute;

  return (
    <>
      <SettingsPage deferBackRef={deferBack}>
        <SettingsGroup title={t('quran.ayahOfDayTitle', 'Ayah of the day')}>
          <SettingsToggleRow
            title={t('settings.ayahOfDay', 'Daily ayah notification')}
            help={t(
              'settings.ayahOfDayHelp',
              'A randomly chosen ayah with its translation, every day.',
            )}
            value={settings.ayahOfDayEnabled}
            onValueChange={onToggleAyahOfDay}
          />
          {settings.ayahOfDayEnabled ? (
            <SettingsLinkRow
              title={t('settings.ayahOfDayTime', 'Notification time')}
              value={fmtTime(settings.ayahOfDayHour, settings.ayahOfDayMinute)}
              onPress={() => setTimeTarget('ayah')}
            />
          ) : null}
        </SettingsGroup>

        {/* The adhkār, in the windows they name themselves. */}
        <SettingsGroup title={t('duaReminders.groupTitle', 'Morning and evening duas')}>
          <SettingsToggleRow
            title={t('duaReminders.morning', 'Morning duas')}
            help={t(
              'duaReminders.morningHelp',
              'A reminder in the morning window — after Fajr, before sunrise.',
            )}
            value={settings.morningDuaReminderEnabled}
            onValueChange={onToggleMorningDuas}
          />
          <SettingsToggleRow
            title={t('duaReminders.evening', 'Evening duas')}
            help={t(
              'duaReminders.eveningHelp',
              'A reminder in the evening window — after ʿAṣr, before sunset.',
            )}
            value={settings.eveningDuaReminderEnabled}
            onValueChange={onToggleEveningDuas}
          />
        </SettingsGroup>

        {/* Khatmah daily reminder (v2.7.28) — only meaningful while a
            plan is active, and the row says so rather than accepting a
            promise the scheduler will no-op on. */}
        <SettingsGroup title={t('quran.khatmah', 'Khatmah')}>
          <SettingsToggleRow
            title={t('settings.khatmahReminder', 'Khatmah daily reminder')}
            help={
              hasKhatmah
                ? t(
                    'settings.khatmahReminderHelp',
                    "Today's portion and where to continue, while a khatmah is active.",
                  )
                : t(
                    'settings.khatmahReminderNoPlan',
                    'Start a khatmah in the Qur’an tab to use this.',
                  )
            }
            value={settings.khatmahReminderEnabled && hasKhatmah}
            disabled={!hasKhatmah}
            onValueChange={onToggleKhatmahReminder}
          />
          {settings.khatmahReminderEnabled && hasKhatmah ? (
            <SettingsLinkRow
              title={t('settings.ayahOfDayTime', 'Notification time')}
              value={fmtTime(
                settings.khatmahReminderHour,
                settings.khatmahReminderMinute,
              )}
              onPress={() => setTimeTarget('khatmah')}
            />
          ) : null}
        </SettingsGroup>
      </SettingsPage>

      <TimePickerSheet
        visible={timeTarget != null}
        hour={pickerHour}
        minute={pickerMinute}
        onChangeHour={h =>
          updateSettings(
            editingKhatmah
              ? { khatmahReminderHour: h }
              : { ayahOfDayHour: h },
          )
        }
        onChangeMinute={m =>
          updateSettings(
            editingKhatmah
              ? { khatmahReminderMinute: m }
              : { ayahOfDayMinute: m },
          )
        }
        onClose={() => setTimeTarget(null)}
      />
    </>
  );
}
