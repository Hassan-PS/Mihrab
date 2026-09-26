/**
 * Tajwīd for the Warsh muṣḥaf — which letters of each word the colours
 * paint, and in which rule's ink.
 *
 * ── WHERE THE SPANS COME FROM ─────────────────────────────────────────
 *
 * `assets/quran/tajweed-warsh/{NNN}.json`, built by
 * `scripts/mushaf/build_warsh_tajweed.py` from the King Fahd Complex's
 * Warsh text with the rules in `scripts/mushaf/warsh_tajweed.py`, which
 * refuses to build unless its fixtures pass (issue #58: each Warsh case
 * cited to ʿAbd al-Jalīl's *Uṣūl riwāyat Warsh*). The shape is the Ḥafṣ
 * files' (`tajweedData.ts`), with one difference:
 *
 * ── A HASH WHERE THE HAFS FILES HAVE THE WORD ─────────────────────────
 *
 * Mihrab does not ship the Warsh text — the device fetches it from the
 * publisher (`riwayahStore.ts` has why) — and a file that listed every
 * word would be that text under another name. So each word is a hash of
 * its text: `"h"` or `["h", [[ruleIndex, start, end]…]]`, FNV-1a over the
 * UTF-16 code units, 8 hex characters. A span is an offset into ONE text;
 * on a word that does not hash the same, the offsets would paint the
 * wrong letters, so such a word is drawn in plain ink. Nothing is ever
 * coloured on trust.
 *
 * ── ONE INK PER LETTER ────────────────────────────────────────────────
 *
 * The spans overlap where two rules meet on a letter — a thick rāʾ that
 * also carries the tanwīn of an idghām, a madd letter under taqlīl. A
 * letter takes one colour, so `PRIORITY` decides: what changes what is
 * SAID (silent, a moved hamza, a hum, a long vowel) before how heavy a
 * letter sounds.
 */
import { Platform } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { tajweedRule, type TajweedRule, type TajweedRuleId } from './rules';

type RawWord = string | [string, Array<[number, number, number]>] | null;
type RawSurah = { v: number; rules: string[]; ayahs: RawWord[][] };

/** A word's colour runs, left to right in the string (not on screen). */
export type WarshRun = { text: string; rule: TajweedRule | null };

export type WarshTajweedWord = {
  text: string;
  /** 1-based, among the āyah's whitespace-separated words. */
  position: number;
  rules: TajweedRule[];
  runs: WarshRun[];
};

/** Later wins: the rule a shared letter is painted in. */
const PRIORITY: readonly TajweedRuleId[] = [
  'tafkheem',
  'laam_taghleedh',
  'raa_tarqeeq',
  'madda_normal',
  'madda_permissible',
  'madd_badal',
  'leen_mahmooz',
  'qalaqah',
  'ikhafa',
  'ikhafa_shafawi',
  'iqlab',
  'idgham_ghunnah',
  'idgham_shafawi',
  'ghunnah',
  'madda_obligatory_monfasel',
  'madda_obligatory_mottasel',
  'madda_necessary',
  'taqleel',
  'tasheel',
  'naql',
  'idgham_mutaqaribayn',
  'idgham_mutajanisayn',
  'idgham_wo_ghunnah',
  'laam_shamsiyah',
  'slnt',
  'ham_wasl',
];
const RANK = new Map(PRIORITY.map((id, i) => [id, i]));

/** FNV-1a over UTF-16 code units — the build's `fnv1a`, to the bit. */
export function warshWordHash(text: string): string {
  let h = 0x811c9dc5;
  // A hash is bit arithmetic; there is no other way to write it.
  /* eslint-disable no-bitwise */
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  /* eslint-enable no-bitwise */
  return h.toString(16).padStart(8, '0');
}

/**
 * The word cut into runs, each in one rule's ink or in none. Pure: the
 * spans are `[rule, start, end)` in UTF-16 offsets, and where two cover a
 * letter the one ranked later in `PRIORITY` paints it.
 */
export function warshRuns(
  text: string,
  spans: ReadonlyArray<{ rule: TajweedRule; start: number; end: number }>,
): WarshRun[] {
  const at: Array<TajweedRule | null> = new Array(text.length).fill(null);
  const rank = (r: TajweedRule | null) => (r ? RANK.get(r.id) ?? -1 : -2);
  for (const s of spans) {
    const start = Math.max(0, s.start);
    const end = Math.min(text.length, s.end);
    for (let i = start; i < end; i++) {
      if (rank(s.rule) > rank(at[i])) at[i] = s.rule;
    }
  }
  const runs: WarshRun[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = runs[runs.length - 1];
    if (last && last.rule === at[i]) last.text += text[i];
    else runs.push({ text: text[i], rule: at[i] });
  }
  return runs;
}

// ── Loading ──────────────────────────────────────────────────────────

const cache = new Map<number, RawSurah | null>();
const CACHE_MAX = 6;
const inFlight = new Map<number, Promise<RawSurah | null>>();

async function readSurah(surah: number): Promise<RawSurah | null> {
  const file = `quran/tajweed-warsh/${String(surah).padStart(3, '0')}.json`;
  const path =
    Platform.OS === 'android'
      ? ReactNativeBlobUtil.fs.asset(file)
      : `${ReactNativeBlobUtil.fs.dirs.MainBundleDir}/${file}`;
  try {
    const raw = await ReactNativeBlobUtil.fs.readFile(path, 'utf8');
    const data = JSON.parse(String(raw)) as RawSurah;
    return data && data.v === 1 && Array.isArray(data.ayahs) ? data : null;
  } catch {
    return null;
  }
}

/** The surah's raw spans, or null when the file is missing. Cached. */
export function loadWarshSurah(surah: number): Promise<RawSurah | null> {
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) return Promise.resolve(null);
  const hit = cache.get(surah);
  if (hit !== undefined) return Promise.resolve(hit);
  const pending = inFlight.get(surah);
  if (pending) return pending;
  const p = readSurah(surah).then(data => {
    inFlight.delete(surah);
    cache.set(surah, data);
    if (cache.size > CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    return data;
  });
  inFlight.set(surah, p);
  return p;
}

/** Synchronous, for the render path: the surah if it is already loaded. */
export function warshSurahIfLoaded(surah: number): RawSurah | null | undefined {
  return cache.get(surah);
}

/**
 * One āyah's words, coloured where the file and the text agree.
 *
 * `text` is the āyah as the device has it; its words are matched to the
 * file's by position AND hash, and a word that does not match is left in
 * ink rather than guessed at.
 */
export function warshAyahWords(
  data: RawSurah,
  ayah: number,
  text: string,
): WarshTajweedWord[] {
  const raw = data.ayahs[ayah - 1] ?? [];
  const tokens = text.split(/\s+/).filter(Boolean);
  return tokens.map((token, i) => {
    const entry = raw[i];
    const spans: Array<{ rule: TajweedRule; start: number; end: number }> = [];
    const hash = entry == null ? null : typeof entry === 'string' ? entry : entry[0];
    if (hash != null && hash === warshWordHash(token) && Array.isArray(entry)) {
      for (const [ri, start, end] of entry[1]) {
        const rule = tajweedRule(data.rules[ri] ?? '');
        if (rule) spans.push({ rule, start, end });
      }
    }
    const runs = warshRuns(token, spans);
    // Every rule the word carries, painted or not: a thick rāʾ under the
    // green of an idghām is still a thick rāʾ, and the sheet says so.
    const rules: TajweedRule[] = [];
    for (const s of [...spans].sort((a, b) => a.start - b.start)) {
      if (!rules.includes(s.rule)) rules.push(s.rule);
    }
    return { text: token, position: i + 1, rules, runs };
  });
}

export function _resetWarshTajweedForTests(): void {
  cache.clear();
  inFlight.clear();
}
