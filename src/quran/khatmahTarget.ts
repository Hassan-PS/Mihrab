/**
 * Where a khatmah continues — one answer, for everything that offers to
 * take the reader there.
 *
 * The widget's Continue card and the khatmah reminder are the same
 * promise made on two surfaces: "your portion is here, tap to carry on".
 * They resolved it separately — the widget from `khatmahCurrentPage` and
 * the muṣḥaf page table, the notification from nothing at all, since
 * tapping it did not go anywhere (#27) — and two resolutions of one
 * promise is how a widget and a notification come to disagree about which
 * ayah the reader is on.
 *
 * THE PLAN'S PAGE, NOT THE LAST PAGE LOOKED AT. A reader who browsed
 * somewhere else after finishing today's portion has a last-read position
 * that has nothing to do with the khatmah; the offer is about the plan, so
 * it is the plan's own page that answers.
 */
import { firstAyahOfPage } from './pages';
import { khatmahCurrentPage, type KhatmahPlan } from './quranState';
import { DEFAULT_RIWAYAH, type RiwayahId } from './riwayat';

export type KhatmahTarget = {
  /** The muṣḥaf page the plan continues from. */
  page: number;
  /** The surah that page opens in, and the first ayah of it on that page. */
  surah: number;
  ayah: number;
};

/**
 * `riwayah` is the reader's own muṣḥaf: the plan's place is an ayah count,
 * and which PAGE that is depends on the print. Absent means Ḥafṣ, which is
 * what the widget and the reminder were already answering.
 */
export function khatmahContinueTarget(
  plan: KhatmahPlan,
  riwayah: RiwayahId = DEFAULT_RIWAYAH,
): KhatmahTarget {
  const page = khatmahCurrentPage(plan, riwayah);
  const start = firstAyahOfPage(page, riwayah);
  return { page, surah: start.surah, ayah: start.ayah };
}
