import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ColorValue,
  type ListRenderItem,
} from 'react-native';
import {
  MAINSTREAM_PRAYER_PROVIDERS,
  PRAYER_DATA_PROVIDERS,
  REGIONAL_PRAYER_PROVIDERS,
  getProviderLabel,
} from '../settings/providersCatalog';
import {
  AUTO_DEFAULT_OUTSIDE_SWEDEN,
  getEffectiveDataProvider,
  resolveCoordsFromSettings,
} from '../settings/effectiveProvider';
import {
  isRegionalProvider,
  regionalProviderCovers,
} from '../settings/regionalProviders';
import type {
  PrayerAppSettings,
  PrayerDataProviderId,
} from '../settings/types';
import { useSystemNavigationReserve } from '../navigation/tabBarInset';
import { cardEdgeStyle, rowDividerStyle } from '../theme/chrome';

type Palette = {
  card: ColorValue;
  text: ColorValue;
  muted: ColorValue;
  border: ColorValue;
  bg: ColorValue;
  overlay: ColorValue;
  flatChrome: boolean;
  accent: ColorValue;
  accentBg: ColorValue;
  danger: ColorValue;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  settings: PrayerAppSettings;
  updateSettings: (patch: Partial<PrayerAppSettings>) => void;
  palette: Palette;
};

type ListItem =
  | { kind: 'auto' }
  | { kind: 'section'; title: string }
  | { kind: 'provider'; id: PrayerDataProviderId }
  | { kind: 'footer'; text: string };

function keyExtractor(item: ListItem): string {
  if (item.kind === 'auto') return 'auto';
  if (item.kind === 'section') return `section-${item.title}`;
  if (item.kind === 'footer') return 'footer';
  return `provider-${item.id}`;
}

function ProviderPickerModalImpl({
  visible,
  onClose,
  settings,
  updateSettings,
  palette,
}: Props) {
  const { t } = useTranslation();
  const navigationReserve = useSystemNavigationReserve();
  /**
   * WHAT THIS LIST USED TO NOT SAY.
   *
   * A national source only holds tables for its own country. Pick Sweden
   * from Cairo and nothing warns you, nothing fails, and the app quietly
   * serves AlAdhan instead — `getEffectiveDataProvider` redirects rather
   * than mapping Cairo to the nearest Swedish city, which is the right
   * call and was completely invisible. The row said Sweden, the times
   * were AlAdhan's, and the two never met.
   *
   * So the list is told where the user is. One row is marked as the one
   * that fits, and any national source that has no tables where they are
   * says so on its own row, before it is picked rather than after.
   */
  const coords = useMemo(
    () => resolveCoordsFromSettings(settings),
    [settings],
  );
  const preferred = useMemo(
    () =>
      coords
        ? getEffectiveDataProvider(true, settings.dataProvider, coords)
        : null,
    [coords, settings.dataProvider],
  );
  const fallbackLabel = getProviderLabel(AUTO_DEFAULT_OUTSIDE_SWEDEN);
  const listData = useMemo<ListItem[]>(
    () => [
      { kind: 'auto' },
      { kind: 'section', title: t('provider.sectionMainstream') },
      ...MAINSTREAM_PRAYER_PROVIDERS.map(p => ({
        kind: 'provider' as const,
        id: p.id,
      })),
      { kind: 'section', title: t('provider.sectionRegional') },
      ...REGIONAL_PRAYER_PROVIDERS.map(p => ({
        kind: 'provider' as const,
        id: p.id,
      })),
      { kind: 'footer', text: t('provider.footer') },
    ],
    [t],
  );

  // Memoised renderItem so FlatList doesn't recreate row components on every
  // settings change. Captures everything via deps; stable as long as none of
  // them change identity.
  const renderItem = useCallback<ListRenderItem<ListItem>>(
    ({ item }) => {
      if (item.kind === 'section') {
        return (
          <View style={[styles.sectionHeader, rowDividerStyle(palette)]}>
            <Text style={[styles.sectionTitle, { color: palette.muted }]}>
              {item.title}
            </Text>
          </View>
        );
      }
      if (item.kind === 'footer') {
        return (
          <View style={styles.footerWrap}>
            <Text style={[styles.footerText, { color: palette.muted }]}>
              {item.text}
            </Text>
          </View>
        );
      }
      if (item.kind === 'auto') {
        const selected = settings.dataProviderAuto;
        const autoNow =
          preferred != null
            ? t('provider.autoNow', {
                defaultValue: 'Where you are now, that is {{label}}.',
                label: getProviderLabel(preferred),
              })
            : null;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('provider.autoTitle')}
            accessibilityState={{ selected }}
            style={[
              styles.row,
              rowDividerStyle(palette),
              selected && { backgroundColor: palette.bg },
            ]}
            onPress={() => {
              updateSettings({ dataProviderAuto: true });
              onClose();
            }}
          >
            <Text style={[styles.rowTitle, { color: palette.text }]}>
              {t('provider.autoTitle')}
            </Text>
            <Text style={[styles.rowSub, { color: palette.muted }]}>
              {autoNow ?? t('provider.autoSub')}
            </Text>
          </Pressable>
        );
      }
      const opt = PRAYER_DATA_PROVIDERS.find(o => o.id === item.id)!;
      const selected =
        !settings.dataProviderAuto && settings.dataProvider === item.id;
      const name = t(opt.nameKey, { defaultValue: opt.name });
      const desc = t(opt.descriptionKey, { defaultValue: opt.description });
      const fits = preferred != null && preferred === item.id;
      // Only a NATIONAL source can be out of range — the worldwide ones
      // have an answer for every coordinate. And only when the location is
      // known: with none, the user's pick stands and so does its row.
      const outOfRegion =
        coords != null &&
        isRegionalProvider(item.id) &&
        !regionalProviderCovers(item.id, coords);
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={name}
          accessibilityState={{ selected }}
          style={[
            styles.row,
            rowDividerStyle(palette),
            selected && { backgroundColor: palette.bg },
          ]}
          onPress={() => {
            updateSettings({
              dataProvider: item.id,
              dataProviderAuto: false,
            });
            onClose();
          }}
        >
          <View style={styles.titleRow}>
            <Text style={[styles.rowTitle, { color: palette.text }]}>
              {name}
            </Text>
            {fits ? (
              <View
                style={[styles.badge, { backgroundColor: palette.accentBg }]}>
                <Text style={[styles.badgeLabel, { color: palette.accent }]}>
                  {t('provider.bestHere', 'Fits where you are')}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.rowSub, { color: palette.muted }]}>{desc}</Text>
          {outOfRegion ? (
            <Text style={[styles.rowWarn, { color: palette.danger }]}>
              {t('provider.outOfRegion', {
                defaultValue:
                  'No times for where you are — {{fallback}} would be used instead.',
                fallback: fallbackLabel,
              })}
            </Text>
          ) : null}
        </Pressable>
      );
    },
    [
      palette,
      settings.dataProviderAuto,
      settings.dataProvider,
      coords,
      preferred,
      fallbackLabel,
      t,
      updateSettings,
      onClose,
    ],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={[styles.modalFill, { backgroundColor: palette.overlay }]}
          onPress={onClose}
        />
        <View
          style={[
            styles.modalSheet,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
            // The sheet sits on the window's bottom edge, which under
            // edge-to-edge is behind the system's navigation. Without this the
            // last row of the list is under the navigation bar and cannot be
            // tapped.
            { paddingBottom: navigationReserve },
          ]}
        >
          <Text style={[styles.modalTitle, { color: palette.text }]}>
            {t('provider.modalTitle')}
          </Text>
          <FlatList
            data={listData}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
          />
        </View>
      </View>
    </Modal>
  );
}

/** Memo'd. Modal content tree is rebuilt only when its 5 props change. */
export const ProviderPickerModal = memo(ProviderPickerModalImpl);

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalFill: {
    ...StyleSheet.absoluteFillObject,
  },
  modalSheet: {
    maxHeight: '78%',
    borderTopStartRadius: 16,
    borderTopEndRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  sectionHeader: {
    paddingTop: 12,
    paddingBottom: 6,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  footerWrap: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingBottom: 20,
  },
  footerText: {
    fontSize: 12,
    lineHeight: 17,
  },
  row: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgeLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  rowWarn: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  rowSub: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
});
