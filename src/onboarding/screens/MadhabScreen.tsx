/**
 * Screen 3 — how you pray.  ·  NEW
 *
 * The question the app has never asked, and the one that changes the
 * numbers on the main screen. `school` defaults to 0 — the 1:1 shadow —
 * so a Ḥanafī user's ʿaṣr has always been three quarters of an hour early
 * or worse, every day, until they found Settings → Prayer times →
 * Calculation. `madhab` defaults to null, which the UI renders as
 * "Custom": the app's honest way of saying it never asked.
 *
 * ── THE DESIGN POINT IS THE ʿAṢR LINE ─────────────────────────────────
 *
 * The user's own ʿaṣr is on screen and it moves as they tap. Nobody has
 * to know what a shadow ratio is to see what the choice does. That is
 * only possible because screen 2 just established where they are, which
 * is why the order of the flow is what it is.
 *
 * Both values come from `previewTimes`, which computes on device — see
 * that module for why, and for the one thing it costs.
 *
 * ── WRITES ────────────────────────────────────────────────────────────
 *
 * `madhab` and `school` together, in one call, on every tap. They must be
 * written as a pair: `selectedMadhab()` falls back to Custom when the
 * stored school no longer describes the stored madhab, so writing one
 * without the other silently discards the answer.
 *
 * Mālikī reveals one row, defaulted on, and turning away from Mālikī
 * writes it back off — otherwise somebody who changed their mind is left
 * with a setting they can no longer see the control for.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { usePrayerSettings } from '../../context/PrayerSettingsContext';
import { useClockFormatter } from '../../hooks/useClockFormatter';
import { asrSchoolFor, MADHABS, selectedMadhab, type Madhab } from '../../prayer/madhab';
import { SettingsGroup, SettingsToggleRow } from '../../screens/settings/SettingsGroup';
import { RADIUS, SPACING } from '../../theme/tokens';
import { typeStyle } from '../../theme/typography';
import { tabularNumeralStyle } from '../../theme/textScale';
import { previewAsrByMadhab, previewCoords } from '../previewTimes';
import {
  OnboardingFrame,
  OnboardingHeading,
  PrimaryAction,
  QuietAction,
} from '../OnboardingChrome';

export function MadhabScreen({
  progress,
  onAdvance,
}: {
  progress: { now: number; total: number } | null;
  onAdvance: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { palette } = useAppPalette();
  const { settings, updateSettings } = usePrayerSettings();
  const clock = useClockFormatter();
  const chosen = selectedMadhab(settings.madhab, settings.school);
  const [unsure, setUnsure] = useState(false);

  const coords = useMemo(() => previewCoords(settings), [settings]);
  const asrBy = useMemo(
    () =>
      coords
        ? previewAsrByMadhab(coords, {
            calculationMethod: settings.calculationMethod,
          })
        : null,
    [coords, settings.calculationMethod],
  );

  const currentAsr = asrBy
    ? asrBy[chosen ?? 'shafii']
    : null;

  // The value the line is moving FROM, kept for one render so the change
  // is visible as a change rather than a silent substitution.
  const previous = useRef<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  useEffect(() => {
    if (!currentAsr) return undefined;
    if (previous.current && previous.current !== currentAsr) {
      setFrom(previous.current);
      const id = setTimeout(() => setFrom(null), 1200);
      previous.current = currentAsr;
      return () => clearTimeout(id);
    }
    previous.current = currentAsr;
    return undefined;
  }, [currentAsr]);

  // The consequence a sighted user sees, said out loud for one who does
  // not. Announced on change only, never on mount.
  const announced = useRef<string | null>(null);
  useEffect(() => {
    if (!currentAsr) return;
    if (announced.current && announced.current !== currentAsr) {
      AccessibilityInfo.announceForAccessibility(
        `${t('onboarding.madhab.asr', 'ʿAṣr today')}, ${clock(currentAsr)}`,
      );
    }
    announced.current = currentAsr;
  }, [currentAsr, clock, t]);

  const pick = (madhab: Madhab) => {
    setUnsure(false);
    updateSettings({
      madhab,
      school: asrSchoolFor(madhab),
      // Mālikī users are the only ones the second times mean anything to,
      // and they have just identified themselves: on ARRIVING at Mālikī
      // the row defaults on. Someone already Mālikī — re-running setup,
      // say — who turned it off in Settings keeps that; tapping their own
      // school again is not a request to undo a choice. Everyone else
      // gets it written back off, so no invisible setting survives a
      // change of mind.
      malikiSecondTimesEnabled:
        madhab === 'maliki'
          ? chosen === 'maliki'
            ? settings.malikiSecondTimesEnabled
            : true
          : false,
    });
  };

  const pickUnsure = () => {
    setUnsure(true);
    // The majority ʿaṣr, and `madhab: null` — which is what "Custom" has
    // always meant. Said plainly in the caption rather than hidden behind
    // the word.
    updateSettings({
      madhab: null,
      school: 0,
      malikiSecondTimesEnabled: false,
    });
  };

  const arrow = i18n.dir() === 'rtl' ? '←' : '→';

  return (
    <OnboardingFrame
      progress={progress}
      footer={
        <PrimaryAction
          testID="onboarding-madhab-continue"
          label={t('common.continue', 'Continue')}
          onPress={onAdvance}
        />
      }>
      <OnboardingHeading
        title={t('onboarding.madhab.title', 'How do you pray?')}
        body={t('onboarding.madhab.body', 'This sets when ʿaṣr begins for you.')}
      />

      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t('onboarding.madhab.title', 'How do you pray?')}
        style={[
          styles.card,
          { backgroundColor: palette.card, borderRadius: RADIUS.lg },
        ]}>
        {MADHABS.map((m, i) => {
          const selected = !unsure && chosen === m;
          return (
            <Pressable
              key={m}
              testID={`onboarding-madhab-${m}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={t(`settings.madhab_${m}`)}
              onPress={() => pick(m)}
              style={({ pressed }) => [
                styles.option,
                i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border } : null,
                pressed && { opacity: 0.6 },
              ]}>
              <Text style={[typeStyle('body'), { color: palette.text }]}>
                {t(`settings.madhab_${m}`)}
              </Text>
              <Text
                style={[
                  typeStyle('headline'),
                  { color: selected ? palette.accentSolid : palette.muted },
                ]}>
                {selected ? '●' : '○'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {currentAsr ? (
        <View
          accessibilityLiveRegion="polite"
          style={[styles.asrRow, { borderColor: palette.border }]}>
          <Text style={[typeStyle('footnote'), { color: palette.muted }]}>
            {t('onboarding.madhab.asr', 'ʿAṣr today')}
          </Text>
          <Text
            style={[
              typeStyle('title3'),
              tabularNumeralStyle,
              { color: palette.text },
            ]}>
            {from ? `${clock(from)} ${arrow} ${clock(currentAsr)}` : clock(currentAsr)}
          </Text>
        </View>
      ) : null}

      <QuietAction
        testID="onboarding-madhab-unsure"
        label={t('onboarding.madhab.unsure', 'I’m not sure')}
        onPress={pickUnsure}
      />
      {unsure ? (
        <Text style={[typeStyle('footnote'), styles.note, { color: palette.muted }]}>
          {t(
            'onboarding.madhab.unsureNote',
            'We’ll use the majority ʿaṣr — you can change this any time in Settings.',
          )}
        </Text>
      ) : null}

      {chosen === 'maliki' ? (
        <SettingsGroup>
          <SettingsToggleRow
            testID="onboarding-maliki-second-times"
            title={t(
              'onboarding.madhab.malikiSecond',
              'Also show the second prayer times (ikhtiyārī and ḍarūrī)',
            )}
            value={settings.malikiSecondTimesEnabled}
            onValueChange={v => updateSettings({ malikiSecondTimesEnabled: v })}
          />
        </SettingsGroup>
      ) : null}
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden', marginTop: SPACING.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
  },
  asrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: SPACING.lg,
    marginTop: SPACING.lg,
  },
  note: { textAlign: 'center' },
});
