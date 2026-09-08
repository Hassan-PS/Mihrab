import { memo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLiveActivitySettings } from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import { isMacCatalyst } from '../../responsive/breakpoints';
import {
  SettingsBlock,
  SettingsGroup,
  SettingsToggleRow,
} from './SettingsGroup';
import { sharedSettingsStyles as s } from './sharedStyles';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE } from '../../theme/typography';
import { HelpText } from '../../components/ui/InfoSheet';
import {
  LIVE_ACTIVITY_DESIGNS,
  liveActivityDesignSupport,
  type LiveActivityDesign,
  type LiveActivityRenderer,
} from '../../settings/liveActivityDesign';

// tokens-ok: the previews are miniatures of a system notification, drawn at a third of its size
type LADesign = LiveActivityDesign;

/**
 * A miniature of the card the phone WILL draw — per design and per native
 * builder, from the same source as the builder (see liveActivityDesign.ts).
 *
 * ── WHAT IS DRAWN, AND WHY IT LOOKS LIKE THIS ─────────────────────────
 *
 * Every card on API 36+ is a standard notification template: a header
 * line (app icon, app name, the sub-text, and — where the builder asks for
 * it — the platform's own chronometer counting down at the right), a title,
 * and a body. The previews used to sketch a generic "bar with seven equal
 * segments" and a big countdown that no Android version renders; these
 * follow the builders:
 *
 *   timeline  (36/37)  title = prayer name; body = ProgressStyle bar over
 *                      the NEXT THREE events, segments sized by the time
 *                      between them, filled to now; chronometer in header;
 *                      sub-text = the prayer's clock time.
 *   markers   (36/37)  the same bar with a point at each event and a
 *                      tracker icon at now.
 *   countdown (36)     title = the countdown at minute resolution ("2:18"),
 *                      text = "Maghrib · 22:12", plain progress bar; the
 *                      chronometer also ticks in the header.
 *   countdown (37)     MetricStyle: title = prayer name; a metric row
 *                      "At 22:12 | In 2:18:42" the system ticks; no header
 *                      chronometer.
 *   legacy    (<36)    one card regardless of design: "Maghrib · 22:12" with
 *                      "↓ 2h 18m | 52%" and a plain bar.
 */
function DesignPreview({
  design,
  renderer,
  accent,
  text,
  muted,
  surface,
}: {
  design: LADesign;
  renderer: LiveActivityRenderer;
  accent: string;
  text: string;
  muted: string;
  surface: string;
}) {
  const header = (chronometer: boolean, subText?: string) => (
    <View style={styles.pvHeader}>
      <View style={[styles.pvAppIcon, { backgroundColor: accent }]} />
      <Text style={[styles.pvHeaderText, { color: muted }]} numberOfLines={1}>
        {subText ? `Mihrab · ${subText}` : 'Mihrab'}
      </Text>
      {chronometer ? (
        <Text style={[styles.pvHeaderText, styles.pvChrono, { color: muted }]}>2:18:42</Text>
      ) : null}
    </View>
  );

  if (renderer === 'legacy') {
    return (
      <View style={[styles.preview, { backgroundColor: surface }]}>
        {header(false)}
        <View style={styles.pvRow}>
          <Text style={[styles.pvTitle, { color: text }]}>Maghrib · 22:12</Text>
          <Text style={[styles.pvSmall, { color: muted }]}>↓ 2h 18m | 52%</Text>
        </View>
        <PlainBar accent={accent} muted={muted} pct={0.52} />
      </View>
    );
  }

  if (design === 'countdown') {
    if (renderer === 'android17') {
      return (
        <View style={[styles.preview, { backgroundColor: surface }]}>
          {header(false)}
          <Text style={[styles.pvTitle, { color: text }]}>Maghrib</Text>
          <View style={styles.pvMetrics}>
            <View style={styles.pvMetric}>
              <Text style={[styles.pvSmall, { color: muted }]}>At</Text>
              <Text style={[styles.pvMetricValue, { color: text }]}>22:12</Text>
            </View>
            <View style={[styles.pvMetricDivider, { backgroundColor: muted }]} />
            <View style={styles.pvMetric}>
              <Text style={[styles.pvSmall, { color: muted }]}>In</Text>
              <Text style={[styles.pvMetricValue, { color: accent }]}>2:18:42</Text>
            </View>
          </View>
        </View>
      );
    }
    return (
      <View style={[styles.preview, { backgroundColor: surface }]}>
        {header(true)}
        <Text style={[styles.pvBig, { color: text }]}>2:18</Text>
        <Text style={[styles.pvSmall, { color: muted }]}>Maghrib · 22:12</Text>
        <PlainBar accent={accent} muted={muted} pct={0.52} />
      </View>
    );
  }

  // timeline / markers: the next three events, sized by the time between
  // them — Maghrib in 2h 18m, then Isha, then tomorrow's Fajr.
  const segments = [0.35, 0.25, 0.4];
  const filled = 0.2; // of the whole bar: part-way through the first gap
  return (
    <View style={[styles.preview, { backgroundColor: surface }]}>
      {header(true, '22:12')}
      <Text style={[styles.pvTitle, { color: text }]}>Maghrib</Text>
      <View style={styles.pvBarRow}>
        {segments.map((w, i) => (
          <View key={i} style={[styles.pvSeg, { flex: w }]}>
            <View style={[styles.pvSegTrack, { backgroundColor: muted }]} />
            {i === 0 ? (
              <View
                style={[
                  styles.pvSegFill,
                  { backgroundColor: accent, width: `${(filled / w) * 100}%` },
                ]}
              />
            ) : null}
            {design === 'markers' ? (
              <View style={[styles.pvPoint, { backgroundColor: i === 0 ? accent : muted }]} />
            ) : null}
          </View>
        ))}
        {design === 'markers' ? (
          <View
            style={[
              styles.pvTracker,
              { left: `${filled * 100}%`, backgroundColor: accent },
            ]}
          />
        ) : null}
      </View>
    </View>
  );
}

function PlainBar({ accent, muted, pct }: { accent: string; muted: string; pct: number }) {
  return (
    <View style={[styles.pvPlain, { backgroundColor: muted }]}>
      <View style={[styles.pvPlainFill, { backgroundColor: accent, width: `${pct * 100}%` }]} />
    </View>
  );
}

/**
 * Live Activity card — task #128.
 *
 * Master toggle pins an ongoing notification (Android) or starts an ActivityKit
 * Live Activity (iOS). On Android the user can also pick between designs
 * (all keep the status-bar chip + always-on display) — where the phone's
 * Android can draw them. Below API 36 the native builder draws one card
 * whatever the setting says, so the picker is shown disabled with the card
 * it will actually get (`liveActivityDesignSupport`).
 *
 * Off by default — existing users see no change unless they opt in.
 */
function LiveActivityCardImpl() {
  const { t } = useTranslation();
  const { slice: settings, update } = useLiveActivitySettings();
  const { palette } = useAppPalette();

  // Mac Catalyst has no Live Activity surface, so hide the whole card there.
  if (isMacCatalyst) return null;

  // Coerce any legacy stored value to the current options.
  const design: LADesign =
    settings.liveActivityDesign === 'countdown'
      ? 'countdown'
      : settings.liveActivityDesign === 'markers'
        ? 'markers'
        : 'timeline';

  const options: { id: LADesign; labelKey: string }[] = LIVE_ACTIVITY_DESIGNS.map(id => ({
    id,
    labelKey:
      id === 'timeline'
        ? 'settings.laDesignTimeline'
        : id === 'markers'
          ? 'settings.laDesignMarkers'
          : 'settings.laDesignCountdown',
  }));
  // What this phone's Android can draw. `Platform.Version` is the API
  // level on Android; the picker is Android-only, so the iOS string never
  // reaches this.
  const support = liveActivityDesignSupport(
    typeof Platform.Version === 'number' ? Platform.Version : 0,
  );

  return (
    <SettingsGroup
      title={t('settings.liveActivity')}
      footer={
        Platform.OS === 'ios'
          ? t('settings.liveActivityExperimental')
          : undefined
      }>
      <SettingsToggleRow
        title={t('settings.liveActivity')}
        help={t('settings.liveActivityHelp')}
        value={settings.liveActivityEnabled}
        onValueChange={v => update({ liveActivityEnabled: v })}
      />

      {/* Design picker — Android only (the iOS Live Activity has its own,
          fixed layout). Shown when the Live Activity is enabled. */}
      {Platform.OS === 'android' && settings.liveActivityEnabled ? (
        <SettingsBlock>
          <Text style={[s.label, { color: palette.muted }]}>
            {t('settings.laDesignLabel', { defaultValue: 'Style' })}
          </Text>
          <View style={styles.optionRow}>
            {options.map(opt => {
              const enabled = support.enabled[opt.id];
              // Nothing is "selected" where nothing is drawn differently.
              const selected = enabled && design === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, disabled: !enabled }}
                  disabled={!enabled}
                  onPress={() => update({ liveActivityDesign: opt.id })}
                  style={[
                    styles.option,
                    {
                      borderColor: selected ? palette.accent : palette.border,
                      backgroundColor: selected ? palette.accentBg : 'transparent',
                      borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
                    },
                    !enabled && styles.optionDisabled,
                  ]}>
                  <DesignPreview
                    design={opt.id}
                    // A disabled option shows what the design looks like on
                    // an Android that has it, so the label means something.
                    renderer={support.stylesSupported ? support.renderer : 'android16'}
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
                      defaultValue:
                        opt.id === 'countdown'
                          ? 'Countdown'
                          : opt.id === 'markers'
                            ? 'Markers'
                            : 'Timeline',
                    })}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {!support.stylesSupported ? (
            <>
              {/* What this phone draws instead — one card, whatever the
                  setting says. */}
              <View style={styles.legacyWrap}>
                <DesignPreview
                  design="timeline"
                  renderer="legacy"
                  accent={palette.accent as string}
                  text={palette.text as string}
                  muted={palette.muted as string}
                  surface={palette.bg as string}
                />
              </View>
              <HelpText
                text={t('settings.laDesignNeedsAndroid16')}
                title={t('settings.laDesignLabel', { defaultValue: 'Style' })}
                color={palette.muted}
                style={styles.legacyHelp}
              />
            </>
          ) : null}
        </SettingsBlock>
      ) : null}

      {/* Lock-screen button — Android only. The card has room for two
          actions and the other one, muting the next adhan, is the one
          people reach for; someone who has decided the card belongs on
          their lock screen is carrying a button they will never press. */}
      {Platform.OS === 'android' && settings.liveActivityEnabled ? (
        <SettingsToggleRow
          title={t('settings.laLockButtonLabel', {
            defaultValue: 'Lock-screen button',
          })}
          help={t('settings.laLockButtonHelp', {
            defaultValue:
              'Show a button on the card for hiding it from the lock screen and always-on display.',
          })}
          value={settings.liveActivityLockButton !== false}
          onValueChange={v => update({ liveActivityLockButton: v })}
        />
      ) : null}
    </SettingsGroup>
  );
}

export const LiveActivityCard = memo(LiveActivityCardImpl);

const styles = StyleSheet.create({
  optionRow: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.sm },
  option: {
    flex: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  optionDisabled: { opacity: 0.45 },
  optionLabel: { fontSize: TYPE.footnote.fontSize, fontWeight: '600' },
  legacyWrap: { marginTop: SPACING.md },
  legacyHelp: { fontSize: TYPE.footnote.fontSize, marginTop: SPACING.sm },
  // The miniature card. Its smallest type is deliberately below the app's
  // smallest token: it is a picture of a notification at a third of its
  // size, not text to be read.
  preview: {
    width: '100%',
    minHeight: 64,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    justifyContent: 'center',
    gap: 3,
  },
  pvHeader: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pvAppIcon: { width: 8, height: 8, borderRadius: 2 },
  pvHeaderText: { fontSize: 8, fontWeight: '500', flexShrink: 1 },
  pvChrono: { marginStart: 'auto', fontVariant: ['tabular-nums'] },
  pvRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 4,
  },
  pvTitle: { fontSize: TYPE.label.fontSize, fontWeight: '700' },
  pvBig: {
    fontSize: TYPE.title2.fontSize,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    lineHeight: 24,
  },
  pvSmall: { fontSize: 9, fontWeight: '500' },
  pvMetrics: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: 2 },
  pvMetric: { gap: 1 },
  pvMetricValue: {
    fontSize: TYPE.footnote.fontSize,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  pvMetricDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', opacity: 0.5 },
  pvBarRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4, height: 10 },
  pvSeg: { height: 10, justifyContent: 'center' },
  pvSegTrack: { height: 4, borderRadius: 2, opacity: 0.3 },
  pvSegFill: { position: 'absolute', left: 0, height: 4, borderRadius: 2 },
  pvPoint: { position: 'absolute', right: -2, width: 5, height: 5, borderRadius: RADIUS.full },
  pvTracker: {
    position: 'absolute',
    top: 0,
    width: 10,
    height: 10,
    borderRadius: RADIUS.full,
    marginStart: -5,
  },
  pvPlain: { height: 4, borderRadius: 2, opacity: 0.6, marginTop: 4 },
  pvPlainFill: { height: 4, borderRadius: 2 },
});
