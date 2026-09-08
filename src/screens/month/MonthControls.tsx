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
import { Stepper } from '../../components/ui';
import type { AppPalette } from '../../theme/appPalette';
import { getMethodLabel } from '../../settings/methods';
import {
  providerHidesCalculationMethod,
  providerHidesHanafiAsr,
} from '../../settings/providerUi';
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
      {/* The same stepper the Log's day view uses (redesign-plan §2.6). The
          provenance line — provider, method, months stored — is its
          subtitle rather than a caption floating under two pills. */}
      <Stepper
        title={monthTitle}
        subtitle={
          getProviderLabel(effectiveProvider) +
          (!providerHidesCalculationMethod(effectiveProvider)
            ? ` · ${getMethodLabel(calculationMethod)}`
            : '') +
          // Not `!== 'islamiska_forbundet'`: Morocco publishes a single
          // schedule too, so a stored Hanafi setting must not caption a
          // table that does not vary by madhab.
          (!providerHidesHanafiAsr(effectiveProvider) && school === 1
            ? ` · ${t('home.hanafiSuffix')}`
            : '') +
          // `month.monthsStored` has been translated into all thirteen
          // languages since the screen was written.
          (cacheStatus && !refreshingCache
            ? ` · ${t('month.monthsStored', { count: cacheStatus.monthsStored })}`
            : '')
        }
        prevLabel={t('common.back')}
        nextLabel={t('common.continue')}
        onPrev={onPrev}
        onNext={onNext}
      />

      <View style={styles.actionsRow}>
        {!isCurrentMonth && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('month.thisMonth')}
            onPress={onThisMonth}
            style={styles.action}>
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
          style={[styles.action, { opacity: refreshingCache ? 0.5 : 1 }]}>
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
          style={[styles.action, isShareView && { backgroundColor: palette.accentBg }]}>
          <Text style={[styles.pillLabel, { color: palette.accent }]}>
            {t('month.shareView', 'Share')}
          </Text>
        </Pressable>
      </View>

      {/* activity-indicator-allowed: small inline progress beside the
          "Refresh stored data" caption. The full-screen hydration loader
          uses a Skeleton; this is a 16x16 spinner during cache refill. */}
      {loading && (
        <ActivityIndicator style={{ marginTop: SPACING.sm }} color={palette.accent} />
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
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
    flexWrap: 'wrap',
  },
  // Quiet text actions, not bordered pills under the title
  // (redesign-plan B.2.1): "Share" is the one that earns the accent.
  action: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    minHeight: 36,
    justifyContent: 'center',
  },
  pillLabel: { ...typeStyle('footnote'), fontWeight: '600' },
  err: { ...typeStyle('footnote'), marginTop: SPACING.xs + 2, textAlign: 'center' },
});
