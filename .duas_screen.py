#!/usr/bin/env python3
"""The dua index, redesigned; and the header that says where you are."""
p = 'src/screens/DuasScreen.tsx'
s = open(p, encoding='utf-8').read()

def one(old, new):
    global s
    assert s.count(old) == 1, (old[:80], s.count(old))
    s = s.replace(old, new, 1)

one("""import { memo, useCallback, useRef, useState } from 'react';""",
    """import { memo, useCallback, useLayoutEffect, useRef, useState } from 'react';""")

one("""import { useScrollToTop } from '@react-navigation/native';""",
    """import { useNavigation, useScrollToTop } from '@react-navigation/native';""")

one("""import {
  DUA_CATEGORIES,
  duasByCategory,
  type Dua,
  type DuaCategory,
} from '../duas/duas';""",
"""import {
  DUA_SECTIONS,
  duasByCategory,
  type Dua,
  type DuaCategory,
} from '../duas/duas';""")

one("""import { cardEdgeStyle } from '../theme/chrome';""",
    """import { cardEdgeStyle, rowDividerStyle } from '../theme/chrome';""")

# ── The header says which category you are in ─────────────────────────
one("""  const [selected, setSelected] = useState<DuaCategory | null>(null);""",
"""  const [selected, setSelected] = useState<DuaCategory | null>(null);
  /**
   * THE HEADER SAYS WHERE YOU ARE.
   *
   * This is a tab screen, so its title comes from the tab's `title` and
   * stayed "Duas" for every one of the twenty-one categories you can open
   * inside it — the one place on screen that names a destination, naming
   * the tab instead. The category is what you navigated to; it is what
   * the header should say.
   *
   * `headerTitle` and not `title`: `title` is the fallback for the tab
   * BAR's label too, so setting it here would rename the tab at the foot
   * of the screen every time a category opened.
   *
   * `useLayoutEffect` so the title and the list change in the same frame.
   * With `useEffect` the header repaints one frame late, which on a slow
   * device reads as the old title flashing over the new content.
   */
  const navigation = useNavigation();
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: selected ? t(`duas.cat.${selected}`) : t('nav.duas'),
    });
  }, [navigation, selected, t]);""")

# ── The index: grouped cards instead of twenty-one slabs ──────────────
one("""        {selected === null
          ? DUA_CATEGORIES.map(c => {
              const count = duasByCategory(c).length;
              return (
                <Pressable
                  key={c}
                  accessibilityRole="button"
                  accessibilityLabel={t(`duas.cat.${c}`)}
                  onPress={() => setSelected(c)}
                  style={[
                    styles.categoryRow,
                    { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
                  ]}>
                  <Text
                    numberOfLines={2}
                    style={[styles.categoryName, { color: palette.text }]}>
                    {t(`duas.cat.${c}`)}
                  </Text>
                  {/* How many, because a row that only names a category
                      says nothing about whether it is worth opening. */}
                  <Text
                    style={[
                      styles.categoryCount,
                      tabularNumeralStyle,
                      { color: palette.muted },
                    ]}>
                    {count}
                  </Text>
                </Pressable>
              );
            })""",
"""        {selected === null
          ? /* ── THE INDEX ────────────────────────────────────────────
               Twenty-one categories in five groups, each group one card
               with hairlines between its rows — the settings idiom this
               app already reads as "a set of related things", rather
               than twenty-one floating slabs that read as a list of
               unrelated ones. The groups are navigational and live in
               `DUA_SECTIONS`; a test keeps them exhaustive, because a
               category that falls out of that table falls off the only
               screen that can reach it. */
            DUA_SECTIONS.map(section => (
              <View key={section.id} style={styles.section}>
                <Text
                  style={[styles.sectionTitle, { color: palette.muted }]}
                  maxFontSizeMultiplier={TITLE_BAND_MAX_FONT_SCALE}>
                  {t(`duas.section.${section.id}`)}
                </Text>
                <View
                  style={[
                    styles.sectionCard,
                    { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
                  ]}>
                  {section.categories.map((c, i) => {
                    const count = duasByCategory(c).length;
                    return (
                      <Pressable
                        key={c}
                        accessibilityRole="button"
                        accessibilityLabel={t(`duas.cat.${c}`)}
                        accessibilityHint={t('duas.countHint', {
                          defaultValue: '{{count}} duas',
                          count,
                        })}
                        onPress={() => setSelected(c)}
                        style={({ pressed }) => [
                          styles.categoryRow,
                          i < section.categories.length - 1
                            ? rowDividerStyle(palette)
                            : null,
                          pressed ? { backgroundColor: palette.bg } : null,
                        ]}>
                        <Text
                          numberOfLines={2}
                          style={[styles.categoryName, { color: palette.text }]}>
                          {t(`duas.cat.${c}`)}
                        </Text>
                        {/* How many, because a row that only names a
                            category says nothing about whether it is
                            worth opening. */}
                        <Text
                          style={[
                            styles.categoryCount,
                            tabularNumeralStyle,
                            { color: palette.muted },
                          ]}>
                          {count}
                        </Text>
                        {/* The affordance the flat rows never had: this
                            one opens something. */}
                        <Text
                          style={[
                            styles.categoryChevron,
                            { color: palette.accentSolid },
                          ]}>
                          {'\\u203A'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))""")

# ── Styles ────────────────────────────────────────────────────────────
one("""  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 14,
    paddingHorizontal: 16,
    // Comfortably past the 44pt floor: this is the whole screen's
    // navigation now, not a chip in a strip.
    paddingVertical: 16,
    minHeight: 56,
  },""",
"""  section: { gap: 8 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingHorizontal: 4,
  },
  sectionCard: {
    borderRadius: 14,
    // The card is the group; the rows inside it are separated by
    // hairlines rather than by gaps, so a group reads as one object.
    overflow: 'hidden',
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    // Comfortably past the 44pt floor: this is the whole screen's
    // navigation now, not a chip in a strip.
    paddingVertical: 16,
    minHeight: 56,
  },""")

one("""  categoryName: { flex: 1, fontSize: 16, fontWeight: '600' },
  categoryCount: { fontSize: 14, fontWeight: '600' },""",
"""  categoryName: { flex: 1, fontSize: 16, fontWeight: '600' },
  categoryCount: { fontSize: 14, fontWeight: '600' },
  categoryChevron: {
    fontSize: 20,
    lineHeight: 22,
    includeFontPadding: false,
    // The count sits next to it, not across the row from it: two things
    // pinned to opposite edges of a 56pt row is a row with a hole in it.
    marginStart: -4,
  },""")

open(p, 'w', encoding='utf-8').write(s)
print('DuasScreen patched')
