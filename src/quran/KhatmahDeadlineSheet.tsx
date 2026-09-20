/**
 * "FINISH BY A DATE" — the sheet that sets, moves or removes a deadline.
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

export type DeadlineSheetProps = {
  visible: boolean;
  /** The date the plan already has, if it has one. */
  current?: string | null;
  /** Pages of the muṣḥaf still unread — what the pace is divided from. */
  unreadPages: number;
  /** Set the date. Null removes it, which is offered only when there is one. */
  onChoose: (deadline: string | null) => void;
  onClose: () => void;
  /** A plan being created says "Start"; a live one says "Set the date". */
  mode: 'start' | 'change';
};

export function KhatmahDeadlineSheet({
  visible,
  current,
  unreadPages,
  onChoose,
  onClose,
  mode,
}: DeadlineSheetProps) {
  const { palette } = useAppPalette();
  const { t, i18n } = useTranslation();
  const now = Date.now();
  // A month is the length nobody argues with, and it is the one the
  // duration chips lead with.
  const [at, setAt] = useState<number>(() => {
    if (current) {
      const parsed = Date.parse(`${current}T12:00:00`);
      if (Number.isFinite(parsed) && parsed > now - DAY) return parsed;
    }
    return now + 29 * DAY;
  });

  const ramadan = useMemo(() => getNextRamadanStart(new Date(now)), [now]);
  const endOfMonth = useMemo(() => {
    const d = new Date(now);
    return new Date(d.getFullYear(), d.getMonth() + 1, 0, 12).getTime();
  }, [now]);

  const days = Math.max(1, daysFromToday(at, now) + 1);
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

  // Never before tomorrow: a khatmah due today is not a plan, and the
  // pace it would ask for is the whole book.
  const move = (by: number) =>
    setAt(prev => Math.max(now + DAY, prev + by * DAY));

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

  const preset = (label: string, when: number) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => setAt(Math.max(now + DAY, startOfDay(when).getTime()))}
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
          {t('quran.khatmahByDateTitle', 'Finish by a date')}
        </Text>
        {/* The date can be "Wednesday, 30 September" in a language that
            does not abbreviate; two lines is fine, clipping is not. */}
        <Text style={[styles.date, { color: palette.text }]} numberOfLines={2}>
          {dateLabel}
        </Text>
        <Text style={[styles.meta, { color: palette.muted }]}>
          {[
            t('quran.khatmahInDays', { defaultValue: 'in {{count}} days', count: days }),
            t('quran.khatmahPerDay', {
              defaultValue: '{{count}} pages a day',
              count: perDay,
            }),
          ].join(' · ')}
        </Text>

        <View style={styles.steps}>
          {step(t('quran.khatmahMinusWeek', '− 1 week'), -7)}
          {step(t('quran.khatmahMinusDay', '− 1 day'), -1)}
          {step(t('quran.khatmahPlusDay', '+ 1 day'), 1)}
          {step(t('quran.khatmahPlusWeek', '+ 1 week'), 7)}
        </View>

        <View style={styles.presets}>
          {preset(t('quran.khatmahEndOfMonth', 'End of this month'), endOfMonth)}
          {/* Only when it is a date anybody would aim at: a Ramadan
              eleven months out is not a khatmah plan, it is a reminder. */}
          {ramadan && daysFromToday(ramadan.getTime(), now) > 5 &&
          daysFromToday(ramadan.getTime(), now) < 200
            ? preset(
                t('quran.khatmahBeforeRamadan', 'Before Ramadan'),
                ramadan.getTime() - DAY,
              )
            : null}
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
          {/* Taking the date off is offered only where it means something,
              and it is not destructive: the plan carries on as the
              duration it was made with. */}
          {current ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('quran.khatmahRemoveDate', 'Remove the date')}
              onPress={() => onChoose(null)}
              style={styles.action}>
              <Text style={{ color: palette.muted, fontWeight: '600' }}>
                {t('quran.khatmahRemoveDate', 'Remove the date')}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              mode === 'start'
                ? t('quran.khatmahStartCta', 'Start')
                : t('quran.khatmahSetDate', 'Set the date')
            }
            onPress={() => onChoose(dayKeyOf(new Date(at)))}
            style={styles.action}>
            <Text style={{ color: palette.accentSolid, fontWeight: '700' }}>
              {mode === 'start'
                ? t('quran.khatmahStartCta', 'Start')
                : t('quran.khatmahSetDate', 'Set the date')}
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
    // Three actions on a narrow phone, and "Remove the date" is
    // "Datum entfernen" in German and longer still in Urdu. Wrapping is
    // the honest answer: they stack rather than being clipped.
    flexWrap: 'wrap',
    gap: SPACING.md,
    marginTop: SPACING.lg,
  },
  action: { paddingVertical: SPACING.sm, paddingHorizontal: SPACING.sm },
});
