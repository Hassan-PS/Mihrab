/**
 * Turn a published riwayah dataset into the two files the app reads.
 *
 *   npx tsx tools/riwayat/import.ts --riwayah warsh --input <file.json>
 *
 * ── WHY AN IMPORTER AND NOT A FETCHER ─────────────────────────────────
 *
 * The Habous pipeline fetches, because the ministry publishes at a URL and
 * the terms are settled. This one does not, for two reasons that both
 * matter.
 *
 * The licence is unresolved (`docs/design/riwayat-plan.md`): QUL's code is
 * MIT, its RESOURCES state no licence at all, and its credits name KFGQPC
 * and Tanzil upstream. Whoever runs this has to have obtained the file
 * under terms they can point at — and that act, deliberately, is a human
 * one that leaves a trace, rather than something a script does quietly on
 * a schedule.
 *
 * And there is nothing stable to fetch: QUL's downloads are JS-driven, its
 * API is "coming soon", and quran.com's v4 API does not serve a Warsh
 * script — asked for one it silently returns Uthmani, which is the same
 * shape of failure as the AlAdhan date bug and just as invisible.
 *
 * So: a human obtains the file, this turns it into `pages.json` and
 * `text.json` under `src/quran/data/<riwayah>/`, and refuses anything it
 * cannot vouch for.
 *
 * ── WHAT IT REFUSES ───────────────────────────────────────────────────
 *
 * Scripture is the one payload where "probably right" is not a state the
 * app may ship in, so every check below is fatal rather than a warning.
 * A checksum proves a file arrived intact; these prove it is a Qur'an.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';

type QulWord = { position?: number; text?: string; location?: string };
type QulVerse = {
  verse_key?: string;
  text?: string;
  page_number?: number;
  juz_number?: number;
  words?: QulWord[];
};

/** Ayahs per surah — the shape any Qur'an must have. */
const AYAH_COUNTS = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128,
  111, 110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73,
  54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60,
  49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52,
  44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19,
  26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3,
  6, 3, 5, 4, 5, 6,
];
const TOTAL_AYAHS = AYAH_COUNTS.reduce((a, b) => a + b, 0); // 6236

function die(message: string): never {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function main(): void {
  const riwayah = arg('riwayah');
  const input = arg('input');
  if (!riwayah || !input) {
    die('usage: import.ts --riwayah <id> --input <dataset.json>');
  }
  if (!/^[a-z]+$/.test(riwayah)) die(`riwayah id "${riwayah}" is not a slug`);

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(input, 'utf8'));
  } catch (e) {
    die(`could not read ${input} as JSON: ${String(e)}`);
  }

  // The dataset ships either as a bare array or wrapped; accept both
  // rather than make the caller reshape a file they were given.
  const verses: QulVerse[] = Array.isArray(raw)
    ? (raw as QulVerse[])
    : ((raw as { verses?: QulVerse[] }).verses ?? []);
  if (verses.length === 0) die('no verses found in the input');

  // ── It has to be a Qur'an ───────────────────────────────────────────
  if (verses.length !== TOTAL_AYAHS) {
    die(
      `expected ${TOTAL_AYAHS} ayahs, found ${verses.length}. ` +
        'This is not the whole Qur’an and will not be imported.',
    );
  }

  const bySurah = new Map<number, Map<number, QulVerse>>();
  for (const v of verses) {
    const key = v.verse_key ?? '';
    const m = /^(\d+):(\d+)$/.exec(key);
    if (!m) die(`verse_key "${key}" is not in surah:ayah form`);
    const surah = Number(m[1]);
    const ayah = Number(m[2]);
    if (surah < 1 || surah > 114) die(`surah ${surah} is out of range`);
    if (!v.text || !v.text.trim()) die(`${key} has no text`);
    if (typeof v.page_number !== 'number') die(`${key} has no page_number`);
    if (!bySurah.has(surah)) bySurah.set(surah, new Map());
    if (bySurah.get(surah)!.has(ayah)) die(`${key} appears twice`);
    bySurah.get(surah)!.set(ayah, v);
  }

  if (bySurah.size !== 114) die(`expected 114 surahs, found ${bySurah.size}`);
  for (let s = 1; s <= 114; s++) {
    const got = bySurah.get(s);
    if (!got) die(`surah ${s} is missing entirely`);
    if (got.size !== AYAH_COUNTS[s - 1]) {
      die(`surah ${s} has ${got.size} ayahs, expected ${AYAH_COUNTS[s - 1]}`);
    }
    for (let a = 1; a <= AYAH_COUNTS[s - 1]; a++) {
      if (!got.has(a)) die(`${s}:${a} is missing`);
    }
  }

  // ── Its pagination has to be a pagination ───────────────────────────
  const pageOf = (s: number, a: number) => bySurah.get(s)!.get(a)!.page_number!;
  const juzOf = (s: number, a: number) => bySurah.get(s)!.get(a)!.juz_number ?? 1;

  let lastPage = 0;
  for (let s = 1; s <= 114; s++) {
    for (let a = 1; a <= AYAH_COUNTS[s - 1]; a++) {
      const page = pageOf(s, a);
      // Pages must never go backwards as you read forwards. This is the
      // check that would catch a dataset stitched together in the wrong
      // order — the failure that would look completely plausible on screen.
      if (page < lastPage) {
        die(`page numbers go backwards at ${s}:${a} (${lastPage} → ${page})`);
      }
      lastPage = page;
    }
  }
  const totalPages = lastPage;
  if (totalPages < 1) die('no page numbers at all');

  // Contiguity: a muṣḥaf with a page nobody is on is a broken import.
  const seen = new Set<number>();
  for (let s = 1; s <= 114; s++) {
    for (let a = 1; a <= AYAH_COUNTS[s - 1]; a++) seen.add(pageOf(s, a));
  }
  for (let p = 1; p <= totalPages; p++) {
    if (!seen.has(p)) die(`page ${p} has no ayahs on it`);
  }

  // ── Build what the app reads ────────────────────────────────────────
  const pages: Array<{
    page: number;
    juz: number;
    start: { surah: number; ayah: number };
    end: { surah: number; ayah: number } | null;
  }> = [];
  const firstOf = new Map<number, { surah: number; ayah: number }>();
  for (let s = 1; s <= 114; s++) {
    for (let a = 1; a <= AYAH_COUNTS[s - 1]; a++) {
      const p = pageOf(s, a);
      if (!firstOf.has(p)) firstOf.set(p, { surah: s, ayah: a });
    }
  }
  for (let p = 1; p <= totalPages; p++) {
    const start = firstOf.get(p)!;
    // `end` is EXCLUSIVE and null on the last page — the same contract
    // `pages.json` has for Hafs, so `findPageForAyah` is shared.
    const end = p < totalPages ? firstOf.get(p + 1)! : null;
    pages.push({ page: p, juz: juzOf(start.surah, start.ayah), start, end });
  }

  const text: Record<string, string> = {};
  for (let s = 1; s <= 114; s++) {
    for (let a = 1; a <= AYAH_COUNTS[s - 1]; a++) {
      text[`${s}:${a}`] = bySurah.get(s)!.get(a)!.text!.trim();
    }
  }

  // The surah index is carried over from the Hafs table: surah names are
  // the same 114 names, and inventing a second spelling here would be a
  // difference nobody asked for.
  const hafs = JSON.parse(
    readFileSync(
      path.join(__dirname, '..', '..', 'src', 'quran', 'data', 'pages.json'),
      'utf8',
    ),
  ) as { surahs: unknown };

  const outDir = path.join(
    __dirname, '..', '..', 'src', 'quran', 'data', riwayah,
  );
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    path.join(outDir, 'pages.json'),
    JSON.stringify({ pages, surahs: hafs.surahs }, null, 0) + '\n',
  );
  writeFileSync(
    path.join(outDir, 'text.json'),
    JSON.stringify(text, null, 0) + '\n',
  );

  console.log(`\n  ✓ ${riwayah}: ${verses.length} ayahs, ${totalPages} pages`);
  console.log(`  ✓ wrote ${path.relative(process.cwd(), outDir)}/pages.json`);
  console.log(`  ✓ wrote ${path.relative(process.cwd(), outDir)}/text.json`);
  console.log(
    `\n  Now set totalPages: ${totalPages} for "${riwayah}" in ` +
      'src/quran/riwayat.ts if it differs from what is declared there,\n' +
      '  and record where this dataset came from and under what terms.\n',
  );
}

main();
