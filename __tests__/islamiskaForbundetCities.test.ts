import { matchIslamiskaForbundetCity } from '../src/providers/islamiskaForbundetCities';

describe('Sweden city list matching', () => {
  it('matches Sundsvall and canonical spelling', () => {
    expect(matchIslamiskaForbundetCity('Sundsvall')).toBe('Sundsvall');
    expect(matchIslamiskaForbundetCity('sundsvall')).toBe('Sundsvall');
    expect(
      matchIslamiskaForbundetCity('Sundsvall, Västernorrlands län, Sweden'),
    ).toBe('Sundsvall');
  });

  it('strips kommun and matches Göteborg', () => {
    expect(matchIslamiskaForbundetCity('Göteborgs kommun')).toBe('Göteborg');
    expect(matchIslamiskaForbundetCity('Gothenburg')).toBeUndefined();
  });
});
