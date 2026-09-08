// tokens-ok: the sky's own colours — a drawn scene with its own ink, not app chrome
/**
 * The sky behind the countdown — which sky, for which prayer, and what ink
 * reads on it.
 *
 * The hero is "styled after each prayer time": the card's ground is a
 * drawn sky that moves through the day with the prayer being counted
 * down to. Night before Fajr, the dawn band before sunrise, a clear
 * morning towards Dhuhr, the warm light of the afternoon towards Asr, the
 * sunset towards Maghrib, dusk towards Isha, and night again after it.
 *
 * ── THE SKY IS TRUE TO THE HOUR, NOT TO THE THEME ─────────────────────
 *
 * The first cut drew the sky as a wash over the theme's surface, so a
 * light theme at midnight showed a pale grey-blue and a dark theme at noon
 * a murky one — the theme was deciding what the sky looked like, which is
 * backwards. Now the sky is painted at full strength whatever the theme,
 * and whatever Material You has done to the accent: night is dark at
 * night in a light app, noon is bright at noon in a dark one. That means
 * the hero's TEXT cannot come from the theme either — dark green on a
 * navy night, or a light theme's white on a noon sky, would be unreadable.
 * So each sky declares its ink, `light` or `dark`, and `skyInk` turns that
 * into the colours the hero's text, rail and date use. Every sky's colours
 * are chosen so that its ink reads on the whole gradient — dark-ink skies
 * keep their tops mid-light, light-ink skies keep their feet mid-dark.
 * The accent stays out of it: on the hero the countdown is the ink.
 *
 * Pure: the phase from the target's key, the colours from the phase, and
 * where the sun or moon is from how far the current interval has run.
 */
export type SkyPhase =
  | 'night' // after Isha, or towards Midnight / the last third
  | 'predawn' // towards Fajr
  | 'dawn' // towards Sunrise
  | 'morning' // towards Dhuhr
  | 'afternoon' // towards Asr
  | 'sunset' // towards Maghrib
  | 'dusk'; // towards Isha

export function skyPhaseFor(targetKey: string): SkyPhase {
  switch (targetKey) {
    case 'Fajr':
      return 'predawn';
    case 'Sunrise':
      return 'dawn';
    case 'Dhuhr':
      return 'morning';
    case 'Asr':
      return 'afternoon';
    case 'Maghrib':
      return 'sunset';
    case 'Isha':
      return 'dusk';
    default:
      return 'night';
  }
}

export type SkyBody = 'sun' | 'moon' | 'none';
export type SkyInk = 'light' | 'dark';

export type Sky = {
  /** Gradient stops, top to bottom, as hex — painted at full strength. */
  top: string;
  bottom: string;
  /** The sun or moon, its glow, and the stars. */
  glow: string;
  /** Which ink reads on this sky. */
  ink: SkyInk;
  body: SkyBody;
  /** Stars in the field — the dark skies only. */
  stars: boolean;
};

const SKIES: Record<SkyPhase, Sky> = {
  night: { top: '#0B1230', bottom: '#243462', glow: '#D2DAFF', ink: 'light', body: 'moon', stars: true },
  predawn: { top: '#101A48', bottom: '#5E4C7A', glow: '#F2CDB4', ink: 'light', body: 'moon', stars: true },
  dawn: { top: '#8FA8E0', bottom: '#F7D0AF', glow: '#FFE7B8', ink: 'dark', body: 'sun', stars: false },
  morning: { top: '#7DBCF0', bottom: '#E3F2FD', glow: '#FFF3C8', ink: 'dark', body: 'sun', stars: false },
  afternoon: { top: '#79B0E6', bottom: '#F7E7BF', glow: '#FFE3A0', ink: 'dark', body: 'sun', stars: false },
  sunset: { top: '#8C8FCB', bottom: '#F6B37F', glow: '#FFD08E', ink: 'dark', body: 'sun', stars: false },
  dusk: { top: '#1F2A5E', bottom: '#7B5875', glow: '#EBB9A5', ink: 'light', body: 'none', stars: true },
};

export function skyFor(phase: SkyPhase): Sky {
  return SKIES[phase];
}

export type SkyInkColors = {
  /** The countdown and anything that must be read first. */
  text: string;
  /** Eyebrow, seconds, the clock time, rail labels, the date. */
  muted: string;
  /** The rail's track and its fill. */
  track: string;
  fill: string;
};

/** The colours the hero's text takes on a sky. */
export function skyInk(sky: Sky): SkyInkColors {
  return sky.ink === 'light'
    ? {
        text: '#F7F3EA',
        muted: 'rgba(247,243,234,0.74)',
        track: 'rgba(247,243,234,0.22)',
        fill: '#F7F3EA',
      }
    : {
        text: '#161A26',
        muted: 'rgba(22,26,38,0.66)',
        track: 'rgba(22,26,38,0.16)',
        fill: '#161A26',
      };
}

/**
 * Where the sun or moon sits, as fractions of the card.
 *
 * In the TOP STRIP of the hero — between the eyebrow and the Qibla chip —
 * and nowhere else, so the body is never behind the countdown. x runs
 * with the current interval (the rail's own fraction) so the body moves
 * through the evening; y is a shallow arc within the strip, rising
 * towards sunrise and sinking towards Maghrib.
 */
export function skyBodyPosition(
  phase: SkyPhase,
  progress: number,
): { x: number; y: number } {
  const p = Math.max(0, Math.min(1, progress));
  const x = 0.3 + p * 0.36;
  const arc = Math.sin(p * Math.PI); // 0 → 1 → 0
  switch (phase) {
    case 'dawn':
      // Rising.
      return { x, y: 0.3 - p * 0.18 };
    case 'sunset':
      // Setting.
      return { x, y: 0.12 + p * 0.18 };
    case 'morning':
    case 'afternoon':
      return { x, y: 0.26 - arc * 0.14 };
    default:
      // The moon: a shallow arc.
      return { x, y: 0.22 - arc * 0.1 };
  }
}
