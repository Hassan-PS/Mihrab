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
  const itemWidth =
    w > 0 && cols > 0 ? (w - gutter * (cols - 1)) / cols : undefined;

  const onLayout = (e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.width);
    if (next !== w) setW(next);
  };

  return (
    <View
      onLayout={onLayout}
      style={[{ flexDirection: 'row', flexWrap: 'wrap' }, style]}>
      {items.map((child, i) => {
        const lastInRow = (i + 1) % cols === 0;
        return (
          <View
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            style={{
              width: itemWidth ?? '100%',
              marginEnd: lastInRow ? 0 : gutter,
              marginBottom: gutter,
            }}>
            {child}
          </View>
        );
      })}
    </View>
  );
}
