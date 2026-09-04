// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { memo, useMemo, useRef } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { usePrayerSettings } from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import { getInstalledAppVersionLabel } from '../../appVersion';
import type { RootStackParamList } from '../../navigation/types';
import { resetAppData } from '../../settings/storage';
import { DEFAULT_SETTINGS } from '../../settings/types';
import { rateApp } from '../../polish/rateApp';
import { resetFeatureTour } from '../../polish/FeatureTourModal';
import { NestedPageRows } from './NestedPageRows';
import {
  SettingsGroup,
  SettingsLinkRow,
  SettingsToggleRow,
} from './SettingsGroup';
import { MIHRAB_WEBSITE, MIHRAB_WEBSITE_LABEL } from '../../config/links';

/**
 * About card: the installed-version label and the GitHub link.
 *
 * The tip jar that used to head this card is gone. It was Play-flavour only,
 * which meant a section of the About screen that existed for some builds and
 * not others, an in-app purchase to maintain in two consoles, and a billing
 * dependency carried by every Play build for one optional button.
 */
function AboutCardImpl() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const versionLabel = useMemo(() => getInstalledAppVersionLabel(), []);
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { settings, updateSettings } = usePrayerSettings();

  // Hidden "developer mode" unlock: tap the version 5× (resets after a 1.5 s
  // pause) to reveal the data-statistics toggle, à la Android developer mode.
  const versionTaps = useRef(0);
  const lastVersionTap = useRef(0);
  const onVersionTap = () => {
    if (settings.dataStatsUnlocked) return;
    const now = Date.now();
    versionTaps.current = now - lastVersionTap.current > 1500 ? 1 : versionTaps.current + 1;
    lastVersionTap.current = now;
    if (versionTaps.current >= 5) {
      versionTaps.current = 0;
      updateSettings({ dataStatsUnlocked: true, showDataStats: true });
      Alert.alert(
        t('dataStats.unlockedTitle', 'Data statistics enabled'),
        t(
          'dataStats.unlockedBody',
          'A statistics card now appears at the bottom of the home screen. Turn it off any time below.',
        ),
      );
    }
  };

  const goToBackup = () => navigation.navigate('Backup');
  const goToSync = () => navigation.navigate('Sync');

  // v2.7.28: replaying onboarding no longer wipes anything — it simply
  // reruns the welcome flow over the existing data. The destructive
  // wipe lives in its own clearly-labeled row below.
  const replayOnboarding = () => {
    updateSettings({ onboardingComplete: false });
    navigation.navigate('Onboarding');
  };

  const resetEverything = () => {
    // Destructive reset — wipes all data and walks the user through
    // onboarding again. Confirm before doing this so a stray tap can't
    // erase the journal / fasting log / settings.
    Alert.alert(
      t('settings.resetTitle', 'Reset the app?'),
      t(
        'settings.resetBody',
        'This wipes all settings, saved locations, journal entries, fasting log, and tasbih state, then takes you back to the onboarding flow. This cannot be undone.',
      ),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('settings.resetConfirm', 'Reset everything'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await resetAppData();
              } catch (e) {
                console.warn('resetAppData failed:', e);
              }
              // Restore in-memory state to defaults so the running app
              // doesn't re-flush stale data into storage on the next
              // setting change. Auto-router on Home will pull the user
              // back to Onboarding once onboardingComplete=false.
              updateSettings({
                ...DEFAULT_SETTINGS,
                onboardingComplete: false,
                locationOnboardingComplete: false,
              });
              navigation.navigate('Onboarding');
            })();
          },
        },
      ],
    );
  };

  return (
    <>
      {/* Where your data goes, and how to get it back out. Backup, sync
          and the downloads inventory are three answers to one question,
          so they are one card. */}
      <SettingsGroup title={t('settings.dataAndPrivacy')}>
        <SettingsLinkRow
          title={t('nav.backup')}
          help={t('backup.exportSection')}
          onPress={goToBackup}
        />
        <SettingsLinkRow
          title={t('nav.sync')}
          help={t('sync.settingsRowHint')}
          onPress={goToSync}
        />
        <SettingsLinkRow
          title={t('downloads.title', 'Manage downloads')}
          help={t(
            'downloads.settingsHelp',
            'Mushaf pages, recitation audio and tafsir on this device.',
          )}
          onPress={() => navigation.navigate('QuranDownloads')}
        />
        {settings.dataStatsUnlocked ? (
          <SettingsToggleRow
            title={t('dataStats.toggle')}
            help={t('dataStats.toggleHelp')}
            value={settings.showDataStats}
            onValueChange={v => updateSettings({ showDataStats: v })}
          />
        ) : null}
      </SettingsGroup>

      <SettingsGroup title={t('settings.sectionAbout')}>
        <SettingsLinkRow
          title={t('settings.rateApp', 'Rate Mihrab')}
          help={t(
            'settings.rateAppHelp',
            'Enjoying the app? A rating helps others find it.',
          )}
          onPress={() => {
            void rateApp();
          }}
          accessory={
            <Text style={[styles.star, { color: palette.accent }]}>★</Text>
          }
        />
        <SettingsLinkRow
          title={t('settings.showTour', 'Show the app tour')}
          help={t(
            'settings.showTourHelp',
            'Replay the quick feature walkthrough.',
          )}
          onPress={() => {
            // Clear the seen-flag and pop back to Home, where the tour
            // auto-presents (same path as a fresh install).
            void resetFeatureTour().then(() => {
              navigation.navigate('Home');
            });
          }}
        />
        <SettingsLinkRow
          title={t('settings.replayOnboarding')}
          help={t('settings.replayOnboardingHelp')}
          onPress={replayOnboarding}
        />
        {/* Last, and the only row that changes colour: a row that erases
            everything should not look like a row that opens things. */}
        <SettingsLinkRow
          destructive
          title={t('settings.resetApp', 'Reset app data')}
          help={t(
            'settings.resetAppHelp',
            'Erase all settings and data. Cannot be undone.',
          )}
          onPress={resetEverything}
        />
      </SettingsGroup>

      {/* Attributions, on their own page. Eleven-point centred text under
          the version number read as small print; it is not small print. */}
      <NestedPageRows parent="SettingsAbout" />
      <View style={styles.versionBlock}>
        <Text
          suppressHighlighting
          onPress={onVersionTap}
          style={[styles.versionText, { color: palette.muted }]}>
          {t('settings.versionInstalled', { version: versionLabel })}
        </Text>
        {/* The website, not the repo. Someone who has scrolled to the foot
            of Settings wants to know about the app; the source tree is a
            different question, and it is still one tap away from the site
            and from the attributions page above. */}
        <Text
          accessibilityRole="link"
          accessibilityLabel={MIHRAB_WEBSITE_LABEL}
          style={[styles.versionLink, { color: palette.accent }]}
          onPress={() => {
            void Linking.openURL(MIHRAB_WEBSITE);
          }}>
          {MIHRAB_WEBSITE_LABEL}
        </Text>
      </View>
    </>
  );
}

export const AboutCard = memo(AboutCardImpl);

const styles = StyleSheet.create({
  star: { fontSize: 18 },
  versionBlock: {
    marginTop: 10,
    marginBottom: 4,
    alignItems: 'center',
    gap: 3,
  },
  versionText: {
    fontSize: 12,
    textAlign: 'center',
  },
  versionLink: {
    fontSize: 12,
    fontWeight: '600',
  },
});
