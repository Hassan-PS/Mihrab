// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { memo, useMemo } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { usePrayerSettings } from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import { cardEdgeStyle } from '../../theme/chrome';
import type { AppPalette } from '../../theme/appPalette';
import { showDonationsUi } from '../../distribution';
import { getInstalledAppVersionLabel } from '../../appVersion';
import type { RootStackParamList } from '../../navigation/types';
import { resetAppData } from '../../settings/storage';
import { DEFAULT_SETTINGS } from '../../settings/types';
import { sharedSettingsStyles as s } from './sharedStyles';

function MaybeSupportDeveloperSection({ palette }: { palette: AppPalette }) {
  if (!showDonationsUi()) return null;
  // Lazy require so the donations module is excluded from F-Droid builds via
  // the Babel `__DEV_DONATIONS__` flag (matches existing distribution wiring).
  const { SupportDeveloperSection } = require('../../donations/SupportDeveloperSection');
  return <SupportDeveloperSection palette={palette} />;
}

/**
 * About card: optional donations section (Play flavor only) plus the
 * installed-version label and GitHub link.
 */
function AboutCardImpl() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const versionLabel = useMemo(() => getInstalledAppVersionLabel(), []);
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { updateSettings } = usePrayerSettings();

  const goToBackup = () => navigation.navigate('Backup');
  const replayOnboarding = () => {
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
      <MaybeSupportDeveloperSection palette={palette} />
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
      <View style={styles.versionBlock}>
        <Text style={[styles.versionText, { color: palette.muted }]}>
          {t('settings.versionInstalled', { version: versionLabel })}
        </Text>
        <Text
          accessibilityRole="link"
          accessibilityLabel="github.com/Hassan-PS/Mihrab"
          style={[styles.versionLink, { color: palette.accent }]}
          onPress={() => {
            void Linking.openURL('https://github.com/Hassan-PS/Mihrab');
          }}>
          github.com/Hassan-PS/Mihrab
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
        label={t('attributions.translationEditions', { defaultValue: 'Translation editions (14)' })}
        sub="alquran.cloud · Tanzil-derived · CC BY 3.0"
        url="https://alquran.cloud/"
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
        label={t('attributions.scheherazade', { defaultValue: 'Scheherazade New' })}
        sub="SIL · SIL OFL 1.1"
        url="https://software.sil.org/scheherazade/"
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
