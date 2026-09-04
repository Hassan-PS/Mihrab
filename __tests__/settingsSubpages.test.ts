/**
 * Settings is an index now, and this is what keeps it honest.
 *
 * Twelve cards in one scroll became seven destinations. The failure that
 * shape invites is a card still in the codebase but no longer reachable
 * from anywhere — nothing crashes, nothing fails to compile, the setting
 * simply cannot be found. So the sections are declared once, in
 * `subpages.tsx`, and both the index and the navigator read that list.
 */
import fs from 'fs';
import path from 'path';

const REPO = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf-8');

const SUBPAGES = read('src/screens/settings/subpages.tsx');
const INDEX = read('src/screens/SettingsScreen.tsx');
const NAV = read('src/navigation/RootNavigator.tsx');
const TYPES = read('src/navigation/types.ts');

/** Every route named in the section list — sections and nested pages. */
const routes = [...SUBPAGES.matchAll(/route: '(Settings\w+)'/g)].map(m => m[1]);

/**
 * The nested ones: declared inside a `children:` block rather than at the
 * top level. They are NOT on the index — the only way in is the row their
 * parent draws, which `NestedPageRows` builds from this same list.
 */
const NESTED = read('src/screens/settings/NestedPageRows.tsx');
const nestedRoutes = [
  ...SUBPAGES.matchAll(/children: \[([\s\S]*?)\n {4}\],/g),
].flatMap(block =>
  [...block[1].matchAll(/route: '(Settings\w+)'/g)].map(m => m[1]),
);

/** Every settings card that still exists on disk. */
const cards = fs
  .readdirSync(path.join(REPO, 'src/screens/settings'))
  .filter(f => f.endsWith('Card.tsx'))
  .map(f => f.replace('.tsx', ''));

const pagesDir = 'src/screens/settings/pages';
const pageSources = fs
  .readdirSync(path.join(REPO, pagesDir))
  .filter(f => f.endsWith('.tsx'))
  .map(f => read(path.join(pagesDir, f)))
  .join('\n');

describe('the sections', () => {
  it('are declared once and read by both the index and the navigator', () => {
    expect(routes.length).toBeGreaterThanOrEqual(7);
    expect(INDEX).toMatch(/SETTINGS_SUBPAGES/);
    // The navigator registers the flattened list, so a nested page is on
    // the stack for the same reason its parent is.
    expect(NAV).toMatch(/SETTINGS_STACK_PAGES/);
    // The index must not hand-list them, or the two can drift.
    for (const route of routes) {
      expect(INDEX).not.toContain(`'${route}'`);
    }
  });

  it('each have a route on the root stack', () => {
    for (const route of routes) {
      expect(TYPES).toMatch(new RegExp(`\\b${route}:`));
    }
  });

  /**
   * The one that actually protects the user: a card nobody renders is a
   * setting nobody can reach, and it looks like nothing at all from the
   * outside.
   */
  it('between them render every settings card that exists', () => {
    const orphans = cards.filter(card => !pageSources.includes(`<${card}`));
    expect(orphans).toEqual([]);
  });
});

describe('the pages nested under a section', () => {
  it('exist, and stay off the index', () => {
    expect(nestedRoutes.length).toBeGreaterThanOrEqual(3);
    for (const route of nestedRoutes) {
      expect(TYPES).toMatch(new RegExp(`\\b${route}:`));
      // The index lists sections. A nested page reached from there as
      // well would be the same setting in two places.
      expect(INDEX).not.toContain(route);
    }
  });

  /**
   * The failure this shape invites, one level further down: a page
   * registered on the stack whose row nobody drew. Nothing crashes and
   * nothing fails to compile — the setting simply cannot be reached. So
   * the rows are generated from the same list the navigator reads.
   */
  it('are opened by rows generated from that same list', () => {
    expect(NESTED).toMatch(/nestedPagesOf\(parent\)/);
    expect(NESTED).toMatch(/navigation\.navigate\(/);
    expect(SUBPAGES).toMatch(/export function nestedPagesOf/);
    // And someone renders those rows for each parent that has children.
    const parents = [
      // No other `route:` may fall between the two, or a childless
      // section would claim the next section's children.
      ...SUBPAGES.matchAll(
        /route: '(Settings\w+)',(?:(?!route: ')[\s\S]){0,400}?children: \[/g,
      ),
    ].map(m => m[1]);
    expect(parents.length).toBeGreaterThan(0);
    const rendered = pageSources + read('src/screens/settings/AboutCard.tsx');
    for (const parent of parents) {
      expect(rendered).toContain(`<NestedPageRows parent="${parent}"`);
    }
  });
});

describe('the index itself', () => {
  it('holds no picker state — the pages own their modals', () => {
    expect(INDEX).not.toMatch(/Modal/);
  });

  it('returns to the top when the tab is tapped again', () => {
    expect(INDEX).toMatch(/useScrollToTop\(scrollRef\)/);
  });
});

describe('every subpage', () => {
  /**
   * The header — title plus the system's back control beside it — is the
   * native stack's. `headerLargeTitle: false` is what puts the title in
   * the small header where that control lives, and it is what every
   * other pushed screen in this stack already does.
   */
  it('gets the platform header, with a back title that says where back is', () => {
    expect(NAV).toMatch(
      /headerLargeTitle: false,[\s\S]{0,200}headerBackTitle: t\(page\.backTitleKey\)/,
    );
    // "Settings" for a section; the section's own name for a page nested
    // under it — "‹ Settings" from two levels down points past where back
    // actually goes.
    expect(SUBPAGES).toMatch(/backTitleKey: 'nav\.settings'/);
    expect(SUBPAGES).toMatch(/backTitleKey: page\.titleKey/);
  });

  it('sits in the shared frame rather than rolling its own scroll view', () => {
    const files = fs
      .readdirSync(path.join(REPO, pagesDir))
      .filter(f => f.endsWith('.tsx'));
    expect(files.length).toBe(routes.length);
    for (const f of files) {
      const src = read(path.join(pagesDir, f));
      expect(src).toMatch(/<SettingsPage/);
      expect(src).not.toMatch(/<ScrollView/);
    }
  });
});
