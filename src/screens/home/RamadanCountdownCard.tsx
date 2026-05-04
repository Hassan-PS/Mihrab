import { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { cardEdgeStyle } from '../../theme/chrome';
import { CrescentIcon } from '../../theme/icons';
import {
  TABULAR_MAX_FONT_SCALE,
  tabularNumeralStyle,
} from '../../theme/textScale';
import {
  getNextRamadanEvent,
  type RamadanCountdownEvent,
} from '../../ramadan/countdown';
import { computeSeasonalTreatment } from '../../seasonal/treatments';
import type { TimingsMap } from '../../types/prayer';
import { formatCountdown, formatLocalTime } from '../../utils/prayerTimes';
import { HOME_CARD_PADDING, HOME_CARD_RADIUS } from './tokens';

/**
 * Suhoor / Iftar countdown — visible only during Ramadan.
 *
 * The component is gated by `computeSeasonalTreatment().ramadan` (Hijri-based
 * detection from `src/hijri/`), so it's a no-op for the other ~11 months of
 * the year. During Ramadan it shows:
 *
 *   • before Imsak: "Suhoor ends in HH:MM" — countdown to Imsak.
 *   • between Imsak and Maghrib: "Iftar in HH:MM" — countdown to Maghrib.
 *   • between Maghrib and tomorrow's Imsak: "Suhoor in HH:MM" using tomorrow's Imsak.
 *
 * Like NextPrayerCard, the 30-second tick lives inside this component so the
 * surrounding HomeScreen does not re-render every minute. The card honours
 * the same tabular numerals + font-scale clamping conventions as the hero.
 *
 * Returns null silently when:
 *   • not Ramadan (gated by seasonal treatment).
 *   • Imsak / Maghrib data is missing (provider hasn't returned them yet).
 *   • after Maghrib without tomorrow's data (caller should re-fetch).
 */
type RamadanCountdownCardProps = {
  today: TimingsMap;
  tomorrow: TimingsMap | undefined;
};

function RamadanCountdownCardImpl({
  today,
  tomorrow,
}: RamadanCountdownCardProps) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Gate: only render during Ramadan. We compute the seasonal treatment off the
  // same `now` value so a midnight rollover off Ramadan removes the card.
  const treatment = useMemo(
    () => computeSeasonalTreatment(today, tomorrow, now),
    [today, tomorrow, now],
  );

  const event: RamadanCountdownEvent | null = useMemo(
    () => (treatment.ramadan ? getNextRamadanEvent(today, tomorrow, now) : null),
    [treatment.ramadan, today, tomorrow, now],
  );

  if (!treatment.ramadan || !event) return null;

  const remainingSeconds = Math.max(
    0,
    Math.floor((event.at.getTime() - now.getTime()) / 1000),
  );
  const labelKey =
    event.type === 'suhoor' ? 'ramadan.suhoorIn' : 'ramadan.iftarIn';
  const eventNameKey =
    event.type === 'suhoor' ? 'ramadan.suhoor' : 'ramadan.iftar';

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`${t(eventNameKey)} ${formatLocalTime(event.at)} — ${t(labelKey, { time: formatCountdown(remainingSeconds) })}`}
      style={[
        styles.card,
        {
          backgroundColor: palette.card,
          borderRadius: HOME_CARD_RADIUS,
          padding: HOME_CARD_PADDING,
          ...cardEdgeStyle(palette),
        },
      ]}>
      <View style={styles.headerRow}>
        <CrescentIcon color={palette.accentSolid} size={18} />
        <Text style={[styles.label, { color: palette.muted }]}>
          {t('ramadan.title')}
        </Text>
      </View>
      <View style={styles.row}>
        <Text
          style={[styles.name, { color: palette.text }]}
          numberOfLines={1}
          adjustsFontSizeToFit>
          {t(eventNameKey)}
        </Text>
        <Text
          style={[styles.time, tabularNumeralStyle, { color: palette.accent }]}
          maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
          {formatLocalTime(event.at)}
        </Text>
      </View>
      <View style={styles.countdownRow}>
        <View style={[styles.pill, { backgroundColor: palette.accentBg }]}>
          <Text
            style={[
              styles.countdown,
              tabularNumeralStyle,
              { color: palette.accent },
            ]}
            maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
            {t(labelKey, { time: formatCountdown(remainingSeconds) })}
          </Text>
        </View>
      </View>
    </View>
  );
}

export const RamadanCountdownCard = memo(RamadanCountdownCardImpl);

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  name: { fontSize: 26, fontWeight: '700', flex: 1 },
  time: { fontSize: 22, fontWeight: '700' },
  countdownRow: { marginTop: 10, flexDirection: 'row' },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  countdown: { fontSize: 14, fontWeight: '500' },
});
