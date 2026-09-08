import { memo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../../hooks/useAppPalette';
import { ResponsiveModal } from '../../responsive/ResponsiveModal';
import { RADIUS, SPACING } from '../../theme/tokens';
import { TYPE, typeStyle } from '../../theme/typography';

/**
 * InfoSheet — the app's prose, one tap away instead of on the page
 * (docs/design/redesign-plan.md §2.6, P7).
 *
 * Mihrab documents everything: every setting explains itself and every
 * source is cited. That is a virtue in `docs/` and a cost on a settings
 * page, where an eight-line description under one toggle made the page
 * read as documentation. Nothing the app says is lost — it moves here,
 * behind a small ⓘ, where a person who wants the whole explanation gets
 * all of it and a person who does not gets one line.
 */

/** The full text, in a sheet. */
export function InfoSheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  return (
    <ResponsiveModal visible={visible} onClose={onClose} closeLabel={t('common.close', 'Close')}>
      <View style={styles.sheet}>
        <Text style={[typeStyle('title3'), { color: palette.text }]}>{title}</Text>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
          {typeof children === 'string' ? (
            <Text style={[typeStyle('body'), { color: palette.text }]}>{children}</Text>
          ) : (
            children
          )}
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close', 'Close')}
          onPress={onClose}
          style={[styles.close, { backgroundColor: palette.accentBg }]}>
          <Text style={[typeStyle('headline'), { color: palette.accentSolid }]}>
            {t('common.close', 'Close')}
          </Text>
        </Pressable>
      </View>
    </ResponsiveModal>
  );
}

/** The ⓘ that opens one. Owns its own open state so a row can drop it in. */
export function InfoButton({ title, body }: { title: string; body: string }) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.learnMore', 'Learn more')}
        hitSlop={10}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.info, pressed && { backgroundColor: palette.controlBg }]}>
        <View style={[styles.infoRing, { borderColor: palette.muted }]}>
          <Text style={[styles.infoGlyph, { color: palette.muted }]}>i</Text>
        </View>
      </Pressable>
      <InfoSheet visible={open} onClose={() => setOpen(false)} title={title}>
        {body}
      </InfoSheet>
    </>
  );
}

/** Descriptions longer than this go behind the ⓘ. */
export const HELP_LINE_LIMIT = 140;

/**
 * A setting's explanation: whole when it is short, clamped to two lines
 * with a ⓘ beside it when it is not. The strings themselves are untouched
 * — thirteen locales — so this is a rendering rule, not a rewrite.
 */
function HelpTextImpl({
  text,
  title,
  color,
  style,
}: {
  text: string;
  /** The sheet's title — the row's own title. */
  title: string;
  color: string | object;
  style?: object;
}) {
  const long = text.length > HELP_LINE_LIMIT;
  if (!long) {
    return <Text style={[style, { color } as object]}>{text}</Text>;
  }
  return (
    <View style={styles.helpRow}>
      <Text style={[style, styles.helpClamped, { color } as object]} numberOfLines={2}>
        {text}
      </Text>
      <InfoButton title={title} body={text} />
    </View>
  );
}

export const HelpText = memo(HelpTextImpl);

const styles = StyleSheet.create({
  sheet: { gap: SPACING.md },
  scroll: { maxHeight: 420 },
  body: { gap: SPACING.sm, paddingBottom: SPACING.xs },
  close: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: RADIUS.md,
  },
  info: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoRing: {
    width: 18,
    height: 18,
    borderRadius: RADIUS.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoGlyph: { fontSize: TYPE.caption.fontSize, fontWeight: '700', lineHeight: 13 },
  helpRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.xs },
  helpClamped: { flex: 1 },
});
