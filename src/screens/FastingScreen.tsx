import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { usePrayerSettings } from '../context/PrayerSettingsContext';
import { rescheduleFastingReminders } from '../notifications/fastingReminders';
import {
  durableEncryptedGet,
  durableEncryptedSet,
} from '../storage/durableWrite';
import { useAppPalette } from '../hooks/useAppPalette';
import { useBreakpoint } from '../responsive/breakpoints';
import { cardEdgeStyle } from '../theme/chrome';
import { CrescentIcon } from '../theme/icons';
import { gregorianToHijri } from '../hijri/convert';
import { isRamadan } from '../hijri/events';
import {
  getNextRamadanStart,
  getUpcomingFastingEvents,
} from '../hijri/upcomingEvents';
import {
  coerceFastEntries,
  computeFastStats,
  isRecommendedVoluntaryFastDay,
  ramadanDayNumber,
  upsertFastEntry,
  type FastEntry,
} from '../fasting/fasting';

/**
 * Encrypted-storage key for the fasting log — task #62.
 *
 * Fasting history reveals religious practice (which days are kept, when
 * the user is fasting voluntarily, qadha records). It must never sit in
 * plaintext on disk. EncryptedStorage uses platform native APIs:
 *   • iOS — Keychain Services with kSecClassGenericPassword.
 *   • Android — EncryptedSharedPreferences (Android Keystore-backed).
 *
 * Mirrors the pattern from JournalScreen so both PII collections share
 * the same trust boundary.
 */
const FASTING_KEY = 'prayerapp.fasting.v1';
import { RADIUS, SPACING } from '../theme/tokens';
import { typeStyle } from '../theme/typography';
import {
  TABULAR_MAX_FONT_SCALE,
  tabularNumeralStyle,
} from '../theme/textScale';

/**
 * FastingScreen — task #29 UI shell.
 *
 * Surfaces today's fast status + completed-day grid + streak. The data
 * layer is pure (`src/fasting/fasting.ts`); this screen is the visual
 * face. Storage of `entries` is held in component state for the shell;
 * the next pass wires it through to encrypted storage (the `secureStorage`
 * SECURE_FIELD_NAMES list already reserves a `fasting` slot).
 *
 * The 30-day Ramadan grid only renders when today is in Ramadan
 * (Hijri-derived). Outside Ramadan, the screen shows the Sunnah
 * voluntary-fast tracker (Mondays/Thursdays, white days, Arafah, Ashura).
 */
export function FastingScreen() {
  // Subscribe to width changes so future master-detail layouts pick up
  // the new breakpoint without a forced remount. iPad/Mac (#33) baseline.
  useBreakpoint();
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  const { settings, updateSettings } = usePrayerSettings();

  const [entries, setEntries] = useState<FastEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Re-schedule fasting reminders whenever the toggle or hour changes.
  // Also fires on first mount so a fresh install picks them up.
  useEffect(() => {
    void rescheduleFastingReminders({
      enabled: settings.fastingRemindersEnabled,
      hour: settings.fastingReminderHour,
    });
  }, [settings.fastingRemindersEnabled, settings.fastingReminderHour]);

  const onToggleReminders = useCallback(
    (next: boolean) => {
      updateSettings({ fastingRemindersEnabled: next });
    },
    [updateSettings],
  );

  // Hydrate from encrypted storage on mount. coerceFastEntries silently
  // drops malformed entries so a corrupted blob doesn't crash the screen.
  useEffect(() => {
    let cancelled = false;
    durableEncryptedGet(FASTING_KEY)
      .then(raw => {
        if (cancelled) return;
        if (raw) {
          try {
            setEntries(coerceFastEntries(JSON.parse(raw)));
          } catch (e) {
            console.warn('FastingScreen: malformed stored entries', e);
          }
        }
      })
      .catch(e => {
        // Read failure is rare but surface-loud — silent failure here
        // would lead to overwriting on next save and DESTROYING the
        // user's fasting log. The standing rule (#82) is that user
        // data must never go missing; we'd rather keep the screen empty
        // until the next mount than risk that.
        console.warn('FastingScreen: load failed', e);
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist on every change. Skip the initial hydration tick so we don't
  // immediately overwrite stored data with the empty default.
  const persistedAtLeastOnce = useRef(false);
  useEffect(() => {
    if (!hydrated) return;
    if (!persistedAtLeastOnce.current) {
      persistedAtLeastOnce.current = true;
      // First post-hydrate render — entries reflects what's already on disk,
      // no write needed. Subsequent changes will write through the next time
      // this effect fires.
      return;
    }
    durableEncryptedSet(FASTING_KEY, JSON.stringify(entries)).catch(e =>
      // Retry-exhausted failure. The user's optimistic update remains in
      // memory; next change will trigger another retry round. This logs
      // for diagnostics rather than ever silently dropping.
      console.warn('FastingScreen: persist failed after retries', e),
    );
  }, [entries, hydrated]);

  const now = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => formatLocalDate(now), [now]);
  const hijri = useMemo(() => gregorianToHijri(now), [now]);
  const inRamadan = isRamadan(hijri);
  const ramadanDay = ramadanDayNumber(now);
  const todayEntry = entries.find(e => e.date === todayKey);
  const stats = useMemo(() => computeFastStats(entries, now), [entries, now]);
  const isRecommended = useMemo(
    () => isRecommendedVoluntaryFastDay(now),
    [now],
  );
  // Mon/Thu encouragement copy applies to those weekdays specifically.
  const dow = now.getDay(); // 0=Sun … 6=Sat
  const isMondayOrThursday = dow === 1 || dow === 4;

  // Upcoming high-reward fasting days (Ashura, Arafah, Ramadan, 6 of
  // Shawwal, monthly White Days). Recompute when the date changes.
  const upcomingEvents = useMemo(() => getUpcomingFastingEvents(now), [now]);

  // Days until next Ramadan — when <90 days, surface a countdown card
  // at the very top of the screen.
  const nextRamadan = useMemo(() => getNextRamadanStart(now), [now]);
  const daysToRamadan = useMemo(() => {
    if (!nextRamadan) return null;
    const aMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const bMid = new Date(
      nextRamadan.getFullYear(),
      nextRamadan.getMonth(),
      nextRamadan.getDate(),
    );
    return Math.max(0, Math.round((bMid.getTime() - aMid.getTime()) / 86_400_000));
  }, [now, nextRamadan]);
  const showRamadanCountdown =
    !inRamadan && daysToRamadan != null && daysToRamadan <= 90;

  // Month view: every logged fasting date sorted newest first. The
  // user gets a complete history surface mirroring the journal layout.
  const allLoggedDates = useMemo(() => {
    const seen = new Set<string>();
    for (const e of entries) seen.add(e.date);
    return Array.from(seen).sort().reverse();
  }, [entries]);

  const onToggleToday = useCallback(() => {
    const type = inRamadan ? 'ramadan' : 'voluntary';
    setEntries(prev =>
      upsertFastEntry(prev, todayKey, {
        type,
        completed: !(todayEntry?.completed ?? false),
      }),
    );
  }, [inRamadan, todayEntry?.completed, todayKey]);

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: palette.bg }]}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic">
      {/* Ramadan countdown — only when <= 90 days away. Sits at the top
          to reflect the user's spec: build anticipation as Ramadan
          approaches, fade away once we're in the month. */}
      {showRamadanCountdown ? (
        <View
          style={[
            styles.ramadanCountdown,
            {
              backgroundColor: palette.accentBg,
              borderRadius: RADIUS.md,
              ...cardEdgeStyle(palette),
            },
          ]}>
          <Text style={[typeStyle('caption'), { color: palette.muted, textTransform: 'uppercase' }]}>
            {t('fasting.ramadanCountdownLabel', 'Ramadan begins in')}
          </Text>
          <Text
            style={[typeStyle('title1'), tabularNumeralStyle, { color: palette.accent }]}
            maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
            {t('fasting.daysCount', { count: daysToRamadan ?? 0, defaultValue: '{{count}} days' })}
          </Text>
        </View>
      ) : null}

      <View
        style={[
          styles.heroCard,
          {
            backgroundColor: palette.accentBg,
            borderRadius: RADIUS.lg,
            ...cardEdgeStyle(palette),
          },
        ]}>
        <View style={styles.heroRow}>
          <CrescentIcon color={palette.accentSolid} size={28} />
          <Text style={[typeStyle('caption'), styles.eyebrow, { color: palette.muted }]}>
            {inRamadan
              ? t('fasting.ramadanDayLabel', { day: ramadanDay ?? 0 })
              : t('fasting.todayLabel')}
          </Text>
        </View>
        {/* Mon/Thu Sunnah encouragement — the Prophet ﷺ used to fast on
            Mondays and Thursdays. Surface this gently, only on those
            weekdays and only outside Ramadan. */}
        {!inRamadan && isMondayOrThursday ? (
          <Text style={[typeStyle('footnote'), { color: palette.muted, fontStyle: 'italic' }]}>
            {dow === 1
              ? t(
                  'fasting.mondayEncouragement',
                  'Monday is a Sunnah fast — deeds are presented to Allah on Mondays and Thursdays.',
                )
              : t(
                  'fasting.thursdayEncouragement',
                  'Thursday is a Sunnah fast — deeds are presented to Allah on Mondays and Thursdays.',
                )}
          </Text>
        ) : null}
        <Text style={[typeStyle('title2'), { color: palette.text }]}>
          {todayEntry?.completed
            ? t('fasting.statusKept')
            : isRecommended
              ? t('fasting.statusRecommended')
              : t('fasting.statusOptional')}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            todayEntry?.completed
              ? t('fasting.unmarkCta')
              : t('fasting.markCta')
          }
          onPress={onToggleToday}
          style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
            styles.primary,
            { backgroundColor: palette.accent, borderRadius: RADIUS.sm },
            pressed && { opacity: 0.85 }, hovered && { opacity: 0.92 },
          ]}>
          <Text style={[typeStyle('headline'), { color: palette.bg }]}>
            {todayEntry?.completed
              ? t('fasting.unmarkCta')
              : t('fasting.markCta')}
          </Text>
        </Pressable>
      </View>

      {/* Encouragement copy above the stats — task #95. Mirrors the
          Journal pattern and adapts to the user's progress. */}
      <Text style={[styles.encouragement, { color: palette.text }]}>
        {stats.currentStreak >= 3
          ? t('fasting.encourageStreak', 'Mashallah, {{count}}-day streak. Keep it up.', { count: stats.currentStreak })
          : (stats.ramadanDaysKept + stats.voluntaryDaysKept) >= 1
          ? t('fasting.encourageActive', 'Every fast counts. May Allah accept it.')
          : t('fasting.encourageEmpty', 'Log your first fast to start tracking.')}
      </Text>
      <View style={styles.statsRow}>
        <StatCell
          label={t('fasting.statRamadan')}
          value={stats.ramadanDaysKept}
          palette={palette}
        />
        <StatCell
          label={t('fasting.statVoluntary')}
          value={stats.voluntaryDaysKept}
          palette={palette}
        />
        <StatCell
          label={t('fasting.statStreak')}
          value={stats.currentStreak}
          palette={palette}
        />
      </View>

      {inRamadan ? (
        <View
          style={[
            styles.gridCard,
            {
              backgroundColor: palette.card,
              borderRadius: RADIUS.md,
              ...cardEdgeStyle(palette),
            },
          ]}>
          <Text style={[typeStyle('caption'), styles.eyebrow, { color: palette.muted }]}>
            {t('fasting.gridLabel')}
          </Text>
          <View style={styles.grid}>
            {Array.from({ length: 30 }, (_, i) => {
              const day = i + 1;
              const dateKey = ramadanDateKeyForDay(day, hijri.year);
              const entry = entries.find(e => e.date === dateKey);
              const isToday = day === ramadanDay;
              return (
                <View
                  key={day}
                  accessibilityLabel={t('fasting.gridDayA11y', {
                    day,
                    state: entry?.completed ? '✓' : '–',
                  })}
                  style={[
                    styles.gridCell,
                    {
                      backgroundColor: entry?.completed
                        ? palette.accent
                        : palette.bg,
                      borderColor: isToday ? palette.accent : palette.border,
                      borderRadius: RADIUS.xs,
                    },
                  ]}>
                  <Text
                    style={[
                      typeStyle('footnote'),
                      tabularNumeralStyle,
                      {
                        color: entry?.completed ? palette.bg : palette.text,
                        fontWeight: isToday ? '700' : '500',
                      },
                    ]}
                    maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
                    {day}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Reminder toggle (#98) — schedules a notification the evening
          before each Mon/Thu and special fasting day. */}
      <View
        style={[
          styles.reminderCard,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}>
        <View style={styles.reminderTextCol}>
          <Text style={[styles.reminderTitle, { color: palette.text }]}>
            {t('fasting.reminderToggleTitle', 'Day-before reminder')}
          </Text>
          <Text style={[styles.reminderBody, { color: palette.muted }]}>
            {settings.fastingRemindersEnabled
              ? t(
                  'fasting.reminderToggleOn',
                  'You\'ll get a gentle notification at {{hour}}:00 the evening before each Sunnah fast.',
                  { hour: settings.fastingReminderHour },
                )
              : t(
                  'fasting.reminderToggleOff',
                  'Get notified the evening before each Mon/Thu and special fasting day.',
                )}
          </Text>
        </View>
        <Switch
          accessibilityLabel={t('fasting.reminderToggleA11y', 'Enable day-before fasting reminders')}
          value={settings.fastingRemindersEnabled}
          onValueChange={onToggleReminders}
          trackColor={{ true: palette.accentSolid, false: '#9ca3af' }}
          // Thumb stays light in BOTH states so it remains visible
          // against the accent-coloured track when on. Previously the
          // thumb was set to the same accent colour, which made the
          // whole switch look like a solid pill rather than a toggle
          // (reported on iOS in v2.0.17).
          thumbColor={'#ffffff'}
        />
      </View>

      {/* Upcoming high-reward fasting days, each with a "X days away"
          countdown. Surfaces White Days (every Hijri month), Ashura,
          Arafah, 6 of Shawwal, and Ramadan. */}
      <Text style={[typeStyle('caption'), styles.sectionTitle, { color: palette.muted }]}>
        {t('fasting.upcomingLabel', 'Upcoming fasting Sunnahs')}
      </Text>
      <View style={styles.upcomingList}>
        {upcomingEvents.slice(0, 6).map(({ event, daysAway, gregorianDate }) => (
          <View
            key={`${event.id}-${gregorianDate.toISOString().slice(0, 10)}`}
            style={[
              styles.upcomingRow,
              { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
            ]}>
            <View style={styles.upcomingTextCol}>
              <Text style={[styles.upcomingName, { color: palette.text }]}>
                {t(`events.${event.id}`, event.englishLabel)}
              </Text>
              <Text style={[styles.upcomingDate, { color: palette.muted }]}>
                {gregorianDate.toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
                {event.spanDays && event.spanDays > 1
                  ? ` · ${t('fasting.daysSpan', { count: event.spanDays, defaultValue: '{{count}} days' })}`
                  : ''}
              </Text>
            </View>
            <Text
              style={[styles.upcomingDays, tabularNumeralStyle, { color: palette.accent }]}
              maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
              {daysAway === 0
                ? t('common.today', 'Today')
                : t('fasting.daysAway', { count: daysAway, defaultValue: 'in {{count}}d' })}
            </Text>
          </View>
        ))}
      </View>

      {/* Month-view-style log: every fasting day the user has recorded,
          newest first. Mirrors the Journal's history list (#82). */}
      <Text style={[typeStyle('caption'), styles.sectionTitle, { color: palette.muted }]}>
        {t('fasting.monthViewLabel', 'All logged fasts')}
      </Text>
      {allLoggedDates.length === 0 ? (
        <Text style={[styles.emptyHint, { color: palette.muted }]}>
          {t('fasting.noLogsYet', 'Days you keep will appear here.')}
        </Text>
      ) : (
        <View style={styles.upcomingList}>
          {allLoggedDates.map(date => {
            const entry = entries.find(e => e.date === date);
            if (!entry) return null;
            return (
              <View
                key={date}
                style={[
                  styles.upcomingRow,
                  { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
                ]}>
                <View style={styles.upcomingTextCol}>
                  <Text style={[styles.upcomingName, { color: palette.text }]}>
                    {date}
                  </Text>
                  <Text style={[styles.upcomingDate, { color: palette.muted }]}>
                    {entry.type === 'ramadan'
                      ? t('fasting.typeRamadan', 'Ramadan')
                      : t('fasting.typeVoluntary', 'Voluntary / Sunnah')}
                  </Text>
                </View>
                <Text
                  style={[styles.upcomingDays, { color: entry.completed ? palette.accent : palette.muted }]}>
                  {entry.completed ? '✓' : '–'}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      <Text style={[typeStyle('footnote'), { color: palette.muted, textAlign: 'center' }]}>
        {t('fasting.privacyNote')}
      </Text>
    </ScrollView>
  );
}

function StatCell({
  label,
  value,
  palette,
}: {
  label: string;
  value: number;
  palette: ReturnType<typeof useAppPalette>['palette'];
}) {
  return (
    <View
      style={[
        styles.statCell,
        {
          backgroundColor: palette.card,
          borderRadius: RADIUS.md,
          ...cardEdgeStyle(palette),
        },
      ]}>
      <Text
        style={[typeStyle('title2'), tabularNumeralStyle, { color: palette.accent }]}
        maxFontSizeMultiplier={TABULAR_MAX_FONT_SCALE}>
        {value}
      </Text>
      <Text style={[typeStyle('caption'), { color: palette.muted, textAlign: 'center' }]}>
        {label}
      </Text>
    </View>
  );
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Synthesize a synthetic date-key for Ramadan day N of year Y. The grid uses
 *  it as a stable cell identifier; actual entry date keys come from real
 *  Gregorian dates the user logs. The format intentionally differs from
 *  YYYY-MM-DD so the two namespaces never collide. */
function ramadanDateKeyForDay(day: number, hijriYear: number): string {
  return `H${hijriYear}-09-${String(day).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  heroCard: {
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  eyebrow: {
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  primary: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  statCell: {
    flex: 1,
    padding: SPACING.md,
    alignItems: 'center',
    gap: 4,
  },
  gridCard: {
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  gridCell: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  encouragement: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    marginBottom: 4,
  },
  reminderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: SPACING.md,
    borderRadius: 12,
  },
  reminderTextCol: { flex: 1, gap: 4 },
  reminderTitle: { fontSize: 15, fontWeight: '600' },
  reminderBody: { fontSize: 12, lineHeight: 18 },
  ramadanCountdown: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    gap: 4,
  },
  sectionTitle: {
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: SPACING.sm,
  },
  upcomingList: {
    gap: SPACING.sm,
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: 12,
  },
  upcomingTextCol: { flex: 1, gap: 2 },
  upcomingName: { fontSize: 15, fontWeight: '600' },
  upcomingDate: { fontSize: 12 },
  upcomingDays: { fontSize: 14, fontWeight: '700' },
  emptyHint: { fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 8 },
});
