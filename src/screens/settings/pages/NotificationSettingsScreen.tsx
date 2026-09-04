/**
 * Settings → Notifications. What gets announced, in what voice, and how
 * far ahead — plus the custom adhan import, which lives here because the
 * sound picker is the only thing that can offer it.
 *
 * The per-prayer adhan / alert / silent choice is deliberately NOT here.
 * It is on the prayer's own row on the home screen: it is a question
 * about that prayer, and a control three screens away that has to be
 * changed twice a day is a control people abandon.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePrayerSettings } from '../../../context/PrayerSettingsContext';
import { useAppPalette } from '../../../hooks/useAppPalette';
import { LiveActivityCard } from '../LiveActivityCard';
import { NestedPageRows } from '../NestedPageRows';
import { NotificationsCard } from '../NotificationsCard';
import { PreReminderModal } from '../PreReminderModal';
import { SettingsPage } from '../SettingsPage';
import { SoundPickerModal } from '../SoundPickerModal';
import type {
  CustomAdhanSound,
  NotificationSoundId,
} from '../../../notifications/notificationSounds';
import {
  pickCustomAdhan,
  removeCustomAdhan,
  syncCustomAdhan,
} from '../../../native/CustomAdhan';

export function NotificationSettingsScreen() {
  const { settings, updateSettings } = usePrayerSettings();
  const { palette } = useAppPalette();
  const [soundModal, setSoundModal] = useState(false);
  const [preReminderModal, setPreReminderModal] = useState(false);
  const [previewingId, setPreviewingId] = useState<NotificationSoundId | null>(
    null,
  );
  const [customAdhan, setCustomAdhan] = useState<CustomAdhanSound | null>(null);
  const [importingCustom, setImportingCustom] = useState(false);

  const deferBack = useRef(false);
  deferBack.current = soundModal || preReminderModal;

  const openSound = useCallback(() => setSoundModal(true), []);
  const closeSound = useCallback(() => setSoundModal(false), []);
  const openPreReminder = useCallback(() => setPreReminderModal(true), []);
  const closePreReminder = useCallback(() => setPreReminderModal(false), []);

  // Read from disk rather than from the saved setting: the setting says
  // which sound is chosen, the filesystem says whether the recording is
  // still there. A reinstall drops the file and keeps the setting.
  useEffect(() => {
    let cancelled = false;
    void syncCustomAdhan().then(sound => {
      if (!cancelled) setCustomAdhan(sound);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleImportCustom = useCallback(() => {
    setImportingCustom(true);
    void pickCustomAdhan()
      .then(sound => {
        setCustomAdhan(sound);
        // Selecting it is the point of having imported it; leaving the
        // user to tap the row again would be a step that never has
        // another answer.
        if (sound) updateSettings({ notificationSound: 'custom' });
      })
      .catch(() => {
        // The import failed — the row stays a placeholder, which is honest.
        setCustomAdhan(null);
      })
      .finally(() => setImportingCustom(false));
  }, [updateSettings]);

  const handleRemoveCustom = useCallback(() => {
    void removeCustomAdhan().then(() => {
      void syncCustomAdhan().then(setCustomAdhan);
      // Leaving 'custom' selected with nothing behind it would schedule
      // silent prayers, so the choice goes back to the default sound.
      updateSettings({ notificationSound: 'default' });
    });
  }, [updateSettings]);

  return (
    <>
      <SettingsPage deferBackRef={deferBack}>
        <NotificationsCard
          onOpenSoundPicker={openSound}
          onOpenPreReminderPicker={openPreReminder}
        />
        {/* The extra times and the daily Qur'an reminders. Both were
            headings further down this same scroll, which is where a
            setting goes to be missed. */}
        <NestedPageRows parent="SettingsNotifications" />
        {/* A Live Activity is a notification: posted, dismissed, and
            living in the shade beside the adhan alert. It sat under
            "Home screen" next to the widget, which grouped it by where
            it is drawn rather than by what it is — and left it somewhere
            nobody thought to look. It owns no modals, so the page's
            back-deferral is unaffected. */}
        <LiveActivityCard />
      </SettingsPage>

      <SoundPickerModal
        visible={soundModal}
        currentSound={settings.notificationSound}
        previewingId={previewingId}
        palette={palette}
        onSelect={id => updateSettings({ notificationSound: id })}
        onSetPreviewingId={setPreviewingId}
        onClose={closeSound}
        customAdhan={customAdhan}
        importingCustom={importingCustom}
        onImportCustom={handleImportCustom}
        onRemoveCustom={handleRemoveCustom}
      />
      <PreReminderModal
        visible={preReminderModal}
        current={settings.prePrayerReminderMinutes}
        palette={palette}
        onSelect={minutes =>
          updateSettings({ prePrayerReminderMinutes: minutes })
        }
        onClose={closePreReminder}
      />
    </>
  );
}
