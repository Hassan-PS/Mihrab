import { createContext, memo, useContext, type ReactNode } from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { useAppPalette } from '../../hooks/useAppPalette';
import { ELEVATION, RADIUS, SPACING } from '../../theme/tokens';

/**
 * Card — task #39 component library.
 *
 * Surface container with token-based radius and padding. Three variants
 * map onto the elevation ladder:
 *   • `default`   — flat surface, subtle border in flat-chrome themes.
 *   • `elevated`  — soft shadow (light only — dark themes use the
 *                   surfaceElevated palette token instead, since shadows
 *                   on dark backgrounds look like gray smudges).
 *   • `subtle`    — sunken surface for nested cards.
 *
 * ONE LEVEL OF CONTAINMENT PER SCREEN (docs/design/redesign-plan.md §2.5).
 * A card inside a card is the pattern that made the Log read as three
 * nested boxes, so in development a nested `Card` warns once, naming
 * itself. `subtle` is exempt — that variant exists to be nested, and is the
 * one legitimate second level. The warning is the guard rail; the fix is
 * `Group` (rows) or `Tile` (a number on the page).
 */
export type CardVariant = 'default' | 'elevated' | 'subtle';

type CardProps = {
  children: ReactNode;
  variant?: CardVariant;
  /** Padding token. Defaults to `lg` (16). */
  padding?: keyof typeof SPACING;
  /** Radius token. Defaults to `md` (12). */
  radius?: keyof typeof RADIUS;
  style?: ViewStyle;
  /** Names the card in the nesting warning. */
  debugName?: string;
};

/** How many `Card`s are above this one. */
export const CardDepth = createContext(0);

const warned = new Set<string>();

export function warnIfNested(
  depth: number,
  variant: CardVariant,
  name: string,
): boolean {
  if (!__DEV__ || depth === 0 || variant === 'subtle') return false;
  if (warned.has(name)) return true;
  warned.add(name);
  console.warn(
    `Card "${name}" is inside another Card. One level of containment per screen — ` +
      'use Group for rows or Tile for a number on the page (docs/design/redesign-plan.md §2.5).',
  );
  return true;
}

function CardImpl({
  children,
  variant = 'default',
  padding = 'lg',
  radius = 'md',
  style,
  debugName = 'Card',
}: CardProps) {
  const { palette, isDark } = useAppPalette();
  const depth = useContext(CardDepth);
  warnIfNested(depth, variant, debugName);
  const bg =
    variant === 'subtle'
      ? palette.bg
      : variant === 'elevated'
      ? palette.card
      : palette.card;
  const elev =
    !isDark && variant === 'elevated' ? ELEVATION.md : ELEVATION.none;
  return (
    <CardDepth.Provider value={depth + 1}>
      <View
        style={[
          {
            backgroundColor: bg,
            borderRadius: RADIUS[radius],
            padding: SPACING[padding],
            borderWidth: variant === 'default' && !isDark ? 0 : StyleSheet.hairlineWidth,
            borderColor: palette.border,
            ...(Platform.OS === 'ios'
              ? {
                  shadowColor: '#000',
                  shadowOffset: 'shadowOffset' in elev ? elev.shadowOffset : { width: 0, height: 0 },
                  shadowOpacity: elev.shadowOpacity,
                  shadowRadius: elev.shadowRadius,
                }
              : { elevation: elev.elevation }),
          },
          style,
        ]}>
        {children}
      </View>
    </CardDepth.Provider>
  );
}

export const Card = memo(CardImpl);
