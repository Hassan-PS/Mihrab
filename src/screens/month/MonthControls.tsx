// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { memo } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AppPalette } from '../../theme/appPalette';
import { getMethodLabel } from '../../settings/methods';
import { providerHidesCalculationMethod } from '../../settings/providerUi';
import { getProviderLabel } from '../../settings/providersCatalog';
import type { PrayerDataProviderId } from '../../settings/types';
import { RADIUS, SPACING } from '../../theme/tokens';
import { typeStyle } from '../../theme/typography';

/**
 * Header controls for MonthTimesScreen — task #64 split.
 *
 * Owns: month-navigation arrows, "This month" pill, "Refresh stored data"
 * pill (with progress %), Share toggle, meta line (provider + method +
 * cached-months), and inline progress / error indicators.
 *
 * Pure presentational — every action is a callback prop. The orchestrator
 * (MonthTimesScreen.tsx) owns state.
 */
type Props = {
  palette: AppPalette;
  monthTitle: string;
  isCurrentMonth: boolean;
  isShareView: boolean;
  effectiveProvider: PrayerDataProviderId;
  calculationMethod: number | 'auto';
  school: number;
  cacheStatus: { monthsStored: number; isExpired: boolean } | null;
  refreshingCache: boolean;
  refreshProgress: { current: number; total: number } | null;
  loading: boolean;
  error: string | null;
  onPrev: () => void;
  onNext: () => void;
  onThisMonth: () => void;
  onRefreshCache: () => void;
  onToggleShareView: () => void;
};

function MonthControlsImpl({
  palette,
  monthTitle,
  isCurrentMonth,
  isShareView,
  effectiveProvider,
  calculationMethod,
  school,
  cacheStatus,
  refreshingCache,
  refreshProgress,
  loading,
  error,
  onPrev,
  onNext,
  onThisMonth,
  onRefreshCache,
  onToggleShareView,
}: Props) {
  const { t } = useTranslation();

  return (
    <View
      style={[
        styles.controls,
        { backgroundColor: palette.bg, borderBottomColor: palette.border },
      ]}>
      <View style={styles.monthNav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={onPrev}
          hitSlop={16}
          style={styles.navHit}>
          <Text style={[styles.navArrow, { color: palette.accent }]}>‹</Text>
        </Pressable>
        <Text style={[styles.monthTitle, { color: palette.text }]}>
          {monthTitle}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.continue')}
          onPress={onNext}
          hitSlop={16}
          style={styles.navHit}>
          <Text style={[styles.navArrow, { color: palette.accent }]}>›</Text>
        </Pressable>
      </View>

      <View style={styles.actionsRow}>
        {!isCurrentMonth && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('month.thisMonth')}
            onPress={onThisMonth}
            style={[
              styles.pill,
              { backgroundColor: palette.card, borderColor: palette.border },
            ]}>
            <Text style={[styles.pillLabel, { color: palette.accent }]}>
              {t('month.thisMonth')}
            </Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('month.refreshData')}
          accessibilityState={{ busy: refreshingCache, disabled: refreshingCache }}
          onPress={onRefreshCache}
          disabled={refreshingCache}
          style={[
            styles.pill,
            {
              backgroundColor: palette.card,
              borderColor: palette.border,
              opacity: refreshingCache ? 0.5 : 1,
            },
          ]}>
          <Text style={[styles.pillLabel, { color: palette.muted }]}>
            {refreshingCache
              ? refreshProgress
                ? `${Math.round((refreshProgress.current / refreshProgress.total) * 100)}%`
                : '…'
              : t('month.refreshData')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('month.shareView', 'Share')}
          accessibilityState={{ selected: isShareView }}
          onPress={onToggleShareView}
          style={[
            styles.pill,
            {
              backgroundColor: isShareView ? palette.accentBg : palette.card,
              borderColor: isShareView ? palette.accent : palette.border,
            },
          ]}>
          <Text
            style={[
              styles.pillLabel,
              { color: isShareView ? palette.accent : palette.muted },
            ]}>
            {t('month.shareView', 'Share')}
          </Text>
        </Pressable>
      </View>

      <Text style={[styles.meta, { color: palette.muted }]}>
        {getProviderLabel(effectiveProvider)}
        {!providerHidesCalculationMethod(effectiveProvider)
          ? ` · ${getMethodLabel(calculationMethod)}`
          : ''}
        {effectiveProvider !== 'islamiska_forbundet' && school === 1
          ? ` · ${t('home.hanafiSuffix')}`
          : ''}
        {cacheStatus && !refreshingCache
          ? ` · ${cacheStatus.monthsStored}mo cached`
          : ''}
      </Text>

      {/* activity-indicator-allowed: small inline progress beside the
          "Refresh stored data" caption. The full-screen hydration loader
          uses a Skeleton; this is a 16x16 spinner during cache refill. */}
      {loading && (
        <ActivityIndicator style={{ marginTop: 8 }} color={palette.accent} />
      )}
      {error ? (
        <Text style={[styles.err, { color: palette.danger }]}>{error}</Text>
      ) : null}
    </View>
  );
}

export const MonthControls = memo(MonthControlsImpl);

const styles = StyleSheet.create({
  controls: {
    paddingHorizontal: SPACING.lg,
    paddingTop: Platform.OS === 'ios' ? SPACING.sm : SPACING.md,
    paddingBottom: 10, // tokens-ok-line: 10px sits between sm (8) and md (12) — lifted from iOS HIG header padding
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navHit: {
    minWidth: 44, // 44pt touch-target baseline (Apple HIG)
    alignItems: 'center',
    justifyContent: 'center',
  },
  navArrow: { ...typeStyle('display'), fontSize: 30, fontWeight: '300', lineHeight: 36 }, // tokens-ok-line: bespoke nav-arrow size between title1 and display
  monthTitle: typeStyle('title2'),
  actionsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    flexWrap: 'wrap',
  },
  pill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2, // tokens-ok-line: 6px is half the row height — between xs (4) and sm (8)
    borderRadius: RADIUS.md + 2, // tokens-ok-line: 14px softer pill curve
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillLabel: { ...typeStyle('caption'), fontWeight: '600' },
  meta: { ...typeStyle('caption'), marginTop: SPACING.sm, textAlign: 'center' },
  err: { ...typeStyle('footnote'), marginTop: SPACING.xs + 2, textAlign: 'center' },
});
