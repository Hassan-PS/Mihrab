import { memo, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { GlassSurface } from '../../components/GlassSurface';
import { cardEdgeStyle } from '../../theme/chrome';
import {
  TABULAR_MAX_FONT_SCALE,
  tabularNumeralStyle,
} from '../../theme/textScale';
import { formatCountdown, formatLocalTime } from '../../utils/prayerTimes';
import { HOME_CARD_PADDING, HOME_CARD_RADIUS } from './tokens';

/**
 * Hero card showing the next prayer + countdown.
 *
 * **The performance win of task #8 lives here:** this is the *only* component
 * that subscribes to a per-30s clock tick. The previous HomeScreen god-component
 * called `setNow(...)` every 30 seconds, forcing the entire 800-line tree to
 * re-render — day carousel, prayer rows, provider footer, banners. By isolating
 * `now` here, only this card re-renders on tick. `React.memo` ensures the card
 * doesn't re-render when its parent re-renders for unrelated reasons (e.g.,
 * `nextInfo` changes only when a prayer passes).
 */
type NextPrayerCardProps = {
  /** Next prayer's name and absolute Date. Pass null to hide the card. */
  nextInfo: { name: string; at: Date } | null;
};

function NextPrayerCardImpl({ nextInfo }: NextPrayerCardProps) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Track which announcement boundaries we've already crossed so we only fire
  // each one once per upcoming-prayer cycle. Reset whenever the prayer changes.
  const lastNameRef = useRef<string | null>(null);
  const lastBoundaryRef = useRef<5 | 1 | 0 | null>(null);

  if (!nextInfo) return null;

  const remainingSeconds = Math.max(
    0,
    Math.floor((nextInfo.at.getTime() - now.getTime()) / 1000),
  );
  const remainingMinutes = Math.floor(remainingSeconds / 60);

  // Cross-platform live announcement at the 5-min and 1-min boundaries +
  // when the prayer time arrives. iOS doesn't honour `accessibilityLiveRegion`,
  // so we explicitly call announceForAccessibility. The `accessibilityLiveRegion`
  // attribute below covers Android.
  if (lastNameRef.current !== nextInfo.name) {
    lastNameRef.current = nextInfo.name;
    lastBoundaryRef.current = null;
  }
  let nextBoundary: 5 | 1 | 0 | null = null;
  if (remainingMinutes <= 0) nextBoundary = 0;
  else if (remainingMinutes <= 1) nextBoundary = 1;
  else if (remainingMinutes <= 5) nextBoundary = 5;
  if (
    nextBoundary !== null &&
    nextBoundary !== lastBoundaryRef.current &&
    (lastBoundaryRef.current === null ||
      nextBoundary < lastBoundaryRef.current)
  ) {
    lastBoundaryRef.current = nextBoundary;
    const prayerName = t(`prayer.${nextInfo.name}`);
    AccessibilityInfo.isScreenReaderEnabled()
      .then(enabled => {
        if (!enabled) return;
        AccessibilityInfo.announceForAccessibility(
          nextBoundary === 0
            ? `${prayerName} ${formatLocalTime(nextInfo.at)}`
            : t('home.nextIn', { time: formatCountdown(remainingSeconds) }) +
                ` — ${prayerName}`,
        );
      })
      .catch(() => {});
  }

  return (
    <GlassSurface
      intensity="thick"
      // Calm neutral hero (task #37): the surface is an elevated neutral card,
      // not a saturated accent block. Colour is carried only by the countdown
      // numerals + the small "in …" chip, per "the app shouldn't shout".
      fallbackColor={palette.card}
      accessibilityLiveRegion="polite"
      accessibilityRole="text"
      accessibilityLabel={`${t('home.nextPrayer')}: ${t(`prayer.${nextInfo.name}`)} ${formatLocalTime(nextInfo.at)} — ${t('home.nextIn', { time: formatCountdown(remainingSeconds) })}`}
      style={[
        styles.card,
        {
          borderRadius: HOME_CARD_RADIUS,
          padding: HOME_CARD_PADDING,
          ...cardEdgeStyle(palette),
        },
      ]}>
      <Text style={[styles.label, { color: palette.muted }]}>
        {t('home.nextPrayer')}
      </Text>
      <Text
        style={[styles.name, { color: palette.text }]}
        numberOfLines={1}>
        {t(`prayer.${nextInfo.name}`)}
      </Text>
      <Text
        style={[styles.time, tabularNumeralStyle, { color: palette.accent }]}
        numberOfLines={1}
        // Note: do NOT use `adjustsFontSizeToFit` here — combined with the
        // tabular-nums fontVariant, iOS in some locales (Arabic in particular)
        // mismeasures the text and shrinks it to ~10pt, causing the hero
        // time to disappear entirely. The string "12:50" / "12:50 AM"
        // comfortably fits at 64pt on every supported phone width, and
        // maxFontSizeMultiplier already caps system-level text scaling.
        maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}
        // Override the parent's RTL flow on the time — clock numerals are
        // a logical Latin-style left-to-right unit ("12:50") regardless of
        // app language, and the iOS Arabic font's bidi handling can otherwise
        // collapse the line.
        accessibilityLanguage="en-US">
        {formatLocalTime(nextInfo.at)}
      </Text>
      <View style={styles.countdownRow}>
        <View
          style={[styles.countdownPill, { backgroundColor: palette.accentBg }]}>
          <Text
            style={[
              styles.countdown,
              tabularNumeralStyle,
              { color: palette.accent },
            ]}
            maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
            {t('home.nextIn', { time: formatCountdown(remainingSeconds) })}
          </Text>
        </View>
      </View>
    </GlassSurface>
  );
}

export const NextPrayerCard = memo(NextPrayerCardImpl);

const styles = StyleSheet.create({
  card: { overflow: 'hidden', alignItems: 'center' },
  label: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  // Prayer name sits above the time as the secondary identifier — the time
  // itself is the focal point of the card per CLAUDE.md's "calm before
  // clever / one focal point per screen" principle.
  name: {
    fontSize: 22,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 2,
  },
  // Hero time — large tabular numerals so the user can read it from a
  // glance away. `lineHeight` left undefined so iOS uses the system
  // glyph-aware default (font ascender + descender), avoiding clipping
  // when the device font's metrics differ from a hand-tuned line height.
  // `letterSpacing` removed for the same reason — iOS rendering of the
  // tabular-nums variant interacts oddly with negative letter spacing
  // in some locales (caused the time to collapse in Arabic).
  time: {
    fontSize: 64,
    fontWeight: '700',
    textAlign: 'center',
  },
  countdownRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  countdownPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  countdown: { fontSize: 14, fontWeight: '500' },
});
