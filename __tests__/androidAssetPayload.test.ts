/**
 * What the repo's `assets/` folder costs an Android download.
 *
 * `android/app/build.gradle` adds the repo-root `assets/` directory as an
 * Android asset root so the Qur'an JSON can be read off disk by path on
 * both platforms. That line is indiscriminate: it ships the WHOLE folder,
 * and for a long time the folder held things no copy of the app ever
 * opened — five store screenshots, a 2048px icon source, and four PNGs
 * that Metro was already bundling into `res/drawable-mdpi/` because they
 * are `require()`d from JS. About 700 KB on every install, invisible
 * because nothing broke.
 *
 * iOS never paid it: the Xcode project copies `../assets/quran` and
 * nothing else. So this is a one-platform leak that only a test looking
 * at the folder as a whole would notice.
 *
 * The rule this holds: every entry in `assets/` is either read off disk
 * at runtime, or named in the gradle ignore list. There is no third
 * category. Adding a file to `assets/` should mean deciding which of the
 * two it is, and this test is what asks.
 */

import { readdirSync, readFileSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const GRADLE = path.join(ROOT, 'android/app/build.gradle');

/** Entries read off disk at runtime, by path, and therefore shipped. */
const READ_AT_RUNTIME = ['quran'];

const gradle = readFileSync(GRADLE, 'utf-8');

/**
 * The `!name` patterns this project adds to AGP's defaults. Scoped to the
 * literal `ignoreAssetsPatterns.addAll([...])` block so the many other
 * arrays in this build file cannot accidentally answer for it.
 */
function ignoredAssets(): string[] {
  const block = gradle.match(
    /ignoreAssetsPatterns\s*(?:\.addAll\(|\+=)\s*\[([\s\S]*?)\]/,
  );
  if (!block) return [];
  return [...block[1].matchAll(/"!([^"]+)"/g)].map(m => m[1]);
}

/** Top-level entries of `assets/`, minus dotfiles AGP ignores anyway. */
function assetEntries(): string[] {
  return readdirSync(ASSETS)
    .filter(name => !name.startsWith('.'))
    .sort();
}

/** Every `.ts`/`.tsx` file under `src/`, as one blob to search. */
function sourceText(): string {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) out.push(readFileSync(full, 'utf-8'));
    }
  };
  walk(path.join(ROOT, 'src'));
  return out.join('\n');
}

describe('the repo assets/ folder', () => {
  const entries = assetEntries();
  const ignored = ignoredAssets();

  test('holds nothing that is neither read at runtime nor ignored', () => {
    const unaccounted = entries.filter(
      name => !READ_AT_RUNTIME.includes(name) && !ignored.includes(name),
    );
    // Anything landing here ships to every Android user. If it is app data
    // read by path, add it to READ_AT_RUNTIME. If JS `require()`s it, add
    // it to ignoreAssetsPatterns in android/app/build.gradle — Metro
    // already puts it in res/. If it is neither, it belongs in branding/.
    expect(unaccounted).toEqual([]);
  });

  test('ignores nothing that has since left the folder', () => {
    const stale = ignored.filter(name => !entries.includes(name));
    expect(stale).toEqual([]);
  });

  test('every ignored file is one JS actually requires', () => {
    const src = sourceText();
    for (const name of ignored) {
      // The require is why skipping the raw copy is safe: Metro copies it
      // into res/drawable-mdpi at bundle time, so the image still ships,
      // once. An ignored file that nothing requires would just disappear.
      expect(`${name}: ${src.includes(`assets/${name}`)}`).toBe(`${name}: true`);
    }
  });

  test('still ships the Qur’an data the loader reads by path', () => {
    // src/quran/translations.ts builds `quran/translations/{id}.json` and
    // hands it to ReactNativeBlobUtil — a path, not a require. This one
    // has to stay a raw asset.
    expect(READ_AT_RUNTIME).toContain('quran');
    expect(entries).toContain('quran');
    expect(ignored).not.toContain('quran');
    expect(readdirSync(path.join(ASSETS, 'quran')).sort()).toEqual([
      'surahs',
      'tajweed',
      'translations',
    ]);
  });
});
