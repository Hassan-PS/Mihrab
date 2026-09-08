// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import {
  memo,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import { useScrollToTop } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../hooks/useAppPalette';
import { useBreakpoint } from '../responsive/breakpoints';
import { CenteredColumn } from '../responsive/CenteredColumn';
import { useAndroidSubScreenBack } from '../navigation/useAndroidSubScreenBack';
import { TabBackButton, tabBackButton } from '../navigation/TabBackButton';
import {
  DUA_SECTIONS,
  duasByCategory,
  type Dua,
  type DuaCategory,
} from '../duas/duas';
import { cardEdgeStyle, rowDividerStyle } from '../theme/chrome';
import { ShareIcon } from '../theme/icons';
import { duaShareText } from '../share/shareText';
import { arabicTextStyle } from '../theme/typography';
import { TITLE_BAND_MAX_FONT_SCALE, tabularNumeralStyle } from '../theme/textScale';
import { useTabBarInset } from '../navigation/tabBarInset';
import { useTabBarScroll } from '../navigation/tabBarVisibility';

/**
 * Dua library screen — task #26.
 *
 * A vertical index of the nineteen categories; tapping one opens its
 * duas, and back returns to the index. Each dua row shows Arabic +
 * transliteration + translation + source + repeat count.
 *
 * The index replaced a horizontal strip of chips (#33) that could show
 * about four of the nineteen at a time, on the one screen in the app that
 * scrolled sideways.
 */
/**
 * Only what this screen needs from the navigator, and optional.
 *
 * Taken as a PROP rather than through `useNavigation()`: the hook throws
 * outside a NavigationContainer, and these screens are rendered bare in
 * the tests that cover their content. React Navigation passes this to
 * every screen component anyway, so the prop is the same object the hook
 * would have found — with the difference that a test can hand over a
 * fake one and assert what the header was told.
 */
type DuasNav = {
  setOptions: (options: {
    headerTitle: string;
    headerLeft?: () => ReactNode;
  }) => void;
};

export function DuasScreen({ navigation }: { navigation?: DuasNav } = {}) {
  // Subscribe to width changes so future master-detail layouts pick up
  // the new breakpoint without a forced remount. iPad/Mac (#33) baseline.
  useBreakpoint();
  const { t, i18n } = useTranslation();
  const { palette } = useAppPalette();
  const tabBarInset = useTabBarInset();
  // The bar gets out of the way while reading — see tabBarVisibility.ts.
  const tabBarScroll = useTabBarScroll();
  /**
   * Tapping the tab you are already on returns this screen to the top —
   * the standard idiom on both platforms, and the only way back up a
   * long page without a lot of swiping. `useScrollToTop` listens for
   * `tabPress` and acts only while this screen is focused, so pressing a
   * DIFFERENT tab still just navigates.
   */
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  // Arabic readers don't need a Latin pronunciation guide or an English
  // meaning — they read the Arabic directly. Hide both supplementary
  // lines when the app language is Arabic so the row stays clean and
  // reverent.
  const isArabic = i18n.language === 'ar';
  const showTranslit = !isArabic;
  const showTranslation = !isArabic;
  /**
   * WHICH CATEGORY, OR NONE — and none is where the screen opens.
   *
   * The categories used to be a horizontal row of chips above the list.
   * Nineteen of them, and the row showed four: the rest existed only if
   * you thought to swipe sideways on the one screen in the app that
   * scrolled that way (#33). A reader cannot pick from a list they cannot
   * see, and "how many kinds of dua are in here" is the question the
   * screen is opened with.
   *
   * So `null` is the index — every category, one per row, scrolling the
   * way everything else does — and a category name opens that category.
   */
  const [selected, setSelected] = useState<DuaCategory | null>(null);
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
  useLayoutEffect(() => {
    navigation?.setOptions({
      headerTitle: selected ? t(`duas.cat.${selected}`) : t('nav.duas'),
      // Inside a category the arrow goes up to the index, not home to
      // Today — the same control, pointed one level up. There used to be
      // a second "‹ All duas" link under the title for this, which with
      // the title already naming the category was two ways back drawn
      // next to each other (redesign-plan B.6.2).
      headerLeft: selected
        ? () => (
            <TabBackButton
              onPress={() => setSelected(null)}
              label={t('duas.allCategories', 'All duas')}
            />
          )
        : tabBackButton,
    });
  }, [navigation, selected, t]);
  /**
   * Back closes the category before it leaves the tab.
   *
   * Intercepted rather than deferred: deferring gives the press to the
   * system, and on a tab root that means leaving the app — from a
   * category, which is a screen the reader navigated INTO. One level at a
   * time is what back means everywhere else here.
   */
  useAndroidSubScreenBack(undefined, () => {
    if (selected === null) return false;
    setSelected(null);
    return true;
  });
  // Per-dua tap-to-count state — task #94. Persists for the lifetime of
  // the screen so the user can navigate away from a dua and come back to
  // resume their count. Reset by tapping the inline reset affordance.
  const [counts, setCounts] = useState<Record<string, number>>({});
  /**
   * Which sections a reader has opened, keyed `<dua id>|<part>`.
   *
   * CLOSED TO BEGIN WITH. A category is up to a dozen duas and each was
   * showing Arabic, a Latin transliteration and an English translation at
   * once — three renderings of the same words, stacked, so the ONE you
   * came to read was never on screen by itself and the list took three
   * times the scrolling it needed. The Arabic is the dua; the other two
   * are aids, and an aid you have to scroll past is not aiding.
   *
   * Screen-lifetime state rather than a preference: which dua you need
   * the pronunciation of is a question you answer per dua, not once
   * forever, and it is one tap away.
   */
  const [openParts, setOpenParts] = useState<Record<string, boolean>>({});
  const togglePart = useCallback((key: string) => {
    setOpenParts(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const onIncrement = useCallback((id: string, target: number) => {
    setCounts(prev => {
      const cur = prev[id] ?? 0;
      const next = cur + 1;
      Vibration.vibrate(target > 0 && next === target ? [0, 60, 80, 60, 80, 60] : 20);
      return { ...prev, [id]: next };
    });
  }, []);
  const onResetCount = useCallback((id: string) => {
    setCounts(prev => ({ ...prev, [id]: 0 }));
  }, []);

  /**
   * Hand a dua to whatever the phone can send it with — issue #24.
   *
   * The title and translation are the LOCALIZED ones, the same strings
   * the card is showing: someone reading Mihrab in Turkish and sending a
   * dua to their mother is sending it in Turkish, not in the bundled
   * English that happens to be the fallback.
   *
   * The Arabic, the transliteration and the source are the dua's own and
   * are not translated — the first two because they are the dua, the
   * third because a citation is a reference, not prose.
   */
  const onShare = useCallback(
    async (dua: Dua) => {
      try {
        await Share.share({
          message: duaShareText({
            title: t(`duas.${dua.id}.title`, { defaultValue: dua.titleEn }),
            arabic: dua.arabic,
            transliteration: dua.transliteration,
            translation: t(`duas.${dua.id}.translation`, {
              defaultValue: dua.translation,
            }),
            source: dua.source,
          }),
        });
      } catch {
        /* the sheet was dismissed */
      }
    },
    [t],
  );

  // No manual header offset (v2.8.5).
  //
  // This screen used to add the navigation header's own height to the top
  // of the chips row. That was correct when Duas was a page pushed onto the
  // root stack, whose header is `headerTransparent` on iOS so the blur can
  // extend behind content: without the padding the chips rendered behind
  // the title bar and were invisible.
  //
  // Duas is a TAB now (design review 2e), and the tab navigator's header is
  // opaque — it already sits above the content rather than over it. The
  // padding therefore counted the header twice and left a header's worth of
  // empty band under the title on every platform.
  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      {/* Tabs are wrapped in a fixed-height row pinned just under the
          system header, so when the active category has only one or two
          duas the chips stay at the top instead of vertically centering
          (#101 follow-up). The dua list ScrollView fills the rest of
          the screen and starts at a predictable y-offset. */}
      <ScrollView
        ref={scrollRef}
        {...tabBarScroll}
        style={styles.listScroll}
        contentContainerStyle={[
          styles.list,
          // On the index there is no row above the list to hold it off the
          // header, so the list holds itself off. In a category the way
          // back is that row, and a second gap would double it.
          selected === null ? styles.listTop : null,
          { paddingBottom: tabBarInset },
        ]}
        contentInsetAdjustmentBehavior="automatic">
        {/* The gap lives HERE, not on the ScrollView's content container.
            `contentContainerStyle`'s gap separates the ScrollView's DIRECT
            children, and since the column went in there has been exactly
            one of those — so it separated nothing and every dua sat flush
            against the next, one long slab of cards. The stack is the
            thing whose children need spacing, so the spacing belongs on
            the stack. Both props, because CenteredColumn is a plain
            pass-through on a phone and only grows its inner column on a
            tablet or a Mac. Same fix as LogScreen; see duaCardSpacing. */}
        <CenteredColumn innerStyle={styles.stack} style={styles.stack}>
        {selected === null
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
                          {'\u203A'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))
          : duasByCategory(selected).map(dua => (
          <View
            key={dua.id}
            style={[
              styles.card,
              { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
            ]}>
            {/* The title, and the one action on this card — issue #24.
                A reader wanted to send a dua to family. On the title line
                because it names what will be sent: a control at the foot
                of a card this tall is a long way from the thing it acts
                on, and further still once the Arabic has been read. */}
            <View style={styles.titleRow}>
              <Text
                style={[styles.title, { color: palette.text }]}
                maxFontSizeMultiplier={TITLE_BAND_MAX_FONT_SCALE}>
                {/* Per-dua localized title falls back to bundled English. */}
                {t(`duas.${dua.id}.title`, { defaultValue: dua.titleEn })}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('duas.shareDua', {
                  defaultValue: 'Share {{title}}',
                  title: t(`duas.${dua.id}.title`, {
                    defaultValue: dua.titleEn,
                  }),
                })}
                hitSlop={10}
                onPress={() => onShare(dua)}
                style={({ pressed }) => [
                  styles.shareBtn,
                  { opacity: pressed ? 0.6 : 1 },
                ]}>
                <ShareIcon size={18} color={palette.muted} />
              </Pressable>
            </View>
            <Text
              style={[styles.arabic, { color: palette.text }]}
              accessibilityLabel={dua.arabic}>
              {dua.arabic}
            </Text>
            {/* The two aids, behind their own names.

                Pronunciation is a Latin transliteration for readers who
                cannot read the Arabic line; both are hidden outright for
                Arabic readers, who need neither. */}
            {showTranslit || showTranslation ? (
              <View style={styles.aidRow}>
                {showTranslit ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{
                      expanded: !!openParts[`${dua.id}|say`],
                    }}
                    onPress={() => togglePart(`${dua.id}|say`)}
                    style={[
                      styles.aidChip,
                      { backgroundColor: palette.controlBg },
                    ]}>
                    <Text
                      style={[styles.aidChipText, { color: palette.accentSolid }]}>
                      {`${openParts[`${dua.id}|say`] ? '▾' : '▸'} ${t(
                        'duas.pronunciation',
                        'Pronunciation',
                      )}`}
                    </Text>
                  </Pressable>
                ) : null}
                {showTranslation ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{
                      expanded: !!openParts[`${dua.id}|mean`],
                    }}
                    onPress={() => togglePart(`${dua.id}|mean`)}
                    style={[
                      styles.aidChip,
                      { backgroundColor: palette.controlBg },
                    ]}>
                    <Text
                      style={[styles.aidChipText, { color: palette.accentSolid }]}>
                      {`${openParts[`${dua.id}|mean`] ? '▾' : '▸'} ${t(
                        'quran.viewToggleTranslation',
                        'Translation',
                      )}`}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            {showTranslit && openParts[`${dua.id}|say`] ? (
              <Text
                style={[styles.translit, { color: palette.muted }]}
                accessibilityLabel={dua.transliteration}>
                {dua.transliteration}
              </Text>
            ) : null}
            {showTranslation && openParts[`${dua.id}|mean`] ? (
              <Text style={[styles.translation, { color: palette.text }]}>
                {/* Per-dua localized translation falls back to bundled
                    English. To add another locale, drop entries under
                    `duas.<id>.translation` in that locale's JSON. Hidden
                    entirely when the app language is Arabic. */}
                {t(`duas.${dua.id}.translation`, { defaultValue: dua.translation })}
              </Text>
            ) : null}
            {dua.repeat ? (
              // Tap-to-count counter for duas with a recommended
              // repetition (e.g. ×3, ×100). Mirrors the Tasbih pattern:
              // big number + target, haptic on each tap, reset
              // affordance, persists across the screen session.
              <View style={styles.counterRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('duas.tapToCount', 'Tap to count')}
                  accessibilityValue={{
                    now: counts[dua.id] ?? 0,
                    min: 0,
                    max: dua.repeat,
                    text: `${counts[dua.id] ?? 0} / ${dua.repeat}`,
                  }}
                  onPress={() => onIncrement(dua.id, dua.repeat ?? 0)}
                  style={[
                    styles.counterBtn,
                    {
                      backgroundColor:
                        (counts[dua.id] ?? 0) >= (dua.repeat ?? 0)
                          ? palette.accentBg
                          : palette.bg,
                      borderColor:
                        (counts[dua.id] ?? 0) >= (dua.repeat ?? 0)
                          ? palette.accent
                          : palette.border,
                    },
                  ]}>
                  <Text
                    style={[styles.counterValue, tabularNumeralStyle, { color: palette.text }]}>
                    {counts[dua.id] ?? 0}
                  </Text>
                  <Text style={[styles.counterTarget, { color: palette.muted }]}>
                    / {dua.repeat}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('tasbih.reset', 'Reset')}
                  onPress={() => onResetCount(dua.id)}
                  hitSlop={8}
                  style={styles.counterReset}>
                  <Text style={[styles.counterResetLabel, { color: palette.muted }]}>
                    {t('tasbih.reset', 'Reset')}
                  </Text>
                </Pressable>
              </View>
            ) : null}
            <View style={styles.metaRow}>
              {dua.repeat ? (
                <Text style={[styles.meta, { color: palette.accent }]}>
                  {t('duas.repeat', { count: dua.repeat })}
                </Text>
              ) : null}
              <Text style={[styles.meta, styles.source, { color: palette.muted }]}>
                {dua.source}
              </Text>
            </View>
          </View>
            ))}
        </CenteredColumn>
      </ScrollView>
    </View>
  );
}

const _DuasScreenMemo = memo(DuasScreen);
export { _DuasScreenMemo as DuasScreenMemo };

const styles = StyleSheet.create({
  root: { flex: 1 },
  section: { gap: 8 },
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
  },
  categoryName: { flex: 1, fontSize: 16, fontWeight: '600' },
  categoryCount: { fontSize: 14, fontWeight: '600' },
  categoryChevron: {
    fontSize: 20,
    lineHeight: 22,
    includeFontPadding: false,
    // The count sits next to it, not across the row from it: two things
    // pinned to opposite edges of a 56pt row is a row with a hole in it.
    marginStart: -4,
  },
  listScroll: { flex: 1 },
  tabs: { paddingHorizontal: 16, paddingVertical: 12, gap: 8, alignItems: 'center' },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 40,
    justifyContent: 'center',
  },
  tabLabel: { fontSize: 14, fontWeight: '600', lineHeight: 18, includeFontPadding: false },
  list: { padding: 16, paddingTop: 0 },
  listTop: { paddingTop: 16 },
  stack: { gap: 12 },
  card: { borderRadius: 14, padding: 16, gap: 8 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    // The title takes the room; the control keeps its own.
    gap: 8,
  },
  title: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  // Pushed to the trailing edge, and `marginStart: 'auto'` rather than a
  // Spacer so a long title shrinks past it instead of pushing it off the
  // card. Never `Left`/`Right` — this screen is read in Arabic and Urdu.
  shareBtn: { marginStart: 'auto', padding: 2 },
  /**
   * The QURAN face, not the body one.
   *
   * A dua as this app prints it is fully vocalised — every harakah, the
   * quranic annotation marks, the small alif — and a good third of the
   * corpus is literal Quran (Ayat al-Kursi, the three quls). Amiri body
   * is a text face; AmiriQuran was cut for exactly this: taller
   * diacritics that stack without colliding, and mushaf letterforms.
   *
   * The leading was ALREADY the Quran face's (2.17x, per the note in
   * typography.ts), so the page had been paying the taller face's line
   * spacing while drawing with the shorter face — the worst of both, and
   * why it read as loose and slightly wrong.
   */
  arabic: { fontSize: 20, lineHeight: 44, textAlign: 'right', writingDirection: 'rtl', ...arabicTextStyle('quran') },
  /** The two aid toggles, side by side under the Arabic. */
  aidRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  aidChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  aidChipText: { fontSize: 12, fontWeight: '700' },
  translit: { fontSize: 14, fontStyle: 'italic' },
  translation: { fontSize: 15, lineHeight: 22 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  meta: { fontSize: 12 },
  source: { flexShrink: 1, textAlign: 'right' },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  counterBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  counterValue: { fontSize: 28, fontWeight: '700' },
  counterTarget: { fontSize: 16, fontWeight: '500' },
  counterReset: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  counterResetLabel: { fontSize: 13, fontWeight: '600' },
});
