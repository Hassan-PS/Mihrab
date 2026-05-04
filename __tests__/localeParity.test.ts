import * as fs from 'fs';
import * as path from 'path';

/**
 * Locale parity test — task #2.
 *
 * The app ships in 13 locales. Missing keys silently fall back to the key name,
 * which produces broken UI. English fallbacks in non-English files (the zh.json
 * compass a11y bug) silently degrade screen-reader output.
 *
 * This test is the gate that prevents both classes of bug.
 */

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales');
const ALL_LOCALES = [
  'en', 'sv', 'ar', 'bn', 'de', 'es',
  'fr', 'hi', 'id', 'ru', 'tr', 'ur', 'zh',
];

type Translations = Record<string, string>;

function flatten(obj: unknown, prefix = ''): Translations {
  const out: Translations = {};
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return out;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v, key));
    } else if (typeof v === 'string') {
      out[key] = v;
    }
  }
  return out;
}

function loadLocale(name: string): Translations {
  const filePath = path.join(LOCALES_DIR, `${name}.json`);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return flatten(data);
}

/**
 * Keys whose values MUST differ from English in every non-English locale.
 *
 * This list grows as bugs like the zh.json compass a11y drift are found.
 * Reciter names ("Adhan - Abdul Basit"), brand-style strings ("Prayer Times"
 * as app.name), and religious terms commonly kept as transliteration
 * ("Hanafi Asr") are NOT in this list — they may legitimately match English.
 *
 * CLDR plural notes (task #2):
 *   • `month.monthsStored` is currently an orphaned key — defined in all 13
 *     locales but not referenced via t() anywhere. MonthTimesScreen.tsx:277
 *     hardcodes "mo cached" as raw English. Both are candidates for a future
 *     i18n cleanup task.
 *   • `settings.prePrayerReminderOption` and `notifications.prePrayer` use
 *     the "min" abbreviation, where CLDR plural distinction adds no value
 *     (a "1 min" / "5 min" pair reads correctly in any language).
 *   • If a future feature introduces a {{count}} key with a real plural-form
 *     need (e.g., "{{count}} prayers logged today"), use i18next's CLDR
 *     suffix system: `key_one`, `key_other` for most locales; full
 *     `key_zero/_one/_two/_few/_many/_other` for ar; `_one/_few/_many/_other`
 *     for ru. The parity test below should be extended to treat plural
 *     siblings as a single logical key.
 */
const STRICT_TRANSLATE_KEYS = [
  'compass.a11yDialLive',
  'compass.a11yDialChecking',
  'compass.a11yDialUnavailable',
  'compass.a11yNeedleDeg',
  'compass.a11ySignal_good',
  'compass.a11ySignal_weak',
  'compass.a11ySignal_very_weak',
];

const en = loadLocale('en');
const enKeys = new Set(Object.keys(en));

describe('locale key parity', () => {
  for (const locale of ALL_LOCALES) {
    if (locale === 'en') continue;

    test(`${locale}.json has every key from en.json`, () => {
      const data = loadLocale(locale);
      const keys = new Set(Object.keys(data));
      const missing = [...enKeys].filter(k => !keys.has(k)).sort();
      expect(missing).toEqual([]);
    });

    test(`${locale}.json has no keys that are absent from en.json`, () => {
      const data = loadLocale(locale);
      const keys = new Set(Object.keys(data));
      const extra = [...keys].filter(k => !enKeys.has(k)).sort();
      expect(extra).toEqual([]);
    });
  }
});

describe('locale strict-translate keys (no English fallbacks)', () => {
  for (const locale of ALL_LOCALES) {
    if (locale === 'en') continue;

    test(`${locale}.json translates all accessibility-critical keys`, () => {
      const data = loadLocale(locale);
      const fallbacks: string[] = [];
      for (const key of STRICT_TRANSLATE_KEYS) {
        if (data[key] !== undefined && data[key] === en[key]) {
          fallbacks.push(`${key} = "${data[key]}"`);
        }
      }
      expect(fallbacks).toEqual([]);
    });
  }
});

describe('locale value validity', () => {
  for (const locale of ALL_LOCALES) {
    test(`${locale}.json values are valid strings (intentionally-empty keys allowed)`, () => {
      // Empty values are allowed only if the same key is also empty in en.json
      // (the canonical source). E.g., settings.adhanPreviewBody is intentionally
      // empty everywhere because the notification API uses a defaultValue.
      const data = loadLocale(locale);
      const unexpectedEmpty: string[] = [];
      for (const [k, v] of Object.entries(data)) {
        if (typeof v !== 'string') {
          unexpectedEmpty.push(`${k} (non-string)`);
          continue;
        }
        if (v.trim().length === 0 && en[k] !== '' && en[k] !== undefined) {
          unexpectedEmpty.push(`${k} (empty but en.json has "${en[k]}")`);
        }
      }
      expect(unexpectedEmpty).toEqual([]);
    });

    test(`${locale}.json has no leftover TODO_TRANSLATE markers`, () => {
      const data = loadLocale(locale);
      const todos: string[] = [];
      for (const [k, v] of Object.entries(data)) {
        if (v.startsWith('TODO_TRANSLATE:')) todos.push(k);
      }
      expect(todos).toEqual([]);
    });
  }
});

describe('locale interpolation parity', () => {
  // If en.json says "in {{time}}", the same {{time}} placeholder must appear
  // in every locale — otherwise the app shows literal "{{time}}" to users.
  function extractPlaceholders(value: string): string[] {
    const re = /\{\{(\w+)\}\}/g;
    const out = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(value)) !== null) out.add(m[1]);
    return [...out].sort();
  }

  for (const locale of ALL_LOCALES) {
    if (locale === 'en') continue;

    test(`${locale}.json placeholders match en.json`, () => {
      const data = loadLocale(locale);
      const mismatches: string[] = [];
      for (const [k, enVal] of Object.entries(en)) {
        const enPh = extractPlaceholders(enVal);
        if (enPh.length === 0) continue;
        const localeVal = data[k];
        if (localeVal === undefined) continue; // missing-key test catches this
        const locPh = extractPlaceholders(localeVal);
        if (JSON.stringify(enPh) !== JSON.stringify(locPh)) {
          mismatches.push(
            `${k}: en has [${enPh.join(', ')}], ${locale} has [${locPh.join(', ')}]`
          );
        }
      }
      expect(mismatches).toEqual([]);
    });
  }
});
