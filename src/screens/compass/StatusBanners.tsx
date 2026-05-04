import { memo } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import type { CompassMode, SignalQuality } from './useCompassSensor';

/**
 * Four mutually-non-exclusive status banners stacked above the dial:
 *   • iOS Motion permission denied — link to Settings.
 *   • Weak / very-weak signal — calibration instructions.
 *   • Stability warning — phone moving too much.
 *   • Unsupported — device has no usable magnetometer.
 */
type StatusBannersProps = {
  mode: CompassMode;
  signalQuality: SignalQuality;
  stability: number;
  signalStrength: number;
};

function StatusBannersImpl({
  mode,
  signalQuality,
  stability,
  signalStrength,
}: StatusBannersProps) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();

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
