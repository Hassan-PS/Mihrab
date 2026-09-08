/**
 * Phase 2 of docs/design/redesign-plan.md — type and labels. Uppercase
 * letterspaced overlines were the loudest dated signal in the app; the
 * `label` token replaces them. Tables and the exported share image keep
 * their caps, and nothing else does.
 */
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { TYPE } from '../src/theme/typography';

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const ALLOWED_UPPERCASE = new Set([
  'src/screens/month/MonthTable.tsx', // column heads of a dense numeric table
  'src/quran/mushaf/ShareAyahModal.tsx', // the wordmark on an exported image
]);

describe('uppercase overlines', () => {
  it('survive only where caps have a job', () => {
    const out = execSync(
      "grep -rl \"textTransform: 'uppercase'\" src || true",
      { cwd: ROOT, encoding: 'utf8' },
    );
    const files = out.split('\n').filter(Boolean);
    const stray = files.filter(f => !ALLOWED_UPPERCASE.has(f));
    expect(stray).toEqual([]);
  });

  it('left no positive letterspacing behind on the labels they were', () => {
    // A label that lost its caps but kept its tracking reads as neither.
    for (const f of [
      'src/screens/settings/SettingsGroup.tsx',
      'src/screens/settings/sharedStyles.ts',
      'src/screens/home/DataStatsPanel.tsx',
      'src/screens/DuasScreen.tsx',
      'src/screens/LogScreen.tsx',
    ]) {
      expect(read(f)).not.toMatch(/letterSpacing:\s*0\.[4-9]|letterSpacing:\s*1\b/);
    }
  });
});

describe('the label token', () => {
  it('exists, in sentence case, without tracking', () => {
    expect(TYPE.label).toMatchObject({ fontSize: 12, fontWeight: '600' });
    expect(TYPE.label.letterSpacing).toBeUndefined();
  });

  it('is what the screens that used to spell caps by hand now use', () => {
    for (const f of [
      'src/screens/FastingScreen.tsx',
      'src/screens/SyncScreen.tsx',
      'src/screens/BackupScreen.tsx',
      'src/screens/OnboardingScreen.tsx',
    ]) {
      expect(read(f)).toContain("typeStyle('label')");
    }
  });
});

describe('labels that said nothing', () => {
  it('"Practice" and "Today" are gone as headings', () => {
    const log = read('src/screens/LogScreen.tsx');
    expect(log).not.toMatch(/<Text[^>]*>\s*\{t\('log\.practiceTitle'\)\}/);
    const summary = read('src/screens/home/TodaySummary.tsx');
    expect(summary).not.toMatch(/<Text[^>]*>\s*\{t\('home\.todaySummary'/);
    // Still named for a screen reader.
    expect(summary).toContain("accessibilityLabel={t('home.todaySummary'");
  });
});
