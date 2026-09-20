/**
 * HOW A KHATMAH IS PACED — the one sheet that asks it, and the one that
 * changes its mind.
 *
 * There are two plans in this app and they are the same plan said two
 * ways: "in thirty days", which is the reader's own pace and waits for
 * them, and "by the 30th", which is the calendar's and re-cuts what is
 * left every morning (`khatmahPace.ts` has why that reversal is right for
 * one and wrong for the other). Because they are one question, they are
 * one sheet with a segment at the top of it, and the answer carries
 * across when it is flipped: thirty days is a date thirty days out, and
 * that date is thirty days. The number under both — pages a day — does
 * not move when the reader changes which way they are saying it.
 *
 * That is also what makes switching mid-khatmah safe to offer. The sheet
 * only ever reports a length or a date; the store works out what that
 * means for a plan already under way (`setKhatmahDuration`), and nothing
 * the reader has read is touched by either.
 *
 * ── WHY THIS IS NOT A CALENDAR ────────────────────────────────────────
 *
 * A month grid asks the reader to pick a square and tells them nothing
 * about what it costs. The number that actually decides this is the pace:
 * the difference between the 30th and the 7th of next month is not a date
 * on a grid, it is forty pages a day against fourteen. So the date is
 * moved in steps — a day, a week — and the pace under it moves with it,
 * live. The reader chooses the reading they can do, and the date follows.
 *
 * It also keeps a dependency out of the app: there is no date picker in
 * Mihrab, and one would be a native module on three platforms, a Catalyst
 * build to check, and an F-Droid build to keep reproducible, for a screen
 * the reader sees twice a year.
 *
 * The presets are the dates anyone actually names — the end of this
 * month, and Ramadan, which the app can already find (`getNextRamadanStart`).
 */
import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { getNextRamadanStart } from '../hijri/upcomingEvents';
import { useAppPalette } from '../hooks/useAppPalette';
import { SegmentedControl } from '../components/ui';
import { TYPE } from '../theme/typography';
import { RADIUS, SPACING } from '../theme/tokens';

const DAY = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` for a local date, the shape every stored day key has. */
export function dayKeyOf(at: Date): string {
  const m = String(at.getMonth() + 1).padStart(2, '0');
  return `${at.getFullYear()}-${m}-${String(at.getDate()).padStart(2, '0')}`;
}

function startOfDay(at: number): Date {
  const d = new Date(at);
  d.setHours(12, 0, 0, 0);
  return d;
}

/** Whole days from today to `at`, today being zero. */
function daysFromToday(at: number, now: number): number {
  return Math.round(
    (startOfDay(at).getTime() - startOfDay(now).getTime()) / DAY,
  );
}

/**
 * "3 Oct" — a plan's date, in the reader's language, wherever it is put
 * in front of them. One formatter so the Quran card, the ⋯ menu and
 * Settings cannot drift into three ways of writing the same day.
 */
export function formatDeadline(deadline: string, language: string): string {
  try {
    return new Intl.DateTimeFormat(language, {
      day: 'numeric',
      month: 'short',
    }).format(new Date(`${deadline}T12:00:00`));
  } catch {
    return deadline;
  }
}

/** Which of the two the reader is choosing. `days` is the default mode. */
export type PacingKind = 'days' | 'date';

/**
 * What the sheet reports. A length, or a date — never both, and never a
 * plan: turning either into a change to a khatmah already under way is
 * the store's job, not this screen's.
 */
export type PacingChoice =
  | { kind: 'days'; days: number }
  | { kind: 'date'; deadline: string };

export type PacingSheetProps = {
  visible: boolean;
  /** The date the plan already has, if it has one. */
  current?: string | null;
  /**
   * Days of reading the plan asks for as things stand — what the sheet
   * opens on for a plan that has no date, so that a reader who came in to
   * change the length is looking at the length they have.
   */
  currentDays?: number;
  /** Pages of the muṣḥaf still unread — what the pace is divided from. */
  unreadPages: number;
  onChoose: (choice: PacingChoice) => void;
  onClose: () => void;
  /** A plan being created says "Start"; a live one says what it sets. */
  mode: 'start' | 'change';
  /**
   * Which way the sheet opens — the way the reader asked for it, since
   * the card offers both. Only the opening: the segment is live either
   * way. Defaults to the mode the plan is already in.
   */
  initialKind?: PacingKind;
};

export function KhatmahPacingSheet({
  visible,
  current,
  currentDays,
  unreadPages,
  onChoose,
  onClose,
  mode,
  initialKind,
}: PacingSheetProps) {
  const { palette } = useAppPalette();
  const { t, i18n } = useTranslation();
  const now = Date.now();
  /**
   * ONE NUMBER BEHIND BOTH VIEWS, and that is the whole trick.
   *
   * The date is today plus this many days less one, and a date set from a
   * preset is read straight back into it. So the segment does not convert
   * anything, there is no second state to keep in step, and a reader who
   * flips to look at the other way of saying it and flips back finds the
   * pace exactly where they left it.
   */
  const [days, setDays] = useState<number>(() => {
    if (current) {
      const parsed = Date.parse(`${current}T12:00:00`);
      if (Number.isFinite(parsed) && parsed > now - DAY) {
        return Math.max(1, daysFromToday(parsed, now) + 1);
      }
    }
    if (currentDays && currentDays > 0) return Math.min(3650, Math.round(currentDays));
    // A month is the length nobody argues with, and it is the one the
    // duration chips lead with.
    return 30;
  });
  const [kind, setKind] = useState<PacingKind>(
    initialKind ?? (current ? 'date' : 'days'),
  );

  const ramadan = useMemo(() => getNextRamadanStart(new Date(now)), [now]);
  const endOfMonth = useMemo(() => {
    const d = new Date(now);
    return new Date(d.getFullYear(), d.getMonth() + 1, 0, 12).getTime();
  }, [now]);

  const at = startOfDay(now).getTime() + (days - 1) * DAY;
  const perDay = Math.max(1, Math.ceil(Math.max(1, unreadPages) / days));
  const dateLabel = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(i18n.language, {
        weekday: 'short',
        day: 'numeric',
        month: 'long',
      }).format(new Date(at));
    } catch {
      return new Date(at).toDateString();
    }
  }, [at, i18n.language]);
  const daysLabel = t('quran.khatmahDays', {
    defaultValue: '{{count}} days',
    count: days,
  });
  const perDayLabel = t('quran.khatmahPerDay', {
    defaultValue: '{{count}} pages a day',
    count: perDay,
  });

  // Never before tomorrow, and never fewer than one day's reading: a
  // khatmah due today is not a plan, and the pace it would ask for is the
  // whole book.
  const move = (by: number) => setDays(prev => Math.max(1, Math.min(3650, prev + by)));
  const setDate = (when: number) =>
    setDays(Math.max(1, Math.min(3650, daysFromToday(when, now) + 1)));

  const step = (label: string, by: number) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => move(by)}
      style={[styles.step, { borderColor: palette.border }]}>
      {/* One line, shrinking rather than wrapping: "− 1 semaine" and
          "− 1 Woche" are twice the width of "− 1 week", and four of them
          share a row on a phone at whatever text size the reader has
          chosen. A wrapped stepper reflows the whole sheet. */}
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={[styles.stepLabel, { color: palette.accentSolid }]}>
        {label}
      </Text>
    </Pressable>
  );

  const preset = (label: string, onPress: () => void) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.preset, { borderColor: palette.border }]}>
      <Text style={[styles.presetLabel, { color: palette.accentSolid }]}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, { backgroundColor: palette.overlay }]}
        accessibilityLabel={t('common.close', 'Close')}
        onPress={onClose}
      />
      <View style={[styles.card, { backgroundColor: palette.card }]}>
        <Text style={[styles.title, { color: palette.text }]}>
          {t('quran.khatmahPacingTitle', 'How it is paced')}
        </Text>
        {/* The switch itself, and it is the same switch whether a plan is
            being made or re-paced — there is no mode in which one of the
            two is unavailable. */}
        <View style={styles.segment}>
          <SegmentedControl
            testID="khatmah-pacing-mode"
            accessibilityLabel={t('quran.khatmahPacingTitle', 'How it is paced')}
            value={kind}
            onChange={setKind}
            segments={[
              {
                key: 'days',
                label: t('quran.khatmahPacingDays', 'A number of days'),
              },
              {
                key: 'date',
                label: t('quran.khatmahPacingDate', 'By a date'),
              },
            ]}
          />
        </View>
        {/* The date can be "Wednesday, 30 September" in a language that
            does not abbreviate; two lines is fine, clipping is not. */}
        <Text style={[styles.date, { color: palette.text }]} numberOfLines={2}>
          {kind === 'date' ? dateLabel : daysLabel}
        </Text>
        {/* Each view says what the other one would say, so the equivalence
            is on screen rather than implied: a length shows the day it
            lands on, a date shows the days it comes to. Both show the
            reading it asks for, which is the number that decides. */}
        <Text style={[styles.meta, { color: palette.muted }]}>
          {[
            kind === 'date'
              ? t('quran.khatmahInDays', {
                  defaultValue: 'in {{count}} days',
                  count: days,
                })
              : dateLabel,
            perDayLabel,
          ].join(' · ')}
        </Text>

        <View style={styles.steps}>
          {step(t('quran.khatmahMinusWeek', '− 1 week'), -7)}
          {step(t('quran.khatmahMinusDay', '− 1 day'), -1)}
          {step(t('quran.khatmahPlusDay', '+ 1 day'), 1)}
          {step(t('quran.khatmahPlusWeek', '+ 1 week'), 7)}
        </View>

        <View style={styles.presets}>
          {kind === 'days'
            ? [30, 60, 90].map(n =>
                preset(
                  t('quran.khatmahDays', { defaultValue: '{{count}} days', count: n }),
                  () => setDays(n),
                ),
              )
            : [
                preset(t('quran.khatmahEndOfMonth', 'End of this month'), () =>
                  setDate(endOfMonth),
                ),
                /* Only when it is a date anybody would aim at: a Ramadan
                   eleven months out is not a khatmah plan, it is a
                   reminder. */
                ramadan &&
                daysFromToday(ramadan.getTime(), now) > 5 &&
                daysFromToday(ramadan.getTime(), now) < 200
                  ? preset(t('quran.khatmahBeforeRamadan', 'Before Ramadan'), () =>
                      setDate(ramadan.getTime() - DAY),
                    )
                  : null,
              ]}
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel', 'Cancel')}
            onPress={onClose}
            style={styles.action}>
            <Text style={{ color: palette.muted, fontWeight: '600' }}>
              {t('common.cancel', 'Cancel')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              mode === 'start'
                ? t('quran.khatmahStartCta', 'Start')
                : kind === 'date'
                  ? t('quran.khatmahSetDate', 'Set the date')
                  : t('quran.khatmahSetLength', 'Set the length')
            }
            onPress={() =>
              onChoose(
                kind === 'date'
                  ? { kind: 'date', deadline: dayKeyOf(new Date(at)) }
                  : { kind: 'days', days },
              )
            }
            style={styles.action}>
            <Text style={{ color: palette.accentSolid, fontWeight: '700' }}>
              {mode === 'start'
                ? t('quran.khatmahStartCta', 'Start')
                : kind === 'date'
                  ? t('quran.khatmahSetDate', 'Set the date')
                  : t('quran.khatmahSetLength', 'Set the length')}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject },
  card: {
    position: 'absolute',
    left: SPACING.lg,
    right: SPACING.lg,
    bottom: SPACING.xl,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
  },
  title: { fontSize: TYPE.callout.fontSize, fontWeight: '700' },
  segment: { marginTop: SPACING.sm },
  date: {
    fontSize: TYPE.title3.fontSize,
    fontWeight: '700',
    marginTop: SPACING.sm,
  },
  meta: { fontSize: TYPE.footnote.fontSize, marginTop: 2 },
  steps: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  step: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
  },
  stepLabel: { fontSize: TYPE.footnote.fontSize, fontWeight: '600' },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  preset: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  presetLabel: { fontSize: TYPE.footnote.fontSize, fontWeight: '600' },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    // Two actions, and "Set the length" is longer in German and longer
    // still in Urdu. Wrapping is the honest answer: they stack rather
    // than being clipped.
    flexWrap: 'wrap',
    gap: SPACING.md,
    marginTop: SPACING.lg,
  },
  action: { paddingVertical: SPACING.sm, paddingHorizontal: SPACING.sm },
});
