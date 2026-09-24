// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { memo, useCallback, useEffect, useState } from 'react';
import {
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { usePrayerSettings } from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import { useClockFormatter } from '../../hooks/useClockFormatter';
import {
  SILENCE_PRAYERS,
  toggleSilencePrayer,
  type PrayerSilenceSettings,
  type SilencePrayer,
} from '../../settings/prayerSilence';
import {
  hasSilenceAccess,
  prayerSilenceAvailable,
  requestSilenceAccess,
} from '../../native/PrayerSilence';
import {
  SettingsBlock,
  SettingsGroup,
  SettingsToggleRow,
} from './SettingsGroup';
import { sharedSettingsStyles as s } from './sharedStyles';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';

/**
 * Settings → Notifications → "Silence the phone at prayer time" — issue #60.
 *
 * Android only, and only on a build that carries the module: iOS lets no
 * app touch silent mode or Focus, and a card that could only say so is
 * a card that should not be there.
 *
 * ── THE ACCESS ────────────────────────────────────────────────────────
 *
 * Turning Do Not Disturb on needs "Do Not Disturb access", which the
 * system grants on its own screen and this app can only open. So the
 * switch turns the feature on and sends the reader there; while the
 * access is missing the card says so, above everything else, with the
 * one button that fixes it — and asks again each time the app comes
 * back to the foreground, which is when the answer changes.
 *
 * The rest is the request as it was made: which prayers, how long
 * before the adhan, how long after — and Jumuʿah on its own, with its
 * own length and, for a mosque that holds it at a fixed time all year,
 * its own time.
 */
type Props = {
  onOpenLeadPicker: () => void;
  onOpenDurationPicker: () => void;
  onOpenJumuahDurationPicker: () => void;
  onOpenJumuahTimePicker: () => void;
};

function PrayerSilenceCardImpl({
  onOpenLeadPicker,
  onOpenDurationPicker,
  onOpenJumuahDurationPicker,
  onOpenJumuahTimePicker,
}: Props) {
  const { t } = useTranslation();
  const { settings, updateSettings } = usePrayerSettings();
  const { palette } = useAppPalette();
  const clock = useClockFormatter();
  const silence = settings.prayerSilence;
  const [access, setAccess] = useState<boolean | null>(null);

  const patch = useCallback(
    (part: Partial<PrayerSilenceSettings>) =>
      updateSettings({ prayerSilence: { ...silence, ...part } }),
    [silence, updateSettings],
  );

  // Re-asked whenever the app comes back: the reader was just sent to a
  // system screen, and what they did there is the whole question.
  useEffect(() => {
    if (!silence.enabled) return;
    let alive = true;
    const check = () => {
      void hasSilenceAccess().then(v => {
        if (alive) setAccess(v);
      });
    };
    check();
    const sub = AppState.addEventListener('change', st => {
      if (st === 'active') check();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, [silence.enabled]);

  const onToggle = useCallback(
    (on: boolean) => {
      patch({ enabled: on });
      if (on) {
        void hasSilenceAccess().then(v => {
          setAccess(v);
          if (!v) void requestSilenceAccess();
        });
      }
    },
    [patch],
  );

  if (Platform.OS !== 'android' || !prayerSilenceAvailable) return null;

  const jumuah = silence.prayers.includes('Jumuah');
  const prayerLabel = (p: SilencePrayer) => t(`prayer.${p}`);

  return (
    <SettingsGroup title={t('settings.silenceTitle')}>
      <SettingsToggleRow
        title={t('settings.silenceToggle')}
        help={t('settings.silenceHelp')}
        value={silence.enabled}
        onValueChange={onToggle}
        testID="settings-prayer-silence"
      />
      {silence.enabled ? (
        <SettingsBlock>
          {access === false ? (
            <View
              style={[
                styles.access,
                { borderColor: palette.danger, backgroundColor: palette.bg },
              ]}
            >
              <Text style={[s.help, { color: palette.text }]}>
                {t('settings.silenceAccessNeeded')}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('settings.silenceGrantAccess')}
                onPress={() => void requestSilenceAccess()}
                style={styles.accessButton}
              >
                <Text style={[s.changeLink, { color: palette.accent }]}>
                  {t('settings.silenceGrantAccess')}
                </Text>
              </Pressable>
            </View>
          ) : null}
          <View style={styles.block}>
            <Text style={[s.label, { color: palette.muted }]}>
              {t('settings.silencePrayers')}
            </Text>
            <View
              style={styles.chipRow}
              accessibilityRole="none"
              accessibilityLabel={t('settings.silencePrayers')}
            >
              {SILENCE_PRAYERS.map(p => {
                const on = silence.prayers.includes(p);
                return (
                  <Pressable
                    key={p}
                    accessibilityRole="checkbox"
                    accessibilityLabel={prayerLabel(p)}
                    accessibilityState={{ checked: on }}
                    onPress={() =>
                      patch({
                        prayers: toggleSilencePrayer(silence.prayers, p),
                      })
                    }
                    style={[
                      styles.chip,
                      {
                        backgroundColor: on ? palette.accentBg : 'transparent',
                        borderColor: on ? palette.accentSolid : palette.border,
                      },
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.chipLabel,
                        { color: on ? palette.accentSolid : palette.muted },
                      ]}
                    >
                      {prayerLabel(p)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('settings.silenceLead')}
              style={[s.rowPress, styles.pickRow]}
              onPress={onOpenLeadPicker}
            >
              <View>
                <Text style={[s.label, { color: palette.muted }]}>
                  {t('settings.silenceLead')}
                </Text>
                <Text style={[s.valueText, { color: palette.text }]}>
                  {silence.leadMinutes === 0
                    ? t('settings.silenceAtAdhan')
                    : t('settings.prePrayerReminderOption', {
                        count: silence.leadMinutes,
                      })}
                </Text>
              </View>
              <Text style={[s.changeLink, { color: palette.accent }]}>
                {t('common.change')}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('settings.silenceDuration')}
              style={[s.rowPress, styles.pickRow]}
              onPress={onOpenDurationPicker}
            >
              <View>
                <Text style={[s.label, { color: palette.muted }]}>
                  {t('settings.silenceDuration')}
                </Text>
                <Text style={[s.valueText, { color: palette.text }]}>
                  {t('settings.silenceAfterAdhan', {
                    duration: t('settings.minutesOption', {
                      count: silence.durationMinutes,
                    }),
                  })}
                </Text>
              </View>
              <Text style={[s.changeLink, { color: palette.accent }]}>
                {t('common.change')}
              </Text>
            </Pressable>

            {jumuah ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('settings.silenceJumuahDuration')}
                  style={[s.rowPress, styles.pickRow]}
                  onPress={onOpenJumuahDurationPicker}
                >
                  <View>
                    <Text style={[s.label, { color: palette.muted }]}>
                      {t('settings.silenceJumuahDuration')}
                    </Text>
                    <Text style={[s.valueText, { color: palette.text }]}>
                      {t('settings.silenceAfterAdhan', {
                        duration: t('settings.minutesOption', {
                          count: silence.jumuahDurationMinutes,
                        }),
                      })}
                    </Text>
                  </View>
                  <Text style={[s.changeLink, { color: palette.accent }]}>
                    {t('common.change')}
                  </Text>
                </Pressable>
                <SettingsToggleRow
                  title={t('settings.silenceJumuahFixed')}
                  help={t('settings.silenceJumuahFixedHelp')}
                  value={silence.jumuahTime != null}
                  onValueChange={v => patch({ jumuahTime: v ? '13:00' : null })}
                />
                {silence.jumuahTime != null ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('settings.silenceJumuahTime')}
                    style={[s.rowPress, styles.pickRow]}
                    onPress={onOpenJumuahTimePicker}
                  >
                    <View>
                      <Text style={[s.label, { color: palette.muted }]}>
                        {t('settings.silenceJumuahTime')}
                      </Text>
                      <Text style={[s.valueText, { color: palette.text }]}>
                        {clock(silence.jumuahTime)}
                      </Text>
                    </View>
                    <Text style={[s.changeLink, { color: palette.accent }]}>
                      {t('common.change')}
                    </Text>
                  </Pressable>
                ) : null}
              </>
            ) : null}
          </View>
        </SettingsBlock>
      ) : null}
    </SettingsGroup>
  );
}

export const PrayerSilenceCard = memo(PrayerSilenceCardImpl);

const styles = StyleSheet.create({
  block: { gap: SPACING.md },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
  },
  chipLabel: { fontSize: TYPE.footnote.fontSize, fontWeight: '600' },
  pickRow: { marginTop: SPACING.xs },
  access: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  accessButton: {
    alignSelf: 'flex-start',
    minHeight: 32,
    justifyContent: 'center',
  },
});
