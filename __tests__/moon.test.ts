/**
 * The moon in the hero: what phase it is, and which way up.
 *
 * ── WHAT WENT WRONG BEFORE ────────────────────────────────────────────
 *
 * The old model was a straight line — a new moon in 2000 plus whole mean
 * synodic months — and the only test on it checked three dates in
 * January 2024. All three passed. The model was still out by up to 23
 * hours of lunar age and drew the wrong one of the eight phases on one
 * night in ten, because three spot dates cannot see a drift that comes
 * and goes over a month.
 *
 * So these check the SHAPE of the answer as well as its value: that the
 * month is the length it really is and varies the way it really varies,
 * that the crescent turns over between hemispheres, and that it lies on
 * its back on the equator. Those are things a broken model fails and a
 * lucky date cannot rescue.
 */
import {
  moonBrightLimbTilt,
  moonIllumination,
  moonPhaseFraction,
  moonView,
} from '../src/screens/home/moon';

const utc = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(Date.UTC(y, m, d, h, min));

/** Lunar age error, in hours, against a phase this instant should be. */
function hoursOff(date: Date, want: number): number {
  let d = moonPhaseFraction(date) - want;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return Math.abs(d) * 29.530588853 * 24;
}

describe('what phase it is', () => {
  it('lands on published phase instants within minutes', () => {
    // The old mean model was 3.7 h, 13.6 h and 8.7 h out on these same
    // three, and passed its test anyway because none of the errors
    // happened to cross one of the eight boundaries.
    expect(hoursOff(utc(2024, 0, 11, 11, 57), 0)).toBeLessThan(0.5);
    expect(hoursOff(utc(2024, 0, 18, 3, 52), 0.25)).toBeLessThan(0.5);
    expect(hoursOff(utc(2024, 0, 25, 17, 54), 0.5)).toBeLessThan(0.5);
  });

  it('runs new → full → new, in order, once a month', () => {
    const days = [0, 7, 14, 22].map(d => moonPhaseFraction(utc(2024, 0, 11 + d, 12)));
    // Noon on the 11th is within minutes of new, and the model puts that
    // new moon a few minutes the other side of noon — so the reading is
    // just short of a full turn rather than just past zero. Distance
    // round the circle, not distance along the number line.
    expect(Math.min(days[0], 1 - days[0])).toBeLessThan(0.05);
    expect(days[1]).toBeGreaterThan(0.2);
    expect(days[1]).toBeLessThan(0.3);
    expect(days[2]).toBeGreaterThan(0.45);
    expect(days[2]).toBeLessThan(0.55);
    expect(days[3]).toBeGreaterThan(0.7);
    expect(days[3]).toBeLessThan(0.8);
  });

  it('has a month that varies the way the real one does', () => {
    // THE test that the old model could never have passed. A mean model
    // gives 29.5306 days between every pair of new moons, always. The
    // real interval swings between about 29.27 and 29.83 as the moon
    // runs ahead of the mean near perigee and behind it near apogee —
    // which is the whole reason the old one drifted by most of a day.
    const newMoons: number[] = [];
    let prev = moonPhaseFraction(utc(2026, 0, 1));
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2029, 0, 1); t += 3_600_000) {
      const f = moonPhaseFraction(new Date(t));
      if (f < prev) newMoons.push(t);
      prev = f;
    }
    const gaps = newMoons.slice(1).map((t, i) => (t - newMoons[i]) / 86_400_000);
    expect(gaps.length).toBeGreaterThan(30);
    expect(Math.min(...gaps)).toBeLessThan(29.4);
    expect(Math.max(...gaps)).toBeGreaterThan(29.7);
    // …and still averages the synodic month, so the spread is the moon's
    // and not an accumulating error.
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    expect(mean).toBeGreaterThan(29.4);
    expect(mean).toBeLessThan(29.65);
  });

  it('never leaves the circle', () => {
    for (let t = Date.UTC(2020, 0, 1); t < Date.UTC(2030, 0, 1); t += 97 * 3_600_000) {
      const f = moonPhaseFraction(new Date(t));
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });
});

describe('how much of it is lit', () => {
  it('is none at new, all at full, half at the quarters', () => {
    expect(moonIllumination(0)).toBeCloseTo(0, 6);
    expect(moonIllumination(0.25)).toBeCloseTo(0.5, 6);
    expect(moonIllumination(0.5)).toBeCloseTo(1, 6);
    expect(moonIllumination(0.75)).toBeCloseTo(0.5, 6);
  });

  it('is symmetric about full — waxing and waning look alike', () => {
    for (const f of [0.05, 0.17, 0.3, 0.44]) {
      expect(moonIllumination(f)).toBeCloseTo(moonIllumination(1 - f), 9);
    }
  });
});

/**
 * The tilt is reported as degrees clockwise to turn a disc that starts
 * lit on its right, so the bright limb ends up `tilt + 90` clockwise
 * from straight up in the reader's sky.
 */
describe('which way up it is', () => {
  const limb = (tilt: number) => (tilt + 90) % 360;
  const points = (tilt: number): 'up' | 'right' | 'down' | 'left' => {
    const a = limb(tilt);
    if (a < 45 || a >= 315) return 'up';
    if (a < 135) return 'right';
    if (a < 225) return 'down';
    return 'left';
  };

  /**
   * A first quarter moon transits around six in the evening, so this
   * longitude puts it on the meridian at the moment it is exactly half
   * lit — the one configuration whose answer is known without any
   * computation at all.
   */
  const FIRST_QUARTER = utc(2024, 0, 18, 3, 52);
  const MERIDIAN_LON = (18 - (3 + 52 / 60)) * 15 - 360;

  it('lights the right limb in the north and the left in the south', () => {
    // Face south from Stockholm to see it and west is on your right;
    // face north from its mirror and west has moved to your left. Same
    // moon, same instant, turned over. This is the half of the world the
    // old drawing did not draw.
    expect(points(moonBrightLimbTilt(FIRST_QUARTER, 59.3, MERIDIAN_LON))).toBe('right');
    expect(points(moonBrightLimbTilt(FIRST_QUARTER, -59.3, MERIDIAN_LON))).toBe('left');
  });

  it('lays the young crescent on its back at the equator', () => {
    // Just after sunset the sun is directly below a two-day moon, so the
    // lit limb points down and the crescent is the bowl — the shape a
    // great many readers of this app actually see, and the one a
    // northern-hemisphere drawing gets most wrong.
    const evening = utc(2024, 0, 13, 18, 20);
    expect(moonIllumination(moonPhaseFraction(evening))).toBeLessThan(0.12);
    expect(points(moonBrightLimbTilt(evening, 0, 0))).toBe('down');
  });

  it('turns steadily from north to south, without a jump at the equator', () => {
    // The tilt is a continuous thing, not a hemisphere flag: Nairobi is
    // not Stockholm-with-a-switch. Walking the latitudes should walk the
    // angle round with them.
    const evening = utc(2024, 0, 13, 18, 20);
    const tilts = [59.3, 30, 15, 0, -15, -30, -59.3].map(lat =>
      moonBrightLimbTilt(evening, lat, 0),
    );
    for (let i = 1; i < tilts.length; i += 1) {
      expect(tilts[i]).toBeGreaterThan(tilts[i - 1]);
    }
  });

  it('drifts smoothly across a night rather than jumping', () => {
    // The moon really does turn as it crosses the sky, so the drawn one
    // should too — but by a degree or two between redraws, not by a
    // quadrant. A wrapped angle would show up here as a huge step.
    let previous: number | null = null;
    let biggest = 0;
    for (let t = Date.UTC(2026, 8, 13, 16); t <= Date.UTC(2026, 8, 14, 6); t += 600_000) {
      const now = moonBrightLimbTilt(new Date(t), 59.33, 18.07);
      if (previous !== null) {
        let step = Math.abs(now - previous);
        if (step > 180) step = 360 - step;
        biggest = Math.max(biggest, step);
      }
      previous = now;
    }
    expect(biggest).toBeLessThan(5);
  });

  it('actually depends on where the reader is', () => {
    // The guard against the whole feature quietly becoming a constant.
    const t = utc(2026, 8, 13, 20);
    const here = moonBrightLimbTilt(t, 59.33, 18.07);
    expect(Math.abs(moonBrightLimbTilt(t, -6.21, 106.85) - here)).toBeGreaterThan(45);
    expect(Math.abs(moonBrightLimbTilt(t, -33.87, 151.21) - here)).toBeGreaterThan(45);
  });

  it('stays a legal rotation', () => {
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 37 * 3_600_000) {
      for (const [lat, lon] of [
        [59.33, 18.07],
        [-33.92, 18.42],
        [0, 0],
        [21.42, 39.83],
        [89, -179],
      ]) {
        const v = moonBrightLimbTilt(new Date(t), lat, lon);
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(360);
      }
    }
  });
});

describe('what the hero asks for', () => {
  it('bundles the phase, the light and the tilt', () => {
    const v = moonView(utc(2024, 0, 25, 17, 54), 59.33, 18.07);
    expect(v.fraction).toBeCloseTo(0.5, 2);
    expect(v.illuminated).toBeGreaterThan(0.99);
    expect(Number.isFinite(v.tilt)).toBe(true);
  });

  it('falls back to the northern hemisphere when nobody has said where', () => {
    // Before a location is set there is no honest tilt, and a moon drawn
    // the way the app always drew it beats no moon at all.
    expect(moonView(utc(2024, 0, 18, 3, 52)).tilt).toBe(0);
    expect(moonView(utc(2024, 0, 18, 3, 52), null, null).tilt).toBe(0);
    expect(moonView(utc(2024, 0, 18, 3, 52), 59.33, undefined).tilt).toBe(0);
  });
});
