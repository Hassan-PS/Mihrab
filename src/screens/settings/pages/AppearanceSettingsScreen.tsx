/**
 * Settings → Appearance. Theme, accent, time format, language.
 *
 * Language sits here rather than on a page of its own because it is a
 * decision about how the app LOOKS to you, and a settings index with a
 * one-row page in it is an index that made you tap twice for nothing.
 */
import { useCallback, useRef, useState } from 'react';
import { usePrayerSettings } from '../../../context/PrayerSettingsContext';
import { useAppPalette } from '../../../hooks/useAppPalette';
import { AppearanceCard } from '../AppearanceCard';
import { LanguageCard } from '../LanguageCard';
import { LanguageModal } from '../LanguageModal';
import { SettingsPage } from '../SettingsPage';

export function AppearanceSettingsScreen() {
  const { settings, updateSettings } = usePrayerSettings();
  const { palette } = useAppPalette();
  const [languageModal, setLanguageModal] = useState(false);
  const deferBack = useRef(false);
  deferBack.current = languageModal;

  const open = useCallback(() => setLanguageModal(true), []);
  const close = useCallback(() => setLanguageModal(false), []);

  return (
    <>
      <SettingsPage deferBackRef={deferBack}>
        <AppearanceCard />
        <LanguageCard onOpenLanguagePicker={open} />
      </SettingsPage>
      <LanguageModal
        visible={languageModal}
        current={settings.language}
        palette={palette}
        // `languagePicked` is what stops the app following the phone from
        // here on: see settings/storage.ts.
        onSelect={lang =>
          updateSettings({ language: lang, languagePicked: true })
        }
        onClose={close}
      />
    </>
  );
}
