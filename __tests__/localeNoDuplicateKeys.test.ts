/**
 * The same key twice in one locale file, which nothing else can see.
 *
 * `JSON.parse` keeps the LAST occurrence and says nothing. So a new
 * string added under a name that already exists does not collide, does
 * not warn, and does not fail parity — it silently replaces the older
 * one, and whatever used the older one starts rendering the newer one's
 * text. The two are usually in different sections, hundreds of lines
 * apart, which is why nobody notices by reading.
 *
 * That happened on 2026-09-04: `quran.downloadingAudio` already existed
 * for the per-surah download inside the ayah sheet ("Downloading…
 * 40/86"), and a whole-Quran download added a second entry under the
 * same name ("Downloading {{name}}"). The sheet started announcing a
 * reciter where a count belonged, in all thirteen languages at once, and
 * every test passed.
 *
 * The parity suite cannot catch this — it compares parsed objects, and by
 * then the duplicate is gone. This one reads the bytes.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const DIR = join(__dirname, '..', 'src', 'i18n', 'locales');
const FILES = readdirSync(DIR).filter(f => f.endsWith('.json'));

/**
 * Every key path in the file, in source order, duplicates included.
 *
 * A hand-rolled walk rather than a parse, because a parser is exactly the
 * thing that throws the evidence away. The locale files are flat objects
 * of objects with string values, no arrays and no escapes that matter to
 * key names, so tracking brace depth and the section a key sits under is
 * enough to name a collision precisely.
 */
function keyPathsInOrder(source: string): string[] {
  const paths: string[] = [];
  const stack: string[] = [];
  const lineRe = /^\s*"((?:[^"\\]|\\.)*)"\s*:\s*(.*)$/;
  for (const raw of source.split('\n')) {
    const m = lineRe.exec(raw);
    if (m) {
      const key = m[1];
      const rest = m[2].trim();
      paths.push([...stack, key].join('.'));
      if (rest.startsWith('{')) stack.push(key);
      continue;
    }
    const closes = (raw.match(/\}/g) ?? []).length;
    for (let i = 0; i < closes && stack.length > 0; i++) stack.pop();
  }
  return paths;
}

describe('no locale file declares the same key twice', () => {
  it('has locale files to check at all', () => {
    // A guard that silently checks nothing is worse than no guard.
    expect(FILES.length).toBe(13);
  });

  for (const file of FILES) {
    it(`${file} has no duplicate key paths`, () => {
      const source = readFileSync(join(DIR, file), 'utf8');
      const seen = new Set<string>();
      const duplicates: string[] = [];
      for (const path of keyPathsInOrder(source)) {
        if (seen.has(path)) duplicates.push(path);
        else seen.add(path);
      }
      expect(duplicates).toEqual([]);
    });
  }

  it('the walker actually detects a duplicate', () => {
    // Otherwise the thirteen assertions above could be passing because
    // the walker returns nothing useful.
    const contrived = [
      '{',
      '  "quran": {',
      '    "a": "one",',
      '    "b": "two",',
      '    "a": "three"',
      '  }',
      '}',
    ].join('\n');
    const paths = keyPathsInOrder(contrived);
    expect(paths).toContain('quran.a');
    expect(paths.filter(p => p === 'quran.a')).toHaveLength(2);
  });

  it('the walker does not confuse two sections that share a key name', () => {
    // `settings.title` and `quran.title` are different keys, and flagging
    // them would make this test useless noise.
    const contrived = [
      '{',
      '  "settings": {',
      '    "title": "one"',
      '  },',
      '  "quran": {',
      '    "title": "two"',
      '  }',
      '}',
    ].join('\n');
    const paths = keyPathsInOrder(contrived);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
