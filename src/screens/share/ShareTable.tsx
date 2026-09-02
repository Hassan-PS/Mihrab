// tokens-ok: deterministic raw values are part of this surface
// contract (share-image must render identically regardless of in-app
// theme; donations section uses platform brand colors).
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { TFunction } from 'i18next';
import type { MonthDayEntry } from '../../prayer/loadMonthPrayerTimes';
import { DISPLAY_ORDER, OPTIONAL_TIME_KEYS } from '../../types/prayer';
import { formatDisplayTime } from '../../utils/prayerTimes';

/**
 * Share-image table — task #64 split.
 *
 * Renders a static, high-contrast grid of one row per day with day-of-week,
 * Hijri date, Gregorian date, and the six prayer times. Friday rows are
 * tinted; alternating rows use zebra-striping. Colours are intentionally
 * absolute (not palette-derived) — the rendered PNG must look identical
 * regardless of the sender's in-app theme.
 */
const TABLE_BORDER = '#d1d5db';
const HEADER_BG = '#dcfce7';
const HEADER_ACCENT = '#166534';
const TEXT_COLOR = '#111827';
const SUNRISE_COLOR = '#6b7280';
const SUNRISE_DATA_COLOR = '#9ca3af';

/**
 * The five, and everything else.
 *
 * Nine columns now, and only five of them are prayers: Sunrise and the
 * three night marks are times. Set at one weight they read as a list of
 * nine equal things, and someone glancing at the sheet on a wall to find
 * ʿAṣr has to work out which of the nine it is. So the five carry the
 * weight and the darker ink, and the derived times sit back — lighter,
 * italic, and on a paler ground in the header. Nothing is hidden; the
 * order of importance is simply visible.
 */
const IS_SALAH = (key: string) =>
  !(OPTIONAL_TIME_KEYS as readonly string[]).includes(key);
const DERIVED_HEADER_BG = '#eef2f5';
const DERIVED_TEXT = '#8a939e';
const SALAH_HEADER_BG = '#c9f0d5';

type Props = {
  rows: MonthDayEntry[] | null;
  /** i18n locale — used for weekday name + Hijri intl formatting. */
  locale: string;
  /**
   * The sheet's own translator, which is NOT the app's.
   *
   * The sheet is exported in a language the sender chooses — the people
   * it is pinned up for need not read what the sender reads — so every
   * string here comes from a fixed-language `t` passed down rather than
   * from `useTranslation`.
   */
  t: TFunction;
  /**
   * True when the sheet must be laid out right to left.
   *
   * NET direction, not the sheet language's own: this renders inside the
   * app's tree, which is already mirrored when the APP is in Arabic or
   * Urdu, and a `row-reverse` inside a mirrored tree flips twice and
   * lands back where it started. The caller works out the difference —
   * see `ShareMonthScreen`.
   */
  rtl: boolean;
};

function ShareTableImpl({ rows, locale, t, rtl }: Props) {
  const dir = rtl ? ('row-reverse' as const) : ('row' as const);
  /**
   * The rows divide whatever the page has left, rather than being drawn
   * at a height computed from a guess at the banner's.
   *
   * The first attempt measured: page, less padding, less an assumed
   * banner and footer, over the number of days. The assumption was forty
   * pixels short and the last row and the footer fell off the bottom of
   * the sheet — on a surface whose whole promise is that it is exactly
   * one page. Flex asks the layout instead of predicting it, and it comes
   * out right for a 28-day February and a 31-day January alike.
   */
  return (
    <View style={[styles.table, { borderColor: TABLE_BORDER, flex: 1 }]}>
      <View
        style={[
          styles.tableRow,
          styles.tableHeader,
          { backgroundColor: HEADER_BG, flexDirection: dir },
        ]}>
        <View
          style={[styles.cell, styles.cellDay, { borderColor: TABLE_BORDER }]}>
          <Text style={[styles.headerText, { color: HEADER_ACCENT }]}>
            {t('month.dayOfWeek', 'Day')}
          </Text>
        </View>
        <View
          style={[
            styles.cell,
            styles.cellDateGroup,
            {
              borderColor: TABLE_BORDER,
              flexDirection: 'column',
              paddingVertical: 0,
            },
          ]}>
          <View
            style={[
              styles.cellSubHeader,
              { borderBottomWidth: 1, borderColor: TABLE_BORDER },
            ]}>
            <Text style={[styles.headerText, { color: HEADER_ACCENT }]}>
              {t('month.date', 'Date')}
            </Text>
          </View>
          <View style={[styles.cellSubRow, { flexDirection: dir }]}>
            <View
              style={[
                styles.cellSubCol,
                { borderEndWidth: 1, borderColor: TABLE_BORDER },
              ]}>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={[styles.headerText, { color: HEADER_ACCENT }]}>
                {t('month.hijri', 'Hijri')}
              </Text>
            </View>
            <View style={styles.cellSubCol}>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={[styles.headerText, { color: HEADER_ACCENT }]}>
                {t('month.gregorian', 'Greg.')}
              </Text>
            </View>
          </View>
        </View>
        <View
          style={[
            styles.cell,
            styles.cellTimesGroup,
            {
              borderColor: TABLE_BORDER,
              flexDirection: 'column',
              paddingVertical: 0,
              borderEndWidth: 0,
            },
          ]}>
          <View
            style={[
              styles.cellSubHeader,
              { borderBottomWidth: 1, borderColor: TABLE_BORDER },
            ]}>
            <Text style={[styles.headerText, { color: HEADER_ACCENT }]}>
              {t('month.prayerTimes', 'Prayer Times')}
            </Text>
          </View>
          <View style={[styles.cellSubRow, { flexDirection: dir }]}>
            {DISPLAY_ORDER.map((key, idx) => {
              const salah = IS_SALAH(key);
              return (
                <View
                  key={key}
                  style={[
                    styles.cellSubCol,
                    {
                      borderEndWidth:
                        idx === DISPLAY_ORDER.length - 1 ? 0 : 1,
                      borderColor: TABLE_BORDER,
                      backgroundColor: salah
                        ? SALAH_HEADER_BG
                        : DERIVED_HEADER_BG,
                    },
                  ]}>
                  <Text
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    style={[
                      salah ? styles.headerText : styles.headerTextQuiet,
                      { color: salah ? HEADER_ACCENT : SUNRISE_COLOR },
                    ]}>
                    {t(`prayer.${key}`)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>

      {rows?.map((row, index) => {
        const isFriday = row.date.getDay() === 5;
        const rowBg = isFriday
          ? '#e5e7eb'
          : index % 2 === 0
            ? '#ffffff'
            : '#f9fafb';
        const gregDateStr = row.date.getDate().toString();
        const hijriDateStr = new Intl.DateTimeFormat(
          `${locale}-u-ca-islamic`,
          { day: 'numeric' },
        ).format(row.date);
        const dayStr = row.date.toLocaleDateString(locale, {
          weekday: 'short',
        });
        return (
          <View
            key={index}
            style={[
              styles.tableRow,
              { backgroundColor: rowBg, flexDirection: dir, flex: 1 },
            ]}>
            <View
              style={[
                styles.cell,
                styles.cellDay,
                { borderColor: TABLE_BORDER },
              ]}>
              <Text
                style={[
                  styles.cellText,
                  isFriday && styles.boldText,
                  { color: TEXT_COLOR },
                ]}>
                {dayStr}
              </Text>
            </View>
            <View
              style={[
                styles.cell,
                styles.cellDateGroup,
                {
                  borderColor: TABLE_BORDER,
                  flexDirection: dir,
                  paddingVertical: 0,
                },
              ]}>
              <View
                style={[
                  styles.cellSubCol,
                  {
                    borderEndWidth: 1,
                    borderColor: TABLE_BORDER,
                    justifyContent: 'center',
                  },
                ]}>
                <Text
                  style={[
                    styles.cellText,
                    isFriday && styles.boldText,
                    { color: TEXT_COLOR },
                  ]}>
                  {hijriDateStr}
                </Text>
              </View>
              <View
                style={[styles.cellSubCol, { justifyContent: 'center' }]}>
                <Text
                  style={[
                    styles.cellText,
                    isFriday && styles.boldText,
                    { color: TEXT_COLOR },
                  ]}>
                  {gregDateStr}
                </Text>
              </View>
            </View>
            <View
              style={[
                styles.cell,
                styles.cellTimesGroup,
                {
                  borderColor: TABLE_BORDER,
                  flexDirection: dir,
                  paddingVertical: 0,
                  borderEndWidth: 0,
                },
              ]}>
              {DISPLAY_ORDER.map((key, idx) => {
                const raw = row.timings[key];
                const timeStr = raw ? formatDisplayTime(raw) : '—';
                const salah = IS_SALAH(key);
                return (
                  <View
                    key={key}
                    style={[
                      styles.cellSubCol,
                      {
                        borderEndWidth:
                          idx === DISPLAY_ORDER.length - 1 ? 0 : 1,
                        borderColor: TABLE_BORDER,
                        justifyContent: 'center',
                        backgroundColor: salah ? undefined : '#00000006',
                      },
                    ]}>
                    <Text
                      style={[
                        salah ? styles.cellTextSalah : styles.cellText,
                        isFriday && salah && styles.boldText,
                        {
                          color: salah
                            ? TEXT_COLOR
                            : key === 'Sunrise'
                              ? SUNRISE_DATA_COLOR
                              : DERIVED_TEXT,
                          fontStyle: salah ? 'normal' : 'italic',
                        },
                      ]}>
                      {timeStr}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export const ShareTable = memo(ShareTableImpl);

const styles = StyleSheet.create({
  table: { borderWidth: 1 },
  tableRow: {},
  tableHeader: {},
  cell: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderEndWidth: 1,
  },
  cellDay: { width: 52 },
  cellDateGroup: { width: 92 },
  cellTimesGroup: { flex: 1 },
  cellSubHeader: {
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellSubRow: { paddingVertical: 0 },
  cellSubCol: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  headerText: { fontSize: 10, fontWeight: '800', textAlign: 'center' },
  headerTextQuiet: { fontSize: 9, fontWeight: '600', textAlign: 'center' },
  cellText: { fontSize: 9.5, textAlign: 'center' },
  cellTextSalah: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  boldText: { fontWeight: '800' },
});
