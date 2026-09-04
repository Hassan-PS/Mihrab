import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { MainTabParamList } from '../navigation/types';
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
import { MonthTimesCard } from './settings/MonthTimesCard';
import { MethodModal } from './settings/MethodModal';
import { NotificationsCard } from './settings/NotificationsCard';
import { QuranCard } from './settings/QuranCard';
import { LiveActivityCard } from './settings/LiveActivityCard';
import { PrayerOffsetsModal } from './settings/PrayerOffsetsModal';
import { PreReminderModal } from './settings/PreReminderModal';
import { SavedLocationsCard } from './settings/SavedLocationsCard';
import { SoundPickerModal } from './settings/SoundPickerModal';
import { WidgetCard } from './settings/WidgetCard';
import type {
  CustomAdhanSound,
  NotificationSoundId,
} from '../notifications/notificationSounds';
import {
  pickCustomAdhan,
  removeCustomAdhan,
  syncCustomAdhan,
} from '../native/CustomAdhan';
import { useTabBarInset } from '../navigation/tabBarInset';
import { useTabBarScroll } from '../navigation/tabBarVisibility';

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
  const { t } = useTranslation();
  const { settings, updateSettings } = usePrayerSettings();
  const { palette } = useAppPalette();

  // Deep-link highlight: when arriving from the home location selector's
  // "Add new location" action, scroll to and briefly flash the Saved
  // Locations section so the user knows where to add a location.
  const route = useRoute<RouteProp<MainTabParamList, 'SettingsTab'>>();
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
  const [daruriLeadModal, setDaruriLeadModal] = useState(false);
  const [notificationSoundModal, setNotificationSoundModal] = useState(false);
  const [providerModal, setProviderModal] = useState(false);
  const [languageModal, setLanguageModal] = useState(false);
  const [previewingId, setPreviewingId] = useState<NotificationSoundId | null>(
    null,
  );
  const [customAdhan, setCustomAdhan] = useState<CustomAdhanSound | null>(null);
  const [importingCustom, setImportingCustom] = useState(false);

  // Read from disk rather than from the saved setting: the setting says which
  // sound is chosen, the filesystem says whether the recording is still there.
  // A reinstall drops the file and keeps the setting.
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
        // Selecting it is the point of having imported it; leaving the user to
        // tap the row again would be a step that never has another answer.
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

  // Hardware-back on Android: when any modal is open, swallow the back press
  // (so it dismisses the modal) instead of popping the screen.
  const deferHardwareBackRef = useRef(false);
  deferHardwareBackRef.current =
    methodModal ||
    offsetsModal ||
    preReminderModal ||
    notificationSoundModal ||
    providerModal ||
    languageModal ||
    daruriLeadModal;
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
  const openDaruriLead = useCallback(() => setDaruriLeadModal(true), []);
  const closeDaruriLead = useCallback(() => setDaruriLeadModal(false), []);
  const openSoundPicker = useCallback(
    () => setNotificationSoundModal(true),
    [],
  );
  const openProvider = useCallback(() => setProviderModal(true), []);
  const tabBarInset = useTabBarInset();
  // The bar gets out of the way while reading — see tabBarVisibility.ts.
  const tabBarScroll = useTabBarScroll();
  const openLanguage = useCallback(() => setLanguageModal(true), []);

  return (
    <>
      <ScrollView
        {...tabBarScroll}
        ref={scrollRef}
        style={[styles.scroll, { backgroundColor: palette.bg }]}
        contentContainerStyle={[
          styles.scrollContent,
          // No `insets.bottom`: the tab bar is in flow and already spends
          // it, so adding it here doubled the dead air at the foot of the
          // list (see HomeScreen's scroll content).
          { paddingBottom: 24 + tabBarInset },
        ]}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        {(() => {
          const savedLocations = (
            <View
              onLayout={e => {
                savedLocationsYRef.current = e.nativeEvent.layout.y;
              }}
            >
              <SavedLocationsCard highlightSignal={savedHighlightSignal} />
            </View>
          );
          const appearance = <AppearanceCard />;
          const language = <LanguageCard onOpenLanguagePicker={openLanguage} />;
          const widget = <WidgetCard />;
          const dataSource = (
            <DataSourceCard onOpenProviderPicker={openProvider} />
          );
          const location = <LocationCard />;
          const calculation = (
            <CalculationCard
              onOpenMethodPicker={openMethod}
              onOpenOffsetsModal={openOffsets}
              onOpenDaruriLeadPicker={openDaruriLead}
            />
          );
          const notifications = (
            <NotificationsCard
              onOpenSoundPicker={openSoundPicker}
              onOpenPreReminderPicker={openPreReminder}
            />
          );
          const liveActivity = <LiveActivityCard />;
          const monthTimes = <MonthTimesCard />;
          const quran = <QuranCard />;
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
                    {monthTimes}
                    {quran}
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
              {monthTimes}
              {quran}
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

      {/* The same picker as the pre-prayer reminder, asking the same
          question about a different boundary — see PreReminderModal's
          `title` / `offLabel`. */}
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

      <SoundPickerModal
        visible={notificationSoundModal}
        currentSound={settings.notificationSound}
        previewingId={previewingId}
        palette={palette}
        onSelect={id => updateSettings({ notificationSound: id })}
        onSetPreviewingId={setPreviewingId}
        onClose={closeSoundPicker}
        customAdhan={customAdhan}
        importingCustom={importingCustom}
        onImportCustom={handleImportCustom}
        onRemoveCustom={handleRemoveCustom}
      />

      <LanguageModal
        visible={languageModal}
        current={settings.language}
        palette={palette}
        // `languagePicked` is what stops the app following the phone from
        // here on: see settings/storage.ts.
        onSelect={lang => updateSettings({ language: lang, languagePicked: true })}
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
