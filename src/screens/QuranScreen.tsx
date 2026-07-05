// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
/**
 * Quran index screen — Quran Reader v2
 * (docs/quran-reader-plan.md, QR-10/11/12/21/22/23).
 *
 * Four tabs: Surah / Juz / Bookmarks, plus search across surah names,
 * Arabic text (diacritic-insensitive) and the active translation.
 * Above the tabs: continue-reading resume card, khatmah progress, and
 * the verse of the day.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../hooks/useAppPalette';
import { useBreakpoint } from '../responsive/breakpoints';
import { useAndroidSubScreenBack } from '../navigation/useAndroidSubScreenBack';
import type { RootStackParamList } from '../navigation/types';
import { findPageForAyah, MUSHAF_PAGES } from '../quran/pages';
import { findSurah, loadSurah, SURAHS, type SurahIndex } from '../quran/quran';
import { getAyahTranslation } from '../quran/translations';
import { useActiveEdition } from '../quran/useActiveEdition';
import {
  activeKhatmah,
  hydrateQuranState,
  khatmahToday,
  removeBookmark,
  startKhatmah,
  toggleStar,
  useQuranState,
  BOOKMARK_COLORS,
  KHATMAH_TOTAL_PAGES,
} from '../quran/quranState';
import {
  searchQuran,
  verseOfTheDayRef,
  type QuranSearchResult,
} from '../quran/search';
import { cardEdgeStyle } from '../theme/chrome';
import { arabicTextStyle } from '../theme/typography';

type Tab = 'surah' | 'juz' | 'bookmarks';

type JuzRow = { juz: number; page: number; startSurah: SurahIndex | undefined };

export function QuranScreen() {
  useBreakpoint();
  const { t, i18n } = useTranslation();
  const { palette } = useAppPalette();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  useAndroidSubScreenBack();
  const isArabic = i18n.language === 'ar';
  const quran = useQuranState();
  const edition = useActiveEdition();

  useEffect(() => {
    void hydrateQuranState();
  }, []);

  const [tab, setTab] = useState<Tab>('surah');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<QuranSearchResult[] | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced full-text search (QR-22).
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    searchTimer.current = setTimeout(() => {
      void searchQuran(q, edition, 50).then(setResults);
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query, edition]);

  // Verse of the day (QR-23).
  const votdRef = useMemo(() => verseOfTheDayRef(), []);
  const [votdArabic, setVotdArabic] = useState('');
  useEffect(() => {
    let cancelled = false;
    void loadSurah(votdRef.surah).then(loaded => {
      if (cancelled || !loaded) return;
      setVotdArabic(loaded.arabic[votdRef.ayah - 1] ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [votdRef]);
  const votdTranslation = getAyahTranslation(edition, votdRef.surah, votdRef.ayah);
  const votdSurah = findSurah(votdRef.surah);

  const openSurah = (surahNumber: number, scrollToAyah?: number, page?: number) => {
    navigation.navigate('QuranSurah', {
      surahNumber,
      scrollToAyah,
      initialPage: page,
    });
  };

  // ── Surah tab data (name filter applies instantly) ──────────────────
  const filteredSurahs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SURAHS;
    return SURAHS.filter(
      s =>
        s.romanized.toLowerCase().includes(q) ||
        s.english.toLowerCase().includes(q) ||
        s.arabic.includes(query.trim()) ||
        String(s.number) === q,
    );
  }, [query]);

  // ── Juz tab data ────────────────────────────────────────────────────
  const juzRows: JuzRow[] = useMemo(() => {
    const rows: JuzRow[] = [];
    for (let j = 1; j <= 30; j++) {
      const firstPage = MUSHAF_PAGES.find(p => p.juz === j);
      if (!firstPage) continue;
      rows.push({
        juz: j,
        page: firstPage.page,
        startSurah: findSurah(firstPage.start.surah),
      });
    }
    return rows;
  }, []);

  // ── Header (cards + tabs + search) ──────────────────────────────────
  const plan = activeKhatmah(quran);
  const today = plan ? khatmahToday(plan) : null;

  const header = (
    <View style={styles.headerWrap}>
      {/* Continue reading (QR-10) */}
      {quran.lastRead ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('quran.continueReading', 'Continue reading')}
          onPress={() => {
            const lr = quran.lastRead;
            if (!lr) return;
            openSurah(
              lr.surah,
              lr.mode === 'withTranslation' ? lr.ayah : undefined,
              lr.mode === 'mushaf' ? lr.page : undefined,
            );
          }}
          style={[
            styles.resumeCard,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.resumeLabel, { color: palette.muted }]}>
              {t('quran.continueReading', 'Continue reading')}
            </Text>
            <Text style={[styles.resumeTitle, { color: palette.text }]}>
              {`${findSurah(quran.lastRead.surah)?.romanized ?? ''} · ${t('quran.pageLabel', { page: quran.lastRead.page })}`}
            </Text>
          </View>
          <Text style={{ color: palette.accentSolid, fontSize: 18 }}>→</Text>
        </Pressable>
      ) : null}

      {/* Khatmah (QR-21) */}
      <View
        style={[
          styles.khatmahCard,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}>
        {plan && today ? (
          <>
            <View style={styles.khatmahTop}>
              <Text style={[styles.khatmahTitle, { color: palette.text }]}>
                {t('quran.khatmah', 'Khatmah')}
              </Text>
              <Text style={[styles.khatmahMeta, { color: palette.muted }]}>
                {t('quran.khatmahDaysLeft', {
                  defaultValue: '{{count}} days left',
                  count: today.daysLeft,
                })}
              </Text>
            </View>
            <View style={[styles.khatmahTrack, { backgroundColor: palette.accentBg }]}>
              <View
                style={[
                  styles.khatmahFill,
                  {
                    backgroundColor: palette.accentSolid,
                    width: `${Math.min(100, (plan.pagesRead / KHATMAH_TOTAL_PAGES) * 100)}%`,
                  },
                ]}
              />
            </View>
            <Text style={[styles.khatmahMeta, { color: palette.muted }]}>
              {t('quran.khatmahProgress', {
                defaultValue: '{{read}} / {{total}} pages · today: {{today}}',
                read: plan.pagesRead,
                total: KHATMAH_TOTAL_PAGES,
                today: today.pagesToday,
              })}
              {today.behindBy > 0
                ? ` · ${t('quran.khatmahBehind', {
                    defaultValue: '{{count}} to catch up',
                    count: today.behindBy,
                  })}`
                : ''}
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.khatmahTitle, { color: palette.text }]}>
              {t('quran.startKhatmah', 'Start a khatmah')}
            </Text>
            <View style={styles.khatmahChips}>
              {[30, 60, 90].map(days => (
                <Pressable
                  key={days}
                  accessibilityRole="button"
                  accessibilityLabel={t('quran.khatmahDays', {
                    defaultValue: '{{count}} days',
                    count: days,
                  })}
                  onPress={() => startKhatmah(days)}
                  style={[styles.chip, { borderColor: palette.border }]}>
                  <Text style={{ color: palette.accentSolid, fontWeight: '600', fontSize: 13 }}>
                    {t('quran.khatmahDays', {
                      defaultValue: '{{count}} days',
                      count: days,
                    })}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </View>

      {/* Verse of the day (QR-23) */}
      {votdArabic ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('quran.verseOfDay', 'Verse of the day')}
          onPress={() => openSurah(votdRef.surah, votdRef.ayah)}
          style={[
            styles.votdCard,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          <Text style={[styles.votdLabel, { color: palette.muted }]}>
            {t('quran.verseOfDay', 'Verse of the day')}
          </Text>
          <Text
            numberOfLines={2}
            style={[styles.votdArabic, { color: palette.text }]}>
            {votdArabic}
          </Text>
          {votdTranslation ? (
            <Text
              numberOfLines={2}
              style={[styles.votdTranslation, { color: palette.muted }]}>
              {votdTranslation}
            </Text>
          ) : null}
          <Text style={[styles.votdRef, { color: palette.accentSolid }]}>
            {`${votdSurah?.romanized ?? ''} ${votdRef.surah}:${votdRef.ayah}`}
          </Text>
        </Pressable>
      ) : null}

      {/* Search (QR-22) */}
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={t('quran.searchPlaceholder', 'Search surahs, ayahs, translation…')}
        placeholderTextColor={String(palette.muted)}
        accessibilityLabel={t('quran.searchPlaceholder', 'Search surahs, ayahs, translation…')}
        clearButtonMode="while-editing"
        style={[
          styles.search,
          {
            color: palette.text,
            backgroundColor: palette.card,
            ...cardEdgeStyle(palette),
          },
        ]}
      />

      {/* Tabs (QR-11) */}
      <View style={[styles.tabs, { backgroundColor: palette.card, ...cardEdgeStyle(palette) }]}>
        {(
          [
            ['surah', t('quran.tabSurah', 'Surah')],
            ['juz', t('quran.tabJuz', 'Juz')],
            ['bookmarks', t('quran.tabBookmarks', 'Bookmarks')],
          ] as Array<[Tab, string]>
        ).map(([key, label]) => {
          const selected = tab === key;
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => setTab(key)}
              style={[
                styles.tab,
                selected && { backgroundColor: palette.accentBg },
              ]}>
              <Text
                style={{
                  color: selected ? palette.accentSolid : palette.muted,
                  fontWeight: '700',
                  fontSize: 13,
                }}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Full-text results */}
      {results != null ? (
        <View style={styles.resultsWrap}>
          <Text style={[styles.resultsLabel, { color: palette.muted }]}>
            {t('quran.searchResults', {
              defaultValue: '{{count}} ayah matches',
              count: results.length,
            })}
          </Text>
          {results.map(r => (
            <Pressable
              key={`${r.surah}:${r.ayah}`}
              accessibilityRole="button"
              accessibilityLabel={`${findSurah(r.surah)?.romanized ?? ''} ${r.surah}:${r.ayah}`}
              onPress={() => openSurah(r.surah, r.ayah)}
              style={[
                styles.resultRow,
                { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
              ]}>
              <Text style={[styles.resultRef, { color: palette.accentSolid }]}>
                {`${findSurah(r.surah)?.romanized ?? ''} ${r.surah}:${r.ayah}`}
              </Text>
              <Text
                numberOfLines={1}
                style={[styles.resultArabic, { color: palette.text }]}>
                {r.arabic}
              </Text>
              {r.translation ? (
                <Text
                  numberOfLines={2}
                  style={[styles.resultTranslation, { color: palette.muted }]}>
                  {r.translation}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );

  // ── Rows per tab ────────────────────────────────────────────────────
  const renderSurahRow = ({ item }: { item: SurahIndex }) => {
    const startPage = findPageForAyah(item.number, 1);
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.number}. ${item.romanized} — ${t('quran.pageLabel', { page: startPage })}`}
        onPress={() => openSurah(item.number)}
        style={[
          styles.row,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}>
        <View style={[styles.numberBadge, { backgroundColor: palette.accentBg }]}>
          <Text style={[styles.numberText, { color: palette.accent }]}>
            {item.number}
          </Text>
        </View>
        <View style={styles.rowText}>
          {!isArabic ? (
            <Text style={[styles.romanized, { color: palette.text }]}>
              {item.romanized}
            </Text>
          ) : null}
          <Text style={[styles.english, { color: palette.muted }]}>
            {isArabic ? '' : `${item.english} · `}
            {t('quran.ayahCount', { count: item.ayahCount })} ·{' '}
            {item.type === 'meccan' ? t('quran.meccan') : t('quran.medinan')}
          </Text>
          <Text style={[styles.pageHint, { color: palette.muted }]}>
            {t('quran.pageLabel', { page: startPage })}
          </Text>
        </View>
        <Text style={[styles.arabic, { color: palette.text }]}>
          {item.arabic}
        </Text>
      </Pressable>
    );
  };

  const renderJuzRow = ({ item }: { item: JuzRow }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('quran.juzLabel', { defaultValue: 'Juz {{juz}}', juz: item.juz })} — ${t('quran.pageLabel', { page: item.page })}`}
      onPress={() =>
        item.startSurah && openSurah(item.startSurah.number, undefined, item.page)
      }
      style={[
        styles.row,
        { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
      ]}>
      <View style={[styles.numberBadge, { backgroundColor: palette.accentBg }]}>
        <Text style={[styles.numberText, { color: palette.accent }]}>
          {item.juz}
        </Text>
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.romanized, { color: palette.text }]}>
          {t('quran.juzLabel', { defaultValue: 'Juz {{juz}}', juz: item.juz })}
        </Text>
        <Text style={[styles.english, { color: palette.muted }]}>
          {`${item.startSurah?.romanized ?? ''} · ${t('quran.pageLabel', { page: item.page })}`}
        </Text>
      </View>
      <Text style={[styles.arabic, { color: palette.text }]}>
        {item.startSurah?.arabic ?? ''}
      </Text>
    </Pressable>
  );

  const bookmarks = useMemo(
    () =>
      [...quran.bookmarks].sort(
        (a, b) => a.surah - b.surah || a.ayah - b.ayah,
      ),
    [quran.bookmarks],
  );
  const starredRefs = useMemo(
    () =>
      quran.starred
        .map(k => {
          const [s, a] = k.split(':').map(Number);
          return { surah: s, ayah: a };
        })
        .filter(r => Number.isFinite(r.surah) && Number.isFinite(r.ayah))
        .sort((a, b) => a.surah - b.surah || a.ayah - b.ayah),
    [quran.starred],
  );

  const bookmarksEmpty = bookmarks.length === 0 && starredRefs.length === 0;

  const renderBookmarks = () => (
    <View style={{ gap: 8 }}>
      {bookmarksEmpty ? (
        <View
          style={[
            styles.row,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          <Text style={{ color: palette.muted, fontSize: 13, flex: 1 }}>
            {t(
              'quran.noBookmarks',
              'No bookmarks yet — tap any ayah while reading to bookmark or star it.',
            )}
          </Text>
        </View>
      ) : null}
      {bookmarks.map(b => (
        <Pressable
          key={b.id}
          accessibilityRole="button"
          accessibilityLabel={`${findSurah(b.surah)?.romanized ?? ''} ${b.surah}:${b.ayah}`}
          onPress={() => openSurah(b.surah, b.ayah, b.page)}
          style={[
            styles.row,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          <View
            style={[
              styles.bookmarkDot,
              { backgroundColor: BOOKMARK_COLORS[b.color] },
            ]}
          />
          <View style={styles.rowText}>
            <Text style={[styles.romanized, { color: palette.text }]}>
              {`${findSurah(b.surah)?.romanized ?? ''} ${b.surah}:${b.ayah}`}
            </Text>
            <Text style={[styles.english, { color: palette.muted }]}>
              {t('quran.pageLabel', { page: b.page })}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('quran.deleteBookmark', 'Delete bookmark')}
            hitSlop={10}
            onPress={() => removeBookmark(b.id)}
            style={styles.deleteBtn}>
            <Text style={[styles.deleteGlyph, { color: palette.muted }]}>
              ✕
            </Text>
          </Pressable>
        </Pressable>
      ))}
      {starredRefs.length > 0 ? (
        <Text style={[styles.starredHeading, { color: palette.muted }]}>
          {t('quran.starred', 'Starred')}
        </Text>
      ) : null}
      {starredRefs.map(r => (
        <Pressable
          key={`${r.surah}:${r.ayah}`}
          accessibilityRole="button"
          accessibilityLabel={`${findSurah(r.surah)?.romanized ?? ''} ${r.surah}:${r.ayah}`}
          onPress={() => openSurah(r.surah, r.ayah)}
          style={[
            styles.row,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          <Text style={{ color: '#e0a52e', fontSize: 16 }}>★</Text>
          <View style={styles.rowText}>
            <Text style={[styles.romanized, { color: palette.text }]}>
              {`${findSurah(r.surah)?.romanized ?? ''} ${r.surah}:${r.ayah}`}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('quran.removeStar', 'Remove star')}
            hitSlop={10}
            onPress={() => toggleStar(r.surah, r.ayah)}
            style={styles.deleteBtn}>
            <Text style={[styles.deleteGlyph, { color: palette.muted }]}>
              ✕
            </Text>
          </Pressable>
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      {tab === 'surah' ? (
        <FlatList<SurahIndex>
          data={[...filteredSurahs]}
          keyExtractor={s => String(s.number)}
          contentContainerStyle={styles.list}
          contentInsetAdjustmentBehavior="automatic"
          ListHeaderComponent={header}
          initialNumToRender={12}
          windowSize={7}
          renderItem={renderSurahRow}
        />
      ) : tab === 'juz' ? (
        <FlatList<JuzRow>
          data={juzRows}
          keyExtractor={j => String(j.juz)}
          contentContainerStyle={styles.list}
          contentInsetAdjustmentBehavior="automatic"
          ListHeaderComponent={header}
          renderItem={renderJuzRow}
        />
      ) : (
        <FlatList
          data={[0]}
          keyExtractor={() => 'bookmarks'}
          contentContainerStyle={styles.list}
          contentInsetAdjustmentBehavior="automatic"
          ListHeaderComponent={header}
          renderItem={renderBookmarks}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 16, gap: 8 },
  headerWrap: { gap: 10, marginBottom: 8 },
  resumeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    gap: 10,
  },
  resumeLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  resumeTitle: { fontSize: 15, fontWeight: '700', marginTop: 2 },
  khatmahCard: { padding: 14, borderRadius: 12, gap: 8 },
  khatmahTop: { flexDirection: 'row', justifyContent: 'space-between' },
  khatmahTitle: { fontSize: 14, fontWeight: '700' },
  khatmahMeta: { fontSize: 12, fontVariant: ['tabular-nums'] },
  khatmahTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  khatmahFill: { height: '100%' },
  khatmahChips: { flexDirection: 'row', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  votdCard: { padding: 14, borderRadius: 12, gap: 6 },
  votdLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  votdArabic: {
    fontSize: 18,
    lineHeight: 40,
    textAlign: 'right',
    writingDirection: 'rtl',
    ...arabicTextStyle('quran'),
  },
  votdTranslation: { fontSize: 13, lineHeight: 19 },
  votdRef: { fontSize: 12, fontWeight: '700' },
  search: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  tabs: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 9,
  },
  resultsWrap: { gap: 8 },
  resultsLabel: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  resultRow: { padding: 12, borderRadius: 12, gap: 4 },
  resultRef: { fontSize: 12, fontWeight: '700' },
  resultArabic: {
    fontSize: 16,
    lineHeight: 36,
    textAlign: 'right',
    writingDirection: 'rtl',
    ...arabicTextStyle('quran'),
  },
  resultTranslation: { fontSize: 12, lineHeight: 17 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    gap: 12,
  },
  numberBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  rowText: { flex: 1 },
  romanized: { fontSize: 16, fontWeight: '600' },
  english: { fontSize: 12, marginTop: 2 },
  pageHint: { fontSize: 11, marginTop: 2, fontVariant: ['tabular-nums'] },
  arabic: { fontSize: 22, lineHeight: 42, ...arabicTextStyle('body') },
  bookmarkDot: { width: 14, height: 14, borderRadius: 7 },
  deleteBtn: { paddingHorizontal: 6, paddingVertical: 6 },
  deleteGlyph: { fontSize: 14, fontWeight: '700' },
  starredHeading: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 8,
  },
});
