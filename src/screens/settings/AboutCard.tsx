// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { memo, useMemo, useRef } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { usePrayerSettings } from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import { cardEdgeStyle } from '../../theme/chrome';
import type { AppPalette } from '../../theme/appPalette';
import { getInstalledAppVersionLabel } from '../../appVersion';
import type { RootStackParamList } from '../../navigation/types';
import { resetAppData } from '../../settings/storage';
import { DEFAULT_SETTINGS } from '../../settings/types';
import { rateApp } from '../../polish/rateApp';
import { resetFeatureTour } from '../../polish/FeatureTourModal';
import { sharedSettingsStyles as s } from './sharedStyles';
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
      <Text style={[s.sectionTitle, { color: palette.muted }]}>
        {t('settings.dataAndPrivacy')}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('nav.backup')}
        style={[
          s.card,
          s.rowPress,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}
        onPress={goToBackup}>
        <View>
          <Text style={[s.label, { color: palette.muted }]}>
            {t('nav.backup')}
          </Text>
          <Text style={[s.valueText, { color: palette.text }]}>
            {t('backup.exportSection')}
          </Text>
        </View>
        <Text style={[s.changeLink, { color: palette.accent }]}>›</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('nav.sync')}
        style={[
          s.card,
          s.rowPress,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}
        onPress={goToSync}>
        <View>
          <Text style={[s.label, { color: palette.muted }]}>
            {t('nav.sync')}
          </Text>
          <Text style={[s.valueText, { color: palette.text }]}>
            {t('sync.settingsRowHint')}
          </Text>
        </View>
        <Text style={[s.changeLink, { color: palette.accent }]}>›</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('downloads.title', 'Manage downloads')}
        style={[
          s.card,
          s.rowPress,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}
        onPress={() => navigation.navigate('QuranDownloads')}>
        <View>
          <Text style={[s.label, { color: palette.muted }]}>
            {t('downloads.title', 'Manage downloads')}
          </Text>
          <Text style={[s.valueText, { color: palette.text }]}>
            {t(
              'downloads.settingsHelp',
              'Mushaf pages, recitation audio and tafsir on this device.',
            )}
          </Text>
        </View>
        <Text style={[s.changeLink, { color: palette.accent }]}>›</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('settings.rateApp', 'Rate Mihrab')}
        style={[
          s.card,
          s.rowPress,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}
        onPress={() => {
          void rateApp();
        }}>
        <View>
          <Text style={[s.label, { color: palette.muted }]}>
            {t('settings.rateApp', 'Rate Mihrab')}
          </Text>
          <Text style={[s.valueText, { color: palette.text }]}>
            {t('settings.rateAppHelp', 'Enjoying the app? A rating helps others find it.')}
          </Text>
        </View>
        <Text style={[s.changeLink, { color: palette.accent }]}>★</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('settings.showTour', 'Show the app tour')}
        style={[
          s.card,
          s.rowPress,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}
        onPress={() => {
          // Clear the seen-flag and pop back to Home, where the tour
          // auto-presents (same path as a fresh install).
          void resetFeatureTour().then(() => {
            navigation.navigate('Home');
          });
        }}>
        <View>
          <Text style={[s.label, { color: palette.muted }]}>
            {t('settings.showTour', 'Show the app tour')}
          </Text>
          <Text style={[s.valueText, { color: palette.text }]}>
            {t('settings.showTourHelp', 'Replay the quick feature walkthrough.')}
          </Text>
        </View>
        <Text style={[s.changeLink, { color: palette.accent }]}>›</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('settings.replayOnboarding')}
        style={[
          s.card,
          s.rowPress,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}
        onPress={replayOnboarding}>
        <View>
          <Text style={[s.label, { color: palette.muted }]}>
            {t('settings.replayOnboarding')}
          </Text>
          <Text style={[s.valueText, { color: palette.text }]}>
            {t('settings.replayOnboardingHelp')}
          </Text>
        </View>
        <Text style={[s.changeLink, { color: palette.accent }]}>›</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('settings.resetApp', 'Reset app data')}
        style={[
          s.card,
          s.rowPress,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}
        onPress={resetEverything}>
        <View>
          <Text style={[s.label, { color: '#d43f3f' }]}>
            {t('settings.resetApp', 'Reset app data')}
          </Text>
          <Text style={[s.valueText, { color: palette.text }]}>
            {t(
              'settings.resetAppHelp',
              'Erase all settings and data. Cannot be undone.',
            )}
          </Text>
        </View>
        <Text style={[s.changeLink, { color: '#d43f3f' }]}>›</Text>
      </Pressable>
      {settings.dataStatsUnlocked && (
        <View
          style={[
            s.card,
            s.switchRow,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          <View style={s.switchCopy}>
            <Text style={[s.valueText, { color: palette.text }]}>
              {t('dataStats.toggle')}
            </Text>
            <Text style={[s.help, { color: palette.muted }]}>
              {t('dataStats.toggleHelp')}
            </Text>
          </View>
          <Switch
            value={settings.showDataStats}
            trackColor={{ true: palette.accentSolid, false: '#9ca3af' }}
            thumbColor={'#ffffff'}
            onValueChange={v => updateSettings({ showDataStats: v })}
          />
        </View>
      )}
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
            and from the attributions below. */}
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
      <Attributions palette={palette} />
    </>
  );
}

/**
 * Attributions block — task #68/#69/#70.
 *
 * Religious content and bundled assets must be attributed per their
 * respective licenses (CC BY 3.0 for the Quran text, SIL OFL for the
 * Arabic fonts, etc.). This block sits below the version + GitHub
 * link so it's discoverable but not intrusive.
 */
function Attributions({ palette }: { palette: AppPalette }) {
  const { t } = useTranslation();
  return (
    <View style={styles.attribBlock}>
      <Text style={[styles.attribTitle, { color: palette.muted }]}>
        {t('settings.attributions')}
      </Text>
      <AttributionRow
        palette={palette}
        label={t('attributions.quranText', { defaultValue: 'Quran Uthmani text' })}
        sub="Tanzil.net · CC BY 3.0"
        url="https://tanzil.net/"
      />
      <AttributionRow
        palette={palette}
        label={t('attributions.mushafImages', { defaultValue: 'Mushaf page images (604)' })}
        sub="Hassan-PS/Mihrab · KFGQPC fonts · via quran/quran.com-images"
        url="https://github.com/Hassan-PS/Mihrab/releases/tag/mushaf-assets-v2"
      />
      <AttributionRow
        palette={palette}
        label={t('attributions.quranGeometry', { defaultValue: 'Ayah position data (quran.com / Quran for Android project)' })}
        sub="quran.com · files.quran.app ayahinfo"
        url="https://github.com/quran/quran_android"
      />
      <AttributionRow
        palette={palette}
        label={t('attributions.recitation', { defaultValue: 'Recitation audio (42 reciters): EveryAyah.com · word timings: quran-align (CC BY 4.0)' })}
        sub="everyayah.com · cpfair/quran-align"
        url="https://everyayah.com/"
      />
      <AttributionRow
        palette={palette}
        label={t('attributions.translationEditions', { defaultValue: 'Translation editions (14)' })}
        sub="alquran.cloud · Tanzil-derived · CC BY 3.0"
        url="https://alquran.cloud/"
      />
      <AttributionRow
        palette={palette}
        label={t('attributions.tafsir', { defaultValue: 'Tafsir texts: Ibn Kathir, Maarif-ul-Quran, al-Muyassar' })}
        sub="spa5k/tafsir_api · Quran.com tafsir corpus"
        url="https://github.com/spa5k/tafsir_api"
      />
      <AttributionRow
        palette={palette}
        label={t('attributions.sahihIntl', { defaultValue: 'Sahih International (English)' })}
        sub="public domain · via Tanzil"
        url="https://tanzil.net/trans/"
      />
      <AttributionRow
        palette={palette}
        label={t('attributions.pickthall', { defaultValue: 'Pickthall (English)' })}
        sub="public domain"
        url="https://tanzil.net/trans/"
      />
      <AttributionRow
        palette={palette}
        label={t('attributions.mushafMetadata', { defaultValue: 'Mushaf page metadata' })}
        sub="alquran.cloud /v1/meta · Tanzil-derived · CC BY 3.0"
        url="https://alquran.cloud/api"
      />
      <AttributionRow
        palette={palette}
        label={t('attributions.amiriFonts', { defaultValue: 'Amiri & Amiri Quran fonts' })}
        sub="aliftype/amiri · SIL OFL 1.1"
        url="https://github.com/aliftype/amiri"
      />
      <AttributionRow
        palette={palette}
        label={t('attributions.hisnulMuslim', { defaultValue: 'Hisnul Muslim duas' })}
        sub="rn0x/hisn_almuslim_json · MIT"
        url="https://github.com/rn0x/hisn_almuslim_json"
      />
    </View>
  );
}

function AttributionRow({
  palette,
  label,
  sub,
  url,
}: {
  palette: AppPalette;
  label: string;
  sub: string;
  url: string;
}) {
  return (
    <Text
      accessibilityRole="link"
      accessibilityLabel={`${label} — ${sub}`}
      style={[styles.attribRow, { color: palette.muted }]}
      onPress={() => {
        void Linking.openURL(url);
      }}>
      <Text style={{ color: palette.text }}>{label}</Text>
      {' · '}
      <Text style={{ color: palette.accent }}>{sub}</Text>
    </Text>
  );
}

export const AboutCard = memo(AboutCardImpl);

const styles = StyleSheet.create({
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
  attribBlock: {
    marginTop: 16,
    marginBottom: 8,
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
  },
  attribTitle: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  attribRow: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },
});
