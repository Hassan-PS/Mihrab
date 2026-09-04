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
 * filled pill rather than a line of coloured text.
 *
 * ── WHY THE WORD STAYS ────────────────────────────────────────────────
 *
 * A bare mark would fit the header better and teach nobody anything. The
 * word is the point — it is what the page is called, and seeing it here
 * is where a reader learns that. The mark does the other half of the job
 * the name cannot do on its own: someone who has never met the word can
 * still tell this plays something.
 *
 * ── WHY THE MARK IS DRAWN ─────────────────────────────────────────────
 *
 * It was a `♪` typed into the label with two spaces after it. That glyph
 * is the system font's, so its size, weight and vertical placement are
 * whatever the platform decided — on Android it sat high and thin beside
 * a 13pt bold word, and the "gap" was two space characters, which is not
 * a gap, it is whatever the font says a space is. It is the same drawn
 * note the bar under the title bar and the now-playing row carry, so the
 * three ways into the player are one mark.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import type { RootStackParamList } from '../../navigation/types';
import { TilawahIcon } from '../../quran/audio/PlaybackIcons';

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
      {/* Boxed at the cap height of the word beside it. An icon is square
          and a word is not, so left to itself the note sets the pill's
          height and the label floats in the middle of it. */}
      <View style={styles.mark}>
        <TilawahIcon color={String(palette.accentSolid)} size={15} />
      </View>
      <Text
        numberOfLines={1}
        style={[styles.text, { color: palette.accentSolid }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingStart: 10,
    paddingEnd: 14,
    paddingVertical: 6,
    borderRadius: 999,
    // A hairline on a filled pill is a rounding error on a dark ground —
    // the same lesson the "back to the top" button learned. One point.
    borderWidth: 1,
    // The header is a fixed height and some languages are longer than
    // English; the pill may shrink, but the label never wraps.
    maxWidth: 190,
  },
  mark: { height: 15, justifyContent: 'center' },
  text: { fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.65 },
});
