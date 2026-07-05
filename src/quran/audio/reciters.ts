/**
 * Reciter registry — QR-15/16 (docs/quran-reader-plan.md).
 *
 * Five murattal reciters chosen so that every one has BOTH a complete
 * EveryAyah per-ayah MP3 set AND validated word-timing data from
 * cpfair/quran-align (CC BY 4.0). Timing JSONs are re-hosted on this
 * repo's own `quran-timings-v1` release (same trust model as the mushaf
 * pages). Audio streams from everyayah.com on explicit user action, or
 * plays fully offline once a surah is downloaded (see `audioStore.ts`).
 *
 * All five verified live (HTTP range probes) on 2026-07-04.
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
};

export const RECITERS: ReadonlyArray<Reciter> = [
  {
    id: 'husary',
    name: 'Mahmoud Khalil Al-Husary',
    arabicName: 'محمود خليل الحصري',
    folder: 'Husary_64kbps',
  },
  {
    id: 'alafasy',
    name: 'Mishary Rashid Alafasy',
    arabicName: 'مشاري راشد العفاسي',
    folder: 'Alafasy_128kbps',
  },
  {
    id: 'abdulbasit',
    name: 'Abdul Basit Abdus-Samad',
    arabicName: 'عبد الباسط عبد الصمد',
    folder: 'Abdul_Basit_Murattal_64kbps',
  },
  {
    id: 'minshawi',
    name: 'Mohamed Siddiq El-Minshawi',
    arabicName: 'محمد صديق المنشاوي',
    folder: 'Minshawy_Murattal_128kbps',
  },
  {
    id: 'shuraym',
    name: 'Saud Al-Shuraim',
    arabicName: 'سعود الشريم',
    folder: 'Saood_ash-Shuraym_128kbps',
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
  'Recitation audio courtesy of EveryAyah.com. Word timings derived ' +
  'from the quran-align project (Colin Fair), CC BY 4.0.';
