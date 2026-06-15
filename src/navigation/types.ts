export type RootStackParamList = {
  Home: undefined;
  // `highlight` lets a caller (the home location selector's "Add new
  // location" action) deep-link into Settings and briefly flash a section
  // so the user knows where to act.
  Settings: { highlight?: 'savedLocations' } | undefined;
  MonthTimes: undefined;
  ShareMonth: { year: number; month: number };
  Compass: undefined;
  Tasbih: undefined;
  Duas: undefined;
  Quran: undefined;
  QuranSurah: { surahNumber: number };
  Mosques: undefined;
  Journal: undefined;
  Onboarding: undefined;
  Backup: undefined;
  Fasting: undefined;
};
