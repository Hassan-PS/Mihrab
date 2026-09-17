/**
 * Deleting a khatmah used to undo itself.
 *
 * `mergeKhatmah` unites two devices' plans by id, and a plan that is
 * absent locally and present on the other side is indistinguishable from
 * one the other side has just created — so the next sync round put a
 * deleted plan straight back. The delete was a local act that did not
 * survive contact with the folder, which is word for word the bug
 * `removedPeers.ts` describes for devices and `coerceSunnahLog` for a
 * cleared day. The answer is theirs too: the removal is a fact with a
 * date on it, and it travels.
 */
import { mergeKhatmah } from '../src/sync/merge';
import type { KhatmahPlan } from '../src/quran/quranState';

const plan = (over: Partial<KhatmahPlan> = {}): KhatmahPlan => ({
  id: 'k1',
  startedAt: 1_700_000_000_000,
  targetDays: 30,
  pagesRead: 120,
  completedAt: null,
  ...over,
});

const DAY = 24 * 60 * 60 * 1000;
const abandoned = plan({ abandonedAt: 1_700_000_000_000 + 5 * DAY });

describe('an abandoned khatmah stays abandoned', () => {
  it('does not come back from the device that still has it', () => {
    // The phone deleted it; the Mac has not heard yet and still sends the
    // live plan. This is the exact round that used to resurrect it.
    const merged = mergeKhatmah([abandoned], [plan()]);
    expect(merged).toHaveLength(1);
    expect(merged[0].abandonedAt).toBe(abandoned.abandonedAt);
  });

  it('and reaches the device that has not heard yet', () => {
    const merged = mergeKhatmah([plan()], [abandoned]);
    expect(merged[0].abandonedAt).toBe(abandoned.abandonedAt);
  });

  it('whichever way round, and whoever is asked first', () => {
    const a = mergeKhatmah([abandoned], [plan()]);
    const b = mergeKhatmah([plan()], [abandoned]);
    expect(a).toEqual(b);
  });

  it('keeps the earliest date when both sides carry one', () => {
    const later = plan({ abandonedAt: abandoned.abandonedAt! + 3 * DAY });
    expect(mergeKhatmah([abandoned], [later])[0].abandonedAt).toBe(
      abandoned.abandonedAt,
    );
    expect(mergeKhatmah([later], [abandoned])[0].abandonedAt).toBe(
      abandoned.abandonedAt,
    );
  });

  it('adds no field to a pair that never had one', () => {
    // The idempotence the whole sync cycle rests on: merging a snapshot
    // with itself returns that snapshot, key for key.
    const merged = mergeKhatmah([plan()], [plan()]);
    expect(merged[0]).toEqual(plan());
    expect('abandonedAt' in merged[0]).toBe(false);
  });

  it('progress made elsewhere does not revive it', () => {
    // The Mac read on before it heard: the reading merges, the plan is
    // still gone. Losing the delete would be worse than losing the pages.
    const readOn = plan({ pagesRead: 300 });
    const merged = mergeKhatmah([abandoned], [readOn]);
    expect(merged[0].abandonedAt).toBe(abandoned.abandonedAt);
    expect(merged[0].pagesRead).toBe(300);
  });
});
