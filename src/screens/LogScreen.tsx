/**
 * The Log — prayers and fasting on one screen (design review 2c).
 *
 * They were two screens with two visual languages recording the same act:
 * what you did today. Merged, they share one graph — green depth for
 * prayers, an amber ring for the fast — and one day column. The stats
 * trio and the two "all logged days" lists are gone: the graph already
 * shows the streak, so the number only has to name it, and a wall of
 * squares says more than a scrolling list of dates ever did.
 *
 * Everything either screen could DO is still here: the four statuses, the
 * private note per prayer, marking and unmarking a fast, the day-before
 * reminder and the sunnah calendar (behind "All upcoming", since a calendar
 * is reference, not a daily action).
 *
 * THE SCREEN SHOWS A DAY, not today. It used to be welded to `dayKey()`,
 * which meant the journal could only ever be written forward: a prayer you
 * forgot to mark last night was unreachable the next morning, and a record
 * you cannot correct is one you stop trusting. Any day back to the first
 * one you ever logged can be opened — with the arrows, or by tapping its
 * square in the graph — and every control on the screen writes to whichever
 * day is open. Forward stops at today, because a log of the future is a
 * plan, and this screen is not for plans.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import notifee, { EventType } from '@notifee/react-native';
import { JOURNAL_LOG_ACTION_ID } from '../notifications/prayerNotifications';
import { useAppPalette } from '../hooks/useAppPalette';
import { CenteredColumn } from '../responsive/CenteredColumn';
import { useAndroidSubScreenBack } from '../navigation/useAndroidSubScreenBack';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import { usePrayerDay } from '../hooks/usePrayerDay';
import {
  durableEncryptedGet,
  durableEncryptedSet,
} from '../storage/durableWrite';
import {
  FASTING_KEY,
  JOURNAL_KEY,
  dayKey,
  notifyPracticeChanged,
} from '../practice/practiceStore';
import {
  buildHeatmap,
  PracticeHeatmap,
  weeksToCover,
} from '../practice/PracticeHeatmap';
import { getCachedPrayerTimes } from '../prayer/prayerStorage';
import { getEffectiveDataProvider } from '../settings/effectiveProvider';
import { applyOffsets } from '../settings/prayerOffsets';
import { injectNightTimes } from '../utils/nightTimes';
import type { TimingsMap } from '../types/prayer';
import {
  coerceJournalEntries,
  computeCurrentStreak,
  getEntryStatus,
  removeEntry,
  setEntryNote,
  upsertEntry,
  type JournalEntry,
  type JournalPrayer,
  type JournalStatus,
} from '../journal/journal';
import {
  coerceFastEntries,
  computeFastStats,
  findFastEntry,
  isRecommendedVoluntaryFastDay,
  ramadanDayNumber,
  upsertFastEntry,
  deleteFastEntry,
  type FastEntry,
} from '../fasting/fasting';
import { cardEdgeStyle, inputChromeStyle } from '../theme/chrome';
import { tabularNumeralStyle } from '../theme/textScale';
import { formatDisplayTime } from '../utils/prayerTimes';
import { useTabBarInset } from '../navigation/tabBarInset';

const PRAYERS: JournalPrayer[] = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const STATUSES: JournalStatus[] = ['on-time', 'late', 'missed', 'qadha'];

/**
 * A `YYYY-MM-DD` key back into a local Date, anchored at noon.
 *
 * Noon and not midnight: adding or subtracting a day around a DST boundary
 * can land on an hour that does not exist locally, and the resulting Date
 * rolls into the neighbouring day. The log would then skip 30 March or
 * repeat 26 October once a year, in exactly the countries that would never
 * think to report it.
 */
function dateFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

export function LogScreen() {
  const { t, i18n } = useTranslation();
  const { palette } = useAppPalette();
  const tabBarInset = useTabBarInset();
  const navigation = useNavigation();
  const { settings, hydrated: settingsHydrated, updateSettings } =
    usePrayerSettings();
  const { state } = usePrayerDay(settings, settingsHydrated);
  useAndroidSubScreenBack();

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [fasts, setFasts] = useState<FastEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [openNote, setOpenNote] = useState<JournalPrayer | null>(null);
  const [actionTargetPrayer, setActionTargetPrayer] =
    useState<JournalPrayer | null>(null);
  const today = dayKey();
  /**
   * The day being shown and written to. Defaults to today, and every write
   * on this screen goes here rather than to `today`.
   */
  const [selected, setSelected] = useState(today);
  const isToday = selected === today;
  const selectedDate = useMemo(() => dateFromKey(selected), [selected]);
  /** Forward is barred past today — see the header comment. */
  const canGoForward = selected < today;

  const stepDay = useCallback(
    (delta: number) => {
      setSelected(cur => {
        const d = dateFromKey(cur);
        d.setDate(d.getDate() + delta);
        const next = dayKey(d);
        return next > today ? cur : next;
      });
    },
    [today],
  );

  // Deep link from a prayer notification's "Log prayer" action: highlight
  // the row it names for a few seconds so the tap lands somewhere obvious.
  useEffect(() => {
    const sub = notifee.onForegroundEvent(({ type, detail }) => {
      if (type !== EventType.ACTION_PRESS) return;
      const id = detail.pressAction?.id ?? '';
      if (!id.startsWith(`${JOURNAL_LOG_ACTION_ID}:`)) return;
      const name = id.slice(JOURNAL_LOG_ACTION_ID.length + 1) as JournalPrayer;
      if (PRAYERS.includes(name)) {
        // The notification is about today's prayer, so it also snaps the
        // screen back to today — otherwise the highlight would land on a
        // row belonging to whichever old day was left open.
        setSelected(dayKey());
        setActionTargetPrayer(name);
        setTimeout(() => setActionTargetPrayer(null), 4000);
      }
    });
    return sub;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      durableEncryptedGet(JOURNAL_KEY).catch(() => null),
      durableEncryptedGet(FASTING_KEY).catch(() => null),
    ])
      .then(([j, f]) => {
        if (cancelled) return;
        if (j) setEntries(coerceJournalEntries(JSON.parse(j)));
        if (f) setFasts(coerceFastEntries(JSON.parse(f)));
      })
      .catch(e => {
        console.warn('LogScreen load failed:', e);
        Alert.alert(
          t('journal.loadFailedTitle', 'Could not load journal'),
          t(
            'journal.loadFailedBody',
            'Your data is safe on disk but could not be read right now. Please try opening the journal again.',
          ),
        );
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const persistJournal = useCallback(
    async (next: JournalEntry[]) => {
      const prev = entries;
      setEntries(next);
      try {
        await durableEncryptedSet(JOURNAL_KEY, JSON.stringify(next));
        notifyPracticeChanged();
      } catch (e) {
        console.warn('LogScreen journal persist failed', e);
        setEntries(prev);
        Alert.alert(
          t('journal.saveFailedTitle', 'Could not save'),
          t('journal.saveFailedBody', 'Please try again.'),
        );
      }
    },
    [entries, t],
  );

  const persistFasts = useCallback(
    async (next: FastEntry[]) => {
      const prev = fasts;
      setFasts(next);
      try {
        await durableEncryptedSet(FASTING_KEY, JSON.stringify(next));
        notifyPracticeChanged();
      } catch (e) {
        console.warn('LogScreen fasting persist failed', e);
        setFasts(prev);
      }
    },
    [fasts],
  );

  /**
   * Note drafts belong to the day on screen, so they are re-read whenever
   * the day changes — not once on hydrate. Getting this wrong would carry
   * one day's private note onto another and save it there.
   */
  useEffect(() => {
    if (!hydrated) return;
    const next: Record<string, string> = {};
    for (const p of PRAYERS) {
      const e = entries.find(x => x.date === selected && x.prayer === p);
      next[p] = e?.note ?? '';
    }
    setDraftNotes(next);
    setOpenNote(null);
    // Deliberately not keyed on `entries`: re-running on every save would
    // wipe whatever the user has typed since.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, selected]);

  const onMark = useCallback(
    (prayer: JournalPrayer, status: JournalStatus) => {
      // Tapping the selected status again clears it — the only way to undo
      // a mis-tap.
      if (getEntryStatus(entries, selected, prayer) === status) {
        void persistJournal(removeEntry(entries, selected, prayer));
        return;
      }
      void persistJournal(upsertEntry(entries, selected, prayer, status));
    },
    [entries, selected, persistJournal],
  );

  const onSaveNote = useCallback(
    (prayer: JournalPrayer) => {
      void persistJournal(
        setEntryNote(entries, selected, prayer, draftNotes[prayer] ?? ''),
      );
    },
    [draftNotes, entries, selected, persistJournal],
  );

  const markAllOnTime = useCallback(() => {
    let next = entries;
    for (const p of PRAYERS) {
      if (!getEntryStatus(next, selected, p)) {
        next = upsertEntry(next, selected, p, 'on-time');
      }
    }
    if (next !== entries) void persistJournal(next);
  }, [entries, selected, persistJournal]);

  const dayFast = findFastEntry(fasts, selected);
  const toggleFast = useCallback(() => {
    if (dayFast) {
      void persistFasts(deleteFastEntry(fasts, selected));
      return;
    }
    // Ramadan is a property of the DAY being logged, not of the day the
    // logging happens on — back-filling a fast in Ramadan from the week
    // after must still record it as a Ramadan fast.
    const ramadanDay = ramadanDayNumber(dateFromKey(selected));
    void persistFasts(
      upsertFastEntry(fasts, selected, {
        type: ramadanDay != null ? 'ramadan' : 'voluntary',
        completed: true,
      }),
    );
  }, [fasts, selected, dayFast, persistFasts]);

  // ── The graph ────────────────────────────────────────────────────────
  /**
   * The oldest day with anything on it, across both stores — the graph is
   * drawn back to this and no further. Fasts count as well as prayers: a
   * Ramadan logged before the journal was ever used is still history.
   */
  const earliestLogged = useMemo(() => {
    let earliest: string | null = null;
    for (const e of entries) {
      if (earliest === null || e.date < earliest) earliest = e.date;
    }
    for (const f of fasts) {
      if (earliest === null || f.date < earliest) earliest = f.date;
    }
    return earliest;
  }, [entries, fasts]);

  const heatmapRows = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const e of entries) {
      byDay.set(e.date, (byDay.get(e.date) ?? 0) + 1);
    }
    const fasted = new Set(fasts.filter(f => f.completed).map(f => f.date));
    return buildHeatmap(
      byDay,
      fasted,
      new Date(),
      weeksToCover(earliestLogged),
    );
  }, [entries, fasts, earliestLogged]);

  const weekdayLabels = useMemo(() => {
    // Monday-first initials in the app language.
    const monday = new Date(2024, 0, 1); // a Monday
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d
        .toLocaleDateString(i18n.language, { weekday: 'narrow' })
        .slice(0, 2);
    });
  }, [i18n.language]);

  const streak = computeCurrentStreak(entries);
  const fastStats = computeFastStats(fasts);

  /**
   * The selected day's prayer times, for the row labels and the iftar line.
   *
   * Today comes straight from `usePrayerDay`, which is already loaded and
   * already carries the user's per-prayer offsets. An older day is read
   * from the local cache and put through the same two transforms, so the
   * time next to "Asr" here is the one the rest of the app would have
   * shown that day rather than a raw provider value four minutes off.
   *
   * A miss is normal and silent: the cache holds about a year, and a day
   * older than that — or one logged in another city — simply shows no
   * times. Nothing on this screen depends on them.
   */
  const [pastTimes, setPastTimes] = useState<TimingsMap | null>(null);
  const coords =
    state.phase === 'ready'
      ? { latitude: state.latitude, longitude: state.longitude }
      : null;
  const lat = coords?.latitude;
  const lon = coords?.longitude;
  useEffect(() => {
    if (isToday || lat === undefined || lon === undefined) {
      setPastTimes(null);
      return;
    }
    let cancelled = false;
    void getCachedPrayerTimes({
      provider: getEffectiveDataProvider(
        settings.dataProviderAuto,
        settings.dataProvider,
        { latitude: lat, longitude: lon },
      ),
      latitude: lat,
      longitude: lon,
      date: dateFromKey(selected),
      calculationMethod: settings.calculationMethod,
      school: settings.school,
    })
      .then(raw => {
        if (cancelled) return;
        setPastTimes(
          raw
            ? injectNightTimes([applyOffsets(raw, settings.prayerOffsets)])[0]
            : null,
        );
      })
      .catch(() => {
        if (!cancelled) setPastTimes(null);
      });
    return () => {
      cancelled = true;
    };
  }, [
    isToday,
    selected,
    lat,
    lon,
    settings.dataProviderAuto,
    settings.dataProvider,
    settings.calculationMethod,
    settings.school,
    settings.prayerOffsets,
  ]);

  const dayTimes = isToday
    ? state.phase === 'ready'
      ? state.today
      : undefined
    : (pastTimes ?? undefined);

  const maghrib = dayTimes?.Maghrib;
  const isSunnahDay = isRecommendedVoluntaryFastDay(selectedDate);
  const ramadanDay = ramadanDayNumber(selectedDate);

  /** "Sunday 2 August" — the day's own name, not a raw key. */
  const selectedLabel = useMemo(
    () =>
      selectedDate.toLocaleDateString(i18n.language, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        // The year only when it is not the current one — it is noise for
        // the ninety percent of visits that land in the last few months.
        ...(selectedDate.getFullYear() === new Date().getFullYear()
          ? {}
          : { year: 'numeric' }),
      }),
    [selectedDate, i18n.language],
  );

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[styles.scroll, { paddingBottom: tabBarInset }]}
      contentInsetAdjustmentBehavior="automatic">
      <CenteredColumn>
        {/* ── The graph ─────────────────────────────────────────────── */}
        <View
          style={[
            styles.card,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          <Text style={[styles.sectionTitle, { color: palette.muted }]}>
            {t('log.practiceTitle')}
          </Text>
          <PracticeHeatmap
            rows={heatmapRows}
            weekdayLabels={weekdayLabels}
            selectedKey={selected}
            onSelectDay={setSelected}
            caption={`${t('log.streakCaption', {
              defaultValue: '{{count}}-day streak',
              count: streak,
            })} · ${t('log.fastsCaption', {
              defaultValue: '{{count}} fasts',
              count: fastStats.total,
            })}`}
          />
        </View>

        {/* ── The day being logged ──────────────────────────────────── */}
        <View style={styles.dayBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('log.previousDay')}
            onPress={() => stepDay(-1)}
            hitSlop={10}
            style={[styles.dayArrow, { backgroundColor: palette.controlBg }]}>
            <Text style={[styles.dayArrowGlyph, { color: palette.accent }]}>‹</Text>
          </Pressable>
          <View style={styles.dayNameWrap}>
            <Text
              style={[styles.dayName, { color: palette.text }]}
              numberOfLines={1}>
              {isToday ? t('journal.todayLabel') : selectedLabel}
            </Text>
            {isToday ? null : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('log.backToToday')}
                onPress={() => setSelected(today)}
                hitSlop={6}>
                <Text style={[styles.backToToday, { color: palette.accent }]}>
                  {t('log.backToToday')}
                </Text>
              </Pressable>
            )}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('log.nextDay')}
            // Tomorrow is not a thing you can have prayed.
            disabled={!canGoForward}
            onPress={() => stepDay(1)}
            hitSlop={10}
            style={[
              styles.dayArrow,
              {
                backgroundColor: palette.controlBg,
                opacity: canGoForward ? 1 : 0.35,
              },
            ]}>
            <Text style={[styles.dayArrowGlyph, { color: palette.accent }]}>›</Text>
          </Pressable>
        </View>
        <View style={styles.todayHeader}>
          <View style={{ flex: 1 }} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('log.markAllOnTime', 'Mark all on time')}
            onPress={markAllOnTime}
            style={[styles.ghostBtn, { backgroundColor: palette.controlBg }]}>
            <Text style={[styles.ghostLabel, { color: palette.accent }]}>
              {t('log.markAllOnTime', 'Mark all on time')}
            </Text>
          </Pressable>
        </View>

        {/* The nightly prompt is the same act as the button above, offered
            when the day is actually over — so the switch for it belongs
            here, next to the thing it fills in, as well as in Settings. */}
        <View
          style={[
            styles.card,
            styles.reminderRow,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          <View style={styles.reminderCopy}>
            <Text style={[styles.reminderTitle, { color: palette.text }]}>
              {t('settings.endOfDayLog')}
            </Text>
            <Text style={[styles.reminderHelp, { color: palette.muted }]}>
              {t('settings.endOfDayLogHelp')}
            </Text>
          </View>
          <Switch
            value={settings.endOfDayLogReminderEnabled}
            trackColor={{ true: palette.accentSolid, false: '#9ca3af' }}
            thumbColor="#ffffff"
            onValueChange={v =>
              updateSettings({ endOfDayLogReminderEnabled: v })
            }
          />
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          {PRAYERS.map((prayer, index) => {
            const current = getEntryStatus(entries, selected, prayer);
            const draft = draftNotes[prayer] ?? '';
            const savedNote = entries.find(
              e => e.date === selected && e.prayer === prayer,
            )?.note;
            const draftDirty = (savedNote ?? '') !== draft;
            const time = dayTimes?.[prayer];
            return (
              <View
                key={prayer}
                style={[
                  styles.prayerRow,
                  index > 0 && {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: palette.border ?? palette.muted,
                  },
                  actionTargetPrayer === prayer && {
                    backgroundColor: palette.accentBg,
                  },
                ]}>
                <View style={styles.prayerHead}>
                  <Text style={[styles.prayerName, { color: palette.text }]}>
                    {t(`prayer.${prayer}`)}
                  </Text>
                  {time ? (
                    <Text
                      style={[
                        styles.prayerTime,
                        tabularNumeralStyle,
                        { color: palette.muted },
                      ]}>
                      {formatDisplayTime(time)}
                    </Text>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t(
                      'journal.noteLabel',
                      'Personal note (private, encrypted)',
                    )}
                    onPress={() =>
                      setOpenNote(cur => (cur === prayer ? null : prayer))
                    }
                    hitSlop={8}
                    style={styles.noteToggle}>
                    <Text
                      style={{
                        color: savedNote ? palette.accent : palette.muted,
                        fontSize: 15,
                      }}>
                      ✎
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.statusRow}>
                  {STATUSES.map(s => {
                    const isSel = current === s;
                    return (
                      <Pressable
                        key={s}
                        accessibilityRole="radio"
                        accessibilityLabel={t(`journal.status.${s}`)}
                        accessibilityState={{ selected: isSel }}
                        onPress={() => onMark(prayer, s)}
                        style={[
                          styles.statusChip,
                          {
                            backgroundColor: isSel
                              ? palette.accentSolid
                              : palette.controlBg,
                          },
                        ]}>
                        <Text
                          style={[
                            styles.statusLabel,
                            { color: isSel ? palette.onAccent : palette.text },
                          ]}
                          numberOfLines={1}>
                          {t(`journal.statusShort.${s}`)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {openNote === prayer ? (
                  <View style={styles.noteRow}>
                    <TextInput
                      accessibilityLabel={t(
                        'journal.noteLabel',
                        'Personal note (private, encrypted)',
                      )}
                      value={draft}
                      onChangeText={txt =>
                        setDraftNotes(prev => ({ ...prev, [prayer]: txt }))
                      }
                      onBlur={() => {
                        if (draftDirty) onSaveNote(prayer);
                      }}
                      placeholder={t(
                        'journal.notePlaceholder',
                        'Private note (only on this device)',
                      )}
                      placeholderTextColor={String(palette.muted)}
                      multiline
                      style={[
                        styles.noteInput,
                        inputChromeStyle(palette),
                        { color: palette.text, backgroundColor: palette.bg },
                      ]}
                    />
                    {draftDirty ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('journal.saveNote', 'Save note')}
                        onPress={() => onSaveNote(prayer)}
                        style={[
                          styles.saveNoteBtn,
                          { backgroundColor: palette.accentSolid },
                        ]}>
                        <Text
                          style={[styles.saveNoteLabel, { color: palette.onAccent }]}>
                          {t('journal.saveNote', 'Save')}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        {/* ── Fasting: one card, not a screen ───────────────────────── */}
        <View
          style={[
            styles.card,
            { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
          ]}>
          <Text style={[styles.sectionTitle, { color: palette.muted }]}>
            {t('log.fastingTitle')}
          </Text>
          <View style={styles.fastRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fastState, { color: palette.text }]}>
                {dayFast
                  ? t('fasting.statusKept')
                  : ramadanDay != null
                    ? t('fasting.ramadanDayLabel', { day: ramadanDay })
                    : isSunnahDay
                      ? t('fasting.statusRecommended')
                      : t('log.noFastLogged')}
              </Text>
              {maghrib ? (
                <Text
                  style={[styles.fastMeta, { color: palette.muted }]}
                  numberOfLines={1}>
                  {t('log.iftarAt', {
                    defaultValue: 'Iftar {{time}}',
                    time: formatDisplayTime(maghrib),
                  })}
                </Text>
              ) : null}
            </View>
            {/* Neutral wording in both states: "Mark TODAY as fasted" was
                a lie on every day but one, now that older days open here. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                dayFast ? t('log.unmarkFasted') : t('log.markFasted')
              }
              onPress={toggleFast}
              style={[
                styles.fastCta,
                {
                  backgroundColor: dayFast
                    ? palette.controlBg
                    : palette.accentSolid,
                },
              ]}>
              <Text
                style={[
                  styles.fastCtaLabel,
                  { color: dayFast ? palette.text : palette.onAccent },
                ]}>
                {dayFast ? t('log.unmarkFasted') : t('log.markFasted')}
              </Text>
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('log.allUpcoming', 'All upcoming')}
            onPress={() => navigation.navigate('Fasting' as never)}
            style={[
              styles.upcomingRow,
              { borderTopColor: palette.border ?? palette.muted },
            ]}>
            <Text style={[styles.upcomingLabel, { color: palette.accent }]}>
              {t('log.allUpcoming', 'All upcoming')}
            </Text>
            <Text style={{ color: palette.accent, fontSize: 15 }}>→</Text>
          </Pressable>
        </View>

        {!hydrated ? (
          <Text style={[styles.hint, { color: palette.muted }]}>
            {t('common.loading')}
          </Text>
        ) : null}
      </CenteredColumn>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, gap: 12, paddingBottom: 36 },
  card: { borderRadius: 18, padding: 14 },
  sectionTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  todayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  dayBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  dayArrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayArrowGlyph: { fontSize: 20, fontWeight: '700', lineHeight: 22 },
  dayNameWrap: { flex: 1, alignItems: 'center' },
  dayName: { fontSize: 16, fontWeight: '700' },
  backToToday: { fontSize: 12, fontWeight: '700', marginTop: 1 },
  ghostBtn: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 10,
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  reminderCopy: { flex: 1, minWidth: 0, gap: 2 },
  reminderTitle: { fontSize: 14, fontWeight: '700' },
  reminderHelp: { fontSize: 12, lineHeight: 16 },
  ghostLabel: { fontSize: 12, fontWeight: '700' },
  prayerRow: { paddingVertical: 10 },
  prayerHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  prayerName: { fontSize: 15, fontWeight: '600' },
  prayerTime: { flex: 1, fontSize: 13 },
  noteToggle: { padding: 4 },
  statusRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  statusChip: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 12,
    alignItems: 'center',
  },
  statusLabel: { fontSize: 12, fontWeight: '600' },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 8 },
  noteInput: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  saveNoteBtn: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10 },
  saveNoteLabel: { fontSize: 13, fontWeight: '700' },
  fastRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fastState: { fontSize: 15, fontWeight: '600' },
  fastMeta: { fontSize: 12.5, marginTop: 2 },
  fastCta: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
  fastCtaLabel: { fontSize: 13, fontWeight: '700' },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 11,
    marginTop: 12,
  },
  upcomingLabel: { fontSize: 13.5, fontWeight: '600' },
  hint: { fontSize: 13, textAlign: 'center', marginTop: 8 },
});
