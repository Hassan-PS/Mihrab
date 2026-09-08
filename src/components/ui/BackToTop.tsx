/**
 * "Back to the top" — the floating arrow Tilāwah's surah list has, for
 * any long list that scrolls.
 *
 * It appears when the reader is deep in the list AND heading back up:
 * going down they are looking for something and the button would be in
 * front of what they are reading; going up they have already decided
 * where they are going, and this is the short way there. A dead band
 * keeps a resting finger from flickering it in and out on a pixel of
 * drift. The hook owns that rule; the button is the drawing.
 */
import { useCallback, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Path } from 'react-native-svg';
import { useAppPalette } from '../../hooks/useAppPalette';
import { RADIUS } from '../../theme/tokens';

/** Deep enough that the top is genuinely far away. */
export const TO_TOP_AFTER = 700;
/** Scroll frames closer together than this are the same frame. */
export const SCROLL_HYSTERESIS = 8;

/** The rule, as a pure step: given the last offset and this one, show? */
export function backToTopStep(
  y: number,
  last: number,
): { last: number; show: boolean } | null {
  const dy = y - last;
  if (Math.abs(dy) < SCROLL_HYSTERESIS) return null;
  return { last: y, show: y > TO_TOP_AFTER && dy < 0 };
}

export function useBackToTop(scrollTo: () => void): {
  show: boolean;
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onPress: () => void;
  /** Call when the list changes under the reader (a new category). */
  reset: () => void;
} {
  const last = useRef(0);
  const [show, setShow] = useState(false);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const step = backToTopStep(e.nativeEvent.contentOffset.y, last.current);
    if (!step) return;
    last.current = step.last;
    setShow(step.show);
  }, []);
  const onPress = useCallback(() => {
    scrollTo();
    setShow(false);
  }, [scrollTo]);
  const reset = useCallback(() => {
    last.current = 0;
    setShow(false);
  }, []);
  return { show, onScroll, onPress, reset };
}

function TopArrowIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M12 20V5" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path
        d="M6 11l6-6 6 6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** The button. Absolutely positioned; mount it as the last child of the page. */
export function BackToTopButton({
  visible,
  onPress,
  bottom = 24,
}: {
  visible: boolean;
  onPress: () => void;
  /** Distance from the page's foot — above an in-flow bar, or the inset. */
  bottom?: number;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  if (!visible) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('quran.backToTop', 'Back to the top')}
      onPress={onPress}
      style={({ pressed }) => [
        styles.toTop,
        { bottom },
        {
          // The accent tint, not the card colour: the rows under it ARE
          // the card colour, so a card-coloured circle floating over them
          // read as part of whichever row it landed on.
          backgroundColor: palette.accentBg,
          borderColor: palette.accentSolid,
        },
        pressed && styles.pressed,
      ]}>
      <TopArrowIcon color={String(palette.accentSolid)} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toTop: {
    position: 'absolute',
    end: 18,
    width: 46,
    height: 46,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    // Enough to read as floating over the list rather than as a row in it.
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  pressed: { opacity: 0.7 },
});
