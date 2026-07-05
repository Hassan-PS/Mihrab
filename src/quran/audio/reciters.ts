/**
 * Reciter registry — QR-15/16 (docs/quran-reader-plan.md).
 *
 * Twenty-one mainstream murattal reciters, every one verified to have a
 * complete EveryAyah per-ayah MP3 set (HTTP range probes: the original
 * five on 2026-07-04, the sixteen added in v2.7.27 on 2026-07-05).
 *
 * `hasTimings` marks reciters with validated word-timing data from
 * cpfair/quran-align (CC BY 4.0), re-hosted on this repo's own
 * `quran-timings-v1` release (same trust model as the mushaf pages).
 * Reciters without timings still play perfectly — the reader falls back
 * from word-level to ayah-level highlighting (see `useWordTiming.ts`).
 *
 * Coverage note (v2.7.28 audit): quran-align's corpus covers 9 of our
 * 21 recordings — every timing set it publishes for an EveryAyah
 * murattal folder we ship is hosted and wired up. The remaining 12
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
};

export const RECITERS: ReadonlyArray<Reciter> = [
  {
    id: 'husary',
    name: 'Mahmoud Khalil Al-Husary',
    arabicName: 'محمود خليل الحصري',
    folder: 'Husary_64kbps',
    hasTimings: true,
  },
  {
    id: 'alafasy',
    name: 'Mishary Rashid Alafasy',
    arabicName: 'مشاري راشد العفاسي',
    folder: 'Alafasy_128kbps',
    hasTimings: true,
  },
  {
    id: 'abdulbasit',
    name: 'Abdul Basit Abdus-Samad',
    arabicName: 'عبد الباسط عبد الصمد',
    folder: 'Abdul_Basit_Murattal_64kbps',
    hasTimings: true,
  },
  {
    id: 'minshawi',
    name: 'Mohamed Siddiq El-Minshawi',
    arabicName: 'محمد صديق المنشاوي',
    folder: 'Minshawy_Murattal_128kbps',
    hasTimings: true,
  },
  {
    id: 'shuraym',
    name: 'Saud Al-Shuraim',
    arabicName: 'سعود الشريم',
    folder: 'Saood_ash-Shuraym_128kbps',
    hasTimings: true,
  },
  {
    id: 'sudais',
    name: 'Abdurrahman As-Sudais',
    arabicName: 'عبد الرحمن السديس',
    folder: 'Abdurrahmaan_As-Sudais_192kbps',
    hasTimings: true,
  },
  {
    id: 'shatri',
    name: 'Abu Bakr Ash-Shatri',
    arabicName: 'أبو بكر الشاطري',
    folder: 'Abu_Bakr_Ash-Shaatree_128kbps',
    hasTimings: true,
  },
  {
    id: 'rifai',
    name: 'Hani Ar-Rifai',
    arabicName: 'هاني الرفاعي',
    folder: 'Hani_Rifai_192kbps',
    hasTimings: true,
  },
  {
    id: 'tablawi',
    name: 'Mohammad Al-Tablawi',
    arabicName: 'محمد الطبلاوي',
    folder: 'Mohammad_al_Tablaway_128kbps',
    hasTimings: true,
  },
  {
    id: 'maher',
    name: 'Maher Al-Muaiqly',
    arabicName: 'ماهر المعيقلي',
    folder: 'Maher_AlMuaiqly_64kbps',
    hasTimings: false,
  },
  {
    id: 'ghamdi',
    name: 'Saad Al-Ghamdi',
    arabicName: 'سعد الغامدي',
    folder: 'Ghamadi_40kbps',
    hasTimings: false,
  },
  {
    id: 'ajmi',
    name: 'Ahmed Al-Ajmi',
    arabicName: 'أحمد بن علي العجمي',
    folder: 'ahmed_ibn_ali_al_ajamy_128kbps',
    hasTimings: false,
  },
  {
    id: 'ayyub',
    name: 'Muhammad Ayyub',
    arabicName: 'محمد أيوب',
    folder: 'Muhammad_Ayyoub_128kbps',
    hasTimings: false,
  },
  {
    id: 'jibreel',
    name: 'Muhammad Jibreel',
    arabicName: 'محمد جبريل',
    folder: 'Muhammad_Jibreel_128kbps',
    hasTimings: false,
  },
  {
    id: 'dosari',
    name: 'Yasser Ad-Dossari',
    arabicName: 'ياسر الدوسري',
    folder: 'Yasser_Ad-Dussary_128kbps',
    hasTimings: false,
  },
  {
    id: 'hudhaify',
    name: 'Ali Al-Hudhaify',
    arabicName: 'علي الحذيفي',
    folder: 'Hudhaify_128kbps',
    hasTimings: false,
  },
  {
    id: 'qatami',
    name: 'Nasser Al-Qatami',
    arabicName: 'ناصر القطامي',
    folder: 'Nasser_Alqatami_128kbps',
    hasTimings: false,
  },
  {
    id: 'basfar',
    name: 'Abdullah Basfar',
    arabicName: 'عبد الله بصفر',
    folder: 'Abdullah_Basfar_64kbps',
    hasTimings: false,
  },
  {
    id: 'abbad',
    name: 'Fares Abbad',
    arabicName: 'فارس عباد',
    folder: 'Fares_Abbad_64kbps',
    hasTimings: false,
  },
  {
    id: 'budair',
    name: 'Salah Al-Budair',
    arabicName: 'صلاح البدير',
    folder: 'Salah_Al_Budair_128kbps',
    hasTimings: false,
  },
  {
    id: 'juhany',
    name: 'Abdullah Al-Juhany',
    arabicName: 'عبد الله عواد الجهني',
    folder: 'Abdullaah_3awwaad_Al-Juhaynee_128kbps',
    hasTimings: false,
  },
] as const;

export const DEFAULT_RECITER_ID = 'husary';

export function findReciter(id: string): Reciter {
  return RECITERS.find(r => r.id === id) ?? RECITERS[0];
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
  'Recitation audio (21 reciters) courtesy of EveryAyah.com. Word ' +
  'timings derived from the quran-align project (Colin Fair), CC BY 4.0.';
