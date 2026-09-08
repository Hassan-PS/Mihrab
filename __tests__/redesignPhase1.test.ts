/**
 * Phase 1 of docs/design/redesign-plan.md — the things that were plainly
 * wrong rather than merely dated. Source-text checks, per repo convention.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('Today', () => {
  const card = read('src/screens/home/TodayCard.tsx');
  const home = read('src/screens/HomeScreen.tsx');
  const panel = read('src/screens/home/DataStatsPanel.tsx');

  it('keeps diagnostics out of the hero and in the data panel', () => {
    expect(card).not.toMatch(/home\.updatedAt|home\.daysStored|dataStatus/);
    expect(home).not.toMatch(/dataStatus|getCacheStatus/);
    expect(panel).toContain("t('dataStats.lastUpdated')");
  });

  it('names the target in sentence case, not an uppercase overline', () => {
    const eyebrow = /heroEyebrow:\s*\{[^}]*\}/.exec(card)?.[0] ?? '';
    expect(eyebrow).not.toContain('uppercase');
    expect(eyebrow).not.toContain('letterSpacing');
  });

  it('marks a logged fact with a ring or a tick, never a cross', () => {
    const summary = read('src/screens/home/TodaySummary.tsx');
    // Rendered glyphs only — the comment that records the old cross may
    // keep it.
    const rendered = summary.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(rendered).not.toContain('✕');
    expect(summary).toContain('fraction={logged / LOGGABLE_PRAYERS}');
    expect(summary).toMatch(/strokeDasharray/);
  });
});

describe('the Quran tab', () => {
  const src = read('src/screens/QuranScreen.tsx');

  it('never shows two "Continue" cards at once', () => {
    // The standalone resume card is for a reader with no khatmah; with one,
    // last-read is a labelled row inside the khatmah card.
    expect(src).toContain('{quran.lastRead && !plan ? (');
    expect(src).toContain("t('quran.lastReadRow'");
  });

  it('has one primary, one secondary and a "more" on the khatmah card', () => {
    const start = src.indexOf('{/* One primary, one secondary');
    const end = src.indexOf('{/* Where the reader actually left off');
    expect(start).toBeGreaterThan(0);
    const actions = src.slice(start, end);
    expect(actions.match(/backgroundColor: palette\.accentSolid/g)).toHaveLength(1);
    expect(actions.match(/backgroundColor: palette\.accentBg/g)).toHaveLength(1);
    expect(actions).toContain("t('quran.khatmahMore'");
    // Two rows of four buttons is what this replaced.
    expect(actions).not.toContain('khatmahPrevDay');
    expect(src).not.toContain('khatmahBtnGhost');
  });

  it('keeps "Previous day" reachable, in the menu', () => {
    const menu = src.slice(src.indexOf('Khatmah reset menu'));
    expect(menu).toContain("t('quran.khatmahPrevDay'");
    expect(menu).toContain('stepKhatmahBack()');
  });

  it('speaks in the accent only — no cyan, no gold on this screen', () => {
    expect(src).not.toMatch(/KHATMAH_COLOR|KHATMAH_EXTRA_COLOR/);
  });
});

describe('Duas', () => {
  const src = read('src/screens/DuasScreen.tsx');
  it('has one way back — the header arrow, pointed at the index', () => {
    expect(src).not.toContain('styles.backRow');
    expect(src).toMatch(/headerLeft: selected\s*\?\s*\(\) => \(\s*<TabBackButton/);
  });
});

describe('the new strings exist in every locale', () => {
  const locales = ['en', 'sv', 'ar', 'bn', 'de', 'es', 'fr', 'hi', 'id', 'ru', 'tr', 'ur', 'zh'];
  it.each(locales)('%s', l => {
    const j = JSON.parse(read(`src/i18n/locales/${l}.json`));
    expect(typeof j.quran.khatmahMore).toBe('string');
    expect(typeof j.quran.khatmahPrevDayHelp).toBe('string');
    expect(j.quran.lastReadRow).toContain('{{page}}');
  });
});
