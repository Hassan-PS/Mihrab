/**
 * The way into Tilāwah, in the Quran tab's own title bar.
 *
 * ── WHY IT MOVED ──────────────────────────────────────────────────────
 *
 * It was a twelve-point text link in a row of three, below the segmented
 * tabs, sharing a line with "Reading traditions" and "Manage downloads".
 * Those two are places you go when you already know what you want. This
 * one is a whole half of the app — recitation that plays with the screen
 * off — and it has to be findable by someone who does not yet know it
 * exists. A link that size, in that company, reads as a footnote.
 *
 * So it sits opposite the title, where the eye lands on the way in, as a
 * filled pill rather than a line of coloured text. The note glyph does
 * the other half of the job the name cannot do on its own: someone who
 * has never met the word "Tilāwah" can still tell this plays something.
 *
 * ── WHY IT IS NOT AN ICON ─────────────────────────────────────────────
 *
 * A bare note glyph would fit the header better and teach nobody
 * anything. The word is the point — it is what the page is called, and
 * seeing it here is where a reader learns that.
 */
import { Pressable, StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import type { RootStackParamList } from '../../navigation/types';

export function TilawahHeaderChip() {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const label = t('quran.listenTitle', 'Tilawah');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} — ${t(
        'quran.tilawahDoorSub',
        'Listen to the Quran',
      )}`}
      hitSlop={8}
      onPress={() => navigation.navigate('QuranListen')}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: palette.accentBg, borderColor: palette.accentSolid },
        pressed && styles.pressed,
      ]}>
      <Text
        numberOfLines={1}
        style={[styles.text, { color: palette.accentSolid }]}>
        {`♪  ${label}`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    // The header is a fixed height and some languages are longer than
    // English; the pill may shrink, but the label never wraps.
    maxWidth: 190,
  },
  text: { fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.65 },
});
