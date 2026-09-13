/**
 * What to send, when a dua is being sent — issue #47.
 *
 * ── WHY IT IS NOT AN ALERT ────────────────────────────────────────────
 *
 * The first version of this asked with each platform's own dialog: an
 * action sheet on iOS, `Alert.alert` on Android. It worked, and on
 * Android it looked like somebody else's app had interrupted this one —
 * a white Material box with three blue words in it, a title, and a
 * band of empty space where the message would have been, because there
 * is no message to give. Nothing in Mihrab looks like that.
 *
 * So it is a sheet, in the idiom every other choice in this app is made
 * in: ResponsiveModal for the shape (a sheet on a phone, a card on an
 * iPad or a Mac), Group and Row for the options, the accent for the
 * things you can tap and the muted colour for what they mean. The same
 * furniture as the Log's ⋯ sheet, two screens away.
 *
 * ── WHAT EACH ROW MEANS ───────────────────────────────────────────────
 *
 * The subtitles are not decoration. "Arabic and translation" also takes
 * the pronunciation with it and the other two do not, which is a real
 * difference to somebody choosing between them, and one they cannot see
 * from the titles.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Group } from '../components/ui/Group';
import { Row } from '../components/ui/Row';
import { useAppPalette } from '../hooks/useAppPalette';
import { ResponsiveModal } from '../responsive/ResponsiveModal';
import { RADIUS, SPACING } from '../theme/tokens';
import { typeStyle } from '../theme/typography';
import type { DuaShareParts } from '../share/shareText';

export function ShareDuaSheet({
  visible,
  duaTitle,
  onPick,
  onClose,
}: {
  visible: boolean;
  /** The dua being sent, so the sheet says what it is about. */
  duaTitle: string;
  onPick: (parts: DuaShareParts) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();

  // Close first, then share: the system share sheet is a surface of its
  // own, and two of them stacked is one too many — the same rule the
  // Log's options sheet follows before it opens a confirmation.
  const pick = (parts: DuaShareParts) => () => {
    onClose();
    onPick(parts);
  };

  return (
    <ResponsiveModal
      visible={visible}
      onClose={onClose}
      closeLabel={t('common.close', 'Close')}
    >
      <View style={styles.sheet}>
        <View style={styles.head}>
          <Text
            accessibilityRole="header"
            style={[typeStyle('title3'), { color: palette.text }]}
          >
            {t('duas.shareWhat', 'What to send')}
          </Text>
          {/* Which dua this is about. A sheet that opened from a card the
              reader has since scrolled past should still say. */}
          <Text
            style={[typeStyle('footnote'), { color: palette.muted }]}
            numberOfLines={2}
          >
            {duaTitle}
          </Text>
        </View>
        <Group>
          <Row
            tone="accent"
            title={t('duas.shareArabicOnly', 'Arabic only')}
            subtitle={t('duas.shareArabicOnlyHelp', 'The dua as it is said')}
            onPress={pick('arabic')}
          />
          <Row
            tone="accent"
            title={t('duas.shareTranslationOnly', 'Translation only')}
            subtitle={t('duas.shareTranslationOnlyHelp', 'What it means')}
            onPress={pick('translation')}
          />
          <Row
            tone="accent"
            title={t('duas.shareBoth', 'Arabic and translation')}
            subtitle={t('duas.shareBothHelp', 'With the pronunciation')}
            onPress={pick('both')}
          />
        </Group>
        {/* The source goes with all three; saying so is cheaper than a
            reader wondering whether it did. */}
        <Text
          style={[typeStyle('footnote'), styles.note, { color: palette.muted }]}
        >
          {t('duas.shareSourceNote', 'The source is sent whichever you choose.')}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel', 'Cancel')}
          onPress={onClose}
          style={({ pressed }) => [
            styles.close,
            { backgroundColor: palette.controlBg },
            pressed ? styles.pressed : null,
          ]}
        >
          <Text style={[typeStyle('headline'), { color: palette.text }]}>
            {t('common.cancel', 'Cancel')}
          </Text>
        </Pressable>
      </View>
    </ResponsiveModal>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: SPACING.md },
  head: { gap: SPACING.xs },
  note: { paddingHorizontal: SPACING.xs },
  close: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: RADIUS.md,
  },
  pressed: { opacity: 0.7 },
});
