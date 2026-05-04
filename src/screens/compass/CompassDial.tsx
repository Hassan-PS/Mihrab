import { memo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { FIXED_LABEL_MAX_FONT_SCALE } from '../../theme/textScale';
import type { CompassMode } from './useCompassSensor';

export const DIAL = 260;
const ARM_H = DIAL * 0.4;

/**
 * The Qibla compass dial — round face with cardinal labels, phone-front
 * indicator, rotating Qibla arm, and centre hub.
 *
 * `needleDeg` is the rotation applied to the arm (Qibla bearing minus current
 * heading). A change here re-renders only this component; the surrounding
 * status banners and bearing header don't move.
 */
type CompassDialProps = {
  mode: CompassMode;
  /** 0-360. Rotation of the Qibla arm relative to "Phone front". */
  needleDeg: number;
};

function CompassDialImpl({ mode, needleDeg }: CompassDialProps) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();

  const a11yLabel =
    mode === 'live'
      ? t('compass.a11yDialLive', { deg: Math.round(needleDeg) })
      : mode === 'checking'
      ? t('compass.a11yDialChecking')
      : t('compass.a11yDialUnavailable');

  return (
    <View style={styles.wrap}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={a11yLabel}
        style={[
          styles.dial,
          {
            backgroundColor: palette.card,
            opacity: mode === 'unsupported' ? 0.5 : 1,
            ...(palette.flatChrome
              ? { borderWidth: 0, borderColor: 'transparent' }
              : { borderColor: palette.border }),
          },
        ]}>
        <View style={styles.phoneFrontMark} pointerEvents="none">
          <Text
            style={[styles.phoneFrontLabel, { color: palette.accent }]}
            maxFontSizeMultiplier={FIXED_LABEL_MAX_FONT_SCALE}>
            {t('compass.phoneFront')}
          </Text>
          <View
            style={[
              styles.phoneFrontArrow,
              { borderTopColor: palette.accent },
            ]}
          />
        </View>

        <Text
          style={[styles.cardinal, styles.n, { color: palette.muted }]}
          maxFontSizeMultiplier={FIXED_LABEL_MAX_FONT_SCALE}>
          {t('compass.north')}
        </Text>
        <Text
          style={[styles.cardinal, styles.e, { color: palette.muted }]}
          maxFontSizeMultiplier={FIXED_LABEL_MAX_FONT_SCALE}>
          {t('compass.east')}
        </Text>
        <Text
          style={[styles.cardinal, styles.s, { color: palette.muted }]}
          maxFontSizeMultiplier={FIXED_LABEL_MAX_FONT_SCALE}>
          {t('compass.south')}
        </Text>
        <Text
          style={[styles.cardinal, styles.w, { color: palette.muted }]}
          maxFontSizeMultiplier={FIXED_LABEL_MAX_FONT_SCALE}>
          {t('compass.west')}
        </Text>

        {mode === 'checking' ? (
          // activity-indicator-allowed: sensor-warmup is <1 s and transient.
          // A Skeleton dial would imply we're waiting for data when we're
          // actually waiting for the magnetometer to stabilise.
          <ActivityIndicator size="large" color={palette.accent} />
        ) : null}

        {mode === 'live' ? (
          <>
            <View
              style={[
                styles.rotatePlate,
                { transform: [{ rotate: `${needleDeg}deg` }] },
              ]}>
              <View
                style={[
                  styles.qiblaArm,
                  { bottom: DIAL / 2, left: DIAL / 2 - 26 },
                ]}>
                <View style={styles.qiblaHead}>
                  <View
                    style={[
                      styles.qiblaTriangle,
                      { borderBottomColor: palette.accent },
                    ]}
                  />
                  <Text
                    style={[styles.qiblaHeadText, { color: palette.accent }]}
                    maxFontSizeMultiplier={FIXED_LABEL_MAX_FONT_SCALE}>
                    {t('compass.qiblaMarker')}
                  </Text>
                </View>
                <View
                  style={[
                    styles.qiblaShaft,
                    { backgroundColor: palette.accent },
                  ]}
                />
              </View>
            </View>
            <View style={[styles.hub, { backgroundColor: palette.text }]} />
          </>
        ) : null}

        {mode === 'unsupported' ? (
          <View style={styles.disabledOverlay} pointerEvents="none">
            <Text style={[styles.disabledGlyph, { color: palette.muted }]}>
              —
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export const CompassDial = memo(CompassDialImpl);

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', marginVertical: 8 },
  dial: {
    width: DIAL,
    height: DIAL,
    borderRadius: DIAL / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneFrontMark: {
    position: 'absolute',
    top: 6,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 4,
  },
  phoneFrontLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // rtl-safe: geometric triangle (the classic 0×0 + transparent borders trick).
  // borderLeftWidth / borderRightWidth define the triangle's base, NOT a layout
  // direction — they must NOT flip in RTL or the arrow shape inverts.
  phoneFrontArrow: {
    marginTop: 2,
    width: 0,
    height: 0,
    borderLeftWidth: 7, // rtl-safe: triangle geometry
    borderRightWidth: 7, // rtl-safe: triangle geometry
    borderTopWidth: 9,
    borderLeftColor: 'transparent', // rtl-safe: triangle geometry
    borderRightColor: 'transparent', // rtl-safe: triangle geometry
  },
  cardinal: { position: 'absolute', fontSize: 14, fontWeight: '700' },
  n: { top: 36 },
  s: { bottom: 10 },
  // rtl-safe: cardinal labels mark geographic directions, not text direction.
  // East stays on the geographic east of the dial regardless of UI language.
  e: { right: 14 }, // rtl-safe: geographic east
  w: { left: 14 }, // rtl-safe: geographic west
  rotatePlate: {
    position: 'absolute',
    width: DIAL,
    height: DIAL,
    top: 0,
    left: 0,
    zIndex: 1,
  },
  qiblaArm: {
    position: 'absolute',
    width: 52,
    height: ARM_H,
    alignItems: 'center',
    flexDirection: 'column-reverse',
  },
  qiblaShaft: {
    width: 7,
    height: ARM_H * 0.62,
    borderRadius: 3,
    marginTop: 4,
  },
  qiblaHead: { alignItems: 'center', marginBottom: 2 },
  // rtl-safe: Qibla arrowhead — geometric triangle, must not flip in RTL.
  qiblaTriangle: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 14, // rtl-safe: triangle geometry
    borderRightWidth: 14, // rtl-safe: triangle geometry
    borderBottomWidth: 20,
    borderLeftColor: 'transparent', // rtl-safe: triangle geometry
    borderRightColor: 'transparent', // rtl-safe: triangle geometry
    marginBottom: 2,
  },
  qiblaHeadText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  hub: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    left: DIAL / 2 - 7,
    top: DIAL / 2 - 7,
    zIndex: 3,
  },
  disabledOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  disabledGlyph: { fontSize: 48, fontWeight: '200' },
});
