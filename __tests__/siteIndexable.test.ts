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
import { execFileSync } from 'child_process';

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const site = readFileSync(path.join(DOCS, 'index.html'), 'utf-8');
const siteSv = readFileSync(path.join(DOCS, 'sv', 'index.html'), 'utf-8');
const LANGS: Record<string, { name: string; dir: string; path: string }> =
  JSON.parse(
    readFileSync(path.join(ROOT, 'scripts', 'site', 'strings.json'), 'utf-8'),
  );
const host = readFileSync(path.join(DOCS, 'CNAME'), 'utf-8').trim();
const origin = `https://${host}`;

type Shot = { alt: string; cap: string };
type Shots = { items: Record<string, Shot>; spread: Shot };
const SHOT_STRINGS = LANGS as unknown as Record<string, { shots: Shots }>;
const { SHOTS, SHOT_V } = require('../scripts/build-site') as {
  SHOTS: string[];
  SHOT_V: string;
};

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

  it('keeps the Search Console verification file', () => {
    // Deleting it un-verifies the property, silently: Google re-checks and
    // drops ownership, and with it the sitemap, the coverage reports and
    // the ability to ask for indexing. It looks like a stray file. It is
    // not.
    const token = 'googlea1c6b9fa07ce68a5.html';
    const file = path.join(DOCS, token);
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, 'utf-8')).toContain(
      `google-site-verification: ${token}`,
    );
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

describe('the long-tail answers are on the page, not only in the markup', () => {
  // The queries this section exists for: "open source prayer times app",
  // "prayer times no ads", "prayer times homebrew", "prayer times
  // obtainium". Structured data that promises answers the page does not
  // visibly contain is the definition of the markup Google discards.
  const blocks = Array.from(
    site.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
    m => JSON.parse(m[1]),
  );
  const faq = blocks.find(b => b['@type'] === 'FAQPage');

  it('ships an FAQPage', () => {
    expect(faq).toBeDefined();
    expect(faq.mainEntity.length).toBeGreaterThanOrEqual(5);
  });

  it('asks every marked-up question visibly, in a heading', () => {
    const headings = Array.from(
      site.matchAll(/<h3>([^<]+)<\/h3>/g),
      m => m[1].replace(/\s+/g, ' ').trim(),
    );
    for (const q of faq.mainEntity) {
      expect(headings).toContain(q.name);
    }
  });

  it.each([
    ['open source', /open-source prayer times app/i],
    ['no ads', /no ad network/i],
    ['homebrew', /brew install --cask hassan-ps\/tap\/mihrab/],
    ['obtainium', /Obtainium/],
    ['no play services', /no Play Services/i],
  ])('says the words someone searching for "%s" would type', (_l, re) => {
    expect(site).toMatch(re);
  });
});

/**
 * The Swedish page, and the wiring that makes it a translation rather than
 * a competitor.
 *
 * A section in Swedish on an English page does not rank in Swedish: Google
 * classifies a page by its language, and "bönetider" is not a query an
 * English page wins. The answer is a real page — its own title, its own
 * description, its own structured data — declared as the Swedish version
 * of the English one. Declared BOTH ways: hreflang that is not reciprocal
 * is ignored, which is the usual way this is got wrong.
 */
describe('the Swedish page is a page, not a section', () => {
  it('is in Swedish, and says so', () => {
    expect(siteSv).toMatch(/<html lang="sv">/);
    expect(siteSv).toMatch(/<meta property="og:locale" content="sv_SE">/);
  });

  it('carries its own title and description, in Swedish', () => {
    const title = /<title>([^<]+)<\/title>/.exec(siteSv)?.[1] ?? '';
    expect(title).toMatch(/[Bb]önetider/);
    expect(title).not.toBe(/<title>([^<]+)<\/title>/.exec(site)?.[1]);
    const desc =
      /<meta name="description" content="([^"]+)"/.exec(siteSv)?.[1] ?? '';
    expect(desc.length).toBeGreaterThan(80);
    expect(desc).toMatch(/Islamiska Förbundet/);
  });

  it('points at itself, not at the English page', () => {
    expect(siteSv).toContain(`<link rel="canonical" href="${origin}/sv/">`);
    expect(siteSv).toContain(
      `<meta property="og:url" content="${origin}/sv/">`,
    );
  });

  it.each([
    ['the English page', () => site],
    ['the Swedish page', () => siteSv],
  ])('%s declares both languages and a default', (_l, get) => {
    const page = get();
    expect(page).toContain(
      `<link rel="alternate" hreflang="en" href="${origin}/">`,
    );
    expect(page).toContain(
      `<link rel="alternate" hreflang="sv" href="${origin}/sv/">`,
    );
    expect(page).toContain(
      `<link rel="alternate" hreflang="x-default" href="${origin}/">`,
    );
  });

  it('is in the sitemap, with every language named', () => {
    const sitemap = readFileSync(path.join(DOCS, 'sitemap.xml'), 'utf-8');
    expect(sitemap).toContain(`<loc>${origin}/sv/</loc>`);
    expect(sitemap).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    // Every page lists every language, so each alternate appears once per
    // page — that is what makes the annotations reciprocal.
    const pages = Object.keys(LANGS).length;
    expect(
      sitemap.match(
        new RegExp(`hreflang="sv" href="${origin}/sv/"`, 'g'),
      )?.length,
    ).toBe(pages);
  });

  it('is not disallowed to crawlers', () => {
    const robots = readFileSync(path.join(DOCS, 'robots.txt'), 'utf-8');
    expect(robots).not.toMatch(/Disallow: \/sv/);
  });

  it('and the two pages link to each other for readers too', () => {
    expect(site).toMatch(/href="sv\/"/);
    expect(siteSv).toMatch(/href="\.\.\/"/);
  });
});

describe('the Swedish page answers Swedish questions', () => {
  const faq = Array.from(
    siteSv.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
    m => JSON.parse(m[1]),
  ).find(b => b['@type'] === 'FAQPage');

  it('ships an FAQPage with the questions people actually type', () => {
    expect(faq.mainEntity.length).toBeGreaterThanOrEqual(6);
  });

  it('asks every marked-up question visibly, in a heading', () => {
    const headings = Array.from(
      siteSv.matchAll(/<h3>([^<]+)<\/h3>/g),
      m => m[1].replace(/\s+/g, ' ').trim(),
    );
    for (const q of faq.mainEntity) {
      expect(headings).toContain(q.name);
    }
  });

  it.each([
    ['islamiska förbundet', /Islamiska Förbundet/],
    ['bönetider', /[Bb]önetider/],
    ['utan reklam', /utan reklam|ingen reklam/i],
    ['gratis', /[Gg]ratis/],
    ['adhan', /adhan/i],
    ['qibla', /qibla/i],
  ])('says the words someone searching for "%s" would type', (_l, re) => {
    expect(siteSv).toMatch(re);
  });

  it('names the towns it claims to cover', () => {
    for (const town of ['Stockholm', 'Göteborg', 'Malmö', 'Uppsala']) {
      expect(siteSv).toContain(`<li>${town}</li>`);
    }
  });
});

/**
 * The thirteen languages.
 *
 * The app speaks thirteen and the site spoke one, which meant twelve
 * audiences searching in their own language could not find it: Google
 * classifies a page by its language, so "Gebetszeiten" and "namaz
 * vakitleri" are not queries an English page wins. Eleven of the pages are
 * rendered by scripts/build-site.js from one template; English and Swedish
 * are hand-written and only patched between markers. What every page must
 * agree about is generated into all thirteen.
 */
describe('every language the app speaks has a page', () => {
  const codes = Object.keys(LANGS);

  it('is thirteen, the same set the app ships', () => {
    expect(codes.sort()).toEqual(
      ['ar', 'bn', 'de', 'en', 'es', 'fr', 'hi', 'id', 'ru', 'sv', 'tr', 'ur', 'zh'],
    );
  });

  it.each(Object.entries(LANGS))('%s has a page at its path', (code, l) => {
    const file =
      code === 'en'
        ? path.join(DOCS, 'index.html')
        : path.join(DOCS, l.path.replace(/^\/|\/$/g, ''), 'index.html');
    expect(existsSync(file)).toBe(true);
  });

  const pageOf = (code: string) =>
    readFileSync(
      code === 'en'
        ? path.join(DOCS, 'index.html')
        : path.join(DOCS, LANGS[code].path.replace(/^\/|\/$/g, ''), 'index.html'),
      'utf-8',
    );

  it.each(Object.keys(LANGS))(
    '%s declares every other language, and a default',
    code => {
      const page = pageOf(code);
      for (const [other, l] of Object.entries(LANGS)) {
        expect(page).toContain(
          `<link rel="alternate" hreflang="${other}" href="${origin}${l.path}">`,
        );
      }
      expect(page).toContain(
        `<link rel="alternate" hreflang="x-default" href="${origin}/">`,
      );
    },
  );

  it.each(Object.keys(LANGS))('%s offers the picker, with all thirteen', code => {
    const page = pageOf(code);
    expect(page).toContain('<details class="langpicker">');
    for (const [other, l] of Object.entries(LANGS)) {
      expect(page).toContain(`href="${l.path}" hreflang="${other}"`);
    }
    // The current language is marked, and only it.
    expect(page.match(/aria-current="true"/g)?.length).toBe(1);
  });

  it('needs no JavaScript to switch language', () => {
    // The privacy section claims the site ships none, and the claim is the
    // reason the picker is a <details> rather than a <select> with an
    // onchange handler.
    for (const code of codes) {
      const page = pageOf(code);
      const scripts = Array.from(
        page.matchAll(/<script([^>]*)>/g),
        m => m[1],
      );
      for (const attrs of scripts) {
        expect(attrs).toContain('application/ld+json');
      }
    }
  });

  it.each([['ar'], ['ur']])('%s is laid out right to left', code => {
    expect(pageOf(code)).toContain(`<html lang="${code}" dir="rtl">`);
  });

  it('offers every install channel on every page', () => {
    // The translated pages were written with four of the five and dropped
    // Obtainium — on twelve pages, in the section whose whole job is to
    // get the app onto a device. One list in the generator now, and this
    // is what stops a channel going missing from a subset again.
    for (const code of codes) {
      const page = pageOf(code);
      for (const badge of ['appstore', 'googleplay', 'fdroid', 'github', 'obtainium']) {
        expect(page).toContain(`badges/${badge}.png`);
      }
    }
  });

  it('reserves the badge box at the ratio the images actually have', () => {
    // 180×60 is not the shape of a 564×168 image: the wrong intrinsic size
    // reserves the wrong box and the row jumps when the badges load.
    for (const code of codes) {
      expect(pageOf(code)).not.toMatch(/badges\/[a-z]+\.png" width="180"/);
    }
  });

  it('carries the solidarity banner on every page', () => {
    for (const code of codes) {
      expect(pageOf(code)).toContain('class="solidarity"');
    }
  });

  it('keeps the Swedish timetable answer on the Swedish page only', () => {
    // It is a Swedish answer to a Swedish question. On a German or Bengali
    // page it is noise, and it would compete with /sv/ for the phrase.
    for (const code of codes) {
      const page = pageOf(code);
      if (code === 'sv' || code === 'en') continue;
      expect(page).not.toMatch(/Islamiska Förbundet/);
    }
    expect(pageOf('sv')).toMatch(/Islamiska Förbundet/);
  });

  /**
   * The screenshots were English-only for as long as the translations
   * existed: twelve pages describing an app they never showed, which is a
   * page asking to be taken on faith. The gallery is generated now, so
   * these are the three ways it could quietly go back to that — a picture
   * missing from a page, a picture missing from disk, or a translated page
   * carrying the English words under it.
   */
  it.each(codes)('%s shows every screenshot, not only the words', code => {
    const page = pageOf(code);
    const at = code === 'en' ? 'assets' : '../assets';
    for (const id of [...SHOTS, 'spread']) {
      expect(page).toContain(`src="${at}/img/shot-${id}.png${SHOT_V}"`);
    }
  });

  it('ships every picture the pages ask for', () => {
    for (const id of [...SHOTS, 'spread']) {
      expect(existsSync(path.join(DOCS, 'assets', 'img', `shot-${id}.png`))).toBe(
        true,
      );
    }
  });

  it.each(codes.filter(c => c !== 'en'))(
    '%s captions the pictures in its own language',
    code => {
      const shots = SHOT_STRINGS[code].shots;
      const english = SHOT_STRINGS.en.shots;
      for (const id of SHOTS) {
        expect(shots.items[id].alt.trim()).not.toBe('');
        expect(shots.items[id].cap.trim()).not.toBe('');
        expect(shots.items[id].alt).not.toBe(english.items[id].alt);
        expect(pageOf(code)).toContain(shots.items[id].cap);
      }
      expect(shots.spread.cap).not.toBe(english.spread.cap);
    },
  );

  it('is what the generator would write right now', () => {
    // The check the release cut runs: a page edited by hand, or a string
    // changed without rebuilding, fails here rather than shipping.
    execFileSync('node', [path.join(ROOT, 'scripts', 'build-site.js'), '--check'], {
      cwd: ROOT,
    });
  });
});

/**
 * The stylesheet, on the two counts that broke a whole language.
 */
describe('the stylesheet is safe in both directions', () => {
  const css = readFileSync(path.join(DOCS, 'assets', 'site.css'), 'utf-8');

  it('hides the skip link by clipping it, never by pushing it off-screen', () => {
    // `left: -9999px` is the old trick, and it is invisible in a
    // left-to-right page. Right-to-left it made the document 11,279 px wide
    // with the content at the far end, and the Arabic and Urdu pages opened
    // on ten thousand pixels of empty background — a blank page from one
    // line of CSS.
    expect(css).not.toMatch(/-9999px/);
    expect(css).toMatch(/\.skip \{[^}]*clip-path: inset\(50%\)/s);
  });

  it('lays a row of cards out on the class, not on a list of sections', () => {
    // `.privacy .cols, .support .cols, .faq .cols` was a list that had to
    // be remembered, and the translated pages' feature section was not on
    // it: three cards, flush against each other, on twelve pages.
    expect(css).toMatch(/\n\.cols \{[^}]*display: grid/s);
  });

  it('mirrors the two rules that are side-specific', () => {
    expect(css).toMatch(/\[dir="rtl"\] \.card ul/);
    expect(css).toMatch(/\[dir="rtl"\] \.group li::before/);
  });
});
