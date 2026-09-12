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
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
} from '../OnboardingChrome';

export function MadhabScreen({
  progress,
  onAdvance,
}: {
  progress: { now: number; total: number } | null;
  onAdvance: () => void;
}) {
  const { t } = useTranslation();
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

  /**
   * WHY THE TIME IS ON EVERY ROW, AND NOT ON A LINE OF ITS OWN.
   *
   * It used to be one line under the list that showed the chosen ʿaṣr,
   * and animated `16:12 → 17:38` for a second when the choice changed
   * before settling on the new value. That was a riddle: the first time
   * flashed and vanished, so anyone not watching at that moment saw a
   * bare number with no reason attached, and anyone who did see it was
   * shown two numbers and an arrow with nothing saying what had moved.
   * On first arrival there was no "from" at all, so the line opened as a
   * time with no context whatsoever.
   *
   * A column of times, one per row, needs none of that. The consequence
   * is permanently on screen, it is comparable at a glance rather than
   * from memory, and it tells the truth the picker has always encoded:
   * four names, two answers — only the Ḥanafī reckoning moves ʿaṣr.
   * Nothing animates, so nothing has to be caught.
   */
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

      <View style={styles.columnLabel}>
        <Text style={[typeStyle('label'), { color: palette.muted }]}>
          {t('onboarding.madhab.asr', 'ʿAṣr today')}
        </Text>
      </View>

      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t('onboarding.madhab.title', 'How do you pray?')}
        style={[
          styles.card,
          { backgroundColor: palette.card, borderRadius: RADIUS.lg },
        ]}>
        {MADHABS.map((m, i) => {
          const selected = !unsure && chosen === m;
          const time = asrBy ? clock(asrBy[m]) : '—';
          return (
            <Pressable
              key={m}
              testID={`onboarding-madhab-${m}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              // The time is part of what the row IS, so it belongs in the
              // label rather than being left for a screen reader to find
              // as a separate, unexplained number.
              accessibilityLabel={`${t(`settings.madhab_${m}`)}, ${t(
                'onboarding.madhab.asr',
                'ʿAṣr today',
              )} ${time}`}
              onPress={() => pick(m)}
              style={({ pressed }) => [
                styles.option,
                i > 0 ? styles.divided : null,
                i > 0 ? { borderTopColor: palette.border } : null,
                pressed && { opacity: 0.6 },
              ]}>
              <Text
                style={[
                  typeStyle('headline'),
                  { color: selected ? palette.accentSolid : palette.muted },
                ]}>
                {selected ? '\u25cf' : '\u25cb'}
              </Text>
              <Text style={[typeStyle('body'), styles.name, { color: palette.text }]}>
                {t(`settings.madhab_${m}`)}
              </Text>
              <Text
                style={[
                  typeStyle('body'),
                  tabularNumeralStyle,
                  { color: selected ? palette.text : palette.muted },
                ]}>
                {time}
              </Text>
            </Pressable>
          );
        })}

        {/* A real answer, not a skip: somebody may genuinely not claim a
            school, and the app should say what it will do then rather
            than hide behind the word "Custom". Last in the group, and
            quieter, because it is the answer for the person the four
            above did not fit. */}
        <Pressable
          testID="onboarding-madhab-unsure"
          accessibilityRole="radio"
          accessibilityState={{ checked: unsure }}
          accessibilityLabel={t('onboarding.madhab.unsure', 'I\u2019m not sure')}
          accessibilityHint={t(
            'onboarding.madhab.unsureNote',
            'We\u2019ll use the majority \u02bfa\u1e63r \u2014 you can change this any time in Settings.',
          )}
          onPress={pickUnsure}
          style={({ pressed }) => [
            styles.option,
            styles.divided,
            { borderTopColor: palette.border },
            pressed && { opacity: 0.6 },
          ]}>
          <Text
            style={[
              typeStyle('headline'),
              { color: unsure ? palette.accentSolid : palette.muted },
            ]}>
            {unsure ? '\u25cf' : '\u25cb'}
          </Text>
          <View style={styles.name}>
            <Text style={[typeStyle('body'), { color: palette.text }]}>
              {t('onboarding.madhab.unsure', 'I\u2019m not sure')}
            </Text>
            {unsure ? (
              <Text
                style={[typeStyle('footnote'), styles.hint, { color: palette.muted }]}>
                {t(
                  'onboarding.madhab.unsureNote',
                  'We\u2019ll use the majority \u02bfa\u1e63r \u2014 you can change this any time in Settings.',
                )}
              </Text>
            ) : null}
          </View>
          <Text
            style={[
              typeStyle('body'),
              tabularNumeralStyle,
              { color: unsure ? palette.text : palette.muted },
            ]}>
            {asrBy ? clock(asrBy.shafii) : '\u2014'}
          </Text>
        </Pressable>
      </View>

      {/* The sentence that answers "so what am I looking at". Without it
          three rows showing the same time reads as a bug rather than as
          the fact it is. */}
      <Text style={[typeStyle('footnote'), styles.note, { color: palette.muted }]}>
        {t(
          'onboarding.madhab.note',
          'Only the Hanafi reckoning moves \u02bfa\u1e63r \u2014 the other schools share the majority time.',
        )}
      </Text>

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
  // Sits over the trailing edge of the card, naming the column of times
  // under it the way a table header would.
  columnLabel: {
    alignItems: 'flex-end',
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
  },
  card: { overflow: 'hidden' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
  },
  divided: { borderTopWidth: StyleSheet.hairlineWidth },
  name: { flex: 1 },
  hint: { marginTop: SPACING.xs },
  note: { textAlign: 'center', marginTop: SPACING.sm },
});
