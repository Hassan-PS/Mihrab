// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import React, { memo } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { cardEdgeStyle, rowDividerStyle } from '../../theme/chrome';
import type { AppPalette } from '../../theme/appPalette';
import { MADHABS, type Madhab } from '../../prayer/madhab';
import { useSystemNavigationReserve } from '../../navigation/tabBarInset';
import { modalStyles } from './modalStyles';
import { sharedSettingsStyles as s } from './sharedStyles';

type Props = {
  visible: boolean;
  /** Null is Custom, and Custom is a state rather than a choice. */
  current: Madhab | null;
  palette: AppPalette;
  onSelect: (madhab: Madhab) => void;
  onClose: () => void;
};

/**
 * The school picker — issue #21.
 *
 * FOUR NAMES, TWO COMPUTED ANSWERS, and the sheet says so under the list
 * rather than letting the reader infer four different sets of times.
 * Shāfiʿī, Mālikī and Ḥanbalī take the same ʿaṣr shadow; what Mālikī adds
 * is the name at dawn and the offer of the second times. An app that
 * implies more fiqh than it computes is worse than one that says what it
 * does.
 *
 * Custom is not in the list. It is where you land by changing the shadow
 * by hand, and where every existing install starts — offering it as a
 * choice would invite somebody to pick "no school", which is not a thing
 * anyone means to do.
 */
export const MadhabModal = memo(function MadhabModal({
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
          accessibilityLabel={t('settings.madhab', 'School')}
          style={[
            modalStyles.sheet,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
            { paddingBottom: navigationReserve },
          ]}
        >
          <Text style={[modalStyles.title, { color: palette.text }]}>
            {t('settings.madhab', 'School')}
          </Text>
          {MADHABS.map(m => {
            const label = t(`settings.madhab_${m}`);
            return (
              <Pressable
                key={m}
                accessibilityRole="radio"
                accessibilityLabel={label}
                accessibilityState={{ selected: current === m }}
                style={[
                  modalStyles.row,
                  rowDividerStyle(palette),
                  current === m && { backgroundColor: palette.bg },
                ]}
                onPress={() => {
                  onSelect(m);
                  onClose();
                }}
              >
                <Text style={[modalStyles.rowLabel, { color: palette.text }]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
          <Text
            style={[s.help, { color: palette.muted, padding: 16, paddingTop: 12 }]}
          >
            {t('settings.madhabHelp')}
          </Text>
        </View>
      </View>
    </Modal>
  );
});
