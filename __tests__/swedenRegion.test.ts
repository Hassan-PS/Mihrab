import { isCoordinateInSweden } from '../src/utils/swedenRegion';

describe('isCoordinateInSweden', () => {
  it('includes Sundsvall and Stockholm', () => {
    expect(isCoordinateInSweden(62.39, 17.31)).toBe(true);
    expect(isCoordinateInSweden(59.33, 18.07)).toBe(true);
  });

  it('excludes Oslo and Copenhagen areas', () => {
    expect(isCoordinateInSweden(59.91, 10.75)).toBe(false);
    expect(isCoordinateInSweden(55.676, 12.57)).toBe(false);
  });
});
