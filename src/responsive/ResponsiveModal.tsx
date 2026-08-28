/**
 * ResponsiveModal — one modal primitive that adapts to window size (task #33).
 *
 *   • COMPACT (phone)          → bottom sheet that slides up, full width,
 *                                rounded top corners, respects the safe-area
 *                                inset. The historical phone treatment.
 *   • REGULAR / EXPANDED       → a centered popover card, capped width, that
 *                                fades in over a dimmed backdrop — the natural
 *                                iPad / Mac desktop affordance.
 *
 * Tapping the backdrop closes. Content is caller-supplied; this component only
 * owns the container chrome (backdrop, card, positioning, animation).
 */
import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppPalette } from '../hooks/useAppPalette';
import { useBreakpoint } from './breakpoints';
import { RADIUS, SPACING } from '../theme/tokens';

type Props = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Popover width cap on wide windows. */
  maxWidth?: number;
  /** Accessibility label for the dismiss backdrop. */
  closeLabel?: string;
};

export function ResponsiveModal({
  visible,
  onClose,
  children,
  maxWidth = 460,
  closeLabel = 'Close',
}: Props) {
  const { palette } = useAppPalette();
  const insets = useSafeAreaInsets();
  const wide = useBreakpoint() !== 'compact';

  return (
    <Modal
      visible={visible}
      transparent
      animationType={wide ? 'fade' : 'slide'}
      onRequestClose={onClose}>
      <Pressable
        accessibilityLabel={closeLabel}
        onPress={onClose}
        style={[
          styles.backdrop,
          { backgroundColor: palette.overlay },
          wide ? styles.center : styles.bottom,
        ]}>
        {/* Inner Pressable swallows taps so touching the card doesn't dismiss. */}
        <Pressable
          onPress={() => {}}
          style={[
            styles.card,
            { backgroundColor: palette.card },
            wide
              ? { maxWidth, width: '100%', borderRadius: RADIUS.lg }
              : {
                  width: '100%',
                  borderTopLeftRadius: RADIUS.lg, // rtl-safe: top corners are symmetric across LTR/RTL
                  borderTopRightRadius: RADIUS.lg, // rtl-safe: top corners are symmetric across LTR/RTL
                  paddingBottom: insets.bottom + SPACING.md,
                },
          ]}>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: SPACING.lg },
  bottom: { justifyContent: 'flex-end' },
  card: { padding: SPACING.lg },
});
