/**
 * A pinned national source outside its country is REDIRECTED, and that
 * has to be visible.
 *
 * `getEffectiveDataProvider` has always sent Sweden-in-Cairo to the
 * worldwide default rather than map Cairo to the nearest Swedish city —
 * the right call, and for a long time a completely silent one: the
 * settings row said Sweden and the times were AlAdhan's, and nothing
 * anywhere put the two together. These are the assertions that keep the
 * telling attached to the redirect.
 */
import fs from 'fs';
import path from 'path';
import {
  AUTO_DEFAULT_OUTSIDE_SWEDEN,
  getEffectiveDataProvider,
} from '../src/settings/effectiveProvider';

const REPO = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf-8');

const STOCKHOLM = { latitude: 59.33, longitude: 18.07 };
const CAIRO = { latitude: 30.04, longitude: 31.24 };

describe('a national source picked from outside its country', () => {
  it('is redirected to the worldwide default', () => {
    expect(
      getEffectiveDataProvider(false, 'islamiska_forbundet', CAIRO),
    ).toBe(AUTO_DEFAULT_OUTSIDE_SWEDEN);
  });

  it('is honoured inside it', () => {
    expect(
      getEffectiveDataProvider(false, 'islamiska_forbundet', STOCKHOLM),
    ).toBe('islamiska_forbundet');
  });

  /**
   * With no coordinates the pick stands. Redirecting on "we don't know
   * yet" would move someone off their own country's source every cold
   * start, before location has loaded.
   */
  it('is left alone while the location is unknown', () => {
    expect(getEffectiveDataProvider(false, 'islamiska_forbundet', null)).toBe(
      'islamiska_forbundet',
    );
  });
});

describe('the settings row', () => {
  const card = read('src/screens/settings/DataSourceCard.tsx');

  it('names the source that is actually answering, not the pinned one', () => {
    expect(card).toMatch(/const overridden =/);
    expect(card).toMatch(/effectiveProvider !== settings\.dataProvider/);
    expect(card).toMatch(
      /getProviderLabel\(\s*overridden \? effectiveProvider : settings\.dataProvider,?\s*\)/,
    );
  });

  it('says why', () => {
    expect(card).toMatch(/settings\.providerOverridden/);
  });
});

describe('the picker', () => {
  const picker = read('src/components/ProviderPickerModal.tsx');

  it('knows where the user is', () => {
    expect(picker).toMatch(/resolveCoordsFromSettings\(settings\)/);
  });

  it('marks the one that fits', () => {
    expect(picker).toMatch(/provider\.bestHere/);
    // The mark follows the same resolution the app itself uses, rather
    // than a second copy of the country rules living in the UI.
    expect(picker).toMatch(/getEffectiveDataProvider\(true,/);
  });

  it('warns on the national sources that have nothing for here', () => {
    expect(picker).toMatch(/provider\.outOfRegion/);
    expect(picker).toMatch(/isRegionalProvider\(item\.id\)/);
    expect(picker).toMatch(/!regionalProviderCovers\(item\.id, coords\)/);
  });
});

describe('every locale', () => {
  const langs = fs
    .readdirSync(path.join(REPO, 'src/i18n/locales'))
    .filter(f => f.endsWith('.json'));

  it('carries the new strings', () => {
    for (const f of langs) {
      const d = JSON.parse(read(path.join('src/i18n/locales', f)));
      expect(typeof d.provider.bestHere).toBe('string');
      expect(typeof d.provider.outOfRegion).toBe('string');
      expect(typeof d.provider.autoNow).toBe('string');
      expect(typeof d.settings.providerOverridden).toBe('string');
      // The interpolations have to survive translation or the sentence
      // loses the thing it is about.
      expect(d.provider.outOfRegion).toContain('{{fallback}}');
      expect(d.provider.autoNow).toContain('{{label}}');
      expect(d.settings.providerOverridden).toContain('{{picked}}');
      expect(d.settings.providerOverridden).toContain('{{used}}');
    }
  });
});
