import { memo } from 'react';
import { Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLiveActivitySettings } from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import { cardEdgeStyle } from '../../theme/chrome';
import { sharedSettingsStyles as s } from './sharedStyles';

type LADesign = 'timeline' | 'countdown';

/**
 * Mini mock of the Android Live Activity notification for each design, so the
 * user can see the difference before choosing. Not pixel-perfect — just enough
 * to convey the layout (timeline bar vs. big countdown).
 */
function DesignPreview({
  design,
  accent,
  text,
  muted,
  surface,
}: {
  design: LADesign;
  accent: string;
  text: string;
  muted: string;
  surface: string;
}) {
  if (design === 'countdown') {
    return (
      <View style={[styles.preview, { backgroundColor: surface }]}>
        <Text style={[styles.previewCountdown, { color: text }]}>2:18:42</Text>
        <Text style={[styles.previewSub, { color: muted }]}>Maghrib · 22:12</Text>
      </View>
    );
  }
  // timeline
  return (
    <View style={[styles.preview, { backgroundColor: surface }]}>
      <Text style={[styles.previewRow, { color: text }]}>Maghrib · 2:18</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { backgroundColor: accent }]} />
        <View style={[styles.dot, { left: '20%', backgroundColor: muted }]} />
        <View style={[styles.dot, { left: '45%', backgroundColor: accent }]} />
        <View style={[styles.dot, { left: '70%', backgroundColor: muted }]} />
        <View style={[styles.dot, { left: '90%', backgroundColor: muted }]} />
      </View>
    </View>
  );
}

/**
 * Live Activity card — task #128.
 *
 * Master toggle pins an ongoing notification (Android) or starts an ActivityKit
 * Live Activity (iOS). On Android the user can also pick between two designs
 * (both keep the status-bar chip + always-on display):
 *   • Timeline  — the prayer-day ProgressStyle timeline + inline countdown.
 *   • Countdown — a big countdown with the next prayer's name + time.
 *
 * Off by default — existing users see no change unless they opt in.
 */
function LiveActivityCardImpl() {
  const { t } = useTranslation();
  const { slice: settings, update } = useLiveActivitySettings();
  const { palette } = useAppPalette();

  // Coerce any legacy stored value to the current options.
  const design: LADesign =
    settings.liveActivityDesign === 'countdown' ? 'countdown' : 'timeline';

  const options: { id: LADesign; labelKey: string }[] = [
    { id: 'timeline', labelKey: 'settings.laDesignTimeline' },
    { id: 'countdown', labelKey: 'settings.laDesignCountdown' },
  ];

  return (
    <>
      <Text style={[s.sectionTitle, { color: palette.muted }]}>
        {t('settings.liveActivity')}
      </Text>

      <View
        style={[
          s.card,
          s.switchRow,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}>
        <View style={s.switchCopy}>
          <Text style={[s.valueText, { color: palette.text }]}>
            {t('settings.liveActivity')}
          </Text>
          <Text style={[s.help, { color: palette.muted }]}>
            {t('settings.liveActivityHelp')}
          </Text>
          {Platform.OS === 'ios' && (
            <Text
              style={[s.help, { color: palette.muted, fontStyle: 'italic' }]}>
              {t('settings.liveActivityExperimental')}
            </Text>
          )}
        </View>
        <Switch
          value={settings.liveActivityEnabled}
          trackColor={{ true: palette.accentSolid, false: '#9ca3af' }}
          thumbColor={'#ffffff'}
          onValueChange={v => update({ liveActivityEnabled: v })}
        />
      </View>

      {/* Design picker — Android only (the iOS Live Activity has its own,
          fixed layout). Shown when the Live Activity is enabled. */}
      {Platform.OS === 'android' && settings.liveActivityEnabled && (
        <View
          style={[
            s.card,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          <Text style={[s.label, { color: palette.muted }]}>
            {t('settings.laDesignLabel', { defaultValue: 'Style' })}
          </Text>
          <View style={styles.optionRow}>
            {options.map(opt => {
              const selected = design === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => update({ liveActivityDesign: opt.id })}
                  style={[
                    styles.option,
                    {
                      borderColor: selected ? palette.accent : palette.border,
                      backgroundColor: selected ? palette.accentBg : 'transparent',
                      borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
                    },
                  ]}>
                  <DesignPreview
                    design={opt.id}
                    accent={palette.accent as string}
                    text={palette.text as string}
                    muted={palette.muted as string}
                    surface={palette.bg as string}
                  />
                  <Text
                    style={[
                      styles.optionLabel,
                      { color: selected ? palette.accent : palette.text },
                    ]}>
                    {t(opt.labelKey, {
                      defaultValue: opt.id === 'countdown' ? 'Countdown' : 'Timeline',
                    })}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </>
  );
}

export const LiveActivityCard = memo(LiveActivityCardImpl);

const styles = StyleSheet.create({
  optionRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  option: {
    flex: 1,
    borderRadius: 12,
    padding: 8,
    alignItems: 'center',
    gap: 8,
  },
  optionLabel: { fontSize: 13, fontWeight: '600' },
  preview: {
    width: '100%',
    height: 64,
    borderRadius: 8,
    paddingHorizontal: 10,
    justifyContent: 'center',
    gap: 4,
  },
  previewCountdown: { fontSize: 22, fontWeight: '800', letterSpacing: 0.5 },
  previewSub: { fontSize: 11, fontWeight: '500' },
  previewRow: { fontSize: 13, fontWeight: '700' },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(127,127,127,0.25)',
    marginTop: 6,
    position: 'relative',
    justifyContent: 'center',
  },
  barFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '55%',
    borderRadius: 3,
  },
  dot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: -3,
  },
});
