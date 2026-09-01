/**
 * The permanent index beside the mushaf on iPad and Mac (design review 2d).
 *
 * 604 pages behind a modal search is the phone compromise carried onto a
 * 1194pt screen. A standing list — surahs with their Arabic names,
 * revelation place and ayah count, plus Juz and Marks — is what the extra
 * 250pt is actually for: navigating stops being a modal round trip and
 * becomes a glance.
 *
 * The khatmah sits at the foot rather than the top. It is ambient, not an
 * action, so it belongs where the sidebar ends.
 */
import { memo, useMemo, useState } from 'react';
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
import { arabicTextStyle } from '../theme/typography';
import { TABULAR_MAX_FONT_SCALE } from '../theme/textScale';
import { SURAHS } from './quran';
import { pagesForRiwayah, totalPagesForRiwayah } from './pages';
import { DEFAULT_RIWAYAH, type RiwayahId } from './riwayat';
import {
  KHATMAH_TOTAL_PAGES,
  useQuranState,
  type QuranBookmark,
} from './quranState';
import { activeKhatmah } from './quranCardState';
import { Chip } from '../components/controls';
import { desktopSize } from '../responsive/desktop';

/**
 * 268pt is right for a sidebar reached with a thumb on an iPad. On a Mac
 * it lands at ~207 Mac points once Catalyst's scale-down is applied —
 * narrower than a Finder source list, with the surah's English and Arabic
 * names fighting for the same line. The desktop gets the extra 70pt.
 */
export const SIDEBAR_WIDTH = desktopSize(268);

type Tab = 'surah' | 'juz' | 'marks';

type Props = {
  /** Page currently on screen — the row for it reads as "reading". */
  currentPage: number;
  /** Which muṣḥaf those page numbers belong to. Absent means Hafs. */
  riwayah?: RiwayahId;
  onSelectPage: (page: number) => void;
  /**
   * Space to keep clear at the top: the floating navigation bar on iOS and,
   * on Mac Catalyst, the title-bar drag region that holds the window's
   * traffic lights. The reader's page columns reserve the same band.
   */
  topInset?: number;
};

type JuzRow = { juz: number; page: number };

function MushafIndexSidebarImpl({
  currentPage,
  riwayah = DEFAULT_RIWAYAH,
  onSelectPage,
  topInset = 0,
}: Props) {
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const quran = useQuranState();
  const [tab, setTab] = useState<Tab>('surah');
  const [query, setQuery] = useState('');

  // Both tables are facts about the PRINT on screen, not about the Qur'an:
  // a Warsh muṣḥaf opens al-Baqarah and juz 2 on pages of its own.
  const surahStartPage = useMemo(() => {
    const map = new Map<number, number>();
    // The page table is ordered; the first page whose start names a surah
    // is that surah's opening page.
    for (const p of pagesForRiwayah(riwayah)) {
      if (!map.has(p.start.surah)) map.set(p.start.surah, p.page);
    }
    return map;
  }, [riwayah]);

  const juzRows: JuzRow[] = useMemo(() => {
    const seen = new Map<number, number>();
    for (const p of pagesForRiwayah(riwayah)) {
      if (!seen.has(p.juz)) seen.set(p.juz, p.page);
    }
    return Array.from(seen, ([juz, page]) => ({ juz, page })).sort(
      (a, b) => a.juz - b.juz,
    );
  }, [riwayah]);

  const surahRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = SURAHS.map(s => ({
      ...s,
      page: surahStartPage.get(s.number) ?? 1,
    }));
    if (!q) return rows;
    // A page number is a legitimate query here — the search box is the
    // sidebar's "go to" as much as its filter.
    const asPage = Number(q);
    if (Number.isFinite(asPage) && asPage > 0) {
      return rows.filter(
        r =>
          r.page === Math.min(totalPagesForRiwayah(riwayah), asPage) ||
          String(r.number) === q,
      );
    }
    return rows.filter(
      r =>
        r.romanized.toLowerCase().includes(q) ||
        r.english.toLowerCase().includes(q) ||
        r.arabic.includes(query.trim()),
    );
  }, [query, surahStartPage, riwayah]);

  const plan = activeKhatmah(quran);

  const renderSurah = ({
    item,
  }: {
    item: (typeof SURAHS)[number] & { page: number };
  }) => {
    const reading =
      currentPage >= item.page &&
      currentPage < (surahStartPage.get(item.number + 1) ?? Infinity);
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: reading }}
        accessibilityLabel={`${item.number}. ${item.romanized}`}
        onPress={() => onSelectPage(item.page)}
        style={[
          styles.row,
          reading && { backgroundColor: palette.accentBg },
        ]}>
        <Text
          style={[styles.rowNumber, { color: palette.muted }]}
          maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
          {item.number}
        </Text>
        <View style={styles.rowBody}>
          <Text style={[styles.rowTitle, { color: palette.text }]} numberOfLines={1}>
            {item.romanized}
          </Text>
          <Text style={[styles.rowMeta, { color: palette.muted }]} numberOfLines={1}>
            {`${t(`quran.${item.type}`, item.type)} · ${item.ayahCount}`}
            {reading ? ` · ${t('quran.reading', 'reading')}` : ''}
          </Text>
        </View>
        <Text style={[styles.rowArabic, { color: palette.text }]} numberOfLines={1}>
          {item.arabic}
        </Text>
      </Pressable>
    );
  };

  const renderJuz = ({ item }: { item: JuzRow }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('quran.juzLabel', {
        defaultValue: 'Juz {{juz}}',
        juz: item.juz,
      })}
      onPress={() => onSelectPage(item.page)}
      style={styles.row}>
      <Text
        style={[styles.rowNumber, { color: palette.muted }]}
        maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
        {item.juz}
      </Text>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, { color: palette.text }]} numberOfLines={1}>
          {t('quran.juzLabel', { defaultValue: 'Juz {{juz}}', juz: item.juz })}
        </Text>
        <Text style={[styles.rowMeta, { color: palette.muted }]} numberOfLines={1}>
          {t('quran.pageLabel', { page: item.page })}
        </Text>
      </View>
    </Pressable>
  );

  const renderMark = ({ item }: { item: QuranBookmark }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.surah}:${item.ayah}`}
      onPress={() => onSelectPage(item.page)}
      style={styles.row}>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, { color: palette.text }]} numberOfLines={1}>
          {`${item.surah}:${item.ayah}`}
        </Text>
        <Text style={[styles.rowMeta, { color: palette.muted }]} numberOfLines={1}>
          {t('quran.pageLabel', { page: item.page })}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <View
      style={[
        styles.sidebar,
        {
          width: SIDEBAR_WIDTH,
          paddingTop: topInset,
          backgroundColor: palette.bg,
          borderEndColor: palette.border ?? palette.muted,
        },
      ]}>
      <View style={styles.tabs}>
        <Chip
          label={t('quran.tabSurah', 'Surah')}
          selected={tab === 'surah'}
          onPress={() => setTab('surah')}
        />
        <Chip
          label={t('quran.tabJuz', 'Juz')}
          selected={tab === 'juz'}
          onPress={() => setTab('juz')}
        />
        <Chip
          label={t('quran.tabMarks', 'Marks')}
          selected={tab === 'marks'}
          onPress={() => setTab('marks')}
        />
      </View>

      {tab === 'surah' ? (
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('quran.searchSurahOrPage', 'Search surah or page')}
          placeholderTextColor={String(palette.muted)}
          accessibilityLabel={t('quran.searchSurahOrPage', 'Search surah or page')}
          clearButtonMode="while-editing"
          style={[
            styles.search,
            {
              color: palette.text,
              backgroundColor: palette.controlBg,
            },
          ]}
        />
      ) : null}

      {tab === 'surah' ? (
        <FlatList
          data={surahRows}
          keyExtractor={s => String(s.number)}
          renderItem={renderSurah}
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={16}
        />
      ) : tab === 'juz' ? (
        <FlatList
          data={juzRows}
          keyExtractor={j => String(j.juz)}
          renderItem={renderJuz}
          style={styles.list}
          initialNumToRender={16}
        />
      ) : (
        <FlatList
          data={quran.bookmarks}
          keyExtractor={b => b.id}
          renderItem={renderMark}
          style={styles.list}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: palette.muted }]}>
              {t('quran.noBookmarks', 'No bookmarks yet.')}
            </Text>
          }
        />
      )}

      {/* Khatmah pinned to the foot — ambient, not an action. */}
      {plan ? (
        <View
          style={[
            styles.khatmah,
            { borderTopColor: palette.border ?? palette.muted },
          ]}>
          <Text style={[styles.khatmahLabel, { color: palette.muted }]}>
            {t('quran.khatmah', 'Khatmah')}
          </Text>
          <Text
            style={[styles.khatmahMeta, { color: palette.text }]}
            numberOfLines={1}
            maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
            {t('quran.khatmahProgress', {
              defaultValue: '{{read}} of {{total}} pages',
              read: plan.pagesRead,
              total: KHATMAH_TOTAL_PAGES,
            })}
          </Text>
          <View style={[styles.track, { backgroundColor: palette.controlBg }]}>
            <View
              style={[
                styles.fill,
                {
                  backgroundColor: palette.accentSolid,
                  width: `${Math.round((plan.pagesRead / KHATMAH_TOTAL_PAGES) * 100)}%`,
                },
              ]}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

export const MushafIndexSidebar = memo(MushafIndexSidebarImpl);

const styles = StyleSheet.create({
  sidebar: { borderEndWidth: StyleSheet.hairlineWidth },
  tabs: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },
  search: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: desktopSize(8),
    fontSize: desktopSize(14),
  },
  list: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: desktopSize(9),
  },
  rowNumber: {
    width: desktopSize(24),
    fontSize: desktopSize(12),
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: desktopSize(14), fontWeight: '600' },
  rowMeta: { fontSize: desktopSize(11), marginTop: 1 },
  rowArabic: { fontSize: desktopSize(15), ...arabicTextStyle('body') },
  empty: { fontSize: desktopSize(13), padding: 16, textAlign: 'center' },
  khatmah: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 4,
  },
  khatmahLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  khatmahMeta: { fontSize: 13, fontWeight: '600' },
  track: { height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 4 },
  fill: { height: '100%', borderRadius: 2 },
});
