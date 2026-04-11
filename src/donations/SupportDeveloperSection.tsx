import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { AppPalette } from '../theme/appPalette';
import { cardEdgeStyle } from '../theme/chrome';
import { useTipDonation } from './useTipDonation';

type Props = {
  palette: AppPalette;
};

export function SupportDeveloperSection({ palette }: Props) {
  const { t } = useTranslation();
  const {
    product,
    loading,
    purchasing,
    error,
    thankYou,
    dismissThankYou,
    purchase,
  } = useTipDonation();

  const priceLabel = product?.localizedPrice ?? product?.price ?? null;
  const canBuy = !!product && !loading && !purchasing;

  return (
    <View>
      <Text style={[styles.sectionTitle, { color: palette.muted }]}>
        {t('support.section')}
      </Text>
      <View
        style={[
          styles.card,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}>
        <Text style={[styles.valueText, { color: palette.text }]}>
          {t('support.title')}
        </Text>
        <Text style={[styles.help, { color: palette.muted }]}>
          {t('support.help')}
        </Text>

        {thankYou ? (
          <View style={styles.thankYouRow}>
            <Text style={[styles.thankYouText, { color: palette.accent }]}>
              {t('support.thankYou')}
            </Text>
            <Pressable onPress={dismissThankYou} hitSlop={8}>
              <Text style={[styles.dismissLink, { color: palette.muted }]}>
                {t('support.dismiss')}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={palette.accent} />
            <Text style={[styles.help, { color: palette.muted }]}>
              {t('support.loadingPrice')}
            </Text>
          </View>
        ) : null}

        {!loading && !product ? (
          <Text style={[styles.warnText, { color: palette.muted }]}>
            {t('support.unavailable')}
          </Text>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          disabled={!canBuy}
          onPress={() => void purchase()}
          style={[
            styles.buyBtn,
            { backgroundColor: palette.accent },
            !canBuy && styles.buyBtnDisabled,
          ]}>
          {purchasing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buyBtnLabel}>
              {priceLabel
                ? t('support.tipWithPrice', { price: priceLabel })
                : t('support.tip')}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 8,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    gap: 8,
  },
  valueText: {
    fontSize: 16,
    fontWeight: '500',
  },
  help: {
    fontSize: 13,
    lineHeight: 18,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  thankYouRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  thankYouText: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  dismissLink: {
    fontSize: 15,
  },
  warnText: {
    fontSize: 13,
    lineHeight: 18,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 14,
  },
  buyBtn: {
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buyBtnDisabled: {
    opacity: 0.45,
  },
  buyBtnLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
