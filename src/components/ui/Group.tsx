import { Children, memo, type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useAppPalette } from '../../hooks/useAppPalette';
import { cardEdgeStyle } from '../../theme/chrome';
import { LAYOUT, SPACING } from '../../theme/tokens';
import { CardDepth } from './Card';

/**
 * Group — a surface that holds ROWS and nothing else
 * (docs/design/redesign-plan.md §2.5).
 *
 * The settings index, the dua index, the fasting sunnahs: lists of things
 * that used to be either a card per item (five cards for five sunnahs) or
 * rows inside a card that also held a heading, a tile row and a heatmap.
 * A Group is the list's container and only that: no padding of its own,
 * an inset hairline between children, the page's card surface behind.
 *
 * Counts as a level of containment — a Card inside a Group warns, the
 * same as a Card inside a Card.
 */
type Props = {
  children: ReactNode;
  style?: ViewStyle;
  /** Where the divider between rows starts. Defaults to the gutter. */
  dividerInset?: number;
};

/** The inset hairline between two rows. Nothing under flat chrome. */
export function RowDivider({ inset = LAYOUT.gutter }: { inset?: number }) {
  const { palette } = useAppPalette();
  if (palette.flatChrome) return null;
  return (
    <View
      pointerEvents="none"
      style={[styles.divider, { marginStart: inset, backgroundColor: palette.border }]}
    />
  );
}

function GroupImpl({ children, style, dividerInset }: Props) {
  const { palette } = useAppPalette();
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <CardDepth.Provider value={1}>
      <View
        style={[
          styles.group,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          style,
        ]}>
        {rows.map((row, i) => (
          <View key={i}>
            {i > 0 ? <RowDivider inset={dividerInset} /> : null}
            {row}
          </View>
        ))}
      </View>
    </CardDepth.Provider>
  );
}

export const Group = memo(GroupImpl);

const styles = StyleSheet.create({
  group: {
    borderRadius: LAYOUT.cardRadius,
    overflow: 'hidden',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginEnd: 0,
    // A hairline needs no vertical room; the rows carry their own padding.
    marginVertical: 0,
  },
});

/** The row padding every Row and every hand-rolled row in a Group shares. */
export const ROW_PADDING = {
  paddingHorizontal: LAYOUT.gutter,
  paddingVertical: LAYOUT.rowPad,
  minHeight: SPACING.xxxl,
} as const;
