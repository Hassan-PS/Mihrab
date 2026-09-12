/**
 * Screen 5 — make it yours.  ·  NEW
 *
 * The shelf. Not a question, and the design has to say so without a
 * sentence: questions are one per screen with the question as the
 * headline; preferences are rows in a list. A user who has answered four
 * things and is then handed a list understands, without being told, that
 * the important part is over.
 *
 * ── WHY THESE SEVEN ROWS AND NOT SEVENTY ──────────────────────────────
 *
 * A preference earns a row only if all three hold (remake §2): it is off
 * or neutral by default so skipping costs nothing, it is discoverable
 * nowhere obvious, and it can be decided in one glance. `firstThirdEnabled`
 * fails the third — it is the subtlest of the night marks and needs the
 * explanation Settings gives it. `clockFormat` fails the first two: 'auto'
 * follows the phone and is right.
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
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import {
  usePrayerSettings,
  useWidgetSettings,
} from '../../context/PrayerSettingsContext';
import { useClockFormatter } from '../../hooks/useClockFormatter';
import {
  SettingsBlock,
  SettingsGroup,
  SettingsLinkRow,
  SettingsToggleRow,
} from '../../screens/settings/SettingsGroup';
import { PreReminderModal } from '../../screens/settings/PreReminderModal';
import { SegmentedControl } from '../../components/ui';
import {
  APP_ACCENT_SWATCHES,
  widgetPatchForAccent,
} from '../../settings/widgetAccent';
import type {
  AppAccentId,
  AppearancePreference,
} from '../../settings/types';
import type { PrePrayerReminderMinutes } from '../../settings/prePrayerReminder';
import { RADIUS, SPACING } from '../../theme/tokens';
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
  const { palette, isDark } = useAppPalette();
  const { settings, updateSettings } = usePrayerSettings();
  const { update: updateWidget } = useWidgetSettings();
  const clock = useClockFormatter();
  const [preModal, setPreModal] = useState(false);

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
   * Accent is unified with the widget highlight (#127), so the app and
   * the home screen do not disagree about the colour the user just chose.
   * Skipped under dynamic colours, where the OS drives both and the row
   * is not shown at all.
   */
  const dynamicColours =
    settings.appearance === 'system' &&
    settings.useSystemDynamicTheme &&
    (Platform.OS === 'android' || Platform.OS === 'ios');

  const setAccent = (id: AppAccentId) => {
    updateSettings({ appAccentId: id });
    if (!dynamicColours) updateWidget(widgetPatchForAccent(id));
  };

  const alertsOn = settings.notificationsEnabled;

  const minutesLabel =
    settings.prePrayerReminderMinutes === 0
      ? t('settings.prePrayerReminderOff', 'Off')
      : t('settings.prePrayerReminderOption', {
          count: settings.prePrayerReminderMinutes,
        });

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

      {alertsOn ? (
        <SettingsGroup title={t('onboarding.personalise.groupAlerts', 'Alerts')}>
          <SettingsLinkRow
            testID="personalise-pre-reminder"
            title={t('onboarding.alerts.preReminder', 'Remind me before')}
            value={minutesLabel}
            onPress={() => setPreModal(true)}
          />
        </SettingsGroup>
      ) : null}

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
            help={t('duaReminders.morningHelp')}
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
            <View style={styles.swatchRow}>
              {APP_ACCENT_SWATCHES.map(sw => {
                const selected = settings.appAccentId === sw.id;
                return (
                  <Pressable
                    key={sw.id}
                    testID={`personalise-accent-${sw.id}`}
                    accessibilityRole="radio"
                    accessibilityLabel={t(`settings.accent_${sw.id}`, sw.id)}
                    accessibilityState={{ checked: selected }}
                    onPress={() => setAccent(sw.id)}
                    style={[
                      styles.swatch,
                      {
                        backgroundColor: isDark ? sw.dark : sw.light,
                        borderColor: selected ? palette.accent : palette.border,
                        borderWidth: selected ? 3 : 2,
                      },
                    ]}
                  />
                );
              })}
            </View>
          </SettingsBlock>
        )}
      </SettingsGroup>

      <PreReminderModal
        visible={preModal}
        current={settings.prePrayerReminderMinutes}
        palette={palette}
        onSelect={(minutes: PrePrayerReminderMinutes) => {
          updateSettings({ prePrayerReminderMinutes: minutes });
          setPreModal(false);
        }}
        onClose={() => setPreModal(false)}
      />
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: SPACING.sm },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
  },
});
