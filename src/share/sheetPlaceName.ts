import { nearestKnownCityName } from '../prayer/nearestKnownCity';
import { isCoordinateLabel, shortPlaceLabel } from '../widget/shortPlaceLabel';

/**
 * What the shared sheet calls the place its times are for.
 *
 * It printed the coordinates — "59.3293, 18.0686". That is the wrong
 * answer twice over: nobody reading a timetable on a wall can do anything
 * with a decimal degree, and four decimals is about ten metres, which is
 * a poor thing to publish on something made to be passed around.
 *
 * The app already knows the city. Automatic mode reverse-geocodes it into
 * `autoLocationLabel`; a manual location carries the label it was chosen
 * by. Either can arrive as a geocoder's full postal address, so
 * `shortPlaceLabel` takes the locality out of it.
 *
 * ── THE COORDINATE ARRIVES AS THE NAME ────────────────────────────────
 *
 * Which is why the sheet kept printing coordinates anyway. When the
 * reverse geocode fails — offline, the geocoder rate-limiting us, a
 * desktop where it never succeeded once — the city registry writes
 * `"59.33°, 18.07°"` into its entry's `displayName`, that is saved as
 * `autoLocationLabel`, and it arrives here as the city. The fallback
 * below was never reached; it had already been pre-empted by a string
 * that only looked like an answer.
 *
 * So a coordinate-shaped label is read as the absence of a name, and
 * before falling back to coordinates the sheet asks what the nearest
 * listed city is — the app ships coordinates for a couple of hundred of
 * them and can answer offline. Coordinates remain the last resort, at two
 * decimals rather than four: about a kilometre, which is enough to say
 * roughly where and not enough to say whose house.
 */
export function sheetPlaceName(input: {
  manual: boolean;
  manualLabel?: string;
  autoLabel?: string;
  latitude: number;
  longitude: number;
}): string {
  const stored = input.manual ? input.manualLabel : input.autoLabel;
  const city = isCoordinateLabel(stored) ? undefined : shortPlaceLabel(stored);
  if (city) return city;
  const nearest = nearestKnownCityName(input.latitude, input.longitude);
  if (nearest) return nearest;
  return `${input.latitude.toFixed(2)}°, ${input.longitude.toFixed(2)}°`;
}
