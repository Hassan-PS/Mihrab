/**
 * The top edge of a tab page that has no title bar.
 *
 * The five tabs beside Today draw no header any more: no title, no arrow,
 * nothing between the status bar and the page (the Pillars rule — the
 * bars are part of the page, not a frame around it). So the page itself
 * has to clear the status bar, and this is the one number it clears it
 * by, so six screens cannot each pick a different one.
 *
 * ONE EXCEPTION. While something is playing, `HeaderPlaybackBar` is
 * mounted above every tab by the navigator's layout and clears the status
 * bar itself (`headerless`). A page that ALSO padded the inset would open
 * with a band of nothing under the bar, so while the bar is up the page
 * pads only its own breathing room. The bar's own gate — playback active,
 * screen focused and foregrounded — is the same test made here.
 */
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsActive } from '../hooks/useIsActive';
import { usePlaybackStatus } from '../quran/audio/playback';
import { SPACING } from '../theme/tokens';

export function useTabPageTop(): number {
  const insets = useSafeAreaInsets();
  const { active: playing } = usePlaybackStatus();
  const active = useIsActive();
  return (playing && active ? 0 : insets.top) + SPACING.md;
}
