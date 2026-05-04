// hover-ok: list-row / settings-row / sheet pressables. Hover-state
// treatment would visually noise these dense surfaces; the touch
// feedback (pressed opacity / ripple) is the right affordance here.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppPalette } from '../hooks/useAppPalette';
import { useBreakpoint } from '../responsive/breakpoints';
import { useAndroidSubScreenBack } from '../navigation/useAndroidSubScreenBack';
import {
  coerceJournalEntries,
  computeCurrentStreak,
  computeStats,
  entriesForDate,
  getEntryStatus,
  loggedDates,
  setEntryNote,
  upsertEntry,
  type JournalEntry,
  type JournalPrayer,
  type JournalStatus,
} from '../journal/journal';
import {
  durableEncryptedGet,
  durableEncryptedSet,
} from '../storage/durableWrite';
import { cardEdgeStyle, inputChromeStyle } from '../theme/chrome';
import { tabularNumeralStyle } from '../theme/textScale';

const JOURNAL_KEY = 'prayerapp.journal.v1';
const PRAYERS: JournalPrayer[] = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const STATUSES: JournalStatus[] = ['on-time', 'late', 'missed', 'qadha'];

/**
 * Prayer journal — task #25, hardened in #82.
 *
 * Tap each prayer to mark on-time / late / missed / qadha, plus an
 * optional encrypted personal note. Today's row + a stats summary
 * (streak + on-time %). A month-view section below shows every logged
 * day since the user's first entry.
 *
 * Entries persist to encrypted storage with retry-on-failure (see
 * `durableWrite.ts`) — "did/didn't pray" is sensitive personal
 * information that must never sit in plaintext on disk OR get silently
 * dropped on a transient I/O hiccup. If a write ultimately fails after
 * retries, the user sees an explicit alert so they can act.
 */
export function JournalScreen() {
  // Subscribe to width changes so future master-detail layouts pick up
  // the new breakpoint without a forced remount. iPad/Mac (#33) baseline.
  useBreakpoint();
  const { t } = useTranslation();
  const { palette } = useAppPalette();
  useAndroidSubScreenBack();

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);
  // Per-prayer note draft text — keyed by prayer name for today's row.
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    void durableEncryptedGet(JOURNAL_KEY)
      .then(raw => {
        if (raw) setEntries(coerceJournalEntries(JSON.parse(raw)));
      })
      .catch(e => {
        // Read failure → tell the user, don't silently start with empty.
        // Better to let them know than to clobber persisted data on next
        // write.
        console.warn('JournalScreen load failed:', e);
        Alert.alert(
          t('journal.loadFailedTitle', 'Could not load journal'),
          t(
            'journal.loadFailedBody',
            'Your data is safe on disk but could not be read right now. Please try opening the journal again.',
          ),
        );
      })
      .finally(() => setHydrated(true));
  }, [t]);

  const persist = useCallback(
    async (next: JournalEntry[]) => {
      // Optimistically reflect the change in-memory so the UI stays
      // responsive; if persistence fails, we revert and surface an error.
      const prev = entries;
      setEntries(next);
      try {
        await durableEncryptedSet(JOURNAL_KEY, JSON.stringify(next));
      } catch (e) {
        console.warn('JournalScreen persist failed after retries', e);
        setEntries(prev);
        Alert.alert(
          t('journal.saveFailedTitle', 'Could not save'),
          t(
            'journal.saveFailedBody',
            'We tried a few times but could not save this entry. Your earlier journal data is intact.',
          ),
        );
      }
    },
    [entries, t],
  );

  const today = formatDate(new Date());

  const onMark = useCallback(
    (prayer: JournalPrayer, status: JournalStatus) => {
      void persist(upsertEntry(entries, today, prayer, status));
    },
    [entries, today, persist],
  );

  const onSaveNote = useCallback(
    (prayer: JournalPrayer) => {
      const text = draftNotes[prayer] ?? '';
      void persist(setEntryNote(entries, today, prayer, text));
    },
    [draftNotes, entries, today, persist],
  );

  // Hydrate the draft inputs from saved notes on first load.
  useEffect(() => {
    if (!hydrated) return;
    const next: Record<string, string> = {};
    for (const p of PRAYERS) {
      const e = entries.find(x => x.date === today && x.prayer === p);
      if (e?.note) next[p] = e.note;
    }
    setDraftNotes(prev => ({ ...next, ...prev }));
    // We only want to hydrate from storage on first ready; subsequent
    // user edits to drafts must not be overwritten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const stats = computeStats(entries);
  const streak = computeCurrentStreak(entries);

  // Month view: dedupe dates ascending; render newest-first card list.
  const monthViewDates = useMemo(() => {
    const all = loggedDates(entries);
    return all.slice().reverse();
  }, [entries]);

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={styles.scroll}
      contentInsetAdjustmentBehavior="automatic">
      {/* Encouragement copy above the stats — task #95. Adapts to the
          user's progress: a fresh user sees an inviting first-step
          nudge, an active user sees Mashallah-style affirmation. */}
      <Text style={[styles.encouragement, { color: palette.text }]}>
        {streak >= 7
          ? t('journal.encourageStreak', 'Mashallah, {{count}}-day on-time streak. Keep going.', { count: streak })
          : stats.total >= 1
          ? t('journal.encourageActive', 'Every prayer logged is a step forward.')
          : t('journal.encourageEmpty', 'Mark today\'s first prayer to begin your journal.')}
      </Text>
      <View
        style={[
          styles.statsCard,
          { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
        ]}>
        <View style={styles.statCol}>
          <Text style={[styles.statValue, tabularNumeralStyle, { color: palette.text }]}>
            {streak}
          </Text>
          <Text style={[styles.statLabel, { color: palette.muted }]}>
            {t('journal.streakDays')}
          </Text>
        </View>
        <View style={styles.statCol}>
          <Text style={[styles.statValue, tabularNumeralStyle, { color: palette.text }]}>
            {Number.isFinite(stats.onTimeRatio)
              ? `${Math.round(stats.onTimeRatio * 100)}%`
              : '—'}
          </Text>
          <Text style={[styles.statLabel, { color: palette.muted }]}>
            {t('journal.onTimeRate')}
          </Text>
        </View>
        <View style={styles.statCol}>
          <Text style={[styles.statValue, tabularNumeralStyle, { color: palette.text }]}>
            {stats.total}
          </Text>
          <Text style={[styles.statLabel, { color: palette.muted }]}>
            {t('journal.totalLogged')}
          </Text>
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: palette.muted }]}>
        {t('journal.todayLabel')}
      </Text>
      {PRAYERS.map(prayer => {
        const current = getEntryStatus(entries, today, prayer);
        const draft = draftNotes[prayer] ?? '';
        const savedNote = entries.find(
          e => e.date === today && e.prayer === prayer,
        )?.note;
        const draftDirty = (savedNote ?? '') !== draft;
        return (
          <View
            key={prayer}
            style={[
              styles.prayerCard,
              { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
            ]}>
            <View style={styles.prayerHeaderRow}>
              <Text style={[styles.prayerName, { color: palette.text }]}>
                {t(`prayer.${prayer}`)}
              </Text>
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
                        styles.statusBtn,
                        {
                          backgroundColor: isSel ? palette.accent : palette.bg,
                          borderColor: isSel ? palette.accent : palette.border,
                        },
                      ]}>
                      <Text
                        style={[
                          styles.statusLabel,
                          { color: isSel ? '#fff' : palette.text },
                        ]}>
                        {t(`journal.statusShort.${s}`)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Personal note — encrypted, optional. Saving on blur or
                explicit "Save" tap. The blue "Save" affordance only
                appears when the draft has unsaved changes. */}
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
                placeholderTextColor={palette.muted}
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
                  style={[styles.saveNoteBtn, { backgroundColor: palette.accent }]}>
                  <Text style={styles.saveNoteLabel}>
                    {t('journal.saveNote', 'Save')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })}

      <Text style={[styles.sectionTitle, { color: palette.muted, marginTop: 16 }]}>
        {t('journal.monthViewLabel', 'All logged days')}
      </Text>
      {monthViewDates.length === 0 ? (
        <Text style={[styles.emptyHint, { color: palette.muted }]}>
          {t('journal.noLogsYet', 'Logs you record will appear here.')}
        </Text>
      ) : (
        monthViewDates.map(date => {
          const dayEntries = entriesForDate(entries, date);
          const counts: Record<JournalStatus, number> = {
            'on-time': 0,
            late: 0,
            missed: 0,
            qadha: 0,
          };
          for (const e of dayEntries) counts[e.status] += 1;
          return (
            <View
              key={date}
              style={[
                styles.dayCard,
                { backgroundColor: palette.card, ...cardEdgeStyle(palette) },
              ]}>
              <Text style={[styles.dayDate, { color: palette.text }]}>
                {date}
              </Text>
              <View style={styles.dayChips}>
                {STATUSES.map(s =>
                  counts[s] > 0 ? (
                    <View
                      key={s}
                      style={[
                        styles.dayChip,
                        { borderColor: palette.border },
                      ]}>
                      <Text style={[styles.dayChipLabel, { color: palette.muted }]}>
                        {t(`journal.statusShort.${s}`)} · {counts[s]}
                      </Text>
                    </View>
                  ) : null,
                )}
              </View>
            </View>
          );
        })
      )}

      {!hydrated && (
        <Text style={[styles.hint, { color: palette.muted }]}>
          {t('common.loading')}
        </Text>
      )}
    </ScrollView>
  );
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

const styles = StyleSheet.create({
  scroll: { padding: 16, gap: 8 },
  encouragement: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    marginBottom: 4,
  },
  statsCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 14,
    marginBottom: 8,
  },
  statCol: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 28, fontWeight: '700' },
  statLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 4,
  },
  prayerCard: {
    padding: 12,
    borderRadius: 12,
    gap: 10,
  },
  prayerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  prayerName: { flex: 1, fontSize: 16, fontWeight: '600' },
  statusRow: { flexDirection: 'row', gap: 6 },
  statusBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusLabel: { fontSize: 12, fontWeight: '700' },
  noteRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  noteInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 14,
  },
  saveNoteBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveNoteLabel: { color: '#fff', fontSize: 13, fontWeight: '700' },
  dayCard: {
    padding: 12,
    borderRadius: 12,
    gap: 8,
  },
  dayDate: {
    fontSize: 14,
    fontWeight: '600',
  },
  dayChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dayChip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dayChipLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  emptyHint: { textAlign: 'center', fontSize: 13, marginTop: 8, marginBottom: 8 },
  hint: { textAlign: 'center', fontSize: 13, marginTop: 12 },
});
