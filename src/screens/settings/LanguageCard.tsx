import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppearanceSettings } from '../../context/PrayerSettingsContext';
import { SettingsGroup, SettingsLinkRow } from './SettingsGroup';

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

  const current = LANGUAGE_LABELS.find(l => l.id === settings.language);
  const currentLabel = current
    ? current.isI18nKey
      ? t(current.label)
      : current.label
    : 'English';

  return (
    <SettingsGroup
      title={t('settings.language')}
      footer={t('settings.languageHelp')}>
      <SettingsLinkRow
        title={t('settings.language')}
        value={currentLabel}
        onPress={onOpenLanguagePicker}
      />
    </SettingsGroup>
  );
}

export const LanguageCard = memo(LanguageCardImpl);
