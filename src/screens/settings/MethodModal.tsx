// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import React, { memo } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { cardEdgeStyle, rowDividerStyle } from '../../theme/chrome';
import type { AppPalette } from '../../theme/appPalette';
import { CALCULATION_METHODS } from '../../settings/methods';
import { modalStyles } from './modalStyles';

type Props = {
  visible: boolean;
  currentMethod: number | 'auto';
  palette: AppPalette;
  onSelect: (id: number | 'auto') => void;
  onClose: () => void;
};

export const MethodModal = memo(function MethodModal({
  visible,
  currentMethod,
  palette,
  onSelect,
  onClose,
}: Props) {
  const { t } = useTranslation();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}>
      <View style={modalStyles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={[modalStyles.fill, { backgroundColor: palette.overlay }]}
          onPress={onClose}
        />
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t('settings.methodModalTitle')}
          style={[
            modalStyles.sheet,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          <Text style={[modalStyles.title, { color: palette.text }]}>
            {t('settings.methodModalTitle')}
          </Text>
          <FlatList
            data={CALCULATION_METHODS}
            keyExtractor={item => String(item.id)}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="radio"
                accessibilityLabel={item.name}
                accessibilityState={{ selected: currentMethod === item.id }}
                style={[
                  modalStyles.row,
                  rowDividerStyle(palette),
                  currentMethod === item.id && { backgroundColor: palette.bg },
                ]}
                onPress={() => {
                  onSelect(item.id);
                  onClose();
                }}>
                <Text style={[modalStyles.rowLabel, { color: palette.text }]}>
                  {item.name}
                </Text>
              </Pressable>
            )}
          />
        </View>
      </View>
    </Modal>
  );
});
