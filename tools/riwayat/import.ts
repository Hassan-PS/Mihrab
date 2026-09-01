/**
 * Check a riwayah dataset before anyone reads scripture out of it.
 *
 *   npx tsx tools/riwayat/import.ts --input <file.json> [--out <dir>]
 *
 * ── WHAT CHANGED, AND WHY ─────────────────────────────────────────────
 *
 * This used to write `src/quran/data/<riwayah>/{pages,text}.json` for the
 * app to bundle. It does not any more, because the app does not bundle a
 * riwayah at all: Mihrab has no right to redistribute the Warsh corpus
 * and nobody publishes one under terms that would give it one, so the
 * reader obtains the muṣḥaf from whoever publishes it and it lands on
 * their device (`src/quran/riwayahStore.ts`).
 *
 * That moved the important half of this file into `src/`. The CHECKS —
 * 6236 ayahs, 114 surahs, every count exact, no duplicates, no empty
 * text, pages that never go backwards, no page nobody is on — are now
 * `verifyRiwayahDataset`, and the phone runs the same function on the
 * same file. A check that only ran here would have protected only the
 * person who ran it.
 *
 * What is left is still worth having: a way to look at a dataset before
 * pointing anyone at it, and to see the refusals fire
 * (`check-refusals.sh`). `--out` writes the converted pair for local
 * testing — serve it over https and give the app the link.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { verifyRiwayahDataset } from '../../src/quran/riwayahImport';

const hafs = require('../../src/quran/data/pages.json') as {
  surahs: Array<{ number: number; name: string; englishName: string }>;
};

function die(message: string): never {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function main(): void {
  const input = arg('input');
  if (!input) {
    die('usage: import.ts --input <dataset.json> [--out <dir>]');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(input, 'utf8'));
  } catch (e) {
    die(`could not read ${input} as JSON: ${String(e)}`);
  }

  const result = verifyRiwayahDataset(raw, hafs.surahs);
  if (!result.ok) die(result.error);

  const { dataset, totalPages } = result;
  const ayahs = Object.keys(dataset.text).length;
  console.log(`\n  ✓ ${ayahs} ayahs, ${totalPages} pages, 114 surahs`);
  console.log('  ✓ every surah has its exact ayah count');
  console.log('  ✓ pages run forwards and none is empty');

  const out = arg('out');
  if (!out) {
    console.log(
      '\n  Nothing was written. This file is a muṣḥaf as far as these\n' +
        '  checks can tell; whether it is the one it claims to be, and\n' +
        '  whether you may pass it on, are not questions a script can\n' +
        '  answer. See docs/design/riwayat-plan.md §0.\n',
    );
    return;
  }

  const dir = path.resolve(out);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, 'pages.json'),
    JSON.stringify({ pages: dataset.pages, surahs: dataset.surahs }) + '\n',
  );
  writeFileSync(
    path.join(dir, 'text.json'),
    JSON.stringify(dataset.text) + '\n',
  );
  console.log(`  ✓ wrote ${path.relative(process.cwd(), dir)}/pages.json`);
  console.log(`  ✓ wrote ${path.relative(process.cwd(), dir)}/text.json`);
  console.log(
    '\n  These are the CONVERTED files. The app installs the ORIGINAL\n' +
      '  dataset and converts it itself, so use these for inspection —\n' +
      '  give the app the publisher’s own link, not these.\n',
  );
}

main();
