import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import i18n from '../i18n';
import { loadSettings, saveSettings } from '../settings/storage';
import {
  DEFAULT_SETTINGS,
  type PrayerAppSettings,
} from '../settings/types';

type Ctx = {
  settings: PrayerAppSettings;
  hydrated: boolean;
  updateSettings: (patch: Partial<PrayerAppSettings>) => void;
};

const PrayerSettingsContext = createContext<Ctx | null>(null);

export function PrayerSettingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, setSettings] =
    useState<PrayerAppSettings>(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    loadSettings()
      .then(loaded => setSettings(loaded))
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    void i18n.changeLanguage(settings.language);
  }, [hydrated, settings.language]);

  const updateSettings = useCallback((patch: Partial<PrayerAppSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      saveSettings(next).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ settings, hydrated, updateSettings }),
    [settings, hydrated, updateSettings],
  );

  return (
    <PrayerSettingsContext.Provider value={value}>
      {children}
    </PrayerSettingsContext.Provider>
  );
}

export function usePrayerSettings(): Ctx {
  const ctx = useContext(PrayerSettingsContext);
  if (!ctx) {
    throw new Error('usePrayerSettings must be used within PrayerSettingsProvider');
  }
  return ctx;
}
