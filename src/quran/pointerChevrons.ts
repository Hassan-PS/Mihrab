/**
 * Whether the reader must draw its own page-turn arrows.
 *
 * ── THE QUESTION IS ABOUT INPUT, NOT ABOUT ROOM ───────────────────────
 *
 * A finger swipes; a trackpad and a mouse cannot, and wheel scroll does
 * not drive a `pagingEnabled` ScrollView. So where the pointer is the
 * only input, these arrows are the only way to turn a page short of the
 * scrubber — and where a finger is, they are clutter over the page.
 *
 * This was decided by `windowWidth >= 900`, and a window's width says how
 * much room there is, not what is pointing at it. Mac Catalyst fell
 * through every clause: its interface idiom is 'mac', so `isPad` is
 * false, and Mihrab's window opens narrower than 900pt. The arrows were
 * absent on macOS unless you dragged the window wide — in the image
 * reader, which is the one Ḥafṣ uses and so the one nearly everyone
 * opens. Every other control on that screen worked, which is exactly why
 * it read as the arrows being broken rather than missing.
 */
export function showsPointerChevrons(env: {
  os: string;
  /** Running as a Mac Catalyst binary. Always a pointer, at any size. */
  isMacCatalyst: boolean;
  /** Physical screen's short side is under 600dp — a phone, so a finger. */
  isPhoneDevice: boolean;
  /** UIKit's iPad idiom. False on Mac even though a Mac has a pointer. */
  isPad: boolean;
  windowWidth: number;
}): boolean {
  if (env.os !== 'ios') return false;
  if (env.isMacCatalyst) return true;
  if (env.isPhoneDevice) return false;
  return env.isPad || env.windowWidth >= 900;
}
