import React, { memo } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { cardEdgeStyle, rowDividerStyle } from '../../theme/chrome';
import type { AppPalette } from '../../theme/appPalette';
import {
  NOTIFICATION_SOUND_OPTIONS,
  type NotificationSoundId,
} from '../../notifications/notificationSounds';
import {
  previewAdhanSound,
  stopAdhanPreview,
} from '../../notifications/prayerNotifications';
import { modalStyles } from './modalStyles';

type Props = {
  visible: boolean;
  currentSound: NotificationSoundId;
  previewingId: NotificationSoundId | null;
  palette: AppPalette;
  onSelect: (id: NotificationSoundId) => void;
  onSetPreviewingId: (id: NotificationSoundId | null) => void;
  onClose: () => void;
};

export const SoundPickerModal = memo(function SoundPickerModal({
  visible,
  currentSound,
  previewingId,
  palette,
  onSelect,
  onSetPreviewingId,
  onClose,
}: Props) {
  const { t } = useTranslation();

  const handleClose = () => {
    stopAdhanPreview().catch(() => {});
    onSetPreviewingId(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}>
      <View style={modalStyles.root}>
        <Pressable
          style={[modalStyles.fill, { backgroundColor: palette.overlay }]}
          onPress={handleClose}
        />
        <View
          style={[
            modalStyles.sheet,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          <Text style={[modalStyles.title, { color: palette.text }]}>
            {t('settings.notificationSoundModalTitle')}
          </Text>
          <FlatList
            data={NOTIFICATION_SOUND_OPTIONS}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <Pressable
                style={[
                  modalStyles.row,
                  rowDividerStyle(palette),
                  currentSound === item.id && { backgroundColor: palette.bg },
                ]}
                onPress={() => {
                  stopAdhanPreview().catch(() => {});
                  onSetPreviewingId(null);
                  onSelect(item.id);
                  onClose();
                }}>
                <View style={modalStyles.soundRowContent}>
                  <View style={modalStyles.soundRowText}>
                    <Text style={[modalStyles.rowLabel, { color: palette.text }]}>
                      {t(item.labelKey)}
                    </Text>
                    <Text style={[modalStyles.rowSub, { color: palette.muted }]}>
                      {t(item.helpKey)}
                    </Text>
                  </View>
                  {item.id !== 'default' && (
                    <Pressable
                      hitSlop={10}
                      onPress={e => {
                        e.stopPropagation();
                        if (previewingId === item.id) {
                          stopAdhanPreview().catch(() => {});
                          onSetPreviewingId(null);
                        } else {
                          onSetPreviewingId(item.id);
                          previewAdhanSound(item.id).catch(() => {
                            onSetPreviewingId(null);
                          });
                        }
                      }}
                      style={[
                        modalStyles.soundPreviewBtn,
                        { borderColor: palette.border },
                      ]}>
                      <Text
                        style={[
                          modalStyles.soundPreviewIcon,
                          { color: palette.accent },
                        ]}>
                        {previewingId === item.id ? '■' : '▶'}
                      </Text>
                    </Pressable>
                  )}
                </View>
              </Pressable>
            )}
          />
        </View>
      </View>
    </Modal>
  );
});
