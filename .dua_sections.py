#!/usr/bin/env python3
"""The dua index, grouped — so 21 rows read as a library rather than a list."""
p = 'src/duas/duas.ts'
s = open(p, encoding='utf-8').read()

anchor = "export function duasByCategory(category: DuaCategory): Dua[] {"
assert s.count(anchor) == 1

block = '''/**
 * The index, in groups.
 *
 * ── WHY THE FLAT LIST WAS NOT ENOUGH ──────────────────────────────────
 *
 * #33 replaced a horizontal strip of chips — which showed four of the
 * categories and hid the rest behind a sideways swipe — with a vertical
 * list of all of them. That fixed the thing that was broken and left the
 * screen reading as twenty-one identical rows with a number on the
 * right: a settings page, not a library. Nothing about it says that
 * Morning and Evening belong together, or that Funeral is not something
 * you are looking for on an ordinary Tuesday.
 *
 * These groups are NAVIGATIONAL, not doctrinal. They say where to look,
 * in the order a day is lived and then by what a person is going through
 * — and nothing about the standing of any dua, which is what each entry's
 * own `source` is for.
 *
 * ── THE ONE RULE ──────────────────────────────────────────────────────
 *
 * Every category appears exactly once, and every category appears. A
 * grouping is the sort of thing a later edit silently drops a member
 * from, and a category that falls out of this table falls off the screen
 * — it is the only way in. `__tests__/duaCategoryIndex.test.tsx` fails if
 * the groups and `DUA_CATEGORIES` ever disagree.
 *
 * Order within a group follows `DUA_CATEGORIES`, which is itself ordered
 * by where each sits in a day (see the note there about the lavatory and
 * garment duas).
 */
export type DuaSection = {
  /** i18n key suffix: `duas.section.<id>`. */
  id: 'day' | 'worship' | 'out' | 'hardship' | 'asking';
  categories: DuaCategory[];
};

export const DUA_SECTIONS: ReadonlyArray<DuaSection> = [
  {
    id: 'day',
    categories: ['morning', 'evening', 'food', 'sleep', 'lavatory', 'garment'],
  },
  { id: 'worship', categories: ['afterPrayer', 'mosque', 'beforeQuran', 'eid'] },
  { id: 'out', categories: ['travel', 'weather'] },
  {
    id: 'hardship',
    categories: ['distress', 'sickness', 'funeral', 'forgiveness'],
  },
  {
    id: 'asking',
    categories: ['gratitude', 'family', 'knowledge', 'protection', 'guidance'],
  },
];

/**
 * Every category the sections name, in the order they name them.
 *
 * Exported so the test can compare it against `DUA_CATEGORIES` without
 * re-implementing the flattening it is checking.
 */
export function sectionedCategories(): DuaCategory[] {
  return DUA_SECTIONS.flatMap(s => s.categories);
}

'''
s = s.replace(anchor, block + anchor, 1)
open(p, 'w', encoding='utf-8').write(s)
print('duas.ts: sections added')
