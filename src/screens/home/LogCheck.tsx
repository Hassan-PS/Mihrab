import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import type { LoggedStatus } from '../../journal/journal';
import type { QuickLogPhase } from '../../journal/quickLog';
import type { AppPalette } from '../../theme/appPalette';
import { RADIUS, SPACING } from '../../theme/tokens';

/** The ring's outer size; the row's name sits on its centre line. */
export const LOG_CHECK_SIZE = 24;

/**
 * The check beside a prayer on Today (see `quickLog.ts` for what a tap
 * records).
 *
 * ── HOW IT READS ──────────────────────────────────────────────────────
 *
 * A checklist, in the redesign's own vocabulary (redesign-plan §2.7: a
 * chosen thing is the one painted in ink; the rest have nothing):
 *
 *   ○   not yet recorded, and its time has come — a quiet ring.
 *   ●✓  on time — the accent, filled, with the tick in the accent's ink.
 *   ◐✓  late or made up — the accent's tint with the tick in accent: it
 *       was prayed, and it was not on time; both facts are visible.
 *   ○–  missed — the ring with a dash; recorded, and recorded as missed.
 *   ◌   not yet — the ring at a whisper. There is nothing to record
 *       before the prayer's time, but the tap is taken and ANSWERED
 *       (TodayCard says so under the day): a control that does nothing
 *       and says nothing reads as broken, which is how it was reported.
 *       The one state that truly cannot be pressed is a journal that has
 *       not been read yet — there is nothing to answer with, and it
 *       lasts a moment rather than half a day.
 *
 * Drawn with SVG for the tick so it is the same stroke as the rest of the
 * app's marks and not whichever ✓ glyph the system font ships.
 */
function LogCheckImpl({
  status,
  phase,
  ready = true,
  palette,
  prayerLabel,
  onPress,
}: {
  status: LoggedStatus | null;
  phase: QuickLogPhase;
  /** The journal has been read: false while it is being, or after it failed. */
  ready?: boolean;
  palette: AppPalette;
  prayerLabel: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const notYet = phase === 'not-yet' || !ready;
  const logged = status != null;
  const onTime = status === 'on-time';
  const missed = status === 'missed';

  const fill = onTime ? palette.accentSolid : logged && !missed ? palette.accentBg : 'transparent';
  const ring = onTime
    ? palette.accentSolid
    : logged && !missed
      ? palette.accentSolid
      : palette.muted;
  const mark = onTime ? palette.onAccent : palette.accentSolid;

  const label = logged
    ? t('journal.quickLogLogged', {
        prayer: prayerLabel,
        status: t(`journal.statusShort.${status}`),
      })
    : notYet
      ? t('journal.quickLogNotYet', { prayer: prayerLabel })
      : t('journal.quickLogMark', { prayer: prayerLabel });

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: logged, disabled: notYet }}
      accessibilityLabel={label}
      disabled={!ready}
      onPress={onPress}
      hitSlop={10}
      style={styles.hit}>
      <View
        style={[
          styles.ring,
          { borderColor: ring, backgroundColor: fill },
          notYet && styles.notYet,
          !logged && !notYet && styles.open,
        ]}>
        {logged && !missed ? (
          <Svg width={14} height={14} viewBox="0 0 14 14">
            <Path
              d="M2.5 7.5 5.6 10.5 11.5 3.8"
              stroke={String(mark)}
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        ) : missed ? (
          <View style={[styles.dash, { backgroundColor: palette.muted }]} />
        ) : null}
      </View>
    </Pressable>
  );
}

export const LogCheck = memo(LogCheckImpl);

const styles = StyleSheet.create({
  hit: {
    width: LOG_CHECK_SIZE,
    height: LOG_CHECK_SIZE,
    marginEnd: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    width: LOG_CHECK_SIZE,
    height: LOG_CHECK_SIZE,
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  open: { opacity: 0.55 },
  notYet: { opacity: 0.22 },
  dash: { width: 10, height: 2, borderRadius: 1 },
});
