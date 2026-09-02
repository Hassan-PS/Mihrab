// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import React, { memo } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { cardEdgeStyle, rowDividerStyle } from '../../theme/chrome';
import type { AppPalette } from '../../theme/appPalette';
import type { AppLanguage } from '../../settings/types';
import { APP_LANGUAGES } from '../../i18n/languages';
import { useSystemNavigationReserve } from '../../navigation/tabBarInset';
import { modalStyles } from './modalStyles';

/** Shared with the share sheet's own picker — see `i18n/languages`. */
const LANGUAGES = APP_LANGUAGES;

type Props = {
  visible: boolean;
  current: AppLanguage;
  palette: AppPalette;
  onSelect: (lang: AppLanguage) => void;
  onClose: () => void;
};

export const LanguageModal = memo(function LanguageModal({
  visible,
  current,
  palette,
  onSelect,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const navigationReserve = useSystemNavigationReserve();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={modalStyles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={[modalStyles.fill, { backgroundColor: palette.overlay }]}
          onPress={onClose}
        />
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t('settings.language')}
          style={[
            modalStyles.sheet,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
            // The sheet sits on the window's bottom edge, which under
            // edge-to-edge is behind the system's navigation. Without this the
            // last row of the list is under the navigation bar and cannot be
            // tapped.
            { paddingBottom: navigationReserve },
          ]}
        >
          <Text style={[modalStyles.title, { color: palette.text }]}>
            {t('settings.language')}
          </Text>
          <FlatList
            data={LANGUAGES}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="radio"
                accessibilityLabel={item.label}
                accessibilityLanguage={item.id}
                accessibilityState={{ selected: current === item.id }}
                style={[
                  modalStyles.row,
                  rowDividerStyle(palette),
                  current === item.id && { backgroundColor: palette.bg },
                ]}
                onPress={() => {
                  onSelect(item.id);
                  onClose();
                }}
              >
                <Text style={[modalStyles.rowLabel, { color: palette.text }]}>
                  {item.label}
                </Text>
              </Pressable>
            )}
          />
        </View>
      </View>
    </Modal>
  );
});
