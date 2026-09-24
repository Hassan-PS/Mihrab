/**
 * Settings → Notifications. What gets announced, in what voice, and how
 * far ahead — plus the custom adhan import, which lives here because the
 * sound picker is the only thing that can offer it.
 *
 * Everything that FIRES belongs on this page, which is the taxonomy the
 * app already claimed and did not keep: the Mālikī second-time alerts
 * were inside the Calculation card, on the screen about where the numbers
 * come from (#23). What is computed and what is printed stayed there;
 * what interrupts you is here.
 *
 * The per-prayer adhan / alert / silent choice is deliberately NOT here.
 * It is on the prayer's own row on the home screen: it is a question
 * about that prayer, and a control three screens away that has to be
 * changed twice a day is a control people abandon.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePrayerSettings } from '../../../context/PrayerSettingsContext';
import { useAppPalette } from '../../../hooks/useAppPalette';
import { LiveActivityCard } from '../LiveActivityCard';
import { MalikiAlertsCard } from '../MalikiAlertsCard';
import { NestedPageRows } from '../NestedPageRows';
import { NotificationsCard } from '../NotificationsCard';
import { PreReminderModal } from '../PreReminderModal';
import { PrayerSilenceCard } from '../PrayerSilenceCard';
import { MinutesPickerModal } from '../MinutesPickerModal';
import { TimePickerSheet } from '../TimePickerSheet';
import {
  SILENCE_DURATION_OPTIONS,
  SILENCE_JUMUAH_DURATION_OPTIONS,
} from '../../../settings/prayerSilence';
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
  const { t } = useTranslation();
  const { settings, updateSettings } = usePrayerSettings();
  const { palette } = useAppPalette();
  const [soundModal, setSoundModal] = useState(false);
  const [preReminderModal, setPreReminderModal] = useState(false);
  const [daruriLeadModal, setDaruriLeadModal] = useState(false);
  // The quiet windows' four pickers (issue #60): one sheet at a time.
  const [silenceModal, setSilenceModal] = useState<
    'lead' | 'duration' | 'jumuahDuration' | 'jumuahTime' | null
  >(null);
  const [previewingId, setPreviewingId] = useState<NotificationSoundId | null>(
    null,
  );
  const [customAdhan, setCustomAdhan] = useState<CustomAdhanSound | null>(null);
  const [importingCustom, setImportingCustom] = useState(false);

  const deferBack = useRef(false);
  deferBack.current =
    soundModal || preReminderModal || daruriLeadModal || silenceModal !== null;

  const openSound = useCallback(() => setSoundModal(true), []);
  const closeSound = useCallback(() => setSoundModal(false), []);
  const openPreReminder = useCallback(() => setPreReminderModal(true), []);
  const closePreReminder = useCallback(() => setPreReminderModal(false), []);
  const openDaruriLead = useCallback(() => setDaruriLeadModal(true), []);
  const closeDaruriLead = useCallback(() => setDaruriLeadModal(false), []);
  const openSilenceLead = useCallback(() => setSilenceModal('lead'), []);
  const openSilenceDuration = useCallback(() => setSilenceModal('duration'), []);
  const openSilenceJumuahDuration = useCallback(
    () => setSilenceModal('jumuahDuration'),
    [],
  );
  const openSilenceJumuahTime = useCallback(() => setSilenceModal('jumuahTime'), []);
  const closeSilence = useCallback(() => setSilenceModal(null), []);
  const silence = settings.prayerSilence;
  const patchSilence = useCallback(
    (part: Partial<typeof silence>) =>
      updateSettings({ prayerSilence: { ...silence, ...part } }),
    [silence, updateSettings],
  );
  const [jumuahHour, jumuahMinute] = (silence.jumuahTime ?? '13:00')
    .split(':')
    .map(Number);

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
        {/* Which of the Mālikī boundaries are announced, and how much
            warning — the part of that feature that fires. It lived inside
            the Calculation card on Prayer times until #23. */}
        <MalikiAlertsCard onOpenDaruriLeadPicker={openDaruriLead} />
        {/* The phone itself going quiet for the mosque (issue #60). It
            fires, in its way, so it is here; Android only, and the card
            renders nothing anywhere else. */}
        <PrayerSilenceCard
          onOpenLeadPicker={openSilenceLead}
          onOpenDurationPicker={openSilenceDuration}
          onOpenJumuahDurationPicker={openSilenceJumuahDuration}
          onOpenJumuahTimePicker={openSilenceJumuahTime}
        />
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
      {/* The same picker as the pre-prayer reminder, asking the same
          question about a different boundary. */}
      <PreReminderModal
        visible={daruriLeadModal}
        current={settings.malikiSecondTimeAlertMinutes}
        palette={palette}
        title={t('settings.malikiAlertsLeadTitle')}
        offLabel={t('settings.malikiAlertsAtTime')}
        onSelect={minutes =>
          updateSettings({ malikiSecondTimeAlertMinutes: minutes })
        }
        onClose={closeDaruriLead}
      />
      {/* The quiet windows' pickers. The lead is the reminder picker's
          question asked again — "how far before" — so it is the same
          sheet with a different zero. */}
      <PreReminderModal
        visible={silenceModal === 'lead'}
        current={silence.leadMinutes}
        palette={palette}
        title={t('settings.silenceLead')}
        offLabel={t('settings.silenceAtAdhan')}
        onSelect={minutes => patchSilence({ leadMinutes: minutes })}
        onClose={closeSilence}
      />
      <MinutesPickerModal
        visible={silenceModal === 'duration'}
        title={t('settings.silenceDuration')}
        options={SILENCE_DURATION_OPTIONS}
        current={silence.durationMinutes}
        palette={palette}
        onSelect={minutes => patchSilence({ durationMinutes: minutes })}
        onClose={closeSilence}
      />
      <MinutesPickerModal
        visible={silenceModal === 'jumuahDuration'}
        title={t('settings.silenceJumuahDuration')}
        options={SILENCE_JUMUAH_DURATION_OPTIONS}
        current={silence.jumuahDurationMinutes}
        palette={palette}
        onSelect={minutes => patchSilence({ jumuahDurationMinutes: minutes })}
        onClose={closeSilence}
      />
      <TimePickerSheet
        visible={silenceModal === 'jumuahTime'}
        hour={jumuahHour}
        minute={jumuahMinute}
        onChangeHour={h =>
          patchSilence({
            jumuahTime: `${String(h).padStart(2, '0')}:${String(jumuahMinute).padStart(2, '0')}`,
          })
        }
        onChangeMinute={m =>
          patchSilence({
            jumuahTime: `${String(jumuahHour).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
          })
        }
        onClose={closeSilence}
      />
    </>
  );
}
