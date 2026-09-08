/**
 * A tapped notification lands somewhere — issue #27.
 *
 * Reported as three bugs: the khatmah reminder, the ayah of the day and
 * the Log widget all opened the app and left you where you already were.
 * They were one fault. Every notification carries `pressAction: 'default'`,
 * which opens the app, and nothing in the app read the press — the ayah of
 * the day even attached its surah and ayah, and no code ever looked at
 * them.
 *
 * These pin the mapping and the three ways a tap arrives, because the
 * third one — the app not running — is the case that is easy to forget and
 * is the ordinary one for a reminder that fires hours after the app was
 * last opened.
 */
import { readFileSync } from 'fs';
import path from 'path';

const mockPlan = { id: 'k1' };
let mockActive: unknown = mockPlan;
let mockLastReadMode = 'withTranslation';
let mockTarget = { page: 42, surah: 3, ayah: 7 };

jest.mock('../src/quran/quranState', () => ({
  hydrateQuranState: jest.fn(async () => {}),
  getQuranState: jest.fn(() => ({
    lastRead: { mode: mockLastReadMode },
  })),
  activeKhatmah: jest.fn(() => mockActive),
}));
jest.mock('../src/quran/khatmahTarget', () => ({
  khatmahContinueTarget: jest.fn(() => mockTarget),
}));

import {
  notificationRoute,
  ROUTE_AYAH_OF_DAY,
  ROUTE_KHATMAH,
} from '../src/notifications/notificationRoute';

const src = (p: string) => readFileSync(path.join(__dirname, '..', p), 'utf8');

beforeEach(() => {
  mockActive = mockPlan;
  mockLastReadMode = 'withTranslation';
  mockTarget = { page: 42, surah: 3, ayah: 7 };
});

describe('the ayah of the day opens its own ayah', () => {
  it('routes to the ayah it was written for', async () => {
    expect(
      await notificationRoute({
        data: { route: ROUTE_AYAH_OF_DAY, surah: '18', ayah: '10' },
      } as never),
    ).toBe('mihrab://read/18?scrollToAyah=10');
  });

  it('still routes the ones scheduled before the route existed', async () => {
    // A week of notifications is already on the system's queue when this
    // ships, carrying surah and ayah and no route. Ignoring them would
    // make the bug survive the fix for seven days.
    expect(
      await notificationRoute({ data: { surah: '2', ayah: '255' } } as never),
    ).toBe('mihrab://read/2?scrollToAyah=255');
  });

  it('refuses nonsense rather than routing to surah NaN', async () => {
    for (const data of [
      { route: ROUTE_AYAH_OF_DAY, surah: '0', ayah: '1' },
      { route: ROUTE_AYAH_OF_DAY, surah: 'x', ayah: '1' },
      { route: ROUTE_AYAH_OF_DAY, surah: '3', ayah: '-2' },
    ]) {
      expect(await notificationRoute({ data } as never)).toBeNull();
    }
  });
});

describe('the khatmah reminder opens where the plan is NOW', () => {
  it('resolves at press time, not from the notification', async () => {
    // The body names a page, and it is scheduled a week ahead. Baking that
    // page in would send a reader who has since read on back to Monday.
    const url = await notificationRoute({
      data: { route: ROUTE_KHATMAH },
    } as never);
    expect(url).toBe('mihrab://read/3?scrollToAyah=7');
    mockTarget = { page: 100, surah: 5, ayah: 1 };
    expect(await notificationRoute({ data: { route: ROUTE_KHATMAH } } as never))
      .toBe('mihrab://read/5?scrollToAyah=1');
  });

  it('sends a muṣḥaf reader to the page instead', async () => {
    mockLastReadMode = 'mushaf';
    expect(
      await notificationRoute({ data: { route: ROUTE_KHATMAH } } as never),
    ).toBe('mihrab://read/3?initialPage=42');
  });

  it('never carries both a page and an ayah', async () => {
    // The surah screen picks its reader from which of the two it is
    // given, so a link with both has not decided what it is asking for.
    for (const mode of ['mushaf', 'withTranslation']) {
      mockLastReadMode = mode;
      const url = await notificationRoute({
        data: { route: ROUTE_KHATMAH },
      } as never);
      expect(
        Number(url?.includes('initialPage=')) +
          Number(url?.includes('scrollToAyah=')),
      ).toBe(1);
    }
  });

  it('falls back to the Qur’an tab when the plan is gone', async () => {
    // A week is long enough to finish or delete a khatmah.
    mockActive = null;
    expect(
      await notificationRoute({ data: { route: ROUTE_KHATMAH } } as never),
    ).toBe('mihrab://quran');
  });
});

describe('everything else is left alone', () => {
  it.each([[undefined], [{}], [{ route: 'something-else' }]])(
    'returns null for %p',
    async data => {
      expect(
        await notificationRoute(data ? ({ data } as never) : undefined),
      ).toBeNull();
    },
  );
});

describe('all three ways a tap arrives are handled', () => {
  const linking = src('src/navigation/linking.ts');

  it('reads the notification that opened a closed app', () => {
    expect(linking).toContain('notifee.getInitialNotification()');
  });

  it('listens for a press while the app is running', () => {
    expect(linking).toMatch(/onForegroundEvent[\s\S]{0,200}EventType\.PRESS/);
  });

  it('still does what React Navigation’s own defaults did', () => {
    // Overriding getInitialURL and subscribe REPLACES them, so a link
    // from a widget has to keep working — that is the more used half.
    expect(linking).toContain('Linking.getInitialURL()');
    expect(linking).toContain("Linking.addEventListener('url'");
    expect(linking).toMatch(/return \(\) => \{[\s\S]{0,120}link\.remove\(\)/);
  });
});

describe('the senders say what they are', () => {
  it('the khatmah reminder carries its route and not a page', () => {
    const k = src('src/notifications/khatmahReminder.ts');
    expect(k).toContain('data: { route: ROUTE_KHATMAH }');
    expect(k).not.toMatch(/data: \{[^}]*page/);
  });

  it('the ayah of the day carries the ayah it names', () => {
    const a = src('src/notifications/ayahOfDay.ts');
    expect(a).toContain('route: ROUTE_AYAH_OF_DAY');
    expect(a).toContain('surah: String(ref.surah)');
  });

  it('the Log widget opens the Log', () => {
    const log = src(
      'android/app/src/main/java/com/prayer_times/PrayerWidgetLogProvider.kt',
    );
    expect(log).toContain('Uri.parse("mihrab://log")');
    // The bare launcher intent this replaced.
    expect(log).not.toContain('Intent(context, MainActivity::class.java)');
  });
});
