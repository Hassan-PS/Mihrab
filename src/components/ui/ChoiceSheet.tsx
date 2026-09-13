/**
 * "Which of these?" — asked the way this app asks things.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────
 *
 * Two surfaces asked a small either/or with the platform's own dialog: the
 * dua share (#47) and the ayah share before it. On iOS that is an action
 * sheet, which is fine on iOS. On Android it is `Alert.alert` — a white
 * Material box with two or three blue words in it, a title, and a band of
 * empty space where the message would go, because there is no message to
 * give. Nothing else in Mihrab looks like that, and a reader who meets it
 * has been handed to a different app for a moment.
 *
 * So the question is drawn in the idiom every other choice here is made
 * in: ResponsiveModal for the shape — a sheet on a phone, a centred card
 * on an iPad or a Mac — Group and Row for the options, the accent on what
 * can be tapped and the muted colour for what it means.
 *
 * ── WHAT IT IS FOR, AND WHAT IT IS NOT ────────────────────────────────
 *
 * Two to four options that are all the same KIND of thing — three ways to
 * send one dua, two ways to send one ayah. Not a menu of unrelated
 * actions (that is the Log's ⋯ sheet, built from the same parts but
 * saying something else), and not a confirmation (`ConfirmModal`, which
 * has a dangerous side and says so).
 *
 * Each option carries a subtitle because these choices are the kind where
 * the title alone does not say what changes — "Arabic and translation"
 * also takes the pronunciation, "as an image" makes a card rather than a
 * message. A dialog button has nowhere to put that.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Group } from './Group';
import { Row } from './Row';
import { useAppPalette } from '../../hooks/useAppPalette';
import { ResponsiveModal } from '../../responsive/ResponsiveModal';
import { RADIUS, SPACING } from '../../theme/tokens';
import { typeStyle } from '../../theme/typography';

export type Choice = {
  /** Stable key, for tests and for React. */
  id: string;
  title: string;
  /** What picking this one actually does. */
  subtitle?: string;
  onPress: () => void;
};

export function ChoiceSheet({
  visible,
  title,
  subject,
  choices,
  note,
  onClose,
}: {
  visible: boolean;
  /** The question. */
  title: string;
  /** What it is about — the dua's name, the ayah's reference. */
  subject?: string;
  choices: ReadonlyArray<Choice>;
  /** One line under the options, for what is true of all of them. */
  note?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();

  // Close first, then act: what these open — a system share sheet, a card
  // of their own — is a surface, and two stacked is one too many. The
  // same rule the Log's options sheet follows before a confirmation.
  const pick = (choice: Choice) => () => {
    onClose();
    choice.onPress();
  };

  return (
    <ResponsiveModal
      visible={visible}
      onClose={onClose}
      closeLabel={t('common.close', 'Close')}>
      <View style={styles.sheet}>
        <View style={styles.head}>
          <Text
            accessibilityRole="header"
            style={[typeStyle('title3'), { color: palette.text }]}>
            {title}
          </Text>
          {/* What the question is about. A sheet opened from a card the
              reader has since scrolled past should still say. */}
          {subject ? (
            <Text
              style={[typeStyle('footnote'), { color: palette.muted }]}
              numberOfLines={2}>
              {subject}
            </Text>
          ) : null}
        </View>
        <Group>
          {choices.map(choice => (
            <Row
              key={choice.id}
              tone="accent"
              title={choice.title}
              subtitle={choice.subtitle}
              onPress={pick(choice)}
            />
          ))}
        </Group>
        {note ? (
          <Text
            style={[typeStyle('footnote'), styles.note, { color: palette.muted }]}>
            {note}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel', 'Cancel')}
          onPress={onClose}
          style={({ pressed }) => [
            styles.close,
            { backgroundColor: palette.controlBg },
            pressed ? styles.pressed : null,
          ]}>
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
