/**
 * The light in the hero: what colour it is, and how hard it glows.
 *
 * This is the first thing anybody sees when they open the app, and until
 * now it was five hexes in a table — one per passage — so the sun was
 * the same colour at six in the morning as at eleven and changed by
 * jumping at a prayer time. What replaced it is the actual reason the
 * sun goes red, so what these check is that the physics comes out the
 * way the sky does: redder and dimmer the lower it gets, monotonically,
 * with no step anywhere in the day.
 */
import {
  airMass,
  apparentBrightness,
  moonGlow,
  MOON_GLOW_PEAK,
  MOON_SURFACE,
  sunGlow,
  SUN_GLOW_PEAK,
  SUN_SURFACE,
  tintedBy,
  transmittance,
} from '../src/screens/home/skyLight';
import { sunAltitude } from '../src/screens/home/moon';

const channels = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
};

describe('how much air the light comes through', () => {
  it('is one atmosphere overhead and about 38 at the horizon', () => {
    // The two numbers the whole model rests on. A plain 1/sin(h) gives
    // infinity at the horizon; the earth being round is why it does not.
    expect(airMass(90)).toBeCloseTo(1, 2);
    expect(airMass(0)).toBeGreaterThan(35);
    expect(airMass(0)).toBeLessThan(40);
  });

  it('grows as the light sinks, never the other way', () => {
    let last = 0;
    for (let h = 90; h >= 0; h -= 1) {
      const m = airMass(h);
      expect(m).toBeGreaterThan(last);
      last = m;
    }
  });

  it('treats a light below the horizon as being on it', () => {
    // There is no direct beam down there and nothing drawn; this keeps
    // the arithmetic finite rather than returning a negative air mass.
    expect(airMass(-5)).toBe(airMass(0));
  });
});

describe('what the air does to the colour', () => {
  it('takes more blue than green and more green than red', () => {
    // Rayleigh scattering goes as λ⁻⁴. Everything else here follows from
    // this one fact, so if it ever inverts the sunsets go blue.
    for (const h of [90, 30, 10, 0]) {
      const t = transmittance(h);
      expect(t.b).toBeLessThan(t.g);
      expect(t.g).toBeLessThan(t.r);
    }
  });

  it('leaves the sun nearly its own colour overhead', () => {
    const [r, g, b] = channels(tintedBy(SUN_SURFACE, 90));
    expect(r).toBe(255);
    expect(g).toBeGreaterThan(220);
    expect(b).toBeGreaterThan(180);
  });

  it('turns it orange at ten degrees and red on the horizon', () => {
    // Golden hour, then the last minute. These are the two moments
    // anybody would check the app against by looking out of a window.
    const [, g10, b10] = channels(tintedBy(SUN_SURFACE, 10));
    expect(g10).toBeGreaterThan(150);
    expect(g10).toBeLessThan(215);
    expect(b10).toBeLessThan(130);

    const [r0, g0, b0] = channels(tintedBy(SUN_SURFACE, 0));
    expect(r0).toBe(255);
    expect(g0).toBeLessThan(90);
    expect(b0).toBeLessThan(30);
  });

  it('reddens without a single step, all the way down', () => {
    // The complaint this answers: a table of five colours changes by
    // jumping. Blue must fall continuously from the zenith to the
    // horizon, at every degree.
    let previous = Infinity;
    for (let h = 90; h >= 0; h -= 0.5) {
      const [, , b] = channels(tintedBy(SUN_SURFACE, h));
      expect(b).toBeLessThanOrEqual(previous);
      previous = b;
    }
    expect(previous).toBeLessThan(40);
  });

  it('never darkens the hue it returns — that is the glow’s job', () => {
    // `tintedBy` answers what colour, `apparentBrightness` how much. If
    // this one dimmed as well, a low sun would be drawn as a brown disc
    // instead of a red one.
    for (const h of [90, 45, 20, 5, 0]) {
      expect(Math.max(...channels(tintedBy(SUN_SURFACE, h)))).toBe(255);
    }
  });
});

describe('how hard it glows', () => {
  it('is full overhead and fades as it sinks', () => {
    expect(apparentBrightness(90)).toBeCloseTo(1, 3);
    let previous = Infinity;
    for (let h = 90; h >= 0; h -= 1) {
      const v = apparentBrightness(h);
      expect(v).toBeLessThanOrEqual(previous + 1e-9);
      previous = v;
    }
  });

  it('still has the sun alight as it touches the horizon', () => {
    // The raw physical ratio down there is about 0.006, which would put
    // the sun out minutes before it set. The eye adapts instead, and the
    // gamma the screen already encodes in is how that is said honestly.
    const atHorizon = apparentBrightness(0);
    expect(atHorizon).toBeGreaterThan(0.05);
    expect(atHorizon).toBeLessThan(0.2);
  });

  it('holds most of its strength through the working day', () => {
    // Between mid-morning and mid-afternoon the sun does not visibly
    // change brightness, and the model should not pretend it does.
    expect(apparentBrightness(30)).toBeGreaterThan(0.85);
    expect(apparentBrightness(60)).toBeGreaterThan(0.95);
  });

  it('spends its change in the last few degrees, where the eye does', () => {
    // Half the fall happens below about eight degrees — the hour that
    // actually looks like something.
    expect(apparentBrightness(20) - apparentBrightness(8)).toBeLessThan(
      apparentBrightness(8) - apparentBrightness(0),
    );
  });
});

describe('the moon glows in proportion to what is lit', () => {
  it('is nothing at all when nothing is lit', () => {
    // It used to be `0.12 + 0.4 × lit`, which lit a halo around a new
    // moon — a thing that by definition gives off no light.
    expect(moonGlow(0)).toBe(0);
  });

  it('is linear in the lit fraction', () => {
    expect(moonGlow(0.25)).toBeCloseTo(MOON_GLOW_PEAK * 0.25, 6);
    expect(moonGlow(0.5)).toBeCloseTo(MOON_GLOW_PEAK * 0.5, 6);
    expect(moonGlow(1)).toBeCloseTo(MOON_GLOW_PEAK, 6);
  });

  it('cannot be argued out of range', () => {
    expect(moonGlow(-1)).toBe(0);
    expect(moonGlow(4)).toBe(MOON_GLOW_PEAK);
  });
});

describe('the sun against the moon', () => {
  it('is twice a full moon at its height', () => {
    expect(sunGlow(90) / moonGlow(1)).toBeCloseTo(2, 5);
    expect(SUN_GLOW_PEAK).toBeCloseTo(MOON_GLOW_PEAK * 2, 6);
  });

  it('and still brighter than one when it is low', () => {
    // Not a thing that needed saying until the sun's glow started
    // varying: a sun a few degrees up should not be dimmer than a moon.
    expect(sunGlow(10)).toBeGreaterThan(moonGlow(1));
  });

  it('has a warmer moon than most drawings give it', () => {
    // Moonlight is sunlight off a grey rock and measures near 4100 K —
    // WARMER than sunlight. It reads blue in films because at that light
    // level the eye is on rods, which see no colour at all.
    const [r, g, b] = channels(MOON_SURFACE);
    expect(r).toBeGreaterThanOrEqual(g);
    expect(g).toBeGreaterThan(b);
  });
});

describe('the sky is the reader’s own', () => {
  const noonUtc = (lat: number, lon: number, month: number, day: number) => {
    // Local noon at that longitude, near enough for an altitude check.
    const hour = 12 - lon / 15;
    return new Date(Date.UTC(2026, month, day, Math.floor(hour), 0));
  };

  it('never lets a Stockholm midwinter noon go white', () => {
    // The whole reason the altitude is computed rather than taken from
    // the arc: the sun is DRAWN at the top of its arc at noon wherever
    // you are, and in Stockholm in December the top of that arc is seven
    // degrees. It should be amber all day, because it is.
    const alt = sunAltitude(noonUtc(59.33, 18.07, 11, 21), 59.33, 18.07);
    expect(alt).toBeGreaterThan(4);
    expect(alt).toBeLessThan(10);
    const [, g, b] = channels(tintedBy(SUN_SURFACE, alt));
    expect(b).toBeLessThan(120);
    expect(g).toBeLessThan(215);
  });

  it('and does let an equatorial noon', () => {
    const alt = sunAltitude(noonUtc(-6.21, 106.85, 11, 21), -6.21, 106.85);
    expect(alt).toBeGreaterThan(60);
    const [, , b] = channels(tintedBy(SUN_SURFACE, alt));
    expect(b).toBeGreaterThan(180);
  });
});
