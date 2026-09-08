import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View, type ColorValue } from 'react-native';
import { getEffectiveDataProvider } from '../settings/effectiveProvider';
import { getProviderLabel } from '../settings/providersCatalog';
import type { PrayerAppSettings } from '../settings/types';
import { cardEdgeStyle } from '../theme/chrome';
import { ProviderPickerModal } from './ProviderPickerModal';
import { RADIUS, SPACING } from '../theme/tokens';
import { TYPE } from '../theme/typography';

type Palette = {
  card: ColorValue;
  text: ColorValue;
  muted: ColorValue;
  border: ColorValue;
  bg: ColorValue;
  overlay: ColorValue;
  accent: ColorValue;
  accentBg: ColorValue;
  danger: ColorValue;
  flatChrome: boolean;
};

type Props = {
  settings: PrayerAppSettings;
  updateSettings: (patch: Partial<PrayerAppSettings>) => void;
  coords: { latitude: number; longitude: number } | null;
  palette: Palette;
};

export function ProviderSourceHeader({
  settings,
  updateSettings,
  coords,
  palette,
}: Props) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const effective = getEffectiveDataProvider(
    settings.dataProviderAuto,
    settings.dataProvider,
    coords,
  );

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('provider.timesSource')}
        accessibilityHint={t('a11y.openTimesSource')}
        onPress={() => setPickerOpen(true)}
        style={[
          styles.bar,
          {
            backgroundColor: palette.card,
            ...cardEdgeStyle(palette),
          },
        ]}>
        <View style={styles.barText}>
          <Text style={[styles.kicker, { color: palette.muted }]}>
            {t('provider.timesSource')}
          </Text>
          <Text style={[styles.title, { color: palette.text }]}>
            {getProviderLabel(effective)}
          </Text>
          {settings.dataProviderAuto ? (
            <Text style={[styles.sub, { color: palette.muted }]}>
              {t('provider.automaticByLocation')}
            </Text>
          ) : null}
        </View>
        <Text style={[styles.chevron, { color: palette.accent }]}>▾</Text>
      </Pressable>

      <ProviderPickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        settings={settings}
        updateSettings={updateSettings}
        palette={{
          card: palette.card,
          text: palette.text,
          muted: palette.muted,
          border: palette.border,
          bg: palette.bg,
          overlay: palette.overlay,
          flatChrome: palette.flatChrome,
          accent: palette.accent,
          accentBg: palette.accentBg,
          danger: palette.danger,
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginBottom: SPACING.lg,
  },
  barText: {
    flex: 1,
    paddingEnd: SPACING.sm,
  },
  kicker: {
    fontSize: TYPE.label.fontSize,
    fontWeight: '600',
    marginBottom: 2,
  },
  title: {
    fontSize: TYPE.body.fontSize,
    fontWeight: '600',
  },
  sub: {
    fontSize: TYPE.label.fontSize,
    marginTop: 2,
  },
  chevron: {
    fontSize: TYPE.title3.fontSize,
    fontWeight: '600',
  },
});
