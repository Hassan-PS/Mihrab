// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { memo } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { cardEdgeStyle, rowDividerStyle } from '../../theme/chrome';
import type { AppPalette } from '../../theme/appPalette';
import { useSystemNavigationReserve } from '../../navigation/tabBarInset';
import { modalStyles } from './modalStyles';

/**
 * "For how long?" — a sheet of durations in minutes.
 *
 * The sibling of `PreReminderModal`, which asks "how much warning" and
 * prints its numbers as "N min before". This one prints them as a
 * length — "30 min" — because that is the other question a window has:
 * not when it opens but how long it stays open. The list is the
 * caller's, since a daily prayer and a Jumuʿah are not the same length.
 */
type Props<T extends number> = {
  visible: boolean;
  title: string;
  options: readonly T[];
  current: T;
  palette: AppPalette;
  onSelect: (minutes: T) => void;
  onClose: () => void;
};

function MinutesPickerModalImpl<T extends number>({
  visible,
  title,
  options,
  current,
  palette,
  onSelect,
  onClose,
}: Props<T>) {
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
          accessibilityLabel={title}
          style={[
            modalStyles.sheet,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
            { paddingBottom: navigationReserve },
          ]}
        >
          <Text style={[modalStyles.title, { color: palette.text }]}>
            {title}
          </Text>
          <FlatList
            data={[...options]}
            keyExtractor={item => String(item)}
            renderItem={({ item }) => {
              const label = t('settings.minutesOption', { count: item });
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: current === item }}
                  style={[
                    modalStyles.row,
                    rowDividerStyle(palette),
                    current === item && { backgroundColor: palette.bg },
                  ]}
                  onPress={() => {
                    onSelect(item);
                    onClose();
                  }}
                >
                  <Text style={[modalStyles.rowLabel, { color: palette.text }]}>
                    {label}
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

export const MinutesPickerModal = memo(
  MinutesPickerModalImpl,
) as typeof MinutesPickerModalImpl;
