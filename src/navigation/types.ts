/**
 * The six tabs (design review 2e). They are the app; the stack below is
 * everything pushed on top of them.
 */
export type MainTabParamList = {
  TodayTab: undefined;
  QuranTab: undefined;
  TasbihTab: undefined;
  DuasTab: undefined;
  LogTab: undefined;
  /** `highlight` flashes a section after a deep link from Home. */
  SettingsTab: { highlight?: 'savedLocations' } | undefined;
};

export type RootStackParamList = {
  /** The tab navigator. */
  Home: undefined;
  MonthTimes: undefined;
  ShareMonth: { year: number; month: number };
  Compass: undefined;
  QuranSurah: {
    surahNumber: number;
    /** Mushaf mode: open at this exact page (Juz/Page/Bookmark deep links). */
    initialPage?: number;
    /** Translation mode: scroll to this ayah (search / bookmark deep links). */
    scrollToAyah?: number;
  };
  /** Manage downloads: mushaf pages, recitation audio, tafsir cache. */
  QuranDownloads: undefined;
  Onboarding: undefined;
  Backup: undefined;
  Fasting: undefined;
};
