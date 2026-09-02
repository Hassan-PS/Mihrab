import { shortPlaceLabel } from '../widget/shortPlaceLabel';

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
 * Coordinates stay as the last resort — a fix has landed but no name has
 * — and at two decimals rather than four, which is about a kilometre:
 * enough to say roughly where, not enough to say whose house.
 */
export function sheetPlaceName(input: {
  manual: boolean;
  manualLabel?: string;
  autoLabel?: string;
  latitude: number;
  longitude: number;
}): string {
  const city = shortPlaceLabel(
    input.manual ? input.manualLabel : input.autoLabel,
  );
  if (city) return city;
  return `${input.latitude.toFixed(2)}°, ${input.longitude.toFixed(2)}°`;
}
