// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import React, { memo } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { cardEdgeStyle, rowDividerStyle } from '../../theme/chrome';
import type { AppPalette } from '../../theme/appPalette';
import {
  NOTIFICATION_SOUND_OPTIONS,
  type CustomAdhanSound,
  type NotificationSoundId,
} from '../../notifications/notificationSounds';
import { CUSTOM_ADHAN_SUPPORTED } from '../../native/CustomAdhan';
import { useSystemNavigationReserve } from '../../navigation/tabBarInset';
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
  /** The recording the user imported, or null when there is none yet. */
  customAdhan: CustomAdhanSound | null;
  /** True while the picker is open or the file is being converted. */
  importingCustom: boolean;
  onImportCustom: () => void;
  onRemoveCustom: () => void;
};

export const SoundPickerModal = memo(function SoundPickerModal({
  visible,
  currentSound,
  previewingId,
  palette,
  onSelect,
  onSetPreviewingId,
  onClose,
  customAdhan,
  importingCustom,
  onImportCustom,
  onRemoveCustom,
}: Props) {
  const { t } = useTranslation();
  const navigationReserve = useSystemNavigationReserve();

  // A build without the native module cannot import anything, so the row is
  // left out entirely rather than offered and then failing.
  const options = CUSTOM_ADHAN_SUPPORTED
    ? NOTIFICATION_SOUND_OPTIONS
    : NOTIFICATION_SOUND_OPTIONS.filter(option => option.id !== 'custom');

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
      onRequestClose={handleClose}
    >
      <View style={modalStyles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={[modalStyles.fill, { backgroundColor: palette.overlay }]}
          onPress={handleClose}
        />
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t('settings.notificationSoundModalTitle')}
          style={[
            modalStyles.sheet,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
            // The sheet sits on the window's bottom edge, which under
            // edge-to-edge is behind the system's navigation. Without this the
            // last row of the list is under the navigation bar and cannot be
            // tapped — which landed on the newly-added custom row, the one
            // entry a user is most likely to be reaching for.
            { paddingBottom: navigationReserve },
          ]}
        >
          <Text style={[modalStyles.title, { color: palette.text }]}>
            {t('settings.notificationSoundModalTitle')}
          </Text>
          <FlatList
            data={options}
            keyExtractor={item => item.id}
            renderItem={({ item }) => {
              const label = t(item.labelKey);
              const isPreviewing = previewingId === item.id;
              const isCustom = item.id === 'custom';
              // The custom row is the only one whose subtitle carries
              // information rather than instructions: once a file is imported
              // its name is what tells the user which recording this is.
              const subtitle = !isCustom
                ? t(item.helpKey)
                : importingCustom
                ? t('settings.notificationSoundCustomImporting')
                : customAdhan?.name ?? t(item.helpKey);
              // Nothing imported yet means this row is a button, not a
              // choice — selecting a sound that does not exist would schedule
              // a silent prayer.
              const isPlaceholder = isCustom && !customAdhan;
              const canPreview = !isPlaceholder && item.id !== 'default';
              return (
                <Pressable
                  accessibilityRole={isPlaceholder ? 'button' : 'radio'}
                  accessibilityLabel={label}
                  accessibilityState={
                    isPlaceholder
                      ? { disabled: importingCustom, busy: importingCustom }
                      : { selected: currentSound === item.id }
                  }
                  style={[
                    modalStyles.row,
                    rowDividerStyle(palette),
                    currentSound === item.id &&
                      !isPlaceholder && { backgroundColor: palette.bg },
                  ]}
                  onPress={() => {
                    stopAdhanPreview().catch(() => {});
                    onSetPreviewingId(null);
                    if (isPlaceholder) {
                      if (!importingCustom) onImportCustom();
                      return;
                    }
                    onSelect(item.id);
                    onClose();
                  }}
                >
                  <View style={modalStyles.soundRowContent}>
                    <View style={modalStyles.soundRowText}>
                      <Text
                        style={[modalStyles.rowLabel, { color: palette.text }]}
                      >
                        {label}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[modalStyles.rowSub, { color: palette.muted }]}
                      >
                        {subtitle}
                      </Text>
                      {isCustom && customAdhan?.trimmed && (
                        // Only iOS ever sets this. Saying so where the file is
                        // named beats letting someone wonder why their
                        // four-minute adhan stops.
                        <Text
                          style={[modalStyles.rowSub, { color: palette.muted }]}
                        >
                          {t('settings.notificationSoundCustomTrimmed')}
                        </Text>
                      )}
                    </View>
                    {isCustom && customAdhan && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t(
                          'settings.notificationSoundCustomRemove',
                        )}
                        hitSlop={10}
                        onPress={e => {
                          e.stopPropagation();
                          stopAdhanPreview().catch(() => {});
                          onSetPreviewingId(null);
                          onRemoveCustom();
                        }}
                        style={[
                          modalStyles.soundPreviewBtn,
                          { borderColor: palette.border },
                        ]}
                      >
                        <Text
                          style={[
                            modalStyles.soundPreviewIcon,
                            { color: palette.muted },
                          ]}
                        >
                          ✕
                        </Text>
                      </Pressable>
                    )}
                    {canPreview && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={
                          isPreviewing
                            ? t('common.tryAgain')
                            : `${t('settings.adhanPreviewTitle')}: ${label}`
                        }
                        accessibilityState={{ selected: isPreviewing }}
                        hitSlop={10}
                        onPress={e => {
                          e.stopPropagation();
                          if (isPreviewing) {
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
                        ]}
                      >
                        <Text
                          style={[
                            modalStyles.soundPreviewIcon,
                            { color: palette.accent },
                          ]}
                        >
                          {isPreviewing ? '■' : '▶'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </Pressable>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
});
