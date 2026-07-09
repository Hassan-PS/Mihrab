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
  Modal,
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
  abandonKhatmah,
  activeKhatmah,
  hydrateQuranState,
  khatmahCurrentPage,
  khatmahToday,
  removeBookmark,
  resetKhatmahAll,
  resetKhatmahToday,
  setQuranPrefs,
  startKhatmah,
  toggleStar,
  useQuranState,
  BOOKMARK_COLORS,
  KHATMAH_TOTAL_PAGES,
} from '../quran/quranState';
import { loadTafsir, tafsirEditionsForLocale } from '../quran/tafsir';
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
  const quranWide = useBreakpoint() !== 'compact';
  const listCap = quranWide ? styles.listWide : null;
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
  const [khatmahMenuVisible, setKhatmahMenuVisible] = useState(false);
  // Custom khatmah length (v2.7.31) — the 30/60/90 presets plus a
  // free-form day count entered in a small modal.
  const [customDaysVisible, setCustomDaysVisible] = useState(false);
  const [customDaysText, setCustomDaysText] = useState('');
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
  // Second row of the card: translation or real tafsir — the user picks
  // via the small toggle on the card (persisted, v2.7.31).
  const votdMode = quran.prefs.votdMode;
  const [votdTafsir, setVotdTafsir] = useState<string | null>(null);
  // Tafsir can be long — show a few lines by default with a "Show more" expand.
  const [votdExpanded, setVotdExpanded] = useState(false);
  useEffect(() => {
    if (votdMode !== 'tafsir') return;
    let cancelled = false;
    const ed = tafsirEditionsForLocale((i18n.language || 'en').slice(0, 2))[0];
    if (!ed) return;
    void loadTafsir(ed.id, votdRef.surah, votdRef.ayah).then(text => {
      if (!cancelled) setVotdTafsir(text);
    });
    return () => {
      cancelled = true;
    };
  }, [votdMode, votdRef, i18n.language]);

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
            {/* Continue + reset (v2.7.28) */}
            <View style={styles.khatmahActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('quran.khatmahContinue', 'Continue')}
                onPress={() => {
                  const page = khatmahCurrentPage(plan);
                  const startSurah =
                    plan.position?.surah ??
                    MUSHAF_PAGES.find(p => p.page === page)?.start.surah ??
                    1;
                  openSurah(startSurah, undefined, page);
                }}
                style={[
                  styles.khatmahBtn,
                  { backgroundColor: palette.accentSolid },
                ]}>
                <Text style={styles.khatmahBtnLabel}>
                  {`${t('quran.khatmahContinue', 'Continue')} · ${t('quran.pageLabel', { page: khatmahCurrentPage(plan) })}`}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('quran.khatmahReset', 'Reset')}
                onPress={() => setKhatmahMenuVisible(true)}
                style={[styles.khatmahBtnGhost, { borderColor: palette.border }]}>
                <Text style={{ color: palette.muted, fontWeight: '600', fontSize: 13 }}>
                  {t('quran.khatmahReset', 'Reset')}
                </Text>
              </Pressable>
            </View>
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
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('quran.khatmahCustom', 'Custom…')}
                onPress={() => {
                  setCustomDaysText('');
                  setCustomDaysVisible(true);
                }}
                style={[styles.chip, { borderColor: palette.border }]}>
                <Text style={{ color: palette.accentSolid, fontWeight: '600', fontSize: 13 }}>
                  {t('quran.khatmahCustom', 'Custom…')}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </View>

      {/* Verse of the day (QR-23) */}
      {votdArabic ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('quran.verseOfDay', 'Verse of the day')}
          onPress={() =>
            openSurah(
              votdRef.surah,
              votdRef.ayah,
              findPageForAyah(votdRef.surah, votdRef.ayah),
            )
          }
          style={[
            styles.votdCard,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          <View style={styles.votdHeaderRow}>
            <Text style={[styles.votdLabel, { color: palette.muted }]}>
              {t('quran.verseOfDay', 'Verse of the day')}
            </Text>
            {/* Second-row source toggle (v2.7.31): translation ⇄ tafsir. */}
            <View style={[styles.votdToggle, { borderColor: palette.border }]}>
              {(
                [
                  ['translation', t('quran.viewToggleTranslation', 'Translation')],
                  ['tafsir', t('quran.tafsir', 'Tafsir')],
                ] as Array<['translation' | 'tafsir', string]>
              ).map(([mode, label]) => {
                const selected = votdMode === mode;
                return (
                  <Pressable
                    key={mode}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={label}
                    hitSlop={6}
                    onPress={() => {
                      setVotdExpanded(false);
                      setQuranPrefs({ votdMode: mode });
                    }}
                    style={[
                      styles.votdToggleSeg,
                      selected && { backgroundColor: palette.accentBg },
                    ]}>
                    <Text
                      style={{
                        color: selected ? palette.accentSolid : palette.muted,
                        fontWeight: '700',
                        fontSize: 11,
                      }}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          {/* Row 1: the ayah. Row 2: translation or tafsir. */}
          <Text
            numberOfLines={2}
            style={[styles.votdArabic, { color: palette.text }]}>
            {votdArabic}
          </Text>
          {votdMode === 'tafsir' ? (
            <>
              <Text
                numberOfLines={votdExpanded ? undefined : 4}
                style={[styles.votdTranslation, { color: palette.muted }]}>
                {votdTafsir ??
                  t(
                    'quran.tafsirUnavailable',
                    'Tafsir unavailable — connect to the internet once to download it.',
                  )}
              </Text>
              {votdTafsir && votdTafsir.length > 220 ? (
                // Own Pressable — claims the touch so the card's open-in-reader
                // press doesn't also fire when expanding the tafsir.
                <Pressable
                  hitSlop={6}
                  accessibilityRole="button"
                  onPress={() => setVotdExpanded(v => !v)}>
                  <Text style={[styles.votdShowMore, { color: palette.accentSolid }]}>
                    {votdExpanded
                      ? t('quran.showLess', 'Show less')
                      : t('quran.showMore', 'Show more')}
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : votdTranslation ? (
            <Text
              numberOfLines={3}
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

      {/* Manage downloads (v2.7.28) */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('downloads.title', 'Manage downloads')}
        onPress={() => navigation.navigate('QuranDownloads')}
        style={styles.downloadsLink}>
        <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '600' }}>
          {t('downloads.title', 'Manage downloads')} ›
        </Text>
      </Pressable>

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
          contentContainerStyle={[styles.list, listCap]}
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
          contentContainerStyle={[styles.list, listCap]}
          contentInsetAdjustmentBehavior="automatic"
          ListHeaderComponent={header}
          renderItem={renderJuzRow}
        />
      ) : (
        <FlatList
          data={[0]}
          keyExtractor={() => 'bookmarks'}
          contentContainerStyle={[styles.list, listCap]}
          contentInsetAdjustmentBehavior="automatic"
          ListHeaderComponent={header}
          renderItem={renderBookmarks}
        />
      )}

      {/* Khatmah reset menu (v2.7.28): today / whole plan / delete. */}
      <Modal
        visible={khatmahMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setKhatmahMenuVisible(false)}>
        <Pressable
          style={[styles.menuBackdrop, { backgroundColor: palette.overlay }]}
          accessibilityLabel={t('common.close', 'Close')}
          onPress={() => setKhatmahMenuVisible(false)}
        />
        <View style={[styles.menuCard, { backgroundColor: palette.card }]}>
          <Text style={[styles.menuTitle, { color: palette.text }]}>
            {t('quran.khatmahResetTitle', 'Reset khatmah')}
          </Text>
          {(
            [
              [
                t('quran.khatmahResetToday', "Reset today's reading"),
                t(
                  'quran.khatmahResetTodayHelp',
                  'Rewinds only the pages recorded today.',
                ),
                () => resetKhatmahToday(),
                false,
              ],
              [
                t('quran.khatmahResetAll', 'Restart the khatmah'),
                t(
                  'quran.khatmahResetAllHelp',
                  'Back to page 0 with a fresh schedule.',
                ),
                () => resetKhatmahAll(),
                false,
              ],
              [
                t('quran.khatmahDelete', 'Delete the khatmah'),
                t('quran.khatmahDeleteHelp', 'Removes the plan entirely.'),
                () => {
                  const p = activeKhatmah(quran);
                  if (p) abandonKhatmah(p.id);
                },
                true,
              ],
            ] as Array<[string, string, () => void, boolean]>
          ).map(([label, help, action, destructive]) => (
            <Pressable
              key={label}
              accessibilityRole="button"
              accessibilityLabel={label}
              onPress={() => {
                setKhatmahMenuVisible(false);
                action();
              }}
              style={[styles.menuRow, { borderColor: palette.border }]}>
              <Text
                style={{
                  color: destructive ? '#d43f3f' : palette.text,
                  fontWeight: '600',
                  fontSize: 15,
                }}>
                {label}
              </Text>
              <Text style={{ color: palette.muted, fontSize: 12, marginTop: 2 }}>
                {help}
              </Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel', 'Cancel')}
            onPress={() => setKhatmahMenuVisible(false)}
            style={styles.menuCancel}>
            <Text style={{ color: palette.accentSolid, fontWeight: '700' }}>
              {t('common.cancel', 'Cancel')}
            </Text>
          </Pressable>
        </View>
      </Modal>

      {/* Custom khatmah length (v2.7.31). */}
      <Modal
        visible={customDaysVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCustomDaysVisible(false)}>
        <Pressable
          style={[styles.menuBackdrop, { backgroundColor: palette.overlay }]}
          accessibilityLabel={t('common.close', 'Close')}
          onPress={() => setCustomDaysVisible(false)}
        />
        <View style={[styles.menuCard, { backgroundColor: palette.card }]}>
          <Text style={[styles.menuTitle, { color: palette.text }]}>
            {t('quran.khatmahLengthTitle', 'Khatmah length (days)')}
          </Text>
          <TextInput
            value={customDaysText}
            onChangeText={setCustomDaysText}
            keyboardType="number-pad"
            autoFocus
            maxLength={3}
            accessibilityLabel={t('quran.khatmahLengthTitle', 'Khatmah length (days)')}
            placeholder="1–604"
            placeholderTextColor={String(palette.muted)}
            style={[
              styles.customDaysInput,
              { color: palette.text, borderColor: palette.border },
            ]}
            onSubmitEditing={() => {
              const n = Number(customDaysText);
              if (Number.isFinite(n) && n >= 1) {
                startKhatmah(Math.min(604, Math.round(n)));
                setCustomDaysVisible(false);
              }
            }}
          />
          <View style={styles.customDaysRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel', 'Cancel')}
              onPress={() => setCustomDaysVisible(false)}
              style={styles.menuCancel}>
              <Text style={{ color: palette.muted, fontWeight: '600' }}>
                {t('common.cancel', 'Cancel')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('quran.khatmahStartCta', 'Start')}
              onPress={() => {
                const n = Number(customDaysText);
                if (Number.isFinite(n) && n >= 1) {
                  // A khatmah can't be shorter than a day per page-set
                  // beyond the mushaf itself — clamp to 1..604 days.
                  startKhatmah(Math.min(604, Math.round(n)));
                  setCustomDaysVisible(false);
                }
              }}
              style={styles.menuCancel}>
              <Text style={{ color: palette.accentSolid, fontWeight: '700' }}>
                {t('quran.khatmahStartCta', 'Start')}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 16, gap: 8 },
  // Center + cap the index column on iPad/Mac so surah rows stay readable.
  listWide: { maxWidth: 720, width: '100%', alignSelf: 'center' },
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
  votdShowMore: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  votdRef: { fontSize: 12, fontWeight: '700' },
  votdHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  votdToggle: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    overflow: 'hidden',
  },
  votdToggleSeg: { paddingHorizontal: 10, paddingVertical: 4 },
  customDaysInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 18,
    fontVariant: ['tabular-nums'],
    marginTop: 4,
  },
  customDaysRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    marginTop: 6,
  },
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
  khatmahActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  khatmahBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
  },
  khatmahBtnLabel: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  khatmahBtnGhost: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  menuCard: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: '25%',
    borderRadius: 16,
    padding: 18,
    gap: 10,
  },
  menuTitle: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  menuRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  menuCancel: { alignItems: 'center', paddingVertical: 8 },
  downloadsLink: { alignSelf: 'flex-end', paddingVertical: 2 },
  starredHeading: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 8,
  },
});
