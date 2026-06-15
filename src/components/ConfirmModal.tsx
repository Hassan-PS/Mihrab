import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppPalette } from '../hooks/useAppPalette';
import { cardEdgeStyle } from '../theme/chrome';

/**
 * ConfirmModal — a themed two-button confirmation dialog.
 *
 * Replaces the platform `Alert.alert` for in-app confirmations so the
 * prompt matches the app's palette, radii and typography instead of the
 * dated stock Material/UIKit dialog. Fully theme-aware (light / dark /
 * OLED / dynamic) via `useAppPalette`.
 */
type ConfirmModalProps = {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Tints the confirm button with the danger colour for risky actions. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { palette } = useAppPalette();
  const confirmBg = destructive ? palette.danger : palette.accent;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}>
      <Pressable
        style={[styles.scrim, { backgroundColor: palette.overlay }]}
        onPress={onCancel}>
        {/* Inner press is swallowed so taps on the sheet don't dismiss. */}
        <Pressable
          style={[
            styles.sheet,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}
          onPress={() => {}}>
          <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
          {message ? (
            <Text style={[styles.message, { color: palette.muted }]}>
              {message}
            </Text>
          ) : null}
          <View style={styles.buttonRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
              onPress={onCancel}
              style={({ pressed }) => [
                styles.btn,
                styles.cancelBtn,
                pressed && { opacity: 0.6 },
              ]}>
              <Text style={[styles.cancelLabel, { color: palette.muted }]}>
                {cancelLabel}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              onPress={onConfirm}
              style={({ pressed }) => [
                styles.btn,
                styles.confirmBtn,
                { backgroundColor: confirmBg },
                pressed && { opacity: 0.85 },
              ]}>
              <Text style={styles.confirmLabel}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  message: {
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 18,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 6,
  },
  btn: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    paddingHorizontal: 16,
    borderRadius: 22,
  },
  cancelLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  confirmBtn: {
    paddingHorizontal: 22,
    borderRadius: 22,
  },
  confirmLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
});
