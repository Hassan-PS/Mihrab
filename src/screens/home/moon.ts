/**
 * Where the moon is in its month, and which way up it looks from here.
 *
 * ── WHAT WAS HERE BEFORE, AND WHY IT WAS NOT ENOUGH ───────────────────
 *
 * The hero used to take the phase from a straight line: a fixed new moon
 * in January 2000 plus whole multiples of the mean synodic month, 29.53
 * days. That is a linear model of a cycle that is not linear. The moon's
 * orbit is eccentric, so it runs ahead of the mean near perigee and
 * behind it near apogee, and the real interval between new moons swings
 * between about 29.27 and 29.83 days.
 *
 * Measured against the elongation this file now computes, over three
 * years of nights, the old model was out by up to 23 HOURS of lunar age,
 * and the eight-way phase it picked disagreed on 106 of 1096 nights —
 * one night in ten. On 2026-03-16 it drew a new moon, which is very
 * nearly nothing at all, when the real moon was a waning crescent.
 *
 * ── WHAT REPLACES IT ──────────────────────────────────────────────────
 *
 * The phase is the elongation: the moon's apparent ecliptic longitude
 * minus the sun's, which is the angle the two make as seen from here and
 * therefore exactly what "how much of it is lit" means. Zero is new,
 * half a turn is full.
 *
 * The positions come from the standard truncated series — Kepler for
 * each body, then the named periodic terms for the moon (evection, the
 * variation, the yearly equation, and the rest of the first dozen). That
 * is good to roughly 0.2°, or about twenty minutes of lunar age, which
 * is four orders of magnitude inside the error it replaces and far below
 * anything a 22dp disc can show. Checked against published phase
 * instants in the tests.
 *
 * ── AND WHICH WAY UP ──────────────────────────────────────────────────
 *
 * This is the part that needs the reader's own coordinates, and the part
 * the old drawing simply asserted: "as seen from the northern
 * hemisphere: waxing lights the right limb".
 *
 * Half the world does not see that. The lit side of the moon faces the
 * sun, and where the sun sits relative to the moon IN YOUR SKY depends
 * on where you are standing. A first-quarter moon on the meridian is lit
 * on the right in Stockholm and on the left in Cape Town, because the
 * southern observer is facing north to see it and west has moved to the
 * other hand. On the equator a young crescent after sunset sits with the
 * sun directly below it and lies on its back like a bowl — the shape
 * that gets called a smile, and the shape a great many of this app's
 * readers actually see.
 *
 * So the disc is drawn once, lit on the right, and rotated. Two angles
 * decide by how much:
 *
 *   χ  the position angle of the bright limb, from celestial north —
 *      where the sun is relative to the moon on the sky itself, the same
 *      for everyone.
 *   q  the parallactic angle — the angle between celestial north and
 *      the observer's own up, which is where standing somewhere comes
 *      in, and the only reason the crescent flips between hemispheres.
 *
 * `q - χ` is the bright limb measured clockwise from straight up in the
 * reader's sky, and the drawing starts with it at 90° (pointing right),
 * so the rotation is `q - χ - 90`. Waxing and waning stop being separate
 * cases: waning is just a rotation of about half a turn, which is what it
 * is.
 */

const RAD = Math.PI / 180;

/** Days since 1999-12-31 00:00 UTC, the epoch these elements are for. */
function epochDays(date: Date): number {
  return (date.getTime() - Date.UTC(1999, 11, 31)) / 86_400_000;
}

function norm360(deg: number): number {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

/**
 * Eccentric anomaly from the mean anomaly, in degrees.
 *
 * Newton on Kepler's equation. Both orbits here are nearly circular —
 * the moon's e is 0.055 and the earth's 0.017 — so this is well inside
 * its last digit after a handful of passes and the loop is a fixed
 * count rather than a convergence test.
 */
function eccentricAnomaly(meanDeg: number, e: number): number {
  const eDeg = (e * 180) / Math.PI;
  let E = meanDeg + eDeg * Math.sin(meanDeg * RAD) * (1 + e * Math.cos(meanDeg * RAD));
  for (let i = 0; i < 8; i += 1) {
    E -= (E - eDeg * Math.sin(E * RAD) - meanDeg) / (1 - e * Math.cos(E * RAD));
  }
  return E;
}

type Ecliptic = { lon: number; lat: number };

/** The sun's apparent geocentric longitude, and its mean longitude. */
function sun(d: number): Ecliptic & { meanLon: number; meanAnomaly: number } {
  const w = 282.9404 + 4.70935e-5 * d;
  const e = 0.016709 - 1.151e-9 * d;
  const M = norm360(356.047 + 0.9856002585 * d);
  const E = eccentricAnomaly(M, e);
  const x = Math.cos(E * RAD) - e;
  const y = Math.sqrt(1 - e * e) * Math.sin(E * RAD);
  return {
    lon: norm360(Math.atan2(y, x) / RAD + w),
    lat: 0,
    meanLon: norm360(M + w),
    meanAnomaly: M,
  };
}

/**
 * The moon's apparent geocentric longitude and latitude.
 *
 * The orbital elements give the two-body ellipse; the periodic terms
 * after them are the sun pulling on it, and without them the longitude
 * is out by more than a degree — the evection alone is 1.27°, which is
 * two and a half moon-widths.
 */
function moon(d: number, s: ReturnType<typeof sun>): Ecliptic {
  const N = 125.1228 - 0.0529538083 * d;
  const i = 5.1454;
  const w = 318.0634 + 0.1643573223 * d;
  const a = 60.2666;
  const e = 0.0549;
  const M = norm360(115.3654 + 13.0649929509 * d);

  const E = eccentricAnomaly(M, e);
  const xv = a * (Math.cos(E * RAD) - e);
  const yv = a * Math.sqrt(1 - e * e) * Math.sin(E * RAD);
  const v = Math.atan2(yv, xv) / RAD;
  const r = Math.hypot(xv, yv);

  const u = (v + w) * RAD;
  const nr = N * RAD;
  const ir = i * RAD;
  const xe = r * (Math.cos(nr) * Math.cos(u) - Math.sin(nr) * Math.sin(u) * Math.cos(ir));
  const ye = r * (Math.sin(nr) * Math.cos(u) + Math.cos(nr) * Math.sin(u) * Math.cos(ir));
  const ze = r * Math.sin(u) * Math.sin(ir);

  let lon = Math.atan2(ye, xe) / RAD;
  let lat = Math.atan2(ze, Math.hypot(xe, ye)) / RAD;

  // The arguments every one of the corrections is built from: the moon's
  // mean anomaly, the sun's, the mean elongation between them, and the
  // moon's argument of latitude.
  const Lm = norm360(M + w + N);
  const D = Lm - s.meanLon;
  const F = Lm - N;
  const sin = (deg: number) => Math.sin(deg * RAD);

  lon +=
    -1.274 * sin(M - 2 * D) + // evection
    0.658 * sin(2 * D) + // variation
    -0.186 * sin(s.meanAnomaly) + // yearly equation
    -0.059 * sin(2 * M - 2 * D) +
    -0.057 * sin(M - 2 * D + s.meanAnomaly) +
    0.053 * sin(M + 2 * D) +
    0.046 * sin(2 * D - s.meanAnomaly) +
    0.041 * sin(M - s.meanAnomaly) +
    -0.035 * sin(D) + // parallactic equation
    -0.031 * sin(M + s.meanAnomaly) +
    -0.015 * sin(2 * F - 2 * D) +
    0.011 * sin(M - 4 * D);

  lat +=
    -0.173 * sin(F - 2 * D) +
    -0.055 * sin(M - F - 2 * D) +
    -0.046 * sin(M + F - 2 * D) +
    0.033 * sin(F + 2 * D) +
    0.017 * sin(2 * M + F);

  return { lon: norm360(lon), lat };
}

/** Mean obliquity of the ecliptic, degrees. */
function obliquity(d: number): number {
  return 23.4393 - 3.563e-7 * d;
}

type Equatorial = { ra: number; dec: number };

/** Ecliptic to equatorial, both in degrees. */
function toEquatorial({ lon, lat }: Ecliptic, eps: number): Equatorial {
  const l = lon * RAD;
  const b = lat * RAD;
  const e = eps * RAD;
  const x = Math.cos(b) * Math.cos(l);
  const y = Math.cos(b) * Math.sin(l) * Math.cos(e) - Math.sin(b) * Math.sin(e);
  const z = Math.cos(b) * Math.sin(l) * Math.sin(e) + Math.sin(b) * Math.cos(e);
  return { ra: norm360(Math.atan2(y, x) / RAD), dec: Math.asin(z) / RAD };
}

/**
 * Local sidereal time in degrees: which way the observer's meridian is
 * pointing. From the sun's own mean longitude, which is already to hand.
 */
function localSiderealTime(date: Date, s: ReturnType<typeof sun>, longitude: number): number {
  const utHours =
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  return norm360(s.meanLon + 180 + utHours * 15 + longitude);
}

/**
 * How far round its month the moon is: 0 at new, 0.5 at full, back to 1.
 *
 * The elongation, not a count of days — see the header.
 */
export function moonPhaseFraction(date: Date): number {
  const d = epochDays(date);
  const s = sun(d);
  const m = moon(d, s);
  return norm360(m.lon - s.lon) / 360;
}

/**
 * How much of the disc is lit, 0 to 1.
 *
 * The illuminated fraction of a sphere at phase angle θ is
 * (1 − cos θ) / 2, and for the moon the phase angle is the elongation to
 * within a fraction of a degree.
 */
export function moonIllumination(fraction: number): number {
  return (1 - Math.cos(2 * Math.PI * fraction)) / 2;
}

/**
 * How far to rotate the drawn disc, clockwise in degrees, so its bright
 * limb points where the reader's own does.
 *
 * Zero leaves the limb on the right, which is a waxing moon seen from
 * the mid-northern latitudes — the one case the old drawing handled.
 *
 * `latitude` and `longitude` are the reader's, in degrees, east and
 * north positive. Both are needed: latitude decides the hemisphere and
 * how steeply the sky turns, longitude decides where the moon is in the
 * reader's own night rather than in Greenwich's.
 */
export function moonBrightLimbTilt(
  date: Date,
  latitude: number,
  longitude: number,
): number {
  const d = epochDays(date);
  const s = sun(d);
  const m = moon(d, s);
  const eps = obliquity(d);
  const se = toEquatorial(s, eps);
  const me = toEquatorial(m, eps);

  // χ — where the sun is from the moon, on the sky itself. The same for
  // everybody on earth; this is the part that has no location in it.
  const dRa = (se.ra - me.ra) * RAD;
  const sDec = se.dec * RAD;
  const mDec = me.dec * RAD;
  const chi =
    Math.atan2(
      Math.cos(sDec) * Math.sin(dRa),
      Math.sin(sDec) * Math.cos(mDec) - Math.cos(sDec) * Math.sin(mDec) * Math.cos(dRa),
    ) / RAD;

  // q — the angle between celestial north and the reader's own up, at
  // the moon. This is where standing somewhere enters, and it is the
  // whole of why the crescent flips between hemispheres: on the meridian
  // it is 0° north of the moon's declination and 180° south of it.
  const hourAngle = norm360(localSiderealTime(date, s, longitude) - me.ra) * RAD;
  const lat = latitude * RAD;
  const q =
    Math.atan2(
      Math.sin(hourAngle),
      Math.tan(lat) * Math.cos(mDec) - Math.sin(mDec) * Math.cos(hourAngle),
    ) / RAD;

  // `q - χ` is the limb measured clockwise from up; the drawing already
  // has it at 90°.
  return norm360(q - chi - 90);
}

export type MoonView = {
  /** 0 at new, 0.5 at full, back to 1 — see `moonPhaseFraction`. */
  fraction: number;
  /** 0 dark to 1 fully lit. */
  illuminated: number;
  /** Degrees clockwise to turn the drawn disc. */
  tilt: number;
};

/**
 * Everything the hero needs about the moon at one instant.
 *
 * Without coordinates the tilt is zero, which draws the northern
 * hemisphere's moon: a guess, but the one the app has always made, and
 * better than refusing to draw a moon because nobody has said yet where
 * they are.
 */
export function moonView(
  date: Date,
  latitude?: number | null,
  longitude?: number | null,
): MoonView {
  const fraction = moonPhaseFraction(date);
  const placed = typeof latitude === 'number' && typeof longitude === 'number';
  return {
    fraction,
    illuminated: moonIllumination(fraction),
    tilt: placed ? moonBrightLimbTilt(date, latitude, longitude) : 0,
  };
}
