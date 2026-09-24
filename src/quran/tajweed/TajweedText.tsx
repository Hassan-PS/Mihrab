/**
 * A swatch of a rule's ink — the dot beside its name in the sheet and
 * the guide, in the palette the app's theme is in.
 *
 * The words themselves are drawn with the page fonts (`TajweedAyahGlyphs`),
 * not with nested coloured `<Text>`: on Android every nested fragment
 * carries its own font span, the layout shapes each on its own, and the
 * letters either side of a tint come apart.
 */
import { View } from 'react-native';
import { useAppPalette } from '../../hooks/useAppPalette';
import { tajweedInk, type TajweedRule } from './rules';

export function TajweedSwatch({ rule, size = 12 }: { rule: TajweedRule; size?: number }) {
  const { isDark } = useAppPalette();
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: tajweedInk(rule, isDark),
      }}
    />
  );
}
