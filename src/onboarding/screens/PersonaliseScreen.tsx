/**
 * Screen 5 — make it yours.  ·  NEW
 *
 * The shelf. Not a question, and the design has to say so without a
 * sentence: questions are one per screen with the question as the
 * headline; preferences are rows in a list. A user who has answered four
 * things and is then handed a list understands, without being told, that
 * the important part is over.
 *
 * ── WHY THESE ROWS AND NOT SEVENTY ────────────────────────────────────
 *
 * A preference earns a row only if all three hold (remake §2): it is off
 * or neutral by default so skipping costs nothing, it is discoverable
 * nowhere obvious, and it can be decided in one glance. `firstThirdEnabled`
 * fails the third — it is the subtlest of the night marks and needs the
 * explanation Settings gives it. `clockFormat` fails the first two: 'auto'
 * follows the phone and is right.
 *
 * `quranVerseByVerseEnabled` was added against the same test and passes:
 * off by default, buried in Settings → Quran where nobody trips over it,
 * and a switch. The third clause is the close call — somebody who has
 * never opened a surah does not yet know what either reader looks like —
 * which is why that row carries a help line describing the thing rather
 * than naming it. Argued in writing at remake §2, as §14 requires.
 *
 * ── BUILT FROM THE REAL SETTINGS COMPONENTS ───────────────────────────
 *
 * `SettingsGroup` and `SettingsToggleRow`, not a lookalike, so this IS
 * the Settings idiom rather than resembling it — the visual rhyme is the
 * teaching: this is where these things live. It also means the shelf
 * inherits their accessibility and RTL behaviour rather than
 * re-implementing it.
 *
 * ── SKIP WRITES NOTHING ───────────────────────────────────────────────
 *
 * One tap, top-trailing, no confirmation. A shelf that asks "are you sure
 * you want to skip?" is a question.
 */
import { useMemo } from 'react';
import { Platform, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import {
  usePrayerSettings,
} from '../../context/PrayerSettingsContext';
import { useClockFormatter } from '../../hooks/useClockFormatter';
import {
  SettingsBlock,
  SettingsGroup,
  SettingsToggleRow,
} from '../../screens/settings/SettingsGroup';
import { SegmentedControl } from '../../components/ui';
import { AccentShelf } from '../../components/AccentShelf';
import type { AppearancePreference } from '../../settings/types';
import { SPACING } from '../../theme/tokens';
import { typeStyle } from '../../theme/typography';
import { previewCoords, previewNightMarks } from '../previewTimes';
import {
  OnboardingFrame,
  OnboardingHeading,
  PrimaryAction,
  QuietAction,
} from '../OnboardingChrome';

export function PersonaliseScreen({
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

  const coords = useMemo(() => previewCoords(settings), [settings]);
  const night = useMemo(
    () =>
      coords
        ? previewNightMarks(coords, {
            calculationMethod: settings.calculationMethod,
            school: settings.school,
          })
        : null,
    [coords, settings.calculationMethod, settings.school],
  );

  // A switch labelled with a concept is worth less than one labelled with
  // a time. No coordinates means a dash, never a zero and never (0,0).
  const mark = (value: string | undefined) => (value ? clock(value) : '—');

  /**
   * Dynamic colours drive both the app and the widget from the OS, so
   * the accent row is not shown at all in that mode — the same rule
   * Settings follows, and the reason the shelf itself never has to ask.
   */
  const dynamicColours =
    settings.appearance === 'system' &&
    settings.useSystemDynamicTheme &&
    (Platform.OS === 'android' || Platform.OS === 'ios');

  const alertsOn = settings.notificationsEnabled;

  return (
    <OnboardingFrame
      progress={progress}
      topRow={
        <QuietAction
          testID="onboarding-personalise-skip"
          align="end"
          label={t('onboarding.skip', 'Skip')}
          onPress={onAdvance}
        />
      }
      footer={
        <PrimaryAction
          testID="onboarding-personalise-done"
          label={t('common.done', 'Done')}
          onPress={onAdvance}
        />
      }>
      <OnboardingHeading
        title={t('onboarding.personalise.title', 'Make it yours')}
        body={t('onboarding.personalise.body', 'None of this is required.')}
      />

      {/* No "Remind me before" here. It is a preference by the shelf's own
          test and the spec lists it among the seven — but it lives on the
          alerts screen, one tap back, beside the permission it depends on.
          Offering it on two consecutive screens is the redundancy the
          shelf exists to avoid. */}

      <SettingsGroup title={t('onboarding.personalise.groupTimes', 'Times')}>
        <SettingsToggleRow
          testID="personalise-sunrise"
          title={t('settings.sunriseTime', 'Sunrise')}
          value={settings.sunriseEnabled}
          onValueChange={v => updateSettings({ sunriseEnabled: v })}
        />
        <SettingsToggleRow
          testID="personalise-midnight"
          title={t('settings.islamicMidnight', 'Islamic Midnight')}
          help={mark(night?.Midnight)}
          value={settings.islamicMidnightEnabled}
          onValueChange={v => updateSettings({ islamicMidnightEnabled: v })}
        />
        <SettingsToggleRow
          testID="personalise-last-third"
          title={t('settings.lastThird', 'Last Third of the Night')}
          help={mark(night?.Lastthird)}
          value={settings.lastThirdEnabled}
          onValueChange={v => updateSettings({ lastThirdEnabled: v })}
        />
      </SettingsGroup>

      {alertsOn ? (
        <SettingsGroup title={t('onboarding.personalise.groupDaily', 'Daily')}>
          <SettingsToggleRow
            testID="personalise-adhkar"
            title={t('onboarding.personalise.adhkar', 'Morning & evening adhkār')}
            // One habit, one switch, two keys. They are both window-derived
            // — after Fajr before sunrise, after ʿAṣr before sunset — so
            // neither needs a time picker, which is the whole reason this
            // can be a row rather than a page.
            value={
              settings.morningDuaReminderEnabled &&
              settings.eveningDuaReminderEnabled
            }
            onValueChange={v =>
              updateSettings({
                morningDuaReminderEnabled: v,
                eveningDuaReminderEnabled: v,
              })
            }
          />
        </SettingsGroup>
      ) : null}

      {/* Titled with the tab's own name rather than "Reading": the row
          changes what a surah opens as, and the place to change it again
          later is the Qur'an's own settings. The title is the signpost. */}
      <SettingsGroup title={t('nav.quran', 'Quran')}>
        <SettingsToggleRow
          testID="personalise-verse-by-verse"
          title={t('quran.verseByVerse', 'Verse-by-verse view')}
          // The one row on this shelf whose subject the user has not seen
          // yet — they have not opened the reader, so "verse-by-verse"
          // names a thing rather than describing one. The help line does
          // the describing, and says what it is BESIDE so that leaving it
          // off does not read as leaving the translation out entirely.
          help={t('onboarding.personalise.verseByVerseHelp', {
            defaultValue:
              'A second way to read a surah: each verse with its translation under it, beside the mushaf page.',
          })}
          value={settings.quranVerseByVerseEnabled}
          onValueChange={v => updateSettings({ quranVerseByVerseEnabled: v })}
        />
      </SettingsGroup>

      <SettingsGroup title={t('onboarding.personalise.groupLook', 'Look')}>
        <SettingsBlock>
          <Text style={[typeStyle('label'), styles.label, { color: palette.muted }]}>
            {t('onboarding.personalise.theme', 'Theme')}
          </Text>
          <SegmentedControl
            accessibilityLabel={t('onboarding.personalise.theme', 'Theme')}
            segments={
              [
                { key: 'system', label: t('settings.themeSystem') },
                { key: 'light', label: t('settings.themeLight') },
                { key: 'dark', label: t('settings.themeDark') },
              ] as ReadonlyArray<{ key: AppearancePreference; label: string }>
            }
            value={settings.appearance}
            onChange={appearance => updateSettings({ appearance })}
          />
        </SettingsBlock>
        {dynamicColours ? null : (
          <SettingsBlock>
            <Text
              style={[typeStyle('label'), styles.label, { color: palette.muted }]}>
              {t('onboarding.personalise.accent', 'Accent')}
            </Text>
            {/* The same control Settings has, custom colours and all:
                somebody setting the app up for the first time is exactly
                who is most likely to want a colour of their own, and for
                a while they were the one person who could not have it.
                Smaller here — this is one row in a shelf of preferences,
                not a card about accents. */}
            <AccentShelf size={36} testIDPrefix="personalise-accent" />
          </SettingsBlock>
        )}
      </SettingsGroup>

    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: SPACING.sm },
});
