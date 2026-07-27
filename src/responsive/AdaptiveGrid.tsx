import { Children, isValidElement, useState, type ReactNode } from 'react';
import {
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { columnsFor } from './breakpoints';

/**
 * Auto-flowing grid: measures its own available width and lays children into
 * as many `minItemWidth`-wide columns as fit (clamped to `maxColumns`), so it
 * reflows live as the window resizes — 1 column on a phone, 3 on an iPad, 6 on
 * a wide Mac window. Each child is stretched to the exact column width so rows
 * align. Replaces hard-coded `flexBasis: '31%'` grids.
 */
export function AdaptiveGrid({
  children,
  minItemWidth,
  gutter = 12,
  maxColumns = 12,
  style,
}: {
  children: ReactNode;
  minItemWidth: number;
  gutter?: number;
  maxColumns?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [w, setW] = useState(0);
  const items = Children.toArray(children).filter(isValidElement);
  const cols = w > 0 ? columnsFor(w, minItemWidth, gutter, maxColumns) : 1;
  // Floor to a whole dp so `cols` items + gutters can NEVER exceed the row.
  // Fractional widths (e.g. a 392.7dp window at 440dpi) used to round up by
  // a subpixel and wrap the last column — leaving 2 narrow tiles and an
  // empty right half on some devices while emulators looked fine.
  const itemWidth =
    w > 0 && cols > 0
      ? Math.floor((w - gutter * (cols - 1)) / cols)
      : undefined;

  const onLayout = (e: LayoutChangeEvent) => {
    // Floor, never round: assuming even half a pixel more width than the row
    // really has causes the overflow-wrap above.
    const next = Math.floor(e.nativeEvent.layout.width);
    if (next !== w) setW(next);
  };

  return (
    <View
      onLayout={onLayout}
      style={[
        // `columnGap` replaces per-item marginEnd: no last-in-row bookkeeping,
        // and the engine guarantees the spacing never pushes a column out.
        { flexDirection: 'row', flexWrap: 'wrap', columnGap: gutter },
        style,
      ]}>
      {items.map((child, i) => (
        <View
          // eslint-disable-next-line react/no-array-index-key
          key={i}
          style={{
            width: itemWidth ?? '100%',
            marginBottom: gutter,
          }}>
          {child}
        </View>
      ))}
    </View>
  );
}
