/**
 * Screen 6 — ready.
 *
 * Not a summary of what was chosen. The user's own day: their city, their
 * times, the prayer that is actually next — and then three links to the
 * things most people change after this, each landing on the page that
 * owns it. The flow ends by handing them the app rather than a door to
 * it. This is what replaces the four-slide feature tour.
 *
 * ── WHY THIS IS NOT `TodayCard` ITSELF ────────────────────────────────
 *
 * The spec asked for the real Home card here, and it is worth recording
 * why it is not, so nobody "fixes" this by pasting a prop bag.
 *
 * `TodayCard` takes `week`, `past`, `nextInfo`, `resetKey` and a dozen
 * more, all assembled inside `HomeScreen` — a memo that filters the
 * optional non-prayer rows by four toggles, injects the Mālikī second
 * times over past-plus-week and splits them apart again, and a watchdog
 * that recomputes the next prayer on a thirty-second tick. A second call
 * site building its own version of that is precisely the disagreement to
 * avoid: two screens deciding which prayer is next, two ways.
 *
 * The honest fix is to lift that assembly into a `useTodayCardProps()`
 * hook that both screens call — and that is a refactor of the most
 * delicate screen in the app, which should not ride along inside an
 * onboarding change. Until it happens, this screen shows the same real
 * times from the same on-device computation the three screens before it
 * used, and `getNextPrayerDisplay` — the very function the Home watchdog
 * calls — decides what is next. What the user sees is their own day.
 * What it is not is a second copy of Home's derivations.
 */
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { usePrayerSettings } from '../../context/PrayerSettingsContext';
import { useClockFormatter } from '../../hooks/useClockFormatter';
import {
  SettingsGroup,
  SettingsLinkRow,
} from '../../screens/settings/SettingsGroup';
import { getNextPrayerDisplay } from '../../utils/prayerTimes';
import { RADIUS, SPACING } from '../../theme/tokens';
import { typeStyle } from '../../theme/typography';
import { tabularNumeralStyle } from '../../theme/textScale';
import type { RootStackParamList } from '../../navigation/types';
import { previewCoords, previewDay, PREVIEW_ROWS } from '../previewTimes';
import { OnboardingFrame, OnboardingHeading, PrimaryAction } from '../OnboardingChrome';

export function ReadyScreen({
  progress,
  onFinish,
}: {
  progress: { now: number; total: number } | null;
  onFinish: () => void;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const { settings } = usePrayerSettings();
  const clock = useClockFormatter();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const coords = useMemo(() => previewCoords(settings), [settings]);
  const day = useMemo(
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
   * Which of the five rows is next — today's, or none.
   *
   * Only the five: the computed day also carries Sunrise and Imsak, and
   * `getNextPrayerDisplay` is deliberately order-agnostic — it would name
   * Sunrise between Fajr and Ẓuhr, which this card has no row for, and the
   * highlight would go dark for the morning.
   *
   * No tomorrow is passed on purpose. After ʿIshāʾ the honest answer is
   * tomorrow's Fajr, and the only row this card could light for it is
   * TODAY's Fajr — a time that has been and gone. Lighting nothing is
   * right; Home has the day carousel for the rest.
   */
  const next = useMemo(() => {
    if (!day) return null;
    const five = Object.fromEntries(PREVIEW_ROWS.map(r => [r, day[r]]));
    return getNextPrayerDisplay(five, undefined, new Date());
  }, [day]);

  const city =
    settings.manualLocationLabel ?? settings.autoLocationLabel ?? undefined;

  /**
   * Leave the flow first, then go where the link points.
   *
   * `onFinish` is what writes `onboardingComplete`; a deep link that
   * skipped it would drop somebody into Settings with the auto-router
   * still waiting to pull them back into onboarding.
   */
  const goTo = (
    route: 'SettingsPrayerTimes' | 'SettingsNotifications' | 'SettingsWidgets',
  ) => {
    onFinish();
    navigation.navigate(route);
  };

  return (
    <OnboardingFrame
      progress={progress}
      footer={
        <PrimaryAction
          testID="onboarding-start"
          label={t('onboarding.start', 'Start')}
          onPress={onFinish}
        />
      }>
      <OnboardingHeading title={t('onboarding.ready.title', 'You’re ready')} />

      {day ? (
        <View
          style={[
            styles.card,
            { backgroundColor: palette.card, borderRadius: RADIUS.lg },
          ]}>
          {city ? (
            <Text
              style={[typeStyle('headline'), styles.city, { color: palette.text }]}>
              {t('onboarding.location.ready', {
                city,
                defaultValue: 'Today in {{city}}',
              })}
            </Text>
          ) : null}
          {PREVIEW_ROWS.map(row => {
            const isNext = next?.name === row;
            return (
              <View key={row} style={styles.row}>
                <Text
                  style={[
                    typeStyle('body'),
                    { color: isNext ? palette.accentSolid : palette.muted },
                  ]}>
                  {t(`prayer.${row}`, row)}
                </Text>
                <Text
                  style={[
                    typeStyle('body'),
                    tabularNumeralStyle,
                    { color: isNext ? palette.accentSolid : palette.text },
                  ]}>
                  {clock(day[row])}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      <Text style={[typeStyle('footnote'), styles.lead, { color: palette.muted }]}>
        {t('onboarding.ready.body', 'Most people change one of these next.')}
      </Text>

      <SettingsGroup>
        <SettingsLinkRow
          testID="onboarding-ready-method"
          title={t('onboarding.ready.method', 'Calculation method')}
          onPress={() => goTo('SettingsPrayerTimes')}
        />
        <SettingsLinkRow
          testID="onboarding-ready-alerts"
          title={t('onboarding.ready.alerts', 'Per-prayer alerts')}
          onPress={() => goTo('SettingsNotifications')}
        />
        <SettingsLinkRow
          testID="onboarding-ready-widgets"
          title={t('onboarding.ready.widgets', 'Widgets')}
          onPress={() => goTo('SettingsWidgets')}
        />
      </SettingsGroup>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    marginTop: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  city: { textAlign: 'center', marginBottom: SPACING.md },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
  lead: { textAlign: 'center', marginBottom: SPACING.sm },
});
