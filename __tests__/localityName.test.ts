/**
 * One place, one name.
 *
 * Reported from an emulator sitting in Casablanca: the home screen read
 *
 *     Casablanca ⵜⵓⵏⵏⵓⵄⵜ ⵜⵖ…
 *
 * Latin followed by Tifinagh, truncated mid-word into nonsense. The cause
 * was that `reverseLocality` asked Nominatim for a place name and never
 * said in WHICH LANGUAGE, so OpenStreetMap answered with the object's raw
 * `name` tag — and in Morocco, where Tamazight is an official language,
 * that tag routinely carries several scripts at once.
 *
 * The fix is mostly at the source: ask in the app's own language, then
 * French, then English. This tests the second half — the compounds that
 * survive it, because some OSM objects are simply tagged that way.
 */
import { cleanLocalityName } from '../src/geocoding/nominatim';

describe('names that arrive in more than one script', () => {
  it('drops a Tifinagh tail', () => {
    expect(cleanLocalityName('Casablanca ⵜⵓⵏⵏⵓⵄⵜ ⵜⵖⵔⵎⵜ')).toBe('Casablanca');
    expect(cleanLocalityName('Agadir ⴰⴳⴰⴷⵉⵔ')).toBe('Agadir');
  });

  it('keeps the first of a slash-separated pair', () => {
    expect(cleanLocalityName('Casablanca / الدار البيضاء')).toBe('Casablanca');
    expect(cleanLocalityName('Nador – الناظور')).toBe('Nador');
  });

  it('leaves an ordinary name alone', () => {
    for (const name of ['Stockholm', 'Rabat', 'الدار البيضاء', 'Ouarzazate', 'İstanbul']) {
      expect(cleanLocalityName(name)).toBe(name);
    }
  });

  it('keeps names that merely contain punctuation', () => {
    // A hyphen inside a name is not a separator between two names.
    expect(cleanLocalityName('Sidi Bel-Abbès')).toBe('Sidi Bel-Abbès');
    expect(cleanLocalityName("Sidi M'Barek")).toBe("Sidi M'Barek");
  });

  it('never returns nothing', () => {
    // A name written ENTIRELY in a script we strip would otherwise empty
    // out, and a blank label is worse than an unfamiliar one.
    expect(cleanLocalityName('ⵜⵉⵎⵣⴳⵉⴷⴰ')).toBe('ⵜⵉⵎⵣⴳⵉⴷⴰ');
    expect(cleanLocalityName('  Fès  ')).toBe('Fès');
  });
});
