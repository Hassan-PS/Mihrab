/**
 * First-run language (v2.8.4).
 *
 * Mihrab used to open in English on every fresh install regardless of the
 * device — `DEFAULT_SETTINGS.language` is 'en' and nothing consulted the
 * system. Now the device's preference list is resolved against the
 * languages we actually ship, ONCE: as soon as a language is stored, the
 * stored value wins and the device is never consulted again.
 */
import { resolveDeviceLanguage } from '../src/i18n/deviceLanguage';

const SUPPORTED = [
  'en',
  'sv',
  'ar',
  'bn',
  'ur',
  'hi',
  'fr',
  'es',
  'de',
  'tr',
  'id',
  'ru',
  'zh',
] as const;

const resolve = (tags: string[]) =>
  resolveDeviceLanguage(SUPPORTED, 'en', tags);

describe('resolveDeviceLanguage', () => {
  it('takes the primary subtag of a regional tag', () => {
    expect(resolve(['sv-SE'])).toBe('sv');
    expect(resolve(['ar-EG'])).toBe('ar');
    expect(resolve(['pt-BR', 'de-AT'])).toBe('de');
  });

  it('accepts the underscore form Android reports', () => {
    expect(resolve(['sv_SE'])).toBe('sv');
    expect(resolve(['zh_Hans_CN'])).toBe('zh');
  });

  it('is case-insensitive', () => {
    expect(resolve(['AR'])).toBe('ar');
    expect(resolve(['Tr-TR'])).toBe('tr');
  });

  it('honours the order of the preference list', () => {
    // iOS hands back an ordered list; the first one we ship wins.
    expect(resolve(['ja-JP', 'ko-KR', 'ur-PK', 'en-US'])).toBe('ur');
  });

  it('falls back when nothing on the device is shipped', () => {
    expect(resolve(['ja-JP', 'ko-KR'])).toBe('en');
    expect(resolve([])).toBe('en');
  });

  it('ignores empty or malformed tags', () => {
    expect(resolve(['', '-', 'fr'])).toBe('fr');
  });
});
