/**
 * Tab-bar icons (design review 2e).
 *
 * Thin wrappers over the app's existing icon set so `MainTabs` can pass
 * them straight to `tabBarIcon` — which hands back `{ color, size }` and
 * expects an element. Defined at module scope, not inline in the navigator's
 * options: an arrow function there is a new component type on every render,
 * which throws away the icon's own state each time the tab bar re-renders.
 *
 */
import {
  DuaHandsIcon,
  MihrabLogoIcon,
  PenIcon,
  QuranBookIcon,
  SettingsGearIcon,
  TasbihIcon,
} from '../theme/icons';
import { desktopSize } from '../responsive/desktop';

type TabIconProps = { color: string; size: number };

/**
 * The navigator hands down a size tuned for a touch target. On Mac
 * Catalyst that arrives ~23% smaller than drawn (responsive/desktop.ts),
 * which is what made the bar read as a strip of specks.
 */
const iconSize = (size: number) => desktopSize(size);

/**
 * The wordmark's own logo, not the plain arch. The header says "⌂ Mihrab"
 * with one mark and the tab said "Today" with a different one, so the two
 * places that name the same screen disagreed about what it looks like.
 */
export const TabHomeIcon = ({ color, size }: TabIconProps) => (
  <MihrabLogoIcon color={color} size={iconSize(size)} />
);

export const TabBookIcon = ({ color, size }: TabIconProps) => (
  <QuranBookIcon color={color} size={iconSize(size)} />
);

export const TabTasbihIcon = ({ color, size }: TabIconProps) => (
  <TasbihIcon color={color} size={iconSize(size)} />
);

export const TabDuasIcon = ({ color, size }: TabIconProps) => (
  <DuaHandsIcon color={color} size={iconSize(size)} />
);

export const TabLogIcon = ({ color, size }: TabIconProps) => (
  <PenIcon color={color} size={iconSize(size)} />
);

/**
 * The same cog the Home header used to carry. The tab previously drew a
 * ring with eight radial ticks, which at 22pt reads as a sun or a
 * brightness control before it reads as settings — and it no longer had a
 * gear anywhere else in the app to be consistent with.
 *
 * Stroke 1.8 rather than the icon's own 2: the tab bar sets these smaller
 * than the header chip did, and a 2pt stroke fills the cog's teeth in.
 */
export const TabSettingsIcon = ({ color, size }: TabIconProps) => (
  <SettingsGearIcon color={color} size={iconSize(size)} strokeWidth={1.8} />
);
