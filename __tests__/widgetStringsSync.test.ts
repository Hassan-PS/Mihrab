/**
 * The iOS widget's string tables are generated from Android's.
 *
 * That only holds if someone remembers to re-run the generator, and the cost
 * of forgetting is invisible until an iPhone is looked at in another language:
 * a missing key falls back to the key itself, so a widget draws
 * "widget_next_label" where "NEXT" belongs. This test is the reminder — it
 * regenerates in memory and compares, so an edited strings.xml that never
 * reached ios/*.lproj fails here rather than in the App Store.
 */
import { existsSync, readFileSync } from 'fs';
import { relative } from 'path';
const { generate } = require('../scripts/sync-widget-strings.js');

describe('the iOS widget string tables', () => {
  const files: Map<string, string> = generate();

  it('covers all thirteen locales, strings and plurals alike', () => {
    expect(files.size).toBe(26);
    const langs = new Set(
      [...files.keys()].map(f => f.split('/').slice(-2)[0].replace('.lproj', '')),
    );
    expect([...langs].sort()).toEqual(
      ['ar', 'bn', 'de', 'en', 'es', 'fr', 'hi', 'id', 'ru', 'sv', 'tr', 'ur', 'zh-Hans'].sort(),
    );
  });

  it('matches what is checked in — run `npm run sync-widget-strings`', () => {
    const stale: string[] = [];
    for (const [file, contents] of files) {
      const current = existsSync(file) ? readFileSync(file, 'utf8') : null;
      if (current !== contents) stale.push(relative(process.cwd(), file));
    }
    expect(stale).toEqual([]);
  });

  it('speaks iOS format specifiers, never Android ones', () => {
    for (const [file, contents] of files) {
      if (!file.endsWith('.strings')) continue;
      // %1$s is Android's string specifier; iOS reads it as a literal 's'.
      expect(contents).not.toMatch(/%\d+\$s/);
    }
  });

  it('leaves no entry pointing at its own key', () => {
    // A value equal to its key is what a missing translation looks like once
    // it has been through the generator, and it renders as raw snake_case.
    for (const [file, contents] of files) {
      if (!file.endsWith('.strings')) continue;
      for (const line of contents.split('\n')) {
        const m = /^"([^"]+)" = "([^"]*)";$/.exec(line);
        if (m) expect(m[2]).not.toBe(m[1]);
      }
    }
  });
});
