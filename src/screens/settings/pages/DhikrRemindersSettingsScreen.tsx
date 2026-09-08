/**
 * Settings → Notifications → Dhikr reminders — issue #29.
 *
 * The first notifications in this app that are not derived from
 * anything: a time somebody chose, for words somebody chose. The page is
 * a list and an Add row, because that is all the feature is.
 *
 * Each row is pressable and carries its own switch — `SettingsLinkRow`'s
 * `accessory` slot, so turning one off for a week does not mean opening
 * it, and opening one does not mean touching the switch by accident.
 */
import { useMemo, useRef, useState } from 'react';
import { Switch, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import i18n from '../../../i18n';
import { useNotificationsSettings } from '../../../context/PrayerSettingsContext';
import { useAppPalette } from '../../../hooks/useAppPalette';
import { useClockFormatter } from '../../../hooks/useClockFormatter';
import { ensureNotifPermission } from '../../../notifications/ensureNotifPermission';
import { findDhikr } from '../../../dhikr/dhikr';
import {
  addDhikrReminder,
  MAX_DHIKR_REMINDERS,
  removeDhikrReminder,
  updateDhikrReminder,
  type DhikrReminder,
} from '../../../dhikr/dhikrReminders';
import {
  SettingsBlock,
  SettingsGroup,
  SettingsLinkRow,
} from '../SettingsGroup';
import { SettingsPage } from '../SettingsPage';
import { DhikrReminderEditor, type DhikrDraft } from '../DhikrReminderEditor';
import { sharedSettingsStyles as s } from '../sharedStyles';

/** "Every day", or the days themselves, in the app's language. */
function daysLabel(reminder: DhikrReminder, everyDay: string): string {
  if (reminder.days.length === 0) return everyDay;
  return reminder.days
    .map(index => {
      const day = new Date(2024, 0, 7 + index);
      try {
        return new Intl.DateTimeFormat(i18n.language, {
          weekday: 'short',
        }).format(day);
      } catch {
        return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][index];
      }
    })
    .join(' · ');
}

export function DhikrRemindersSettingsScreen() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const clock = useClockFormatter();
  const { slice: settings, update: updateSettings } = useNotificationsSettings();
  const reminders = settings.dhikrReminders;

  /** The reminder being edited, `'new'` while creating, or none. */
  const [editing, setEditing] = useState<DhikrReminder | 'new' | null>(null);

  // Android's back button belongs to the sheet while the sheet is open.
  const deferBack = useRef(false);
  deferBack.current = editing != null;

  const full = reminders.length >= MAX_DHIKR_REMINDERS;

  const everyDay = t('dhikr.everyDay', 'Every day');
  const rows = useMemo(
    () =>
      reminders.map(reminder => {
        const entry = reminder.dhikr ? findDhikr(reminder.dhikr) : undefined;
        const title = entry
          ? t(entry.meaningKey)
          : reminder.title?.trim() ||
            reminder.body?.trim() ||
            t('dhikr.customTitle', 'Reminder');
        const time = clock(
          `${String(reminder.hour).padStart(2, '0')}:${String(
            reminder.minute,
          ).padStart(2, '0')}`,
        );
        return { reminder, title, value: `${time} · ${daysLabel(reminder, everyDay)}` };
      }),
    [reminders, clock, t, everyDay],
  );

  const onToggle = async (reminder: DhikrReminder, value: boolean) => {
    if (!value) {
      updateSettings({
        dhikrReminders: updateDhikrReminder(reminders, reminder.id, {
          enabled: false,
        }),
      });
      return;
    }
    if (!(await ensureNotifPermission())) return;
    updateSettings({
      dhikrReminders: updateDhikrReminder(reminders, reminder.id, {
        enabled: true,
      }),
    });
  };

  const onSave = async (draft: DhikrDraft) => {
    if (editing === 'new') {
      if (draft.enabled && !(await ensureNotifPermission())) {
        draft = { ...draft, enabled: false };
      }
      updateSettings({ dhikrReminders: addDhikrReminder(reminders, draft) });
      return;
    }
    if (editing) {
      updateSettings({
        dhikrReminders: updateDhikrReminder(reminders, editing.id, draft),
      });
    }
  };

  return (
    <>
      <SettingsPage deferBackRef={deferBack}>
        <SettingsGroup
          title={t('dhikr.remindersTitle', 'Dhikr reminders')}
          footer={t('dhikr.remindersFooter')}>
          {rows.length === 0 ? (
            <SettingsBlock>
              <Text style={[s.help, { color: palette.muted }]}>
                {t('dhikr.remindersEmpty')}
              </Text>
            </SettingsBlock>
          ) : null}
          {rows.map(({ reminder, title, value }) => (
            <SettingsLinkRow
              key={reminder.id}
              title={title}
              value={value}
              onPress={() => setEditing(reminder)}
              accessory={
                <Switch
                  value={reminder.enabled}
                  onValueChange={v => onToggle(reminder, v)}
                  trackColor={{ true: palette.accentSolid, false: '#9ca3af' }}
                  thumbColor="#ffffff"
                />
              }
            />
          ))}
          {full ? null : (
            <SettingsLinkRow
              title={t('dhikr.addReminder', 'Add a reminder')}
              onPress={() => setEditing('new')}
            />
          )}
        </SettingsGroup>
      </SettingsPage>

      <DhikrReminderEditor
        visible={editing != null}
        initial={editing && editing !== 'new' ? editing : null}
        onSave={onSave}
        onDelete={
          editing && editing !== 'new'
            ? () =>
                updateSettings({
                  dhikrReminders: removeDhikrReminder(reminders, editing.id),
                })
            : undefined
        }
        onClose={() => setEditing(null)}
      />
    </>
  );
}
