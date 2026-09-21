/**
 * The one line the word reader says when a release plays nothing: the
 * audio is not here and cannot be fetched, or the word has no timing.
 * Shown over the page for a few seconds, then gone; a tap dismisses it.
 * Nothing renders while there is nothing to say.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../hooks/useAppPalette';
import { onWordReaderSilent, type WordReaderSilence } from './audio/wordReader';
import { RADIUS, SPACING } from '../theme/tokens';
import { TYPE } from '../theme/typography';

export const NOTICE_MS = 3500;

export function WordReaderNotice({ bottom = 0 }: { bottom?: number }) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const [why, setWhy] = useState<WordReaderSilence | null>(null);

  useEffect(() => {
    onWordReaderSilent(setWhy);
    return () => onWordReaderSilent(null);
  }, []);
  useEffect(() => {
    if (!why) return undefined;
    const timer = setTimeout(() => setWhy(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [why]);

  if (!why) return null;
  const text =
    why === 'offline'
      ? t('quran.wordReaderOffline', 'That word is not on this device yet, and there is no connection to fetch it.')
      : t('quran.wordReaderNoTiming', 'No timing is known for that word, so it cannot be read on its own.');
  return (
    <Pressable
      accessibilityRole="alert"
      onPress={() => setWhy(null)}
      style={[styles.notice, { bottom: bottom + SPACING.lg, backgroundColor: palette.card, borderColor: palette.border }]}>
      <Text style={[styles.text, { color: palette.text }]}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  notice: {
    position: 'absolute',
    left: SPACING.lg,
    right: SPACING.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: { fontSize: TYPE.callout.fontSize, textAlign: 'center' },
});
