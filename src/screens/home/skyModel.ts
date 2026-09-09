// tokens-ok: the sky's own colours — a drawn scene with its own ink, not app chrome
/**
 * The sky behind the countdown — one continuous day, drawn from the clock.
 *
 * ── FIVE PASSAGES ────────────────────────────────────────────────────
 *
 * The sky is not a set of pictures chosen by the next prayer; it is one
 * scene that moves with the time of day, in five passages that meet at the
 * prayer times themselves:
 *
 *   Isha → Fajr      night. The moon crosses the top of the card, drawn in
 *                    its actual phase — one of the eight — for today.
 *   Fajr → Sunrise   dawn. From the dark of Fajr through the saturated
 *                    rose and orange of the horizon to the peach of first
 *                    light; the sun rises into the card near the end.
 *   Sunrise → Asr    the day. The sun climbs to its height about Dhuhr and
 *                    starts down; the sky goes from morning gold through
 *                    bright noon blue to the warmth of the afternoon.
 *   Asr → Maghrib    sunset. Deepening orange and red as the sun sinks,
 *                    until it has set completely at Maghrib.
 *   Maghrib → Isha   dusk. The afterglow darkens through purple into the
 *                    night that begins at Isha; the stars come out.
 *
 * Each passage is a run of colour KEYFRAMES interpolated by how far the
 * clock has come through it, so the card changes minute by minute and is
 * never seen to jump.
 *
 * ── THE SKY IS TRUE TO THE HOUR, NOT TO THE THEME ─────────────────────
 *
 * Painted at full strength whatever the theme or Material You has done to
 * the accent: night is dark at night in a light app, noon is bright at
 * noon in a dark one. So the hero's TEXT cannot come from the theme either.
 * `skyInkAt` picks the ink for an element from the sky's own colour at
 * that element's height — pure white where the sky is dark, pure black
 * where it is light, with the switch at a luminance where BOTH inks meet
 * WCAG AA (4.5:1): pure white on L = 0.18 is 4.56, pure black on it 4.6.
 * Anything softer than pure fails at the crossing, which is exactly the
 * moment a dawn passes through. The accent stays out of it: on the hero
 * the countdown is the ink, and its size is its rank.
 *
 * Pure functions throughout; the component only draws what `skyFrame`
 * returns.
 */
import { combineLocalDateAndTime } from '../../utils/prayerTimes';
import type { TimingsMap } from '../../types/prayer';

export type SkyPassage = 'night' | 'dawn' | 'day' | 'sunset' | 'dusk';

/** A colour pair at a moment of a passage. */
type Key = { t: number; top: string; bottom: string };

const NIGHT_TOP = '#0B1230';
const NIGHT_BOTTOM = '#1E2B5A';

const KEYS: Record<SkyPassage, Key[]> = {
  night: [
    { t: 0, top: NIGHT_TOP, bottom: NIGHT_BOTTOM },
    { t: 1, top: NIGHT_TOP, bottom: NIGHT_BOTTOM },
  ],
  dawn: [
    { t: 0, top: '#0E1745', bottom: '#3B3163' },
    { t: 0.45, top: '#2F4A8F', bottom: '#B85E7C' },
    { t: 0.78, top: '#5A7FC8', bottom: '#F5924F' },
    { t: 1, top: '#7FA6DC', bottom: '#FBC48A' },
  ],
  day: [
    { t: 0, top: '#6F9BD8', bottom: '#FBD7A8' },
    { t: 0.5, top: '#3F8FE0', bottom: '#D6ECFF' },
    { t: 1, top: '#5F9EDC', bottom: '#F3DFAE' },
  ],
  sunset: [
    { t: 0, top: '#5F9EDC', bottom: '#F3DFAE' },
    { t: 0.5, top: '#6C7BC2', bottom: '#F7A45A' },
    { t: 0.85, top: '#4B4A93', bottom: '#F0653A' },
    { t: 1, top: '#2E3272', bottom: '#D25A55' },
  ],
  dusk: [
    { t: 0, top: '#2E3272', bottom: '#D25A55' },
    { t: 0.4, top: '#1C2260', bottom: '#8A4B72' },
    { t: 1, top: NIGHT_TOP, bottom: NIGHT_BOTTOM },
  ],
};

/** The glow of the sun or moon, per passage. */
const GLOW: Record<SkyPassage, string> = {
  night: '#E6E9FF',
  dawn: '#FFD9A0',
  day: '#FFF3C4',
  sunset: '#FFC27A',
  dusk: '#F2B3A0',
};

// ── Colour arithmetic ───────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  return [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16)) as [number, number, number];
}
function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
}
/** Linear blend of two hex colours, `t` from a to b. */
export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const k = Math.max(0, Math.min(1, t));
  return rgbToHex([ar + (br - ar) * k, ag + (bg - ag) * k, ab + (bb - ab) * k]);
}
/** WCAG relative luminance of a hex colour. */
export function luminance(hex: string): number {
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = hexToRgb(hex).map(v => lin(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function keyed(keys: Key[], t: number): { top: string; bottom: string } {
  const k = Math.max(0, Math.min(1, t));
  for (let i = 1; i < keys.length; i++) {
    if (k <= keys[i].t) {
      const a = keys[i - 1];
      const b = keys[i];
      const span = b.t - a.t || 1;
      const u = (k - a.t) / span;
      return { top: mixHex(a.top, b.top, u), bottom: mixHex(a.bottom, b.bottom, u) };
    }
  }
  const last = keys[keys.length - 1];
  return { top: last.top, bottom: last.bottom };
}

// ── Where in the day ────────────────────────────────────────────────────

export type SkyMoment = { passage: SkyPassage; t: number };

/**
 * Which passage the clock is in and how far through it, from the day's
 * timings. `tomorrowFajr` closes the night after Isha; without it the
 * night is assumed to end at today's Fajr plus a day. Before today's Fajr
 * the night is assumed to have begun at today's Isha minus a day.
 */
export function skyMoment(timings: TimingsMap, now: Date, tomorrowFajr?: string): SkyMoment {
  const at = (key: string, dayShift = 0): number | null => {
    const raw = timings[key];
    if (!raw) return null;
    const d = combineLocalDateAndTime(now, raw);
    if (dayShift) d.setDate(d.getDate() + dayShift);
    return d.getTime();
  };
  const n = now.getTime();
  const fajr = at('Fajr');
  const asr = at('Asr');
  const maghrib = at('Maghrib');
  const ishaRaw = at('Isha');
  const frac = (a: number, b: number) => (b > a ? Math.max(0, Math.min(1, (n - a) / (b - a))) : 0);

  if (fajr == null || asr == null || maghrib == null || ishaRaw == null) {
    return { passage: 'day', t: 0.5 };
  }
  // At a high latitude in summer Isha falls after midnight and is stored
  // as the clock it shows ("00:47"), which as a time on the SAME day is
  // before Maghrib. It belongs to the night that Maghrib began, so it is
  // read as the next day's — otherwise the dusk was skipped and the night
  // began at Maghrib, an hour early, with the moon already at its end.
  const wrapped = ishaRaw < maghrib;
  const isha = wrapped ? ishaRaw + 24 * 3600_000 : ishaRaw;
  // Sunrise is an OPTIONAL row, and a map with the row turned off has no
  // key for it — which once turned the whole night into noon. Without it
  // the dawn is taken to last as long as it does at the middle latitudes
  // this app is used at, an hour and a half; the sky is a drawing, not a
  // timetable, and a dawn ten minutes long or short is not visible.
  const sunrise = at('Sunrise') ?? fajr + 90 * 60_000;
  if (n < fajr) {
    // Before Fajr. With a wrapped Isha, the small hours up to it are still
    // last evening's dusk — Maghrib was yesterday's clock, Isha is today's
    // — and the night that follows began at that Isha, this morning.
    if (wrapped && n < ishaRaw) {
      return { passage: 'dusk', t: frac(maghrib - 24 * 3600_000, ishaRaw) };
    }
    const from = wrapped ? ishaRaw : isha - 24 * 3600_000;
    return { passage: 'night', t: frac(from, fajr) };
  }
  if (n < sunrise) return { passage: 'dawn', t: frac(fajr, sunrise) };
  if (n < asr) return { passage: 'day', t: frac(sunrise, asr) };
  if (n < maghrib) return { passage: 'sunset', t: frac(asr, maghrib) };
  if (n < isha) return { passage: 'dusk', t: frac(maghrib, isha) };
  let end: number;
  if (tomorrowFajr) {
    const d = combineLocalDateAndTime(now, tomorrowFajr);
    d.setDate(d.getDate() + 1);
    end = d.getTime();
  } else {
    end = fajr + 24 * 3600_000;
  }
  return { passage: 'night', t: frac(isha, end) };
}

// ── The moon ────────────────────────────────────────────────────────────

/** The eight phases, new moon first, waxing through full and back. */
export type MoonPhase = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Reference new moon: 2000-01-06 18:14 UTC. Mean synodic month in days. */
const NEW_MOON_EPOCH_MS = Date.UTC(2000, 0, 6, 18, 14);
const SYNODIC_DAYS = 29.530588853;

/** 0 at new moon, 0.5 at full, back to 1 at the next new moon. */
export function moonPhaseFraction(date: Date): number {
  const days = (date.getTime() - NEW_MOON_EPOCH_MS) / 86_400_000;
  const f = (days / SYNODIC_DAYS) % 1;
  return f < 0 ? f + 1 : f;
}

/** The nearest of the eight main phases. */
export function moonPhase(date: Date): MoonPhase {
  return (Math.round(moonPhaseFraction(date) * 8) % 8) as MoonPhase;
}

// ── The frame the component draws ───────────────────────────────────────

export type SkyBody =
  | { kind: 'none' }
  | { kind: 'sun'; x: number; y: number; alpha: number }
  | {
      kind: 'moon';
      x: number;
      y: number;
      phase: MoonPhase;
      /** How much of the disc is lit, 0–1 — the glow follows it. */
      lit: number;
    };

export type SkyFrame = {
  passage: SkyPassage;
  t: number;
  top: string;
  bottom: string;
  glow: string;
  /** 0–1: how visible the stars are. */
  stars: number;
  body: SkyBody;
};

/** The body's x across the top strip — between the eyebrow and the Qibla chip. */
const X0 = 0.3;
const X1 = 0.66;
/**
 * The strip's floor — a body "at the horizon" sits here. The countdown's
 * cap line is at about 0.3 of the hero, so nothing drawn goes below 0.28.
 */
const Y_LOW = 0.26;
const Y_HIGH = 0.08;

export function skyFrame(moment: SkyMoment, moonDate: Date): SkyFrame {
  const { passage, t } = moment;
  const { top, bottom } = keyed(KEYS[passage], t);
  const x = X0 + t * (X1 - X0);
  let stars = 0;
  let body: SkyBody = { kind: 'none' };
  switch (passage) {
    case 'night':
      stars = 1;
      {
        const phase = moonPhase(moonDate);
        // Illuminated fraction of the disc for a phase angle of 2π·p.
        const lit = (1 - Math.cos((2 * Math.PI * phase) / 8)) / 2;
        body = { kind: 'moon', x, y: 0.22 - Math.sin(t * Math.PI) * 0.1, phase, lit };
      }
      break;
    case 'dawn': {
      // Stars fade as the sky lightens; the sun breaks the strip's floor at
      // t ≈ 0.6 and stands at the horizon line by sunrise.
      stars = Math.max(0, 1 - t / 0.5);
      const rise = Math.max(0, (t - 0.6) / 0.4);
      body =
        rise > 0
          ? { kind: 'sun', x, y: Y_LOW + 0.02 - rise * 0.02, alpha: Math.min(1, rise * 1.5) }
          : { kind: 'none' };
      break;
    }
    case 'day':
      // Up to its height about Dhuhr (the middle of Sunrise → Asr), then down.
      body = { kind: 'sun', x, y: Y_LOW - Math.sin(t * Math.PI) * (Y_LOW - Y_HIGH), alpha: 1 };
      break;
    case 'sunset': {
      // From the afternoon's height to the horizon, gone as Maghrib arrives.
      const y = 0.16 + t * (Y_LOW + 0.02 - 0.16);
      body = { kind: 'sun', x, y, alpha: t < 0.9 ? 1 : Math.max(0, Math.round((1 - (t - 0.9) / 0.1) * 1000) / 1000) };
      break;
    }
    case 'dusk':
      stars = Math.max(0, (t - 0.4) / 0.6);
      break;
  }
  return { passage, t, top, bottom, glow: GLOW[passage], stars, body };
}

// ── The ink ─────────────────────────────────────────────────────────────

export type SkyInkColors = {
  text: string;
  muted: string;
  track: string;
  fill: string;
};

/** The sky's colour at a fraction of the card's height. */
export function skyColorAt(frame: Pick<SkyFrame, 'top' | 'bottom'>, y: number): string {
  return mixHex(frame.top, frame.bottom, y);
}

/**
 * The luminance at which the ink switches — where pure white (4.56:1)
 * and pure black (4.6:1) both clear AA against the sky.
 */
export const INK_SWITCH_LUMINANCE = 0.18;

/** The ink for an element drawn at height `y` of the card. */
export function skyInkAt(frame: Pick<SkyFrame, 'top' | 'bottom'>, y: number): SkyInkColors {
  const light = luminance(skyColorAt(frame, y)) < INK_SWITCH_LUMINANCE;
  return light
    ? {
        text: '#FFFFFF',
        muted: 'rgba(255,255,255,0.78)',
        track: 'rgba(255,255,255,0.24)',
        fill: '#FFFFFF',
      }
    : {
        text: '#000000',
        muted: 'rgba(0,0,0,0.66)',
        track: 'rgba(0,0,0,0.16)',
        fill: '#000000',
      };
}

/** Where the hero's elements sit, as fractions of its height. */
export const HERO_Y = { eyebrow: 0.12, countdown: 0.4, foot: 0.82 } as const;
