import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useHeaderHeight } from '@react-navigation/elements';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import { useAppPalette } from '../hooks/useAppPalette';
import { useBreakpoint } from '../responsive/breakpoints';
import { useAndroidSubScreenBack } from '../navigation/useAndroidSubScreenBack';
import { normalizeHeadingDeg, qiblaBearingFrom } from '../utils/qibla';
import { BearingHeader } from './compass/BearingHeader';
import { CompassDial } from './compass/CompassDial';
import { SignalIndicator } from './compass/SignalIndicator';
import { StatusBanners } from './compass/StatusBanners';
import { useCompassAnnouncer } from './compass/useCompassAnnouncer';
import { useCompassSensor } from './compass/useCompassSensor';

/**
 * CompassScreen orchestrator — task #10 split.
 *
 * Owns the high-level Qibla math (bearing from settings coords + needle
 * rotation), delegates the entire sensor lifecycle to `useCompassSensor`,
 * the screen-reader announcements to `useCompassAnnouncer`, and rendering
 * to four memoized children. The watchdog interval, AppState listener,
 * platform-specific subscription branching, signal scoring, and stability
 * smoothing all live inside `useCompassSensor` — none of that touches this
 * file any more.
 */
export function CompassScreen() {
  // Subscribe to width changes so future master-detail layouts pick up
  // the new breakpoint without a forced remount. iPad/Mac (#33) baseline.
  useBreakpoint();
  const { t } = useTranslation();
  const { settings, hydrated } = usePrayerSettings();
  const { palette } = useAppPalette();
  const headerHeight = useHeaderHeight();

  useAndroidSubScreenBack();

  const needsGpsPrime =
    settings.locationMode === 'automatic' &&
    (settings.lastFetchedLatitude == null ||
      settings.lastFetchedLongitude == null);

  const lat =
    settings.locationMode === 'automatic'
      ? settings.lastFetchedLatitude ?? settings.manualLatitude
      : settings.manualLatitude;
  const lng =
    settings.locationMode === 'automatic'
      ? settings.lastFetchedLongitude ?? settings.manualLongitude
      : settings.manualLongitude;

  const qibla = useMemo(() => qiblaBearingFrom(lat, lng), [lat, lng]);

  const sensorEnabled = hydrated && !needsGpsPrime;
  const { heading, mode, signalStrength, signalQuality, stability } =
    useCompassSensor(sensorEnabled);

  const needleDeg = useMemo(
    () => normalizeHeadingDeg(qibla - heading),
    [qibla, heading],
  );

  useCompassAnnouncer({ mode, needleDeg, signalQuality });

  if (!hydrated) {
    return (
      <View
        style={[
          styles.centered,
          { backgroundColor: palette.bg, paddingTop: Platform.OS === 'ios' ? headerHeight : 0 },
        ]}>
        <Text style={{ color: palette.muted }}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (needsGpsPrime) {
    return (
      <View
        style={[
          styles.centered,
          styles.pad,
          { backgroundColor: palette.bg, paddingTop: Platform.OS === 'ios' ? headerHeight : 0 },
        ]}>
        <Text style={[styles.title, { color: palette.text }]}>
          {t('compass.needLocationTitle')}
        </Text>
        <Text style={[styles.body, { color: palette.muted }]}>
          {t('compass.needLocationBody')}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: palette.bg, paddingTop: Platform.OS === 'ios' ? headerHeight : 0 },
      ]}>
      <BearingHeader qiblaDeg={qibla} />

      <SignalIndicator mode={mode} signalStrength={signalStrength} />

      <StatusBanners
        mode={mode}
        signalQuality={signalQuality}
        stability={stability}
        signalStrength={signalStrength}
      />

      <CompassDial mode={mode} needleDeg={needleDeg} />

      {mode === 'checking' ? (
        <Text style={[styles.checkingHint, { color: palette.muted }]}>
          {Platform.OS === 'ios'
            ? t('compass.checkingCompassWithPrompt')
            : t('compass.checkingCompass')}
        </Text>
      ) : null}

      {mode === 'live' ? (
        <Text style={[styles.hint, { color: palette.muted }]}>
          {t('compass.hint')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, paddingTop: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pad: { padding: 24 },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  checkingHint: { fontSize: 14, textAlign: 'center', marginTop: 12 },
  hint: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 16 },
});
