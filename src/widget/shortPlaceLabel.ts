/**
 * The widest thing a widget can say about where you are is a city.
 *
 * A saved location carries whatever the geocoder called the place, and
 * Nominatim's `display_name` is a full postal address — "Stockholm, Stockholm
 * Municipality, Stockholm County, 111 29, Sweden". In the app that is a
 * subtitle under a short title, so nobody notices. On a widget it is one line
 * of roughly sixteen characters, and every family renders it as
 * "STOCKHOLM, STOCKHO…": the city named twice and neither one finished.
 *
 * The first comma-separated segment is the locality in all three geocoders the
 * app reads (Nominatim reverse, Nominatim search, Photon), so that is what the
 * widget and the Live Activity get. A label with no comma is already something
 * short enough that a person chose it.
 */

/**
 * The offline fallback label — `59.33°, 18.07°`. It contains a comma and its
 * first segment is half a coordinate, which is worse than the whole thing.
 */
const COORD_LABEL = /^-?\d+(\.\d+)?\s*°\s*,\s*-?\d+(\.\d+)?\s*°$/;

export function shortPlaceLabel(
  label: string | undefined,
): string | undefined {
  if (label == null) return undefined;
  const trimmed = label.trim();
  if (!trimmed) return undefined;
  if (COORD_LABEL.test(trimmed)) return trimmed;
  const first = trimmed.split(',')[0]?.trim() ?? '';
  return first || trimmed;
}
