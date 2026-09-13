/**
 * Screen 2 — where you are.
 *
 * Substance unchanged from the old step: the whole `LocationSetup` widget
 * embedded, GPS or city search or manual coordinates, and **no skip
 * control**. App Store guideline 5.1.1(iv) requires a location
 * pre-permission screen to lead to the prompt with no exit or delay
 * affordance; the manual city path is the escape hatch and it is INSIDE
 * the widget, not beside it. A test pins the absence of that control,
 * because a redesign is exactly how it would be lost.
 *
 * ── WHAT CHANGED IS THE EIGHTY MILLISECONDS AFTER ─────────────────────
 *
 * The old screen auto-advanced on an 80ms timer the moment
 * `locationOnboardingComplete` flipped, which is faster than the eye. So
 * the first moment the app proves it works — a real city, real times,
 * computed on this device — went by unseen.
 *
 * Now the widget gives way to the city name and today's five times, and
 * the screen waits. It is also the setup for the school screen, which can
 * only show a real ʿaṣr because this one has just established where.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { usePrayerSettings } from '../../context/PrayerSettingsContext';
import { useClockFormatter } from '../../hooks/useClockFormatter';
import { LocationSetup } from '../../components/LocationSetup';
import { SPACING } from '../../theme/tokens';
import { typeStyle } from '../../theme/typography';
import { tabularNumeralStyle } from '../../theme/textScale';
import { previewCoords, previewDay, PREVIEW_ROWS } from '../previewTimes';
import {
  OnboardingFrame,
  OnboardingHeading,
  PrimaryAction,
} from '../OnboardingChrome';

/** Long enough to read five rows, short enough not to feel stuck. */
const PAUSE_MS = 1400;

export function LocationScreen({
  progress,
  onAdvance,
}: {
  progress: { now: number; total: number } | null;
  onAdvance: () => void;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const { settings } = usePrayerSettings();
  const clock = useClockFormatter();
  const done = settings.locationOnboardingComplete;

  const coords = useMemo(() => previewCoords(settings), [settings]);
  const times = useMemo(
    () =>
      coords
        ? previewDay(coords, {
            calculationMethod: settings.calculationMethod,
            school: settings.school,
          })
        : null,
    [coords, settings.calculationMethod, settings.school],
  );

  /**
   * Advance on a timer once the location lands, so the proof is seen. A
   * tap on Continue does the same thing sooner; both paths call the same
   * callback, so nothing double-advances.
   *
   * ── BUT ONLY WHEN IT LANDS HERE ───────────────────────────────────
   *
   * Hardware back steps within the flow, so somebody can come back to
   * this screen to check what they entered. If the timer fired on a
   * location that was ALREADY set when the screen mounted, back would
   * bounce them forward again a second and a half later — a screen they
   * are not allowed to look at. The ref records the state at mount, and
   * the timer is only armed by a change away from it.
   */
  const wasDoneOnMount = useRef(done);
  const [armed, setArmed] = useState(done);
  useEffect(() => {
    if (!done) return undefined;
    setArmed(true);
    if (wasDoneOnMount.current) return undefined;
    const id = setTimeout(onAdvance, PAUSE_MS);
    return () => clearTimeout(id);
  }, [done, onAdvance]);

  const city =
    settings.manualLocationLabel ?? settings.autoLocationLabel ?? undefined;

  return (
    <OnboardingFrame
      progress={progress}
      footer={
        // NO skip control on this screen, ever. The only button is the one
        // that moves forward once an answer exists.
        armed ? (
          <PrimaryAction
            testID="onboarding-location-continue"
            label={t('common.continue', 'Continue')}
            onPress={onAdvance}
          />
        ) : undefined
      }>
      <OnboardingHeading
        title={t('onboarding.location.title', 'Where are you?')}
        body={t(
          'onboarding.location.body',
          'Prayer times depend on where you stand. Your coordinates are encrypted on this device and never leave it.',
        )}
      />

      {armed && times ? (
        <View style={styles.proof}>
          {city ? (
            <Text
              style={[typeStyle('headline'), styles.city, { color: palette.text }]}>
              {t('onboarding.location.ready', { city, defaultValue: 'Today in {{city}}' })}
            </Text>
          ) : null}
          {PREVIEW_ROWS.map(row => (
            <View key={row} style={styles.row}>
              <Text style={[typeStyle('body'), { color: palette.muted }]}>
                {t(`prayer.${row}`, row)}
              </Text>
              <Text
                style={[
                  typeStyle('body'),
                  tabularNumeralStyle,
                  { color: palette.text },
                ]}>
                {clock(times[row])}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.embed}>
          <LocationSetup
            // This screen asks the question in its own type, in the same
            // voice as the five around it; the widget's own headline and
            // subtitle would ask it a second time, in different words,
            // four lines lower.
            hideIntro
            palette={{
              bg: palette.bg,
              text: palette.text,
              muted: palette.muted,
              border: palette.border,
              accent: palette.accent,
              accentBg: palette.accentBg,
              accentSolid: palette.accentSolid,
              onAccent: palette.onAccent,
              card: palette.card,
              danger: palette.danger,
              flatChrome: palette.flatChrome,
            }}
          />
        </View>
      )}
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  embed: { minHeight: 320, marginTop: SPACING.sm },
  proof: { gap: SPACING.sm, marginTop: SPACING.lg },
  city: { textAlign: 'center', marginBottom: SPACING.sm },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
});
