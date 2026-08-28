/**
 * The site has to be findable, and for months it was not.
 *
 * Searching for the exact sentence in its own <h1> returned the F-Droid
 * page and the GitHub repo — never the site itself. The cause was in the
 * head: `rel=canonical`, `og:url` and both image URLs pointed at
 * `hassan-ps.github.io/Mihrab/`, which 301-redirects to the custom domain
 * the page is actually served from. A page whose canonical points at a
 * URL that redirects back to it is telling a crawler two contradictory
 * things about which address is real, and the usual outcome is that
 * neither gets indexed.
 *
 * Everything here reads the host out of docs/CNAME, so the day the domain
 * changes these fail instead of quietly going stale.
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const site = readFileSync(path.join(DOCS, 'index.html'), 'utf-8');
const host = readFileSync(path.join(DOCS, 'CNAME'), 'utf-8').trim();
const origin = `https://${host}`;

describe('the page agrees with itself about where it lives', () => {
  it.each([
    ['canonical', /<link rel="canonical" href="([^"]+)"/],
    ['og:url', /<meta property="og:url" content="([^"]+)"/],
    ['og:image', /<meta property="og:image" content="([^"]+)"/],
    ['twitter:image', /<meta name="twitter:image" content="([^"]+)"/],
  ])('%s is on the served domain', (_label, re) => {
    const found = re.exec(site)?.[1];
    expect(found).toBeDefined();
    expect(found!.startsWith(`${origin}/`)).toBe(true);
  });

  it('never links to the github.io host that redirects here', () => {
    // Including from the README, which is the highest-authority page
    // pointing at the site.
    const readme = readFileSync(path.join(ROOT, 'README.md'), 'utf-8');
    expect(site).not.toMatch(/hassan-ps\.github\.io/i);
    expect(readme).not.toMatch(/hassan-ps\.github\.io/i);
  });
});

describe('crawlers are told what to read', () => {
  it('ships a robots.txt naming the sitemap on this host', () => {
    const robots = readFileSync(path.join(DOCS, 'robots.txt'), 'utf-8');
    expect(robots).toContain(`Sitemap: ${origin}/sitemap.xml`);
    // The working notes under docs/ are served as raw text by Pages; they
    // are not the site and must not compete with it.
    expect(robots).toMatch(/Disallow: \/\*\.md\$/);
  });

  it('ships a sitemap pointing at the page itself', () => {
    const sitemap = readFileSync(path.join(DOCS, 'sitemap.xml'), 'utf-8');
    expect(sitemap).toContain('http://www.sitemaps.org/schemas/sitemap/0.9');
    expect(sitemap).toContain(`<loc>${origin}/</loc>`);
  });

  it('keeps .nojekyll, or Pages drops the underscore paths', () => {
    expect(existsSync(path.join(DOCS, '.nojekyll'))).toBe(true);
  });
});

describe('the app is an entity, not a word', () => {
  // "Mihrab" is a niche of an architectural term with at least eight other
  // apps using the name. Structured data is what ties this page to this
  // app rather than to the word.
  const ld = JSON.parse(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(site)![1],
  );

  it('describes the application', () => {
    expect(ld['@type']).toBe('MobileApplication');
    expect(ld.name).toMatch(/^Mihrab/);
    expect(ld.url).toBe(`${origin}/`);
  });

  it('claims every listing that carries the same app', () => {
    // sameAs is the disambiguation: these four listings and this page are
    // one thing.
    const same: string[] = ld.sameAs;
    expect(same).toEqual(
      expect.arrayContaining([
        expect.stringContaining('play.google.com'),
        expect.stringContaining('apps.apple.com'),
        expect.stringContaining('f-droid.org'),
        expect.stringContaining('github.com/Hassan-PS/Mihrab'),
      ]),
    );
  });

  it('is free and says so in a way a crawler can read', () => {
    expect(ld.isAccessibleForFree).toBe(true);
    expect(ld.offers.price).toBe('0');
  });
});
