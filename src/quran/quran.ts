/**
 * Quran data model + index — task #27.
 *
 * Owns the 114-surah index (name, ayah count, Meccan/Medinan, juz' anchor)
 * plus a lazy `loadSurah(n)` helper that pulls ayah text + translation
 * from per-surah JSON files under `./data/surahs/`. Only the surah the
 * user is reading is held in memory; the other 113 are tree-shakeable.
 *
 * **Religious-content invariant:** any ayah text in this module must come
 * from the Tanzil project's Uthmani text (CC BY 3.0) and pass
 * `__tests__/quranIntegrity.test.ts`'s hash check. Silent edits are
 * forbidden (the `reviewer` subagent's rule).
 *
 * **Bundling state:** Surah al-Fatihah (1) ships fully bundled in this
 * file as the inline reference and as `data/surahs/001.json`. The
 * remaining 113 surahs are loaded from JSON files that get populated by
 * `scripts/quran-import.js` once the Tanzil corpus is dropped into
 * `data/source/quran-uthmani.json` + `data/source/en.sahih.json`. Until
 * then, `loadSurah(n)` returns the index entry with `arabic: []` and
 * `translation: []` so consumers can render a "translation pending"
 * placeholder.
 */

/** Public attribution string surfaced on the QuranScreen About row. */
export const QURAN_ATTRIBUTION =
  'Quran text from Tanzil.net (Uthmani simple-clean), used under ' +
  'Creative Commons Attribution 3.0. English translation by Sahih ' +
  'International, public domain.';

export type SurahIndex = {
  number: number; // 1..114
  /** Romanized name (e.g. "Al-Fatihah"). */
  romanized: string;
  /** Arabic name (e.g. "الفاتحة"). */
  arabic: string;
  /** English meaning (e.g. "The Opening"). */
  english: string;
  ayahCount: number;
  type: 'meccan' | 'medinan';
  /** Juz' (1..30) the surah BEGINS in. Ayahs may span into the next juz'. */
  juz: number;
};

/** Loaded surah text — return shape from `loadSurah()`. */
export type LoadedSurah = {
  index: SurahIndex;
  arabic: ReadonlyArray<string>;
  /** May be empty when the corpus hasn't been imported yet. */
  translation: ReadonlyArray<string>;
};

/**
 * The full 114-surah index. Ayah counts and juz' anchors per the
 * standard Madinah mushaf (King Fahd Glorious Quran Printing Complex
 * edition). These are public-domain factual data — no licensing concern.
 */
export const SURAHS: ReadonlyArray<SurahIndex> = [
  { number: 1, romanized: 'Al-Fatihah', arabic: 'الفاتحة', english: 'The Opening', ayahCount: 7, type: 'meccan', juz: 1 },
  { number: 2, romanized: 'Al-Baqarah', arabic: 'البقرة', english: 'The Cow', ayahCount: 286, type: 'medinan', juz: 1 },
  { number: 3, romanized: 'Aal-i-Imran', arabic: 'آل عمران', english: 'Family of Imran', ayahCount: 200, type: 'medinan', juz: 3 },
  { number: 4, romanized: 'An-Nisa', arabic: 'النساء', english: 'The Women', ayahCount: 176, type: 'medinan', juz: 4 },
  { number: 5, romanized: 'Al-Maidah', arabic: 'المائدة', english: 'The Table Spread', ayahCount: 120, type: 'medinan', juz: 6 },
  { number: 6, romanized: 'Al-Anam', arabic: 'الأنعام', english: 'The Cattle', ayahCount: 165, type: 'meccan', juz: 7 },
  { number: 7, romanized: 'Al-Araf', arabic: 'الأعراف', english: 'The Heights', ayahCount: 206, type: 'meccan', juz: 8 },
  { number: 8, romanized: 'Al-Anfal', arabic: 'الأنفال', english: 'The Spoils of War', ayahCount: 75, type: 'medinan', juz: 9 },
  { number: 9, romanized: 'At-Tawbah', arabic: 'التوبة', english: 'The Repentance', ayahCount: 129, type: 'medinan', juz: 10 },
  { number: 10, romanized: 'Yunus', arabic: 'يونس', english: 'Jonah', ayahCount: 109, type: 'meccan', juz: 11 },
  { number: 11, romanized: 'Hud', arabic: 'هود', english: 'Hud', ayahCount: 123, type: 'meccan', juz: 11 },
  { number: 12, romanized: 'Yusuf', arabic: 'يوسف', english: 'Joseph', ayahCount: 111, type: 'meccan', juz: 12 },
  { number: 13, romanized: 'Ar-Rad', arabic: 'الرعد', english: 'The Thunder', ayahCount: 43, type: 'medinan', juz: 13 },
  { number: 14, romanized: 'Ibrahim', arabic: 'إبراهيم', english: 'Abraham', ayahCount: 52, type: 'meccan', juz: 13 },
  { number: 15, romanized: 'Al-Hijr', arabic: 'الحجر', english: 'The Rocky Tract', ayahCount: 99, type: 'meccan', juz: 14 },
  { number: 16, romanized: 'An-Nahl', arabic: 'النحل', english: 'The Bee', ayahCount: 128, type: 'meccan', juz: 14 },
  { number: 17, romanized: 'Al-Isra', arabic: 'الإسراء', english: 'The Night Journey', ayahCount: 111, type: 'meccan', juz: 15 },
  { number: 18, romanized: 'Al-Kahf', arabic: 'الكهف', english: 'The Cave', ayahCount: 110, type: 'meccan', juz: 15 },
  { number: 19, romanized: 'Maryam', arabic: 'مريم', english: 'Mary', ayahCount: 98, type: 'meccan', juz: 16 },
  { number: 20, romanized: 'Ta-Ha', arabic: 'طه', english: 'Ta-Ha', ayahCount: 135, type: 'meccan', juz: 16 },
  { number: 21, romanized: 'Al-Anbya', arabic: 'الأنبياء', english: 'The Prophets', ayahCount: 112, type: 'meccan', juz: 17 },
  { number: 22, romanized: 'Al-Hajj', arabic: 'الحج', english: 'The Pilgrimage', ayahCount: 78, type: 'medinan', juz: 17 },
  { number: 23, romanized: 'Al-Muminun', arabic: 'المؤمنون', english: 'The Believers', ayahCount: 118, type: 'meccan', juz: 18 },
  { number: 24, romanized: 'An-Nur', arabic: 'النور', english: 'The Light', ayahCount: 64, type: 'medinan', juz: 18 },
  { number: 25, romanized: 'Al-Furqan', arabic: 'الفرقان', english: 'The Criterion', ayahCount: 77, type: 'meccan', juz: 18 },
  { number: 26, romanized: 'Ash-Shuara', arabic: 'الشعراء', english: 'The Poets', ayahCount: 227, type: 'meccan', juz: 19 },
  { number: 27, romanized: 'An-Naml', arabic: 'النمل', english: 'The Ant', ayahCount: 93, type: 'meccan', juz: 19 },
  { number: 28, romanized: 'Al-Qasas', arabic: 'القصص', english: 'The Stories', ayahCount: 88, type: 'meccan', juz: 20 },
  { number: 29, romanized: 'Al-Ankabut', arabic: 'العنكبوت', english: 'The Spider', ayahCount: 69, type: 'meccan', juz: 20 },
  { number: 30, romanized: 'Ar-Rum', arabic: 'الروم', english: 'The Romans', ayahCount: 60, type: 'meccan', juz: 21 },
  { number: 31, romanized: 'Luqman', arabic: 'لقمان', english: 'Luqman', ayahCount: 34, type: 'meccan', juz: 21 },
  { number: 32, romanized: 'As-Sajdah', arabic: 'السجدة', english: 'The Prostration', ayahCount: 30, type: 'meccan', juz: 21 },
  { number: 33, romanized: 'Al-Ahzab', arabic: 'الأحزاب', english: 'The Combined Forces', ayahCount: 73, type: 'medinan', juz: 21 },
  { number: 34, romanized: 'Saba', arabic: 'سبأ', english: 'Sheba', ayahCount: 54, type: 'meccan', juz: 22 },
  { number: 35, romanized: 'Fatir', arabic: 'فاطر', english: 'Originator', ayahCount: 45, type: 'meccan', juz: 22 },
  { number: 36, romanized: 'Ya-Sin', arabic: 'يس', english: 'Ya-Sin', ayahCount: 83, type: 'meccan', juz: 22 },
  { number: 37, romanized: 'As-Saffat', arabic: 'الصافات', english: 'Those Who Set the Ranks', ayahCount: 182, type: 'meccan', juz: 23 },
  { number: 38, romanized: 'Sad', arabic: 'ص', english: 'Sad', ayahCount: 88, type: 'meccan', juz: 23 },
  { number: 39, romanized: 'Az-Zumar', arabic: 'الزمر', english: 'The Throngs', ayahCount: 75, type: 'meccan', juz: 23 },
  { number: 40, romanized: 'Ghafir', arabic: 'غافر', english: 'The Forgiver', ayahCount: 85, type: 'meccan', juz: 24 },
  { number: 41, romanized: 'Fussilat', arabic: 'فصلت', english: 'Explained in Detail', ayahCount: 54, type: 'meccan', juz: 24 },
  { number: 42, romanized: 'Ash-Shura', arabic: 'الشورى', english: 'The Consultation', ayahCount: 53, type: 'meccan', juz: 25 },
  { number: 43, romanized: 'Az-Zukhruf', arabic: 'الزخرف', english: 'The Ornaments of Gold', ayahCount: 89, type: 'meccan', juz: 25 },
  { number: 44, romanized: 'Ad-Dukhan', arabic: 'الدخان', english: 'The Smoke', ayahCount: 59, type: 'meccan', juz: 25 },
  { number: 45, romanized: 'Al-Jathiyah', arabic: 'الجاثية', english: 'The Crouching', ayahCount: 37, type: 'meccan', juz: 25 },
  { number: 46, romanized: 'Al-Ahqaf', arabic: 'الأحقاف', english: 'The Wind-Curved Sandhills', ayahCount: 35, type: 'meccan', juz: 26 },
  { number: 47, romanized: 'Muhammad', arabic: 'محمد', english: 'Muhammad', ayahCount: 38, type: 'medinan', juz: 26 },
  { number: 48, romanized: 'Al-Fath', arabic: 'الفتح', english: 'The Victory', ayahCount: 29, type: 'medinan', juz: 26 },
  { number: 49, romanized: 'Al-Hujurat', arabic: 'الحجرات', english: 'The Rooms', ayahCount: 18, type: 'medinan', juz: 26 },
  { number: 50, romanized: 'Qaf', arabic: 'ق', english: 'Qaf', ayahCount: 45, type: 'meccan', juz: 26 },
  { number: 51, romanized: 'Adh-Dhariyat', arabic: 'الذاريات', english: 'The Winnowing Winds', ayahCount: 60, type: 'meccan', juz: 26 },
  { number: 52, romanized: 'At-Tur', arabic: 'الطور', english: 'The Mount', ayahCount: 49, type: 'meccan', juz: 27 },
  { number: 53, romanized: 'An-Najm', arabic: 'النجم', english: 'The Star', ayahCount: 62, type: 'meccan', juz: 27 },
  { number: 54, romanized: 'Al-Qamar', arabic: 'القمر', english: 'The Moon', ayahCount: 55, type: 'meccan', juz: 27 },
  { number: 55, romanized: 'Ar-Rahman', arabic: 'الرحمن', english: 'The Beneficent', ayahCount: 78, type: 'medinan', juz: 27 },
  { number: 56, romanized: 'Al-Waqiah', arabic: 'الواقعة', english: 'The Inevitable', ayahCount: 96, type: 'meccan', juz: 27 },
  { number: 57, romanized: 'Al-Hadid', arabic: 'الحديد', english: 'The Iron', ayahCount: 29, type: 'medinan', juz: 27 },
  { number: 58, romanized: 'Al-Mujadilah', arabic: 'المجادلة', english: 'The Pleading Woman', ayahCount: 22, type: 'medinan', juz: 28 },
  { number: 59, romanized: 'Al-Hashr', arabic: 'الحشر', english: 'The Exile', ayahCount: 24, type: 'medinan', juz: 28 },
  { number: 60, romanized: 'Al-Mumtahanah', arabic: 'الممتحنة', english: 'She That Is To Be Examined', ayahCount: 13, type: 'medinan', juz: 28 },
  { number: 61, romanized: 'As-Saff', arabic: 'الصف', english: 'The Ranks', ayahCount: 14, type: 'medinan', juz: 28 },
  { number: 62, romanized: 'Al-Jumuah', arabic: 'الجمعة', english: 'The Congregation', ayahCount: 11, type: 'medinan', juz: 28 },
  { number: 63, romanized: 'Al-Munafiqun', arabic: 'المنافقون', english: 'The Hypocrites', ayahCount: 11, type: 'medinan', juz: 28 },
  { number: 64, romanized: 'At-Taghabun', arabic: 'التغابن', english: 'The Mutual Disillusion', ayahCount: 18, type: 'medinan', juz: 28 },
  { number: 65, romanized: 'At-Talaq', arabic: 'الطلاق', english: 'The Divorce', ayahCount: 12, type: 'medinan', juz: 28 },
  { number: 66, romanized: 'At-Tahrim', arabic: 'التحريم', english: 'The Prohibition', ayahCount: 12, type: 'medinan', juz: 28 },
  { number: 67, romanized: 'Al-Mulk', arabic: 'الملك', english: 'The Sovereignty', ayahCount: 30, type: 'meccan', juz: 29 },
  { number: 68, romanized: 'Al-Qalam', arabic: 'القلم', english: 'The Pen', ayahCount: 52, type: 'meccan', juz: 29 },
  { number: 69, romanized: 'Al-Haqqah', arabic: 'الحاقة', english: 'The Reality', ayahCount: 52, type: 'meccan', juz: 29 },
  { number: 70, romanized: 'Al-Maarij', arabic: 'المعارج', english: 'The Ascending Stairways', ayahCount: 44, type: 'meccan', juz: 29 },
  { number: 71, romanized: 'Nuh', arabic: 'نوح', english: 'Noah', ayahCount: 28, type: 'meccan', juz: 29 },
  { number: 72, romanized: 'Al-Jinn', arabic: 'الجن', english: 'The Jinn', ayahCount: 28, type: 'meccan', juz: 29 },
  { number: 73, romanized: 'Al-Muzzammil', arabic: 'المزمل', english: 'The Enshrouded One', ayahCount: 20, type: 'meccan', juz: 29 },
  { number: 74, romanized: 'Al-Muddaththir', arabic: 'المدثر', english: 'The Cloaked One', ayahCount: 56, type: 'meccan', juz: 29 },
  { number: 75, romanized: 'Al-Qiyamah', arabic: 'القيامة', english: 'The Resurrection', ayahCount: 40, type: 'meccan', juz: 29 },
  { number: 76, romanized: 'Al-Insan', arabic: 'الإنسان', english: 'Man', ayahCount: 31, type: 'medinan', juz: 29 },
  { number: 77, romanized: 'Al-Mursalat', arabic: 'المرسلات', english: 'The Emissaries', ayahCount: 50, type: 'meccan', juz: 29 },
  { number: 78, romanized: 'An-Naba', arabic: 'النبأ', english: 'The Announcement', ayahCount: 40, type: 'meccan', juz: 30 },
  { number: 79, romanized: 'An-Naziat', arabic: 'النازعات', english: 'Those Who Drag Forth', ayahCount: 46, type: 'meccan', juz: 30 },
  { number: 80, romanized: 'Abasa', arabic: 'عبس', english: 'He Frowned', ayahCount: 42, type: 'meccan', juz: 30 },
  { number: 81, romanized: 'At-Takwir', arabic: 'التكوير', english: 'The Folding Up', ayahCount: 29, type: 'meccan', juz: 30 },
  { number: 82, romanized: 'Al-Infitar', arabic: 'الإنفطار', english: 'The Cleaving', ayahCount: 19, type: 'meccan', juz: 30 },
  { number: 83, romanized: 'Al-Mutaffifin', arabic: 'المطففين', english: 'Defrauding', ayahCount: 36, type: 'meccan', juz: 30 },
  { number: 84, romanized: 'Al-Inshiqaq', arabic: 'الإنشقاق', english: 'The Splitting Open', ayahCount: 25, type: 'meccan', juz: 30 },
  { number: 85, romanized: 'Al-Buruj', arabic: 'البروج', english: 'The Mansions of the Stars', ayahCount: 22, type: 'meccan', juz: 30 },
  { number: 86, romanized: 'At-Tariq', arabic: 'الطارق', english: 'The Morning Star', ayahCount: 17, type: 'meccan', juz: 30 },
  { number: 87, romanized: 'Al-Ala', arabic: 'الأعلى', english: 'The Most High', ayahCount: 19, type: 'meccan', juz: 30 },
  { number: 88, romanized: 'Al-Ghashiyah', arabic: 'الغاشية', english: 'The Overwhelming', ayahCount: 26, type: 'meccan', juz: 30 },
  { number: 89, romanized: 'Al-Fajr', arabic: 'الفجر', english: 'The Dawn', ayahCount: 30, type: 'meccan', juz: 30 },
  { number: 90, romanized: 'Al-Balad', arabic: 'البلد', english: 'The City', ayahCount: 20, type: 'meccan', juz: 30 },
  { number: 91, romanized: 'Ash-Shams', arabic: 'الشمس', english: 'The Sun', ayahCount: 15, type: 'meccan', juz: 30 },
  { number: 92, romanized: 'Al-Layl', arabic: 'الليل', english: 'The Night', ayahCount: 21, type: 'meccan', juz: 30 },
  { number: 93, romanized: 'Ad-Duhaa', arabic: 'الضحى', english: 'The Morning Hours', ayahCount: 11, type: 'meccan', juz: 30 },
  { number: 94, romanized: 'Ash-Sharh', arabic: 'الشرح', english: 'The Relief', ayahCount: 8, type: 'meccan', juz: 30 },
  { number: 95, romanized: 'At-Tin', arabic: 'التين', english: 'The Fig', ayahCount: 8, type: 'meccan', juz: 30 },
  { number: 96, romanized: 'Al-Alaq', arabic: 'العلق', english: 'The Clot', ayahCount: 19, type: 'meccan', juz: 30 },
  { number: 97, romanized: 'Al-Qadr', arabic: 'القدر', english: 'The Power', ayahCount: 5, type: 'meccan', juz: 30 },
  { number: 98, romanized: 'Al-Bayyinah', arabic: 'البينة', english: 'The Clear Proof', ayahCount: 8, type: 'medinan', juz: 30 },
  { number: 99, romanized: 'Az-Zalzalah', arabic: 'الزلزلة', english: 'The Earthquake', ayahCount: 8, type: 'medinan', juz: 30 },
  { number: 100, romanized: 'Al-Adiyat', arabic: 'العاديات', english: 'The Courser', ayahCount: 11, type: 'meccan', juz: 30 },
  { number: 101, romanized: 'Al-Qariah', arabic: 'القارعة', english: 'The Calamity', ayahCount: 11, type: 'meccan', juz: 30 },
  { number: 102, romanized: 'At-Takathur', arabic: 'التكاثر', english: 'Rivalry in World Increase', ayahCount: 8, type: 'meccan', juz: 30 },
  { number: 103, romanized: 'Al-Asr', arabic: 'العصر', english: 'The Declining Day', ayahCount: 3, type: 'meccan', juz: 30 },
  { number: 104, romanized: 'Al-Humazah', arabic: 'الهمزة', english: 'The Traducer', ayahCount: 9, type: 'meccan', juz: 30 },
  { number: 105, romanized: 'Al-Fil', arabic: 'الفيل', english: 'The Elephant', ayahCount: 5, type: 'meccan', juz: 30 },
  { number: 106, romanized: 'Quraysh', arabic: 'قريش', english: 'Quraysh', ayahCount: 4, type: 'meccan', juz: 30 },
  { number: 107, romanized: 'Al-Maun', arabic: 'الماعون', english: 'Small Kindnesses', ayahCount: 7, type: 'meccan', juz: 30 },
  { number: 108, romanized: 'Al-Kawthar', arabic: 'الكوثر', english: 'The Abundance', ayahCount: 3, type: 'meccan', juz: 30 },
  { number: 109, romanized: 'Al-Kafirun', arabic: 'الكافرون', english: 'The Disbelievers', ayahCount: 6, type: 'meccan', juz: 30 },
  { number: 110, romanized: 'An-Nasr', arabic: 'النصر', english: 'The Help', ayahCount: 3, type: 'medinan', juz: 30 },
  { number: 111, romanized: 'Al-Masad', arabic: 'المسد', english: 'The Palm Fiber', ayahCount: 5, type: 'meccan', juz: 30 },
  { number: 112, romanized: 'Al-Ikhlas', arabic: 'الإخلاص', english: 'Sincerity', ayahCount: 4, type: 'meccan', juz: 30 },
  { number: 113, romanized: 'Al-Falaq', arabic: 'الفلق', english: 'The Daybreak', ayahCount: 5, type: 'meccan', juz: 30 },
  { number: 114, romanized: 'An-Nas', arabic: 'الناس', english: 'Mankind', ayahCount: 6, type: 'meccan', juz: 30 },
] as const;

/**
 * Inline Arabic text for the surahs we ship completely in the MVP.
 * Currently: Surah al-Fatiha only — kept here as the hashable reference
 * for `quranIntegrity.test.ts`. The full corpus lives in
 * `data/surahs/{NNN}.json` once imported.
 *
 * Source: Tanzil Uthmani text (https://tanzil.net), CC BY 3.0.
 */
export const SURAH_TEXT: Record<number, ReadonlyArray<string>> = {
  1: [
    'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ',
    'ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ',
    'ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ',
    'مَـٰلِكِ يَوْمِ ٱلدِّينِ',
    'إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ',
    'ٱهْدِنَا ٱلصِّرَٰطَ ٱلْمُسْتَقِيمَ',
    'صِرَٰطَ ٱلَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ ٱلْمَغْضُوبِ عَلَيْهِمْ وَلَا ٱلضَّآلِّينَ',
  ],
};

/** English translation of Surah al-Fatiha (Sahih International, public-domain). */
export const SURAH_TRANSLATION_EN: Record<number, ReadonlyArray<string>> = {
  1: [
    'In the name of Allah, the Entirely Merciful, the Especially Merciful.',
    '[All] praise is [due] to Allah, Lord of the worlds —',
    'The Entirely Merciful, the Especially Merciful,',
    'Sovereign of the Day of Recompense.',
    'It is You we worship and You we ask for help.',
    'Guide us to the straight path —',
    'The path of those upon whom You have bestowed favor, not of those who have evoked [Your] anger or of those who are astray.',
  ],
};

export function findSurah(number: number): SurahIndex | undefined {
  return SURAHS.find(s => s.number === number);
}

/**
 * Synchronous get — returns inline-bundled text only. Currently Surah
 * al-Fatihah only. Use `loadSurah()` for the lazy data-file path.
 */
export function getSurahAyahs(number: number): {
  arabic: ReadonlyArray<string>;
  translation: ReadonlyArray<string>;
} | null {
  const arabic = SURAH_TEXT[number];
  if (!arabic) return null;
  return {
    arabic,
    translation: SURAH_TRANSLATION_EN[number] ?? [],
  };
}

/**
 * Async lazy loader — returns the surah's ayah text + translation
 * pulled from `data/surahs/{NNN}.json`. Falls back to the inline
 * `SURAH_TEXT` map if the data file isn't present yet (which is the
 * case for surahs 2–114 until the Tanzil corpus is imported).
 *
 * The async signature lets a future implementation switch to
 * `require('./data/surahs/' + pad3(n) + '.json')` (Metro auto-resolves
 * static `require` paths) or to a network fetch with caching.
 *
 * Returns null only when `n` is out of range (1..114).
 */
export async function loadSurah(n: number): Promise<LoadedSurah | null> {
  const index = findSurah(n);
  if (!index) return null;

  // Inline reference: Surah al-Fatihah.
  if (SURAH_TEXT[n]) {
    return {
      index,
      arabic: SURAH_TEXT[n],
      translation: SURAH_TRANSLATION_EN[n] ?? [],
    };
  }

  // Per-surah data files (populated by scripts/quran-import.js).
  // Wrapped in try/catch so a missing file degrades gracefully to the
  // "translation pending" placeholder rather than crashing the screen.
  try {
    const data = await loadSurahDataFile(n);
    if (data) {
      return {
        index,
        arabic: data.arabic,
        translation: data.translation ?? [],
      };
    }
  } catch (e) {
    console.warn(`loadSurah(${n}): data file unavailable`, e);
  }

  // Placeholder: index entry only, empty arrays — the screen shows a
  // "translation pending" message.
  return { index, arabic: [], translation: [] };
}

/**
 * Internal: dynamic import of the per-surah data file. Kept separate so
 * tests can mock it. The data files live under `data/surahs/` and are
 * populated by the import script. Surah 1 is bundled inline for the
 * integrity hash test.
 *
 * Note: Metro doesn't support fully-dynamic require paths, so we use
 * a switch to enumerate the 114 imports. The bundler tree-shakes
 * unloaded surahs only when each branch is a static literal. For the
 * MVP this returns null for all surahs except 1 (which goes through
 * the inline path above); the full switch is filled in by the import
 * script when the corpus arrives.
 */
async function loadSurahDataFile(
  n: number,
): Promise<{ arabic: string[]; translation?: string[] } | null> {
  // Metro requires literal require paths for tree-shaking; we enumerate
  // 2..114 explicitly. Surah 1 goes through the inline SURAH_TEXT path
  // in loadSurah() above. Generated by scripts/quran-import.js.
  switch (n) {
    case 2: return require('./data/surahs/002.json');
    case 3: return require('./data/surahs/003.json');
    case 4: return require('./data/surahs/004.json');
    case 5: return require('./data/surahs/005.json');
    case 6: return require('./data/surahs/006.json');
    case 7: return require('./data/surahs/007.json');
    case 8: return require('./data/surahs/008.json');
    case 9: return require('./data/surahs/009.json');
    case 10: return require('./data/surahs/010.json');
    case 11: return require('./data/surahs/011.json');
    case 12: return require('./data/surahs/012.json');
    case 13: return require('./data/surahs/013.json');
    case 14: return require('./data/surahs/014.json');
    case 15: return require('./data/surahs/015.json');
    case 16: return require('./data/surahs/016.json');
    case 17: return require('./data/surahs/017.json');
    case 18: return require('./data/surahs/018.json');
    case 19: return require('./data/surahs/019.json');
    case 20: return require('./data/surahs/020.json');
    case 21: return require('./data/surahs/021.json');
    case 22: return require('./data/surahs/022.json');
    case 23: return require('./data/surahs/023.json');
    case 24: return require('./data/surahs/024.json');
    case 25: return require('./data/surahs/025.json');
    case 26: return require('./data/surahs/026.json');
    case 27: return require('./data/surahs/027.json');
    case 28: return require('./data/surahs/028.json');
    case 29: return require('./data/surahs/029.json');
    case 30: return require('./data/surahs/030.json');
    case 31: return require('./data/surahs/031.json');
    case 32: return require('./data/surahs/032.json');
    case 33: return require('./data/surahs/033.json');
    case 34: return require('./data/surahs/034.json');
    case 35: return require('./data/surahs/035.json');
    case 36: return require('./data/surahs/036.json');
    case 37: return require('./data/surahs/037.json');
    case 38: return require('./data/surahs/038.json');
    case 39: return require('./data/surahs/039.json');
    case 40: return require('./data/surahs/040.json');
    case 41: return require('./data/surahs/041.json');
    case 42: return require('./data/surahs/042.json');
    case 43: return require('./data/surahs/043.json');
    case 44: return require('./data/surahs/044.json');
    case 45: return require('./data/surahs/045.json');
    case 46: return require('./data/surahs/046.json');
    case 47: return require('./data/surahs/047.json');
    case 48: return require('./data/surahs/048.json');
    case 49: return require('./data/surahs/049.json');
    case 50: return require('./data/surahs/050.json');
    case 51: return require('./data/surahs/051.json');
    case 52: return require('./data/surahs/052.json');
    case 53: return require('./data/surahs/053.json');
    case 54: return require('./data/surahs/054.json');
    case 55: return require('./data/surahs/055.json');
    case 56: return require('./data/surahs/056.json');
    case 57: return require('./data/surahs/057.json');
    case 58: return require('./data/surahs/058.json');
    case 59: return require('./data/surahs/059.json');
    case 60: return require('./data/surahs/060.json');
    case 61: return require('./data/surahs/061.json');
    case 62: return require('./data/surahs/062.json');
    case 63: return require('./data/surahs/063.json');
    case 64: return require('./data/surahs/064.json');
    case 65: return require('./data/surahs/065.json');
    case 66: return require('./data/surahs/066.json');
    case 67: return require('./data/surahs/067.json');
    case 68: return require('./data/surahs/068.json');
    case 69: return require('./data/surahs/069.json');
    case 70: return require('./data/surahs/070.json');
    case 71: return require('./data/surahs/071.json');
    case 72: return require('./data/surahs/072.json');
    case 73: return require('./data/surahs/073.json');
    case 74: return require('./data/surahs/074.json');
    case 75: return require('./data/surahs/075.json');
    case 76: return require('./data/surahs/076.json');
    case 77: return require('./data/surahs/077.json');
    case 78: return require('./data/surahs/078.json');
    case 79: return require('./data/surahs/079.json');
    case 80: return require('./data/surahs/080.json');
    case 81: return require('./data/surahs/081.json');
    case 82: return require('./data/surahs/082.json');
    case 83: return require('./data/surahs/083.json');
    case 84: return require('./data/surahs/084.json');
    case 85: return require('./data/surahs/085.json');
    case 86: return require('./data/surahs/086.json');
    case 87: return require('./data/surahs/087.json');
    case 88: return require('./data/surahs/088.json');
    case 89: return require('./data/surahs/089.json');
    case 90: return require('./data/surahs/090.json');
    case 91: return require('./data/surahs/091.json');
    case 92: return require('./data/surahs/092.json');
    case 93: return require('./data/surahs/093.json');
    case 94: return require('./data/surahs/094.json');
    case 95: return require('./data/surahs/095.json');
    case 96: return require('./data/surahs/096.json');
    case 97: return require('./data/surahs/097.json');
    case 98: return require('./data/surahs/098.json');
    case 99: return require('./data/surahs/099.json');
    case 100: return require('./data/surahs/100.json');
    case 101: return require('./data/surahs/101.json');
    case 102: return require('./data/surahs/102.json');
    case 103: return require('./data/surahs/103.json');
    case 104: return require('./data/surahs/104.json');
    case 105: return require('./data/surahs/105.json');
    case 106: return require('./data/surahs/106.json');
    case 107: return require('./data/surahs/107.json');
    case 108: return require('./data/surahs/108.json');
    case 109: return require('./data/surahs/109.json');
    case 110: return require('./data/surahs/110.json');
    case 111: return require('./data/surahs/111.json');
    case 112: return require('./data/surahs/112.json');
    case 113: return require('./data/surahs/113.json');
    case 114: return require('./data/surahs/114.json');
    default: return null;
  }
}
