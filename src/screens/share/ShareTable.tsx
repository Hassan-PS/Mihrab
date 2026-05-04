// tokens-ok: deterministic raw values are part of this surface
// contract (share-image must render identically regardless of in-app
// theme; donations section uses platform brand colors).
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { MonthDayEntry } from '../../prayer/loadMonthPrayerTimes';
import { DISPLAY_ORDER } from '../../types/prayer';
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
const TEXT_COLOR = '#1f2937';
const SUNRISE_COLOR = '#6b7280';
const SUNRISE_DATA_COLOR = '#9ca3af';

type Props = {
  rows: MonthDayEntry[] | null;
  /** i18n locale — used for weekday name + Hijri intl formatting. */
  locale: string;
};

function ShareTableImpl({ rows, locale }: Props) {
  const { t } = useTranslation();
  return (
    <View style={[styles.table, { borderColor: TABLE_BORDER }]}>
      <View
        style={[
          styles.tableRow,
          styles.tableHeader,
          { backgroundColor: HEADER_BG, flexDirection: 'row' },
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
          <View style={[styles.cellSubRow, { flexDirection: 'row' }]}>
            <View
              style={[
                styles.cellSubCol,
                { borderEndWidth: 1, borderColor: TABLE_BORDER },
              ]}>
              <Text style={[styles.headerText, { color: HEADER_ACCENT }]}>
                {t('month.hijri', 'Hijri')}
              </Text>
            </View>
            <View style={styles.cellSubCol}>
              <Text style={[styles.headerText, { color: HEADER_ACCENT }]}>
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
          <View style={[styles.cellSubRow, { flexDirection: 'row' }]}>
            {DISPLAY_ORDER.map((key, idx) => {
              const isSunrise = key === 'Sunrise';
              return (
                <View
                  key={key}
                  style={[
                    styles.cellSubCol,
                    {
                      borderEndWidth:
                        idx === DISPLAY_ORDER.length - 1 ? 0 : 1,
                      borderColor: TABLE_BORDER,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.headerText,
                      { color: isSunrise ? SUNRISE_COLOR : HEADER_ACCENT },
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
              { backgroundColor: rowBg, flexDirection: 'row' },
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
                  flexDirection: 'row',
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
                  flexDirection: 'row',
                  paddingVertical: 0,
                  borderEndWidth: 0,
                },
              ]}>
              {DISPLAY_ORDER.map((key, idx) => {
                const raw = row.timings[key];
                const timeStr = raw ? formatDisplayTime(raw) : '—';
                const isSunrise = key === 'Sunrise';
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
                      },
                    ]}>
                    <Text
                      style={[
                        styles.cellText,
                        isFriday && styles.boldText,
                        {
                          color: isSunrise ? SUNRISE_DATA_COLOR : TEXT_COLOR,
                          fontStyle: isSunrise ? 'italic' : 'normal',
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
  cellDay: { width: 56 },
  cellDateGroup: { width: 84 },
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
  headerText: { fontSize: 10, fontWeight: '700', textAlign: 'center' },
  cellText: { fontSize: 10, textAlign: 'center' },
  boldText: { fontWeight: '700' },
});
