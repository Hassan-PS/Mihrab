/**
 * Reciter registry — QR-15/16 (docs/quran-reader-plan.md).
 *
 * Forty-two mainstream reciters, every one verified to have a complete
 * EveryAyah per-ayah MP3 set (HTTP range probes: the original five on
 * 2026-07-04, sixteen more in v2.7.27 on 2026-07-05, twenty-one more in
 * v2.8.4 on 2026-07-30 — the last batch probed at 1:1, 2:286 and 114:6
 * so a partial set could not pass).
 *
 * `hasTimings` marks reciters with validated word-timing data from
 * cpfair/quran-align (CC BY 4.0), re-hosted on this repo's own
 * `quran-timings-v1` release (same trust model as the mushaf pages).
 * Reciters without timings still play perfectly — the reader falls back
 * from word-level to ayah-level highlighting (see `useWordTiming.ts`).
 *
 * Coverage note (v2.7.28 audit): quran-align's corpus covers 9 of our
 * 42 recordings — every timing set it publishes for an EveryAyah
 * murattal folder we ship is hosted and wired up. The other 33
 * recordings have NO public forced-alignment data (word timings are
 * per-recording; generating them needs an offline CMUSphinx alignment
 * run against each reciter's audio), so ayah-level highlight is the
 * honest ceiling for them today.
 *
 * Audio streams from everyayah.com on explicit user action, or plays
 * fully offline once a surah is downloaded (see `audioStore.ts`).
 */

export type Reciter = {
  /** Stable id used in settings + file paths. */
  id: string;
  /** Display name (proper noun — not translated). */
  name: string;
  /** Arabic display name. */
  arabicName: string;
  /** EveryAyah folder (also the timing-file basename). */
  folder: string;
  /** Word-level timing data available (quran-align). */
  hasTimings: boolean;
  /**
   * Extra spellings the search box should match (v2.8.4).
   *
   * Arabic names have no single Latin transliteration: العجمي is written
   * Ajmi, Ajami, Ajamy, Ajmy; الحصري is Husary, Husari, Hosary. Someone
   * searching "alajami" got an empty list and concluded the reciter was not
   * there — which is exactly the report that prompted this field. Only the
   * variants that a person would plausibly type, not every permutation;
   * `searchReciters` already ignores case, spaces, hyphens and the "al"
   * article, so those never need to be listed.
   */
  aliases?: readonly string[];
};

export const RECITERS: ReadonlyArray<Reciter> = [
  {
    id: 'husary',
    name: 'Mahmoud Khalil Al-Husary',
    arabicName: 'محمود خليل الحصري',
    folder: 'Husary_64kbps',
    hasTimings: true,
    aliases: ['hosary', 'husari', 'hussary', 'hussari', 'alhusary'],
  },
  {
    id: 'alafasy',
    name: 'Mishary Rashid Alafasy',
    arabicName: 'مشاري راشد العفاسي',
    folder: 'Alafasy_128kbps',
    hasTimings: true,
    aliases: ['afasy', 'mishari', 'meshari', 'mashary', 'alafasi'],
  },
  {
    id: 'abdulbasit',
    name: 'Abdul Basit Abdus-Samad',
    arabicName: 'عبد الباسط عبد الصمد',
    folder: 'Abdul_Basit_Murattal_64kbps',
    hasTimings: true,
    aliases: ['abdel basset', 'abdulbasset', 'abd al basit', 'abdul baset', 'samad'],
  },
  {
    id: 'minshawi',
    name: 'Mohamed Siddiq El-Minshawi',
    arabicName: 'محمد صديق المنشاوي',
    folder: 'Minshawy_Murattal_128kbps',
    hasTimings: true,
    aliases: ['minshawy', 'menshawi', 'menshawy', 'minshawee'],
  },
  {
    id: 'shuraym',
    name: 'Saud Al-Shuraim',
    arabicName: 'سعود الشريم',
    folder: 'Saood_ash-Shuraym_128kbps',
    hasTimings: true,
    aliases: ['shuraim', 'shureim', 'shoraim', 'saud'],
  },
  {
    id: 'sudais',
    name: 'Abdurrahman As-Sudais',
    arabicName: 'عبد الرحمن السديس',
    folder: 'Abdurrahmaan_As-Sudais_192kbps',
    hasTimings: true,
    aliases: ['sudays', 'sedais', 'soudais', 'abdul rahman'],
  },
  {
    id: 'shatri',
    name: 'Abu Bakr Ash-Shatri',
    arabicName: 'أبو بكر الشاطري',
    folder: 'Abu_Bakr_Ash-Shaatree_128kbps',
    hasTimings: true,
    aliases: ['shaatri', 'shatry', 'shaatree', 'abubakr'],
  },
  {
    id: 'rifai',
    name: 'Hani Ar-Rifai',
    arabicName: 'هاني الرفاعي',
    folder: 'Hani_Rifai_192kbps',
    hasTimings: true,
    aliases: ['refai', 'rifaai', 'rifa3i', 'hani'],
  },
  {
    id: 'tablawi',
    name: 'Mohammad Al-Tablawi',
    arabicName: 'محمد الطبلاوي',
    folder: 'Mohammad_al_Tablaway_128kbps',
    hasTimings: true,
    aliases: ['tablaway', 'tablawy', 'tiblawi'],
  },
  {
    id: 'maher',
    name: 'Maher Al-Muaiqly',
    arabicName: 'ماهر المعيقلي',
    folder: 'Maher_AlMuaiqly_64kbps',
    hasTimings: false,
    aliases: ['muaiqly', 'moaiqly', 'muayqali', 'muaikly', 'almuaiqly'],
  },
  {
    id: 'ghamdi',
    name: 'Saad Al-Ghamdi',
    arabicName: 'سعد الغامدي',
    folder: 'Ghamadi_40kbps',
    hasTimings: false,
    aliases: ['ghamadi', 'ghamidi', 'saad'],
  },
  {
    id: 'ajmi',
    name: 'Ahmed Al-Ajmi',
    arabicName: 'أحمد بن علي العجمي',
    folder: 'ahmed_ibn_ali_al_ajamy_128kbps',
    hasTimings: false,
    aliases: ['ajami', 'ajamy', 'ajmy', 'ahmad al ajmi', 'ahmed alajami', 'ibn ali'],
  },
  {
    id: 'ayyub',
    name: 'Muhammad Ayyub',
    arabicName: 'محمد أيوب',
    folder: 'Muhammad_Ayyoub_128kbps',
    hasTimings: false,
    aliases: ['ayoub', 'ayyoub', 'ayub'],
  },
  {
    id: 'jibreel',
    name: 'Muhammad Jibreel',
    arabicName: 'محمد جبريل',
    folder: 'Muhammad_Jibreel_128kbps',
    hasTimings: false,
    aliases: ['jibril', 'gibril', 'jibreen'],
  },
  {
    id: 'dosari',
    name: 'Yasser Ad-Dossari',
    arabicName: 'ياسر الدوسري',
    folder: 'Yasser_Ad-Dussary_128kbps',
    hasTimings: false,
    aliases: ['dossari', 'dussary', 'dosary', 'yasser'],
  },
  {
    id: 'hudhaify',
    name: 'Ali Al-Hudhaify',
    arabicName: 'علي الحذيفي',
    folder: 'Hudhaify_128kbps',
    hasTimings: false,
    aliases: ['huthaify', 'hudhaifi', 'huzaifi', 'hothaifi'],
  },
  {
    id: 'qatami',
    name: 'Nasser Al-Qatami',
    arabicName: 'ناصر القطامي',
    folder: 'Nasser_Alqatami_128kbps',
    hasTimings: false,
    aliases: ['qattami', 'katami', 'nasser'],
  },
  {
    id: 'basfar',
    name: 'Abdullah Basfar',
    arabicName: 'عبد الله بصفر',
    folder: 'Abdullah_Basfar_64kbps',
    hasTimings: false,
    aliases: ['basfer', 'busfar'],
  },
  {
    id: 'abbad',
    name: 'Fares Abbad',
    arabicName: 'فارس عباد',
    folder: 'Fares_Abbad_64kbps',
    hasTimings: false,
    aliases: ['abad', 'fares'],
  },
  {
    id: 'budair',
    name: 'Salah Al-Budair',
    arabicName: 'صلاح البدير',
    folder: 'Salah_Al_Budair_128kbps',
    hasTimings: false,
    aliases: ['bodair', 'bdair', 'budayr'],
  },
  {
    id: 'juhany',
    name: 'Abdullah Al-Juhany',
    arabicName: 'عبد الله عواد الجهني',
    folder: 'Abdullaah_3awwaad_Al-Juhaynee_128kbps',
    hasTimings: false,
    aliases: ['juhaynee', 'juhani', 'jehani', 'awwad', 'awad'],
  },

  // ── Added in v2.8.4 ────────────────────────────────────────────────
  // Twenty-one more complete EveryAyah sets, each verified by HTTP range
  // probe on 2026-07-30 against three ayat spread across the mushaf
  // (1:1, 2:286, 114:6) — a folder that answers 206 for the first ayah
  // but 404 for the last is a partial set, and shipping one would strand
  // a listener mid-surah. `Mahmoud_Ali_Al_Banna_32kbps` is the working
  // spelling; the lower-case `mahmoud_ali_albanna_32kbps` seen in some
  // indexes is a 404.
  //
  // Three of these are MUJAWWAD (and one MUALLIM) readings by reciters
  // already listed in murattal: a different recording, a different style,
  // and the one people ask for by name — so they are separate entries,
  // labelled, rather than replacements.
  {
    id: 'abdulbasit-mujawwad',
    name: 'Abdul Basit Abdus-Samad (Mujawwad)',
    arabicName: 'عبد الباسط عبد الصمد — مجود',
    folder: 'Abdul_Basit_Mujawwad_128kbps',
    hasTimings: false,
    aliases: ['abdel basset mujawwad', 'mujawwad', 'mujawad'],
  },
  {
    id: 'minshawi-mujawwad',
    name: 'Mohamed Siddiq El-Minshawi (Mujawwad)',
    arabicName: 'محمد صديق المنشاوي — مجود',
    folder: 'Minshawy_Mujawwad_192kbps',
    hasTimings: false,
    aliases: ['minshawy', 'menshawi', 'mujawwad', 'mujawad'],
  },
  {
    id: 'husary-mujawwad',
    name: 'Mahmoud Khalil Al-Husary (Mujawwad)',
    arabicName: 'محمود خليل الحصري — مجود',
    folder: 'Husary_Mujawwad_64kbps',
    hasTimings: false,
    aliases: ['hosary', 'husari', 'mujawwad', 'mujawad'],
  },
  {
    id: 'husary-muallim',
    name: 'Mahmoud Khalil Al-Husary (Muallim)',
    arabicName: 'محمود خليل الحصري — المعلم',
    folder: 'Husary_Muallim_128kbps',
    hasTimings: false,
    aliases: ['hosary', 'husari', 'muallim', 'mualim', 'teacher'],
  },
  {
    id: 'jaber',
    name: 'Ali Jaber',
    arabicName: 'علي جابر',
    folder: 'Ali_Jaber_64kbps',
    hasTimings: false,
    aliases: ['jabir', 'jabr'],
  },
  {
    id: 'sowaid',
    name: 'Ayman Suwaid',
    arabicName: 'أيمن سويد',
    folder: 'Ayman_Sowaid_64kbps',
    hasTimings: false,
    aliases: ['suwayd', 'sowaid', 'swaid', 'tajweed'],
  },
  {
    id: 'akhdar',
    name: 'Ibrahim Al-Akhdar',
    arabicName: 'إبراهيم الأخضر',
    folder: 'Ibrahim_Akhdar_32kbps',
    hasTimings: false,
    aliases: ['akhder', 'akhdhar', 'ibrahim'],
  },
  {
    id: 'qahtani',
    name: 'Khalid Al-Qahtani',
    arabicName: 'خالد عبد الله القحطاني',
    folder: 'Khaalid_Abdullaah_al-Qahtaanee_192kbps',
    hasTimings: false,
    aliases: ['qahtaanee', 'kahtani', 'qahtany', 'khaled'],
  },
  {
    id: 'qasim',
    name: 'Muhsin Al-Qasim',
    arabicName: 'محسن القاسم',
    folder: 'Muhsin_Al_Qasim_192kbps',
    hasTimings: false,
    aliases: ['kasim', 'qassim', 'mohsen'],
  },
  {
    id: 'bukhatir',
    name: 'Salah Bukhatir',
    arabicName: 'صلاح بوخاطر',
    folder: 'Salaah_AbdulRahman_Bukhatir_128kbps',
    hasTimings: false,
    aliases: ['boukhatir', 'bukhatier', 'salah'],
  },
  {
    id: 'salamah',
    name: 'Yasser Salamah',
    arabicName: 'ياسر سلامة',
    folder: 'Yaser_Salamah_128kbps',
    hasTimings: false,
    aliases: ['salama', 'yaser'],
  },
  {
    id: 'alili',
    name: 'Aziz Alili',
    arabicName: 'عزيز عليلي',
    folder: 'aziz_alili_128kbps',
    hasTimings: false,
    aliases: ['aleeli', 'azeez'],
  },
  {
    id: 'banna',
    name: 'Mahmoud Ali Al-Banna',
    arabicName: 'محمود علي البنا',
    folder: 'Mahmoud_Ali_Al_Banna_32kbps',
    hasTimings: false,
    aliases: ['albanna', 'elbanna', 'bana'],
  },
  {
    id: 'matrood',
    name: 'Abdullah Al-Matrood',
    arabicName: 'عبد الله المطرود',
    folder: 'Abdullah_Matroud_128kbps',
    hasTimings: false,
    aliases: ['matroud', 'matrud', 'mtrood'],
  },
  {
    id: 'yassin',
    name: 'Sahl Yassin',
    arabicName: 'سهل ياسين',
    folder: 'Sahl_Yassin_128kbps',
    hasTimings: false,
    aliases: ['yasin', 'sahal'],
  },
  {
    id: 'neana',
    name: 'Ahmed Neana',
    arabicName: 'أحمد نعينع',
    folder: 'Ahmed_Neana_128kbps',
    hasTimings: false,
    aliases: ['nuaina', 'nuaynia', 'naina'],
  },
  {
    id: 'abdulkareem',
    name: 'Muhammad Abdul Kareem',
    arabicName: 'محمد عبد الكريم',
    folder: 'Muhammad_AbdulKareem_128kbps',
    hasTimings: false,
    aliases: ['abdulkarim', 'abdel karim'],
  },
  {
    id: 'nabil-rifai',
    name: 'Nabil Ar-Rifai',
    arabicName: 'نبيل الرفاعي',
    folder: 'Nabil_Rifa3i_48kbps',
    hasTimings: false,
    aliases: ['refai', 'rifa3i', 'rifaai', 'nabeel'],
  },
  {
    id: 'alaqimy',
    name: 'Akram Al-Alaqimy',
    arabicName: 'أكرم العلاقمي',
    folder: 'Akram_AlAlaqimy_128kbps',
    hasTimings: false,
    aliases: ['alaqmi', 'alaqemy', 'akram'],
  },
  {
    id: 'mansoori',
    name: 'Karim Mansouri',
    arabicName: 'كريم منصوري',
    folder: 'Karim_Mansoori_40kbps',
    hasTimings: false,
    aliases: ['mansoori', 'mansuri', 'kareem'],
  },
  {
    id: 'suesy',
    name: 'Ali Hajjaj Al-Suesy',
    arabicName: 'علي حجاج السويسي',
    folder: 'Ali_Hajjaj_AlSuesy_128kbps',
    hasTimings: false,
    aliases: ['suwaisy', 'sowesy', 'hajjaj', 'hajaj'],
  },
] as const;

/**
 * Fold a name or query down to what a search should actually compare.
 *
 * Latin: lower case, strip everything that is not a letter or digit, and
 * drop the leading "al"/"el" article — so "Al-Ajmi", "alajmi" and "ajmi"
 * are one string. Arabic: strip the harakat, which nobody types.
 */
export function foldForSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    // Latin combining accents, then Arabic harakat / superscript alef /
    // Quranic marks / tatweel. Written as escapes on purpose: a combining
    // mark pasted literally into a character class is invisible in a diff.
    .replace(/[\u0300-\u036f\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '')
    .replace(/^(al|el)/, '');
}

/**
 * Reciters in the order the picker shows them: alphabetical by display
 * name. The catalog itself stays in the order they were added — it is the
 * provenance record, and `RECITERS[0]` is the default reciter — so the
 * sort lives here, where it is about reading a list of forty-two names.
 */
export function sortedReciters(
  list: ReadonlyArray<Reciter> = RECITERS,
): Reciter[] {
  return [...list].sort((a, b) =>
    a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }),
  );
}

/**
 * Filter the reciter list for the picker's search box. Matches the Latin
 * name, the Arabic name, the id and every declared alias, all folded, and
 * returns them alphabetically.
 */
export function searchReciters(
  query: string,
  list: ReadonlyArray<Reciter> = RECITERS,
): Reciter[] {
  const q = foldForSearch(query);
  const sorted = sortedReciters(list);
  if (!q) return sorted;
  return sorted.filter(r =>
    [r.name, r.arabicName, r.id, ...(r.aliases ?? [])].some(field =>
      foldForSearch(field).includes(q),
    ),
  );
}

export const DEFAULT_RECITER_ID = 'husary';

export function findReciter(id: string): Reciter {
  return (
    RECITERS.find(r => r.id === id) ??
    RECITERS.find(r => r.id === DEFAULT_RECITER_ID) ??
    RECITERS[0]
  );
}

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

/** Streaming URL for one ayah's MP3 on EveryAyah. */
export function ayahAudioUrl(
  reciter: Reciter,
  surah: number,
  ayah: number,
): string {
  return `https://everyayah.com/data/${reciter.folder}/${pad3(surah)}${pad3(ayah)}.mp3`;
}

/** Local filename for one ayah's MP3 (relative to the reciter dir). */
export function ayahAudioFileName(surah: number, ayah: number): string {
  return `${pad3(surah)}${pad3(ayah)}.mp3`;
}

/** Word-timing JSON for a reciter, hosted on this repo's release. */
export function reciterTimingsUrl(reciter: Reciter): string {
  return `https://github.com/Hassan-PS/Mihrab/releases/download/quran-timings-v1/${reciter.folder}.timings.json`;
}

export const RECITATION_ATTRIBUTION =
  'Recitation audio (42 reciters) courtesy of EveryAyah.com. Word ' +
  'timings derived from the quran-align project (Colin Fair), CC BY 4.0.';
