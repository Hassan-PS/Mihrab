// tokens-ok: the sky's own colours — a drawn scene at low alpha over the hero's surface, not app chrome
/**
 * The sky behind the countdown — which sky, for which prayer.
 *
 * The hero is "styled after each prayer time": the card's ground is a
 * drawn sky that moves through the day with the prayer being counted
 * down to. Night before Fajr, the dawn band before sunrise, a clear
 * morning towards Dhuhr, the warm light of the afternoon towards Asr, the
 * sunset towards Maghrib, dusk towards Isha, and night again after it.
 *
 * ── WHY IT IS A WASH AND NOT A PICTURE ────────────────────────────────
 *
 * The countdown is the app's best piece of hierarchy and it is set in the
 * theme's accent on the theme's tint. A painted sky with real sky colours
 * would put dark green on navy at night and white on peach at dawn. So
 * every sky here is drawn at LOW ALPHA over the surface the hero already
 * has (`accentBg`): the colours below are the sky's own, the alpha keeps
 * the surface's legibility, and in the dark theme the same skies are a
 * shade deeper so they read on a dark ground. Nothing here is the accent;
 * the accent stays the one colour of action (redesign-plan §2.4).
 *
 * Pure: the phase from the target's key, the colours from the phase and
 * the theme, and where the sun or moon is from how far the current
 * interval has run. The component only draws what this returns.
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

export type Sky = {
  /** Gradient stops, top to bottom, as hex. */
  top: string;
  bottom: string;
  /** The glow around the sun or moon, and the stars. */
  glow: string;
  /** Alpha for the whole wash — the surface underneath must stay legible. */
  alpha: number;
  body: SkyBody;
  /** Stars in the field — night skies only. */
  stars: boolean;
};

/** The sky's own colours per phase, light-theme and dark-theme variants. */
const SKIES: Record<SkyPhase, { light: Sky; dark: Sky }> = {
  night: {
    light: { top: '#3B4A7A', bottom: '#8A97C4', glow: '#E8ECFF', alpha: 0.22, body: 'moon', stars: true },
    dark: { top: '#0B1230', bottom: '#1D2A5C', glow: '#B7C3FF', alpha: 0.55, body: 'moon', stars: true },
  },
  predawn: {
    light: { top: '#3E4E86', bottom: '#C8A6C9', glow: '#F6D9C5', alpha: 0.24, body: 'moon', stars: true },
    dark: { top: '#0E1740', bottom: '#4A3766', glow: '#E0B8A6', alpha: 0.55, body: 'moon', stars: true },
  },
  dawn: {
    light: { top: '#7A8FD0', bottom: '#F7C9A0', glow: '#FFE7B3', alpha: 0.3, body: 'sun', stars: false },
    dark: { top: '#1B2A66', bottom: '#8C5A3F', glow: '#FFC98A', alpha: 0.5, body: 'sun', stars: false },
  },
  morning: {
    light: { top: '#8FC3F2', bottom: '#DDF0FF', glow: '#FFF3C4', alpha: 0.32, body: 'sun', stars: false },
    dark: { top: '#12325C', bottom: '#2B5A8A', glow: '#F3DFA0', alpha: 0.5, body: 'sun', stars: false },
  },
  afternoon: {
    light: { top: '#7FB3E8', bottom: '#F9E4B7', glow: '#FFE39A', alpha: 0.32, body: 'sun', stars: false },
    dark: { top: '#143A66', bottom: '#6B5530', glow: '#F1CF7E', alpha: 0.5, body: 'sun', stars: false },
  },
  sunset: {
    light: { top: '#6C7FC9', bottom: '#F8B27A', glow: '#FFD08A', alpha: 0.3, body: 'sun', stars: false },
    dark: { top: '#1A2454', bottom: '#8E4A2A', glow: '#F6B26B', alpha: 0.52, body: 'sun', stars: false },
  },
  dusk: {
    light: { top: '#4A5490', bottom: '#D9A2A6', glow: '#F5CDB6', alpha: 0.26, body: 'none', stars: true },
    dark: { top: '#0F1740', bottom: '#5A3552', glow: '#D9A28E', alpha: 0.55, body: 'none', stars: true },
  },
};

export function skyFor(phase: SkyPhase, isDark: boolean): Sky {
  return isDark ? SKIES[phase].dark : SKIES[phase].light;
}

/**
 * Where the sun or moon sits, as fractions of the card.
 *
 * In the TOP STRIP of the hero — between the eyebrow and the Qibla chip —
 * and nowhere else. The first cut let the body run the card's whole width
 * along a mid-height arc, which put a glowing moon behind the "5h" of the
 * countdown and a horizon line through the date. The countdown is the
 * hero; the sky stays out of its way. x still runs with the current
 * interval (the rail's own fraction) so the body moves through the
 * evening; y is a shallow arc within the strip, rising towards sunrise
 * and sinking towards Maghrib.
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
