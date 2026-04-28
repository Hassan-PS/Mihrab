import React, { memo } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { cardEdgeStyle, rowDividerStyle } from '../../theme/chrome';
import type { AppPalette } from '../../theme/appPalette';
import { PRE_PRAYER_REMINDER_OPTIONS } from '../../settings/prePrayerReminder';
import type { PrePrayerReminderMinutes } from '../../settings/prePrayerReminder';
import { modalStyles } from './modalStyles';

type Props = {
  visible: boolean;
  current: PrePrayerReminderMinutes;
  palette: AppPalette;
  onSelect: (minutes: PrePrayerReminderMinutes) => void;
  onClose: () => void;
};

export const PreReminderModal = memo(function PreReminderModal({
  visible,
  current,
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
          style={[modalStyles.fill, { backgroundColor: palette.overlay }]}
          onPress={onClose}
        />
        <View
          style={[
            modalStyles.sheet,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          <Text style={[modalStyles.title, { color: palette.text }]}>
            {t('settings.prePrayerReminderModalTitle')}
          </Text>
          <FlatList
            data={[...PRE_PRAYER_REMINDER_OPTIONS]}
            keyExtractor={item => String(item)}
            renderItem={({ item }) => (
              <Pressable
                style={[
                  modalStyles.row,
                  rowDividerStyle(palette),
                  current === item && { backgroundColor: palette.bg },
                ]}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}>
                <Text style={[modalStyles.rowLabel, { color: palette.text }]}>
                  {item === 0
                    ? t('settings.prePrayerReminderOff')
                    : t('settings.prePrayerReminderOption', { count: item })}
                </Text>
              </Pressable>
            )}
          />
        </View>
      </View>
    </Modal>
  );
});
