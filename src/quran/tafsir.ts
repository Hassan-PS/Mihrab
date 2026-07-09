/**
 * Real tafsir — v2.7.28.
 *
 * Classical tafsir texts fetched per-ayah on demand and cached on disk,
 * shown in the ayah action sheet next to the translation. Source:
 * spa5k/tafsir_api (github.com/spa5k/tafsir_api), a public mirror of
 * Quran.com's tafsir corpus served via the jsDelivr CDN — the same
 * texts Quran.com displays. Every edition is attributed in
 * Settings → About (religious-content rule, CLAUDE.md §4).
 *
 * Cache layout: <Documents>/quran/tafsir/{editionId}/{surah}/{ayah}.json
 * (inside the managed `quran/` store so it is excluded from Android
 * Auto Backup and cleaned by the Manage-downloads screen).
 */
import ReactNativeBlobUtil from 'react-native-blob-util';
import { mkdirDeep } from './mushafDownload';

export type TafsirEdition = {
  id: string;
  /** Display label (proper noun — not translated). */
  label: string;
  /** App locale this edition serves. */
  locale: string;
  /** RTL text? */
  rtl: boolean;
};

/**
 * Verified live against the CDN on 2026-07-05 (HTTP 200 for 1:1).
 * Locales without a native edition fall back to Ibn Kathir (English).
 */
export const TAFSIR_EDITIONS: ReadonlyArray<TafsirEdition> = [
  {
    id: 'en-tafisr-ibn-kathir', // (sic — upstream id carries the typo)
    label: 'Ibn Kathir (abridged)',
    locale: 'en',
    rtl: false,
  },
  {
    id: 'en-tafsir-maarif-ul-quran',
    label: 'Maarif-ul-Quran',
    locale: 'en',
    rtl: false,
  },
  {
    id: 'ar-tafsir-muyassar',
    label: 'التفسير الميسر',
    locale: 'ar',
    rtl: true,
  },
  {
    id: 'ar-tafsir-ibn-kathir',
    label: 'تفسير ابن كثير',
    locale: 'ar',
    rtl: true,
  },
  {
    id: 'ur-tafseer-ibn-e-kaseer',
    label: 'تفسیر ابن کثیر (اردو)',
    locale: 'ur',
    rtl: true,
  },
  {
    id: 'bn-tafseer-ibn-e-kaseer',
    label: 'তাফসীর ইবনে কাসীর',
    locale: 'bn',
    rtl: false,
  },
] as const;

/** Editions offered for an app locale: native ones first, then English. */
export function tafsirEditionsForLocale(locale: string): TafsirEdition[] {
  const native = TAFSIR_EDITIONS.filter(e => e.locale === locale);
  const english = TAFSIR_EDITIONS.filter(e => e.locale === 'en');
  return locale === 'en' ? english : [...native, ...english];
}

export function findTafsirEdition(id: string): TafsirEdition | undefined {
  return TAFSIR_EDITIONS.find(e => e.id === id);
}

/**
 * Resolve the tafsir edition to show for a stored preference + app locale.
 * Honours the stored id when it is offered for the current locale; otherwise
 * falls back to the locale's first edition. This keeps the Quran-page picker
 * and the Settings selector in agreement and guarantees a valid edition even
 * after a language change or an unknown/blank stored id.
 */
export function resolveTafsirEdition(
  storedId: string,
  locale: string,
): TafsirEdition {
  const offered = tafsirEditionsForLocale(locale);
  return offered.find(e => e.id === storedId) ?? offered[0];
}

function tafsirUrl(edition: string, surah: number, ayah: number): string {
  return `https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir/${edition}/${surah}/${ayah}.json`;
}

export function tafsirCacheDir(): string {
  return `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/quran/tafsir`;
}

function cachePath(edition: string, surah: number, ayah: number): string {
  return `${tafsirCacheDir()}/${edition}/${surah}/${ayah}.json`;
}

/**
 * Fetch (or read from cache) one ayah's tafsir text. Resolves null on
 * any failure — the UI shows a quiet "unavailable offline" note.
 */
export async function loadTafsir(
  edition: string,
  surah: number,
  ayah: number,
): Promise<string | null> {
  const path = cachePath(edition, surah, ayah);
  try {
    if (await ReactNativeBlobUtil.fs.exists(path)) {
      const raw = await ReactNativeBlobUtil.fs.readFile(path, 'utf8');
      const parsed = JSON.parse(String(raw)) as { text?: string };
      if (parsed.text) return parsed.text;
    }
  } catch {
    /* fall through to network */
  }
  try {
    const res = await fetch(tafsirUrl(edition, surah, ayah));
    if (!res.ok) return null;
    const parsed = (await res.json()) as { text?: string };
    const text = parsed.text?.trim();
    if (!text) return null;
    // Cache for offline re-reads (best effort).
    try {
      await mkdirDeep(`${tafsirCacheDir()}/${edition}/${surah}`);
      await ReactNativeBlobUtil.fs.writeFile(
        path,
        JSON.stringify({ text }),
        'utf8',
      );
    } catch {
      /* cache write is optional */
    }
    return text;
  } catch {
    return null;
  }
}

/** Bytes on disk in the tafsir cache (Manage-downloads screen). */
export async function tafsirDiskUsage(): Promise<number> {
  const walk = async (dir: string): Promise<number> => {
    try {
      const entries = await ReactNativeBlobUtil.fs.lstat(dir);
      let sum = 0;
      for (const e of entries) {
        if (e.type === 'directory') {
          sum += await walk(`${dir}/${e.filename}`);
        } else {
          sum += Number(e.size) || 0;
        }
      }
      return sum;
    } catch {
      return 0;
    }
  };
  if (!(await ReactNativeBlobUtil.fs.exists(tafsirCacheDir()))) return 0;
  return walk(tafsirCacheDir());
}

/** Delete the whole tafsir cache. */
export async function deleteTafsirCache(): Promise<void> {
  try {
    await ReactNativeBlobUtil.fs.unlink(tafsirCacheDir());
  } catch {
    /* already gone */
  }
}

export const TAFSIR_ATTRIBUTION =
  'Tafsir texts (Ibn Kathir, Maarif-ul-Quran, al-Muyassar) via the ' +
  'spa5k/tafsir_api mirror of the Quran.com tafsir corpus.';
