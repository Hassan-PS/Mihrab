/**
 * No string may rely on its inline English default.
 *
 * `t('some.key', 'Some English')` renders the default whenever the key is
 * absent — silently, and only for the twelve languages that are not English.
 * Twenty-seven keys had drifted into that state: the Quran reader's edition
 * picker showed "CHOOSE" in Arabic, the reset confirmation was English in
 * every locale, and the onboarding salam fell back to its translation.
 *
 * `localeParity` catches a key present in en.json but missing elsewhere.
 * This catches the case it cannot see: a key that was never added to
 * en.json at all, because the call site quietly carries a default.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '..', 'src');
const EN = JSON.parse(
  fs.readFileSync(path.join(SRC, 'i18n', 'locales', 'en.json'), 'utf-8'),
) as Record<string, unknown>;

function hasKey(dotted: string): boolean {
  let cur: unknown = EN;
  for (const part of dotted.split('.')) {
    if (typeof cur !== 'object' || cur === null || !(part in cur)) return false;
    cur = (cur as Record<string, unknown>)[part];
  }
  return true;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

describe('translation keys', () => {
  const files = walk(SRC);

  test('every t() key used in the app exists in en.json', () => {
    const missing = new Map<string, string>();
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf-8');
      // t('a.b', …) — namespaced keys only; a bare word is usually a
      // variable holding an already-resolved string.
      for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+)'\s*[,)]/g)) {
        const key = m[1];
        if (!hasKey(key)) {
          missing.set(key, path.relative(SRC, file));
        }
      }
    }
    expect(
      Array.from(missing, ([key, file]) => `${key} (${file})`),
    ).toEqual([]);
  });
});
