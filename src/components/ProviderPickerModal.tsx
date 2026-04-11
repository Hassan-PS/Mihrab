import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ColorValue,
} from 'react-native';
import {
  MAINSTREAM_PRAYER_PROVIDERS,
  PRAYER_DATA_PROVIDERS,
  REGIONAL_PRAYER_PROVIDERS,
} from '../settings/providersCatalog';
import type {
  PrayerAppSettings,
  PrayerDataProviderId,
} from '../settings/types';

type Palette = {
  card: ColorValue;
  text: ColorValue;
  muted: ColorValue;
  border: ColorValue;
  bg: ColorValue;
  overlay: ColorValue;
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

export function ProviderPickerModal({
  visible,
  onClose,
  settings,
  updateSettings,
  palette,
}: Props) {
  const { t } = useTranslation();
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

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable
          style={[styles.modalFill, { backgroundColor: palette.overlay }]}
          onPress={onClose}
        />
        <View
          style={[
            styles.modalSheet,
            { backgroundColor: palette.card, borderColor: palette.border },
          ]}>
          <Text style={[styles.modalTitle, { color: palette.text }]}>
            {t('provider.modalTitle')}
          </Text>
          <FlatList
            data={listData}
            keyExtractor={item => {
              if (item.kind === 'auto') {
                return 'auto';
              }
              if (item.kind === 'section') {
                return `section-${item.title}`;
              }
              if (item.kind === 'footer') {
                return 'footer';
              }
              return `provider-${item.id}`;
            }}
            renderItem={({ item }) => {
              if (item.kind === 'section') {
                return (
                  <View
                    style={[
                      styles.sectionHeader,
                      { borderBottomColor: palette.border },
                    ]}>
                    <Text
                      style={[styles.sectionTitle, { color: palette.muted }]}>
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
                return (
                  <Pressable
                    style={[
                      styles.row,
                      { borderBottomColor: palette.border },
                      selected && { backgroundColor: palette.bg },
                    ]}
                    onPress={() => {
                      updateSettings({ dataProviderAuto: true });
                      onClose();
                    }}>
                    <Text style={[styles.rowTitle, { color: palette.text }]}>
                      {t('provider.autoTitle')}
                    </Text>
                    <Text style={[styles.rowSub, { color: palette.muted }]}>
                      {t('provider.autoSub')}
                    </Text>
                  </Pressable>
                );
              }
              const opt = PRAYER_DATA_PROVIDERS.find(o => o.id === item.id)!;
              const selected =
                !settings.dataProviderAuto && settings.dataProvider === item.id;
              const desc = t(`providers.${item.id}.desc`, {
                defaultValue: opt.description,
              });
              return (
                <Pressable
                  style={[
                    styles.row,
                    { borderBottomColor: palette.border },
                    selected && { backgroundColor: palette.bg },
                  ]}
                  onPress={() => {
                    updateSettings({
                      dataProvider: item.id,
                      dataProviderAuto: false,
                    });
                    onClose();
                  }}>
                  <Text style={[styles.rowTitle, { color: palette.text }]}>
                    {opt.name}
                  </Text>
                  <Text style={[styles.rowSub, { color: palette.muted }]}>
                    {desc}
                  </Text>
                </Pressable>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

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
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
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
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  rowSub: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
});
