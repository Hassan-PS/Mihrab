import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, type RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import { ProviderPickerModal } from '../components/ProviderPickerModal';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import { useAppPalette } from '../hooks/useAppPalette';
import { useBreakpoint } from '../responsive/breakpoints';
import { CenteredColumn } from '../responsive/CenteredColumn';
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
  // On the widest windows (iPad landscape / Mac) the long single scroll of
  // settings cards wastes horizontal space, so we reflow the cards into two
  // balanced columns. Compact/regular keep the historical single column.
  const isExpanded = useBreakpoint() === 'expanded';
  const { settings, updateSettings } = usePrayerSettings();
  const { palette } = useAppPalette();
  const insets = useSafeAreaInsets();

  // Deep-link highlight: when arriving from the home location selector's
  // "Add new location" action, scroll to and briefly flash the Saved
  // Locations section so the user knows where to add a location.
  const route = useRoute<RouteProp<RootStackParamList, 'Settings'>>();
  const scrollRef = useRef<ScrollView>(null);
  const savedLocationsYRef = useRef(0);
  const [savedHighlightSignal, setSavedHighlightSignal] = useState(0);
  const didHighlightRef = useRef(false);

  useEffect(() => {
    if (route.params?.highlight !== 'savedLocations') return;
    if (didHighlightRef.current) return;
    didHighlightRef.current = true;
    // Let the cards lay out (so the y-offset is measured) before scrolling.
    const id = setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(0, savedLocationsYRef.current - 12),
        animated: true,
      });
      setSavedHighlightSignal(s => s + 1);
    }, 400);
    return () => clearTimeout(id);
  }, [route.params?.highlight]);

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
        ref={scrollRef}
        style={[styles.scroll, { backgroundColor: palette.bg }]}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 24 },
        ]}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled">
        {(() => {
          const savedLocations = (
            <View
              onLayout={e => {
                savedLocationsYRef.current = e.nativeEvent.layout.y;
              }}>
              <SavedLocationsCard highlightSignal={savedHighlightSignal} />
            </View>
          );
          const appearance = <AppearanceCard />;
          const language = (
            <LanguageCard onOpenLanguagePicker={openLanguage} />
          );
          const widget = <WidgetCard />;
          const dataSource = (
            <DataSourceCard onOpenProviderPicker={openProvider} />
          );
          const location = <LocationCard />;
          const calculation = (
            <CalculationCard
              onOpenMethodPicker={openMethod}
              onOpenOffsetsModal={openOffsets}
            />
          );
          const notifications = (
            <NotificationsCard
              onOpenSoundPicker={openSoundPicker}
              onOpenPreReminderPicker={openPreReminder}
            />
          );
          const liveActivity = <LiveActivityCard />;
          const about = <AboutCard />;

          if (isExpanded) {
            // Two balanced columns. Left holds appearance/display + calc/notify;
            // right holds the data-source & location group + about.
            return (
              <CenteredColumn maxWidth={1080}>
                <View style={styles.twoCol}>
                  <View style={styles.col}>
                    {appearance}
                    {language}
                    {widget}
                    {calculation}
                    {liveActivity}
                  </View>
                  <View style={styles.col}>
                    {dataSource}
                    {location}
                    {savedLocations}
                    {notifications}
                    {about}
                  </View>
                </View>
              </CenteredColumn>
            );
          }

          return (
            <CenteredColumn>
              {appearance}
              {language}
              {widget}
              {dataSource}
              {location}
              {savedLocations}
              {calculation}
              {notifications}
              {liveActivity}
              {about}
            </CenteredColumn>
          );
        })()}
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
  // Expanded (iPad landscape / Mac) two-column settings reflow.
  twoCol: { flexDirection: 'row', alignItems: 'flex-start', gap: 20 },
  col: { flex: 1 },
});
