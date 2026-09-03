/**
 * A burst of updates is one write.
 *
 * A page turn is two updates — the last-read position, then the khatmah's
 * progress — and each used to serialise the whole store and hand it to
 * AsyncStorage on its own, the second carrying everything the first had.
 * The store is still updated synchronously for anyone reading it; only the
 * write is deferred to the end of the tick.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  __resetQuranStateForTests,
  getQuranState,
  setLastRead,
  toggleStar,
} from '../src/quran/quranState';

/** Past the microtask the write is queued on, and the write itself. */
const flush = () => new Promise<void>(r => setTimeout(r, 0));

beforeEach(async () => {
  await AsyncStorage.clear();
  __resetQuranStateForTests();
  (AsyncStorage.setItem as jest.Mock).mockClear();
});

it('writes once for two updates in the same tick', async () => {
  setLastRead({ surah: 2, ayah: 5, page: 3, mode: 'mushaf' });
  toggleStar(2, 5);
  // Readers see both immediately…
  expect(getQuranState().lastRead?.ayah).toBe(5);
  expect(getQuranState().starred).toContain('2:5');
  // …and the disk sees one write, of the final state.
  await flush();
  expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
  const written = JSON.parse(
    (AsyncStorage.setItem as jest.Mock).mock.calls[0][1] as string,
  ) as { lastRead: { ayah: number }; starred: string[] };
  expect(written.lastRead.ayah).toBe(5);
  expect(written.starred).toContain('2:5');
});

it('writes again for an update in a later tick', async () => {
  setLastRead({ surah: 2, ayah: 5, page: 3, mode: 'mushaf' });
  await flush();
  setLastRead({ surah: 2, ayah: 6, page: 3, mode: 'mushaf' });
  await flush();
  expect(AsyncStorage.setItem).toHaveBeenCalledTimes(2);
});
