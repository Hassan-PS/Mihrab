/**
 * Whether the page in hand is one the khatmah has read.
 *
 * A hollow amber ring for a page still to read, a filled green check once
 * it is done — beside the surah name, where the session dot sits, in and
 * out of fullscreen. Only while a plan is live: with no khatmah there is
 * no such thing as a page being done, and the mark would be answering a
 * question nobody asked.
 *
 * It exists because crediting is otherwise silent. The plan counts pages
 * as you read them and says so nowhere, so a reader a portion ahead of
 * themselves cannot tell that nothing is counting, and one reading inside
 * today's portion cannot tell that it is. This is that fact, on screen,
 * for the page under the thumb.
 *
 * Not a pulse. The session dot breathes because it is recording as you
 * watch; this is a state, and a state that blinks is an alarm.
 */
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  activeKhatmah,
  isKhatmahPageDone,
  khatmahCoversPage,
  khatmahPageInWindow,
  toggleKhatmahPageDone,
  useQuranState,
  type QuranState,
} from './quranState';
import { DEFAULT_RIWAYAH, type RiwayahId } from './riwayat';
import { useKhatmahSession } from './SessionDot';

/**
 * Tokens-ok: these two are a status pair, read at a glance, not theme ink.
 *
 * Exported because the khatmah card's unread-pages row is the same
 * statement about the same pages, and two ambers that nearly match would
 * read as two different kinds of warning.
 */
export const PAGE_DONE = '#15803d';
export const PAGE_TO_READ = '#b45309';
const DONE = PAGE_DONE;
const TO_READ = PAGE_TO_READ;

export type PageProgress = 'done' | 'toRead' | null;

export function pageProgressOf(
  s: QuranState,
  page: number,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): PageProgress {
  const plan = activeKhatmah(s);
  if (!plan) return null;
  // A page the plan does not reach has no such thing as a done state —
  // a khatmah begun mid-muṣḥaf owns only what follows its start.
  if (!khatmahCoversPage(plan, page, riwayah)) return null;
  // Nor one it has not reached YET. The mark is a control, and out past
  // today's portion there is nothing it could honestly do: a plan in
  // Aal-Imran cannot be told that a page of al-Kahf is read without
  // inventing the fifty portions in between. Read ahead and the mark is
  // simply absent, which is the truth — that reading is not the khatmah's.
  if (!khatmahPageInWindow(plan, page, riwayah)) return null;
  return isKhatmahPageDone(plan, page, riwayah) ? 'done' : 'toRead';
}

/**
 * The mark, for the visit that is open — and ONLY for a khatmah visit.
 *
 * A plan is a months-long thing, so most pages of the muṣḥaf are behind
 * one at any moment: reading Al-Fatiha from the index put a green check
 * in the header of a reading that had nothing to do with the khatmah,
 * which is a loud answer to a question that reading never asked. The
 * marks belong to the door you came in through — see `readingSession`.
 *
 * Crediting is untouched by this. Read today's portion having arrived
 * from anywhere and the plan still counts it (`khatmahTracksPage`); what
 * the door decides is whether the chrome talks about the plan.
 */
export function usePageProgress(
  page: number,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): PageProgress {
  const isKhatmahVisit = useKhatmahSession();
  const progress = pageProgressOf(useQuranState(), page, riwayah);
  return isKhatmahVisit ? progress : null;
}

/**
 * TAPPABLE, because the count can be wrong in both directions and the
 * reader is the only one who knows. Pages can be credited that were only
 * turned past, and pages read elsewhere — a paper muṣḥaf, someone else's
 * phone — cannot be seen by the app at all. One tap says so.
 *
 * It is a small target, so it carries a generous hit slop; and it is a
 * real control rather than decoration now, so it is named for a screen
 * reader and announces which way the tap goes.
 */
export function PageProgressMark({
  state,
  page,
  riwayah = DEFAULT_RIWAYAH,
  size = 9,
}: {
  state: Exclude<PageProgress, null>;
  /** The page this mark is about — what a tap toggles. */
  page: number;
  riwayah?: RiwayahId;
  size?: number;
}) {
  const { t } = useTranslation();
  const done = state === 'done';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ checked: done }}
      accessibilityLabel={
        done
          ? t('quran.markPageUnread', 'Mark this page as not read')
          : t('quran.markPageRead', 'Mark this page as read')
      }
      hitSlop={12}
      onPress={() => toggleKhatmahPageDone(page, riwayah)}
      style={[styles.slot, { width: size + 3, height: size + 3 }]}>
      {done ? (
        <Text style={[styles.check, { color: DONE, fontSize: size + 2 }]}>✓</Text>
      ) : (
        <View
          style={[
            styles.ring,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderColor: TO_READ,
            },
          ]}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  slot: { alignItems: 'center', justifyContent: 'center' },
  ring: { borderWidth: 1.5 },
  check: { fontWeight: '700', includeFontPadding: false },
});
