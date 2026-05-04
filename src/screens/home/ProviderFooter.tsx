import { memo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { cardEdgeStyle } from '../../theme/chrome';
import { getMethodLabel } from '../../settings/methods';
import { providerHidesCalculationMethod } from '../../settings/providerUi';
import { getProviderLabel } from '../../settings/providersCatalog';
import type { PrayerDataProviderId } from '../../settings/types';
import { HOME_TABLE_RADIUS } from './tokens';

/** Pressable footer showing provider, method/madhab, and location label. */
type ProviderFooterProps = {
  effectiveProvider: PrayerDataProviderId;
  calculationMethod: number | 'auto';
  school: number;
  dataProviderAuto: boolean;
  locationLabel: string;
  /** True while a silent background fetch is in flight (drives the small spinner). */
  backgroundRefreshing: boolean;
  onPress: () => void;
};

function ProviderFooterImpl({
  effectiveProvider,
  calculationMethod,
  school,
  dataProviderAuto,
  locationLabel,
  backgroundRefreshing,
  onPress,
}: ProviderFooterProps) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('provider.timesSource')}
      accessibilityHint={t('a11y.openTimesSource')}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.footer,
        {
          backgroundColor: palette.card,
          borderRadius: HOME_TABLE_RADIUS,
          ...cardEdgeStyle(palette),
        },
        pressed && { opacity: 0.75 }, hovered && { opacity: 0.92 },
      ]}>
      <View style={styles.body}>
        <Text style={[styles.kicker, { color: palette.muted }]}>
          {t('provider.timesSource').toUpperCase()}
        </Text>
        <Text
          style={[styles.label, { color: palette.text }]}
          numberOfLines={1}>
          {getProviderLabel(effectiveProvider)}
          {!providerHidesCalculationMethod(effectiveProvider)
            ? ` · ${getMethodLabel(calculationMethod)}`
            : ''}
          {effectiveProvider !== 'islamiska_forbundet' && school === 1
            ? ` · ${t('home.hanafiSuffix')}`
            : ''}
        </Text>
        {locationLabel ? (
          <Text
            style={[styles.sub, { color: palette.muted }]}
            numberOfLines={1}>
            {locationLabel}
            {dataProviderAuto
              ? ` · ${t('provider.automaticByLocation')}`
              : ''}
          </Text>
        ) : null}
      </View>
      <View style={styles.right}>
        {backgroundRefreshing && (
          // activity-indicator-allowed: 16x16 inline progress dot. Skeleton
          // doesn't fit a single chevron-row position; spinner is the right
          // affordance for transient background refresh.
          <ActivityIndicator
            size="small"
            color={palette.muted}
            accessibilityLabel={t('home.updatingLocation')}
          />
        )}
        <Text style={[styles.chevron, { color: palette.accent }]}>▾</Text>
      </View>
    </Pressable>
  );
}

export const ProviderFooter = memo(ProviderFooterImpl);

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: 8,
  },
  body: { flex: 1, gap: 2 },
  kicker: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },
  label: { fontSize: 14, fontWeight: '600' },
  sub: { fontSize: 12 },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chevron: { fontSize: 18, fontWeight: '600' },
});
