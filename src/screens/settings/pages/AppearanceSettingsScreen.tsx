/**
 * Settings → Appearance. Theme, accent, time format, language, and on
 * Android the home-screen widget.
 *
 * Language sits here rather than on a page of its own because it is a
 * decision about how the app LOOKS to you, and a settings index with a
 * one-row page in it is an index that made you tap twice for nothing.
 *
 * The widget arrived by that same rule. It had a section of its own back
 * when it owned a colour picker as well; #127 unified that picker with
 * the app accent and left a page with one slider on it — a destination,
 * an icon and a tap for a single control. It is a look-and-feel choice
 * and the accent it follows is picked two cards above it, so this is
 * where it belongs. `WidgetCard` draws nothing off Android, so nothing
 * about this page changes there.
 */
import { useCallback, useRef, useState } from 'react';
import { usePrayerSettings } from '../../../context/PrayerSettingsContext';
import { useAppPalette } from '../../../hooks/useAppPalette';
import { AppearanceCard } from '../AppearanceCard';
import { LanguageCard } from '../LanguageCard';
import { LanguageModal } from '../LanguageModal';
import { SettingsPage } from '../SettingsPage';
import { WidgetCard } from '../WidgetCard';

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
        {/* Last, not between the two: the widget's colour is the accent
            picked in `AppearanceCard`, and a reader who has just set it
            reads down to what follows it. */}
        <WidgetCard />
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
