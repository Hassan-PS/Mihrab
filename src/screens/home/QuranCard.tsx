/**
 * Home's Quran card (design review 2b) — the doors back into the book.
 *
 * It never disappears: the khatmah's next page, the reading marker, both
 * when the reader keeps both (#41), or the way in when nothing has been
 * started. Which doors are drawn is `selectQuranCardState`'s decision and
 * the rows themselves are `ResumeDoors`, shared with the Qur'an tab, so
 * this file is the shell and nothing else.
 *
 * It no longer reads a verse. The ayah of the day was drawn here when
 * nothing had been started, and a card that is sometimes a shortcut and
 * sometimes a passage of scripture was two things on one spot; Today is
 * the times, and this is the door. The verse keeps its notification.
 *
 * Low, and one row per door: an icon, a line, a line under it, a bar when
 * there is a plan. It sits under a table that fills the screen, and every
 * point of height here is a point the hero gives up — which is why a
 * second door is a second row in the same card and not a second card.
 */
import { memo, useCallback, useEffect } from 'react';
import { InteractionManager, StyleSheet } from 'react-native';
import { GlassSurface } from '../../components/GlassSurface';
import { useAppPalette } from '../../hooks/useAppPalette';
import { cardEdgeStyle } from '../../theme/chrome';
import { useQuranState, type LastRead } from '../../quran/quranState';
import { warmMushafLayout } from '../../quran/mushafLayout';
import { selectQuranCardState } from '../../quran/quranCardState';
import { ResumeDoors } from '../../quran/ResumeDoors';
import type { KhatmahTarget } from '../../quran/khatmahTarget';
import { HOME_TABLE_RADIUS } from './tokens';

type Props = {
  /** Open the reader at a place — surah, and the page or the ayah. */
  onOpenAt: (surah: number, page?: number, ayah?: number) => void;
  /** Opens the Quran home (surah list, khatmah controls). */
  onOpenQuran: () => void;
};

function QuranCardImpl({ onOpenAt, onOpenQuran }: Props) {
  const { palette } = useAppPalette();
  const quran = useQuranState();
  const card = selectQuranCardState(quran);
  // A card that says "Continue" into the muṣḥaf is a reader about to open
  // it. Bring the page-layout data in now, after the home screen has
  // settled, rather than in the middle of the push transition when the
  // first page asks for it — see `warmMushafLayout`.
  const readsMushaf = quran.lastRead?.mode === 'mushaf' || card.khatmah != null;
  const riwayah = quran.prefs.riwayah;
  useEffect(() => {
    if (!readsMushaf) return;
    const task = InteractionManager.runAfterInteractions(() =>
      warmMushafLayout(riwayah),
    );
    return () => task.cancel();
  }, [readsMushaf, riwayah]);

  // The khatmah is a muṣḥaf page: the reader lands on it whichever reader
  // they are in, and the translation reader takes the page's first ayah.
  const openKhatmah = useCallback(
    (target: KhatmahTarget) => onOpenAt(target.surah, target.page, target.ayah),
    [onOpenAt],
  );
  // The marker is an ayah with the page it sits on; the route carries
  // both and each reader takes the one it is addressed by.
  const openReading = useCallback(
    (marker: LastRead) => onOpenAt(marker.surah, marker.page, marker.ayah),
    [onOpenAt],
  );

  return (
    <GlassSurface
      style={[
        styles.card,
        { borderRadius: HOME_TABLE_RADIUS, ...cardEdgeStyle(palette) },
      ]}>
      <ResumeDoors
        state={card}
        onOpenKhatmah={openKhatmah}
        onOpenReading={openReading}
        onOpenQuran={onOpenQuran}
        showStart
        layout="columns"
      />
    </GlassSurface>
  );
}

export const QuranCard = memo(QuranCardImpl);

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
});
