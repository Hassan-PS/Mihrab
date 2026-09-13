/**
 * What colour a light in the sky is, and how strongly it glows.
 *
 * ── WHAT THIS REPLACES ────────────────────────────────────────────────
 *
 * One hex per passage. The glow was `#FFD9A0` for the whole of dawn,
 * `#FFF3C4` for the whole of the day, `#FFC27A` for the whole of sunset
 * — a step function with five steps, so the sun was the same colour at
 * six in the morning as at eleven, and changed by jumping at a prayer
 * time. The most recognisable thing in the sky, and the one thing in the
 * hero that did not move.
 *
 * ── WHY THE SUN GOES RED ──────────────────────────────────────────────
 *
 * Not a stylistic choice, and not worth inventing a ramp for when the
 * real reason is four lines of arithmetic. Air scatters short wavelengths
 * far more than long ones — Rayleigh scattering goes as λ⁻⁴ — so the
 * further through the atmosphere a beam travels, the more blue is taken
 * out of it and the redder what is left becomes. Straight overhead the
 * beam crosses one atmosphere's worth of air; at the horizon it crosses
 * about thirty-eight. That is the whole of sunrise and sunset.
 *
 * So the colour is computed, per channel, from the optical depth at that
 * channel's wavelength and the amount of air in the way:
 *
 *     transmitted = e^(−τ · airmass)
 *
 * with τ the standard sea-level Rayleigh depth plus a modest aerosol
 * term, which is what keeps a real sunset orange rather than the almost
 * black-red that pure Rayleigh alone gives at the horizon.
 *
 * ── AND WHY IT DIMS ───────────────────────────────────────────────────
 *
 * The same transmittance. A setting sun is not merely redder, it is
 * dimmer — that is why it can be looked at — and it dims by exactly the
 * factor that reddens it. Note this is the sun's APPARENT brightness,
 * which is what a glow in a picture stands for, not the illuminance on
 * the ground: that falls off with the sine of the altitude as well, and
 * using it here would put out the sun long before it reached the horizon.
 */

/** Effective wavelengths of the sRGB primaries, in micrometres. */
const LAMBDA = { r: 0.612, g: 0.549, b: 0.465 } as const;

/**
 * Rayleigh optical depth at sea level: 0.008735 · λ^−4.08, the standard
 * fit. The exponent is a little steeper than the textbook −4 because the
 * refractive index of air is itself wavelength-dependent.
 */
function rayleigh(micron: number): number {
  return 0.008735 * micron ** -4.08;
}

/**
 * Aerosol extinction — haze, dust, salt. Far weaker in its wavelength
 * dependence (λ^−1.3), so it dims without reddening much, which is what
 * stops the horizon sun computing out almost black. 0.05 at 550nm is a
 * clear-day continental figure.
 */
function aerosol(micron: number): number {
  return 0.05 * (micron / 0.55) ** -1.3;
}

const TAU = {
  r: rayleigh(LAMBDA.r) + aerosol(LAMBDA.r),
  g: rayleigh(LAMBDA.g) + aerosol(LAMBDA.g),
  b: rayleigh(LAMBDA.b) + aerosol(LAMBDA.b),
} as const;

/**
 * How many atmospheres' worth of air a beam from `altitude` crosses.
 *
 * Kasten and Young (1989). The plain 1/sin(h) runs away to infinity at
 * the horizon, where the answer is about 38 — the earth is round and the
 * air thins, so the path is finite. Below the horizon there is no direct
 * beam at all, and the caller has nothing to draw there; this holds at
 * the horizon value so a body sitting exactly on the line is treated as
 * being on it rather than as an error.
 */
export function airMass(altitudeDeg: number): number {
  const h = Math.max(0, altitudeDeg);
  const rad = (Math.PI / 180) * h;
  return 1 / (Math.sin(rad) + 0.50572 * (h + 6.07995) ** -1.6364);
}

/** What survives the trip, per channel, 0–1. */
export function transmittance(altitudeDeg: number): {
  r: number;
  g: number;
  b: number;
} {
  const m = airMass(altitudeDeg);
  return {
    r: Math.exp(-TAU.r * m),
    g: Math.exp(-TAU.g * m),
    b: Math.exp(-TAU.b * m),
  };
}

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function toHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [clamp255(r), clamp255(g), clamp255(b)]
      .map(v => v.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * The colour of a light of intrinsic colour `surface` seen from the
 * ground at `altitudeDeg` above the horizon.
 *
 * Renormalised so the strongest channel stays at full: this is the light's
 * HUE, not its brightness. A disc drawn at a quarter intensity would be a
 * grey smudge; the dimming is carried separately by `apparentBrightness`,
 * which is what the glow uses, so the two can be applied where each
 * belongs.
 */
export function tintedBy(surface: string, altitudeDeg: number): string {
  const [r, g, b] = channels(surface);
  const t = transmittance(altitudeDeg);
  const lit = [r * t.r, g * t.g, b * t.b];
  const peak = Math.max(...lit);
  if (peak <= 0) return surface;
  const scale = 255 / peak;
  return toHex(lit[0] * scale, lit[1] * scale, lit[2] * scale);
}

/** Luminance of a transmittance triple, weighted the way the eye is. */
function luminanceOf(t: { r: number; g: number; b: number }): number {
  return 0.2126 * t.r + 0.7152 * t.g + 0.0722 * t.b;
}

/** The same light overhead, which is what "full brightness" means. */
const ZENITH_Y = luminanceOf(transmittance(90));

/**
 * How bright a light at `altitudeDeg` looks, 0–1, against itself overhead.
 *
 * ── WHY THIS IS NOT THE RAW RATIO ─────────────────────────────────────
 *
 * The raw ratio at the horizon is about 0.006. That is a true number —
 * a setting sun really does deliver a couple of hundredths of a percent
 * of noon — and drawing the glow at 0.6% of full would put the sun out
 * some minutes before it set, which is not what anybody sees. Nobody
 * sees it because the eye does not measure light, it adapts to it, and
 * by sunset it has: against a dark sky the sun is still the brightest
 * thing in it.
 *
 * The encoding is the honest way to say that rather than a fudge factor.
 * Every value that reaches the screen is gamma-encoded — sRGB is a ≈2.2
 * power curve precisely because perception is roughly logarithmic — so a
 * physical ratio destined for an opacity belongs on the same curve as
 * every colour beside it. What comes out is a sun that holds its
 * brightness through the day, softens over the last few degrees, and is
 * still alight as it touches the horizon.
 */
const PERCEPTUAL_GAMMA = 2.2;

export function apparentBrightness(altitudeDeg: number): number {
  const linear = luminanceOf(transmittance(altitudeDeg)) / ZENITH_Y;
  return Math.min(1, Math.max(0, linear ** (1 / PERCEPTUAL_GAMMA)));
}

/**
 * The sun's own colour, before the air gets at it: a 5800 K body, which
 * in sRGB is white with the faintest warm cast. Everything orange about a
 * sunset happens on the way down, not up there.
 */
export const SUN_SURFACE = '#FFF4EA'; // tokens-ok-line: a physical colour, not app chrome

/**
 * Moonlight, which is sunlight bounced off a dark grey rock.
 *
 * The regolith reddens it — measured moonlight sits near 4100 K, WARMER
 * than sunlight, not cooler. It looks blue in films and in most drawings
 * because at those light levels the eye is running on rods, which see no
 * colour at all and are biased to the blue; the sky around it is blue and
 * borrows it the rest.
 *
 * What is drawn here is the disc as a camera sees it against a night
 * sky, which is a pale cream: the physical warmth, kept far enough from
 * a literal 4100 K swatch that a 22dp circle does not read as a small
 * sun.
 */
export const MOON_SURFACE = '#FBF4E6'; // tokens-ok-line: a physical colour, not app chrome

/**
 * The strongest a full moon's glow is allowed to be, and the sun's at the
 * zenith — twice it, by request and by a long way the more defensible of
 * the two numbers available. The true ratio of their illuminance is about
 * four hundred thousand to one, which is unusable: drawn honestly the
 * moon would be nothing at all. Two says "much brighter" in a picture
 * where the moon still has to be visible.
 */
export const MOON_GLOW_PEAK = 0.4;
export const SUN_GLOW_PEAK = MOON_GLOW_PEAK * 2;

/**
 * The moon's glow, in proportion to how much of it is actually alight.
 *
 * Not a floor plus a fraction, which is what it was: that lit a halo
 * around a new moon, a thing that by definition gives off nothing. A
 * quarter moon is a quarter of the light of a full one, near enough for a
 * picture, and looks it.
 */
export function moonGlow(illuminated: number): number {
  return MOON_GLOW_PEAK * Math.max(0, Math.min(1, illuminated));
}

/** The sun's glow at `altitudeDeg`, on the same scale. */
export function sunGlow(altitudeDeg: number): number {
  return SUN_GLOW_PEAK * apparentBrightness(altitudeDeg);
}
