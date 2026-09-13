/**
 * What to send, when a dua is being sent — issue #47.
 *
 * "If my system language is Arabic, I would normally want to share only
 * the Arabic text. I do not necessarily need the translated text to be
 * included automatically." Which is the point: what a person sends
 * depends on who they are sending it to, and the app cannot know that.
 *
 * The furniture is `ChoiceSheet`, whose header says why this is a sheet
 * of this app's rather than the platform's dialog. What belongs here is
 * the three answers and what each one means — the subtitles are not
 * decoration: "Arabic and translation" also takes the pronunciation with
 * it and the other two do not, which is a real difference to somebody
 * choosing between them, and one they cannot see from the titles.
 */
import { useTranslation } from 'react-i18next';
import { ChoiceSheet } from '../components/ui/ChoiceSheet';
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

  return (
    <ChoiceSheet
      visible={visible}
      onClose={onClose}
      title={t('duas.shareWhat', 'What to send')}
      subject={duaTitle}
      // The source goes with all three; saying so is cheaper than a
      // reader wondering whether it did.
      note={t(
        'duas.shareSourceNote',
        'The source is sent whichever you choose.',
      )}
      choices={[
        {
          id: 'arabic',
          title: t('duas.shareArabicOnly', 'Arabic only'),
          subtitle: t('duas.shareArabicOnlyHelp', 'The dua as it is said'),
          onPress: () => onPick('arabic'),
        },
        {
          id: 'translation',
          title: t('duas.shareTranslationOnly', 'Translation only'),
          subtitle: t('duas.shareTranslationOnlyHelp', 'What it means'),
          onPress: () => onPick('translation'),
        },
        {
          id: 'both',
          title: t('duas.shareBoth', 'Arabic and translation'),
          subtitle: t('duas.shareBothHelp', 'With the pronunciation'),
          onPress: () => onPick('both'),
        },
      ]}
    />
  );
}
