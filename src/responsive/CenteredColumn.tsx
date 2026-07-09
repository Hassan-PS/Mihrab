import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { MAX_CONTENT_WIDTH, useResponsive } from './breakpoints';

/**
 * Centers and width-caps its children on regular/expanded windows, and is a
 * transparent pass-through on compact (phone) — so the phone layout is byte
 * identical while an iPad/Mac window keeps a comfortable reading measure with
 * margin instead of stretching rows across a 27" display.
 *
 * Usage: wrap a screen's scroll CONTENT (not the ScrollView itself):
 *   <ScrollView><CenteredColumn>…cards…</CenteredColumn></ScrollView>
 */
export function CenteredColumn({
  children,
  maxWidth = MAX_CONTENT_WIDTH,
  style,
  innerStyle,
}: {
  children: ReactNode;
  /** Content cap on wide windows. Tables/readers can pass a larger value. */
  maxWidth?: number;
  /** Applied to the outer (full-width, centering) wrapper. */
  style?: StyleProp<ViewStyle>;
  /** Applied to the inner (capped) column. */
  innerStyle?: StyleProp<ViewStyle>;
}) {
  const { bp } = useResponsive();
  // Compact: no wrapper chrome, identical to before.
  if (bp === 'compact') {
    return <View style={style}>{children}</View>;
  }
  return (
    <View style={[{ width: '100%', alignItems: 'center' }, style]}>
      <View style={[{ width: '100%', maxWidth }, innerStyle]}>{children}</View>
    </View>
  );
}
