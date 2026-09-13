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
import {
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
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
  /**
   * Cap the card at this fraction of the window's height, for content
   * that scrolls itself and would otherwise grow to fill the screen —
   * the changelog's fifty-eight releases, say. Left out, the card is as
   * tall as what is in it, which is what every other caller wants.
   */
  maxHeightRatio?: number;
  /**
   * Drop the card's own padding, so a scroll view inside it can run to
   * the rounded corners and its scrollbar can sit at the true edge.
   * The child then owns every inset, including the safe area, which is
   * why the bottom inset below is dropped with it.
   */
  bare?: boolean;
};

export function ResponsiveModal({
  visible,
  onClose,
  children,
  maxWidth = 460,
  closeLabel = 'Close',
  maxHeightRatio,
  bare = false,
}: Props) {
  const { palette } = useAppPalette();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
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
            bare ? styles.bareCard : styles.card,
            { backgroundColor: palette.card },
            wide
              ? { maxWidth, width: '100%', borderRadius: RADIUS.lg }
              : {
                  width: '100%',
                  borderTopLeftRadius: RADIUS.lg, // rtl-safe: top corners are symmetric across LTR/RTL
                  borderTopRightRadius: RADIUS.lg, // rtl-safe: top corners are symmetric across LTR/RTL
                  paddingBottom: bare ? 0 : insets.bottom + SPACING.md,
                },
            // A cap, not a height: a two-release changelog is still a
            // short sheet rather than a tall one with a void in it.
            maxHeightRatio ? { maxHeight: height * maxHeightRatio } : null,
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
  /**
   * `overflow: hidden` is what makes `bare` worth having: without it a
   * scroll view's first row is drawn square over the card's rounded top
   * corners, and on Android it draws over them while bouncing too.
   */
  bareCard: { overflow: 'hidden' },
});
