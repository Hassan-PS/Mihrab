import { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { ProviderPickerModal } from '../components/ProviderPickerModal';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import { useAppPalette } from '../hooks/useAppPalette';
import { useBreakpoint } from '../responsive/breakpoints';
import { useAndroidSubScreenBack } from '../navigation/useAndroidSubScreenBack';
import { AboutCard } from './settings/AboutCard';
import { AppearanceCard } from './settings/AppearanceCard';
import { CalculationCard } from './settings/CalculationCard';
import { DataSourceCard } from './settings/DataSourceCard';
import { LanguageCard } from './settings/LanguageCard';
import { LanguageModal } from './settings/LanguageModal';
import { LocationCard } from './settings/LocationCard';
import { MethodModal } from './settings/MethodModal';
import { NotificationsCard } from './settings/NotificationsCard';
import { LiveActivityCard } from './settings/LiveActivityCard';
import { PrayerOffsetsModal } from './settings/PrayerOffsetsModal';
import { PreReminderModal } from './settings/PreReminderModal';
import { SavedLocationsCard } from './settings/SavedLocationsCard';
import { SoundPickerModal } from './settings/SoundPickerModal';
import { WidgetCard } from './settings/WidgetCard';
import type { NotificationSoundId } from '../notifications/notificationSounds';

/**
 * SettingsScreen orchestrator — task #9 split.
 *
 * Owns the modal-open state and the Android hardware-back deferral, composes
 * the 8 child cards, and renders the picker modals at the screen level so
 * they appear above all card chrome regardless of card render order.
 *
 * Each card subscribes to `usePrayerSettings()` and `useAppPalette()`
 * independently, so context changes only re-render the card whose data
 * actually changed (full benefit lands once task #11 splits the context into
 * per-domain slices).
 */
export function SettingsScreen() {
  // Subscribe to width changes so future master-detail layouts pick up
  // the new breakpoint without a forced remount. iPad/Mac (#33) baseline.
  useBreakpoint();
  const { settings, updateSettings } = usePrayerSettings();
  const { palette } = useAppPalette();

  const [methodModal, setMethodModal] = useState(false);
  const [offsetsModal, setOffsetsModal] = useState(false);
  const [preReminderModal, setPreReminderModal] = useState(false);
  const [notificationSoundModal, setNotificationSoundModal] = useState(false);
  const [providerModal, setProviderModal] = useState(false);
  const [languageModal, setLanguageModal] = useState(false);
  const [previewingId, setPreviewingId] = useState<NotificationSoundId | null>(
    null,
  );

  // Hardware-back on Android: when any modal is open, swallow the back press
  // (so it dismisses the modal) instead of popping the screen.
  const deferHardwareBackRef = useRef(false);
  deferHardwareBackRef.current =
    methodModal ||
    offsetsModal ||
    preReminderModal ||
    notificationSoundModal ||
    providerModal ||
    languageModal;
  useAndroidSubScreenBack(deferHardwareBackRef);

  const closeMethod = useCallback(() => setMethodModal(false), []);
  const closeOffsets = useCallback(() => setOffsetsModal(false), []);
  const closePreReminder = useCallback(() => setPreReminderModal(false), []);
  const closeSoundPicker = useCallback(
    () => setNotificationSoundModal(false),
    [],
  );
  const closeProvider = useCallback(() => setProviderModal(false), []);
  const closeLanguage = useCallback(() => setLanguageModal(false), []);

  const openMethod = useCallback(() => setMethodModal(true), []);
  const openOffsets = useCallback(() => setOffsetsModal(true), []);
  const openPreReminder = useCallback(() => setPreReminderModal(true), []);
  const openSoundPicker = useCallback(
    () => setNotificationSoundModal(true),
    [],
  );
  const openProvider = useCallback(() => setProviderModal(true), []);
  const openLanguage = useCallback(() => setLanguageModal(true), []);

  return (
    <>
      <ScrollView
        style={[styles.scroll, { backgroundColor: palette.bg }]}
        contentContainerStyle={styles.scrollContent}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled">
        <AppearanceCard />
        <LanguageCard onOpenLanguagePicker={openLanguage} />
        <WidgetCard />
        <DataSourceCard onOpenProviderPicker={openProvider} />
        <LocationCard />
        <SavedLocationsCard />
        <CalculationCard
          onOpenMethodPicker={openMethod}
          onOpenOffsetsModal={openOffsets}
        />
        <NotificationsCard
          onOpenSoundPicker={openSoundPicker}
          onOpenPreReminderPicker={openPreReminder}
        />
        <LiveActivityCard />
        <AboutCard />
      </ScrollView>

      <ProviderPickerModal
        visible={providerModal}
        onClose={closeProvider}
        settings={settings}
        updateSettings={updateSettings}
        palette={{
          card: palette.card,
          text: palette.text,
          muted: palette.muted,
          border: palette.border,
          bg: palette.bg,
          overlay: palette.overlay,
          flatChrome: palette.flatChrome,
          accent: palette.accent,
          accentBg: palette.accentBg,
        }}
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

      <SoundPickerModal
        visible={notificationSoundModal}
        currentSound={settings.notificationSound}
        previewingId={previewingId}
        palette={palette}
        onSelect={id => updateSettings({ notificationSound: id })}
        onSetPreviewingId={setPreviewingId}
        onClose={closeSoundPicker}
      />

      <LanguageModal
        visible={languageModal}
        current={settings.language}
        palette={palette}
        onSelect={lang => updateSettings({ language: lang })}
        onClose={closeLanguage}
      />

      <MethodModal
        visible={methodModal}
        currentMethod={settings.calculationMethod}
        palette={palette}
        onSelect={id => updateSettings({ calculationMethod: id })}
        onClose={closeMethod}
      />

      <PrayerOffsetsModal
        visible={offsetsModal}
        current={settings.prayerOffsets}
        palette={palette}
        onChange={next => updateSettings({ prayerOffsets: next })}
        onClose={closeOffsets}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
});
