import { memo, useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import {
  hasSystemCompass,
  openSystemCompass,
} from '../../utils/systemCompass';
import type { CompassMode, SignalQuality } from './useCompassSensor';

/**
 * Five mutually-non-exclusive status banners stacked above the dial:
 *   • iOS Motion permission denied — link to Settings.
 *   • Weak / very-weak signal — calibration instructions.
 *   • Stability warning — phone moving too much.
 *   • Unsupported — device has no usable magnetometer.
 *   • Cross-check — the bearing, and an offer to open the device's own
 *     compass app. Always shown, because it is advice rather than a
 *     fault: the BEARING is trigonometry and is not in doubt, while the
 *     HEADING is a sensor reading that a dedicated compass, tuned to that
 *     handset, may take better. Handing over the number and letting the
 *     other app supply the needle is the honest arrangement for someone
 *     deciding which way to pray in an unfamiliar room.
 */
type StatusBannersProps = {
  mode: CompassMode;
  signalQuality: SignalQuality;
  stability: number;
  signalStrength: number;
  /** Qibla bearing in degrees from true north, for the cross-check note. */
  bearing: number;
};

function StatusBannersImpl({
  mode,
  signalQuality,
  stability,
  signalStrength,
  bearing,
}: StatusBannersProps) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();

  // Whether there is anything to open. Asked once, and the button is
  // absent until the answer comes back true — Android has no compass in
  // AOSP, so on a Pixel the honest answer is "no button".
  const [canOpen, setCanOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    void hasSystemCompass().then(ok => {
      if (alive) setCanOpen(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  const live = mode === 'live' && signalStrength >= 0;
  const showWeak =
    live && (signalQuality === 'weak' || signalQuality === 'very_weak');
  const showStability = live && stability < 45;

  return (
    <>
      {mode === 'permission_denied' && Platform.OS === 'ios' ? (
        <View style={styles.banner}>
          <Text style={[styles.title, { color: palette.text }]}>
            {t('compass.motionPermissionTitle')}
          </Text>
          <Text style={[styles.body, { color: palette.muted }]}>
            {t('compass.motionPermissionDeniedBody')}
          </Text>
          <Text
            accessibilityRole="link"
            accessibilityLabel={t('compass.openSettings')}
            style={[styles.link, { color: palette.accent }]}
            onPress={() => {
              void Linking.openSettings();
            }}>
            {t('compass.openSettings')}
          </Text>
        </View>
      ) : null}

      {showWeak ? (
        <View style={styles.banner}>
          <Text style={[styles.title, { color: palette.text }]}>
            {signalQuality === 'very_weak'
              ? t('compass.signalVeryWeakTitle')
              : t('compass.signalWeakTitle')}
          </Text>
          <Text style={[styles.body, { color: palette.muted }]}>
            {t('compass.signalWeakBody')}
          </Text>
        </View>
      ) : null}

      {showStability ? (
        <View style={styles.banner}>
          <Text style={[styles.title, { color: palette.text }]}>
            {t('compass.motionDetectedTitle')}
          </Text>
          <Text style={[styles.body, { color: palette.muted }]}>
            {t('compass.motionDetectedBody')}
          </Text>
        </View>
      ) : null}

      <View style={styles.banner}>
        <Text style={[styles.title, { color: palette.text }]}>
          {t('compass.crossCheckTitle')}
        </Text>
        <Text style={[styles.body, { color: palette.muted }]}>
          {t('compass.crossCheckBody', {
            // LTR isolate: a Latin-digit run inside a possibly-RTL
            // sentence scrambles without it.
            degrees: `\u2066${Math.round(bearing) % 360}\u00B0\u2069`,
          })}
        </Text>
        {canOpen ? (
          <Text
            accessibilityRole="link"
            accessibilityLabel={t('compass.openSystemCompass')}
            style={[styles.link, { color: palette.accent }]}
            onPress={() => {
              void openSystemCompass();
            }}>
            {t('compass.openSystemCompass')}
          </Text>
        ) : null}
      </View>

      {mode === 'unsupported' ? (
        <View style={styles.banner}>
          <Text style={[styles.title, { color: palette.text }]}>
            {t('compass.unsupportedTitle')}
          </Text>
          <Text style={[styles.body, { color: palette.muted }]}>
            {t('compass.unsupportedBody')}
          </Text>
        </View>
      ) : null}
    </>
  );
}

export const StatusBanners = memo(StatusBannersImpl);

const styles = StyleSheet.create({
  banner: { marginBottom: 12, gap: 8 },
  title: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  link: { textAlign: 'center', fontSize: 14, fontWeight: '700' },
});
