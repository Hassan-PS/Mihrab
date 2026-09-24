/**
 * Which letters of an āyah fall under which tajwīd rule.
 *
 * One file per surah at `assets/quran/tajweed/{NNN}.json`, built by
 * `scripts/mushaf/build_tajweed_assets.py rules` from quran.com's
 * `text_uthmani_tajweed` markup: `{ v, rules: [id…], ayahs: [[word…]…] }`
 * where a word is `[text]` or `[text, [[ruleIndex, start, end]…]]` and the
 * offsets are UTF-16 indices into that word's text. The text is the API's
 * own — it differs from Tanzil's in a few marks — so the spans are
 * measured against the text they are stored with, never against the
 * reader's.
 *
 * App assets rather than the bundle, like the surah files: 2.6 MB that a
 * reader who never turns the colours on should not carry in memory.
 */
import { Platform } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { tajweedRule, type TajweedRule } from './rules';

export type TajweedSpan = { rule: TajweedRule; start: number; end: number };

export type TajweedWord = {
  /** The API's text of the word — what the spans index into. */
  text: string;
  /** 1-based, as the muṣḥaf layout and the word timings count. */
  position: number;
  spans: TajweedSpan[];
};

export type TajweedAyah = {
  surah: number;
  ayah: number;
  words: TajweedWord[];
  /** The rules that occur, in order of first appearance. */
  rules: TajweedRule[];
};

type RawWord = [string] | [string, Array<[number, number, number]>];
type RawSurah = { v: number; rules: string[]; ayahs: RawWord[][] };

const cache = new Map<number, RawSurah | null>();
const CACHE_MAX = 4;
const inFlight = new Map<number, Promise<RawSurah | null>>();

async function readSurah(surah: number): Promise<RawSurah | null> {
  const file = `quran/tajweed/${String(surah).padStart(3, '0')}.json`;
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

function loadSurah(surah: number): Promise<RawSurah | null> {
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) {
    return Promise.resolve(null);
  }
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

/**
 * The āyah's words and their rules, or null when the file is missing or
 * the āyah is out of range. Words with no rule are still listed — the
 * sheet draws the whole āyah, coloured where it is coloured.
 */
export async function loadTajweedAyah(
  surah: number,
  ayah: number,
): Promise<TajweedAyah | null> {
  const data = await loadSurah(surah);
  const raw = data?.ayahs[ayah - 1];
  if (!raw) return null;
  const rules: TajweedRule[] = [];
  const words = raw.map((w, i) => {
    const spans: TajweedSpan[] = [];
    for (const [ruleIdx, start, end] of w[1] ?? []) {
      const rule = tajweedRule(data!.rules[ruleIdx] ?? '');
      if (!rule) continue;
      spans.push({ rule, start, end });
      if (!rules.includes(rule)) rules.push(rule);
    }
    return { text: w[0], position: i + 1, spans };
  });
  return { surah, ayah, words, rules };
}

/**
 * The word's text cut into runs, each in its rule's ink or in none: what
 * a `<Text>` draws it from. Spans never overlap in the source data, and
 * a stray one that did would be drawn after the one before it ends.
 */
export function tajweedRuns(
  word: TajweedWord,
): Array<{ text: string; rule: TajweedRule | null }> {
  const runs: Array<{ text: string; rule: TajweedRule | null }> = [];
  let at = 0;
  const spans = [...word.spans].sort((a, b) => a.start - b.start);
  for (const span of spans) {
    const start = Math.max(span.start, at);
    const end = Math.min(Math.max(span.end, start), word.text.length);
    if (start > at) runs.push({ text: word.text.slice(at, start), rule: null });
    if (end > start) runs.push({ text: word.text.slice(start, end), rule: span.rule });
    at = end;
  }
  if (at < word.text.length) runs.push({ text: word.text.slice(at), rule: null });
  return runs;
}

export function _resetTajweedDataForTests(): void {
  cache.clear();
  inFlight.clear();
}
