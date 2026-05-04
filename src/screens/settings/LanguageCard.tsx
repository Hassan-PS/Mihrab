// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppearanceSettings } from '../../context/PrayerSettingsContext';
import { useAppPalette } from '../../hooks/useAppPalette';
import { cardEdgeStyle } from '../../theme/chrome';
import { sharedSettingsStyles as s } from './sharedStyles';

const LANGUAGE_LABELS: Array<{ id: string; label: string; isI18nKey?: boolean }> = [
  { id: 'en', label: 'settings.langEn', isI18nKey: true },
  { id: 'sv', label: 'settings.langSv', isI18nKey: true },
  { id: 'ar', label: 'settings.langAr', isI18nKey: true },
  { id: 'bn', label: 'বাংলা' },
  { id: 'ur', label: 'اردو' },
  { id: 'hi', label: 'हिन्दी' },
  { id: 'fr', label: 'Français' },
  { id: 'es', label: 'Español' },
  { id: 'de', label: 'Deutsch' },
  { id: 'tr', label: 'Türkçe' },
  { id: 'id', label: 'Bahasa Indonesia' },
  { id: 'ru', label: 'Русский' },
  { id: 'zh', label: '中文' },
];

type LanguageCardProps = {
  onOpenLanguagePicker: () => void;
};

function LanguageCardImpl({ onOpenLanguagePicker }: LanguageCardProps) {
  const { t } = useTranslation();
  // Language lives in the appearance slice — task #11.
  const { slice: settings } = useAppearanceSettings();
  const { palette } = useAppPalette();

  const current = LANGUAGE_LABELS.find(l => l.id === settings.language);
  const currentLabel = current
    ? current.isI18nKey
      ? t(current.label)
      : current.label
    : 'English';

  return (
    <>
      <Text style={[s.sectionTitle, { color: palette.muted }]}>
        {t('settings.language')}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('settings.language')}
        style={[
          s.card,
          s.rowPress,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}
        onPress={onOpenLanguagePicker}>
        <View style={s.copyBlock}>
          <Text style={[s.label, { color: palette.muted }]}>
            {t('settings.language')}
          </Text>
          <Text style={[s.valueText, { color: palette.text }]}>
            {currentLabel}
          </Text>
          <Text style={[s.help, { color: palette.muted }]}>
            {t('settings.languageHelp')}
          </Text>
        </View>
        <Text style={[s.changeLink, { color: palette.accent }]}>
          {t('common.change')}
        </Text>
      </Pressable>
    </>
  );
}

export const LanguageCard = memo(LanguageCardImpl);
