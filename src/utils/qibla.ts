/** Kaaba approximate coordinates (degrees). */
const KAABA_LAT = 21.422487;
const KAABA_LNG = 39.826206;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Initial great-circle bearing from (lat, lng) toward the Kaaba, in degrees
 * clockwise from true north (0–360).
 */
export function qiblaBearingFrom(latitude: number, longitude: number): number {
  const φ1 = toRad(latitude);
  const φ2 = toRad(KAABA_LAT);
  const Δλ = toRad(KAABA_LNG - longitude);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  let θ = toDeg(Math.atan2(y, x));
  θ = (θ + 360) % 360;
  return θ;
}

export function normalizeHeadingDeg(deg: number): number {
  let d = deg % 360;
  if (d < 0) {
    d += 360;
  }
  return d;
}
