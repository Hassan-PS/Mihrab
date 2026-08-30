/**
 * Ask the ministry a question and report the answer. Diagnostics only —
 * commits nothing, is not scheduled.
 *
 *   npx tsx tools/habous-dataset/probe.ts [cityId]
 *   npx tsx tools/habous-dataset/probe.ts --discover
 *
 * ── WHY IT NO LONGER TRIES THE BROKEN PATH FIRST ──────────────────────
 *
 * The first version fetched plainly, watched that fail, and only then tried
 * the fix. That was right while the question was open: it proved a runner
 * cannot reach habous.gov.ma without help, because the server sends only
 * its leaf certificate and Node will not complete the chain on its own.
 *
 * The question is closed now — the intermediate is pinned and the verified
 * fetch works — so leading with a request known to fail meant every run
 * ended red and mailed about it. A diagnostic that cries wolf is one nobody
 * reads. It now goes through `fetchMinistry`, the same path the builder
 * uses, and fails only when the ministry is genuinely unreachable.
 *
 * ── --discover ────────────────────────────────────────────────────────
 *
 * The page takes a `ville` and returns whatever HIJRI month it is showing,
 * which caps the dataset's forward window at "until this month ends" — 14
 * days on the first real build, and as little as a day just before a month
 * turns. That is too thin to rely on. This mode probes for a parameter that
 * selects a different month, so the builder could fetch several.
 */
import { parseHabousCities, parseHabousMonth } from '../../src/providers/habousParser';
import { MINISTRY_BASE, fetchMinistry, fetchMinistryCity } from './fetchMinistry';

function line(label: string, value: unknown): void {
  console.log(`${label.padEnd(24)} ${String(value)}`);
}

async function readOneCity(cityId: number): Promise<number> {
  line('url', `${MINISTRY_BASE}?ville=${cityId}`);
  line('node', process.version);
  const started = Date.now();
  let body: string;
  try {
    ({ body } = await fetchMinistryCity(cityId, {
      onAttempt: (n, why) => line(`attempt ${n}`, `failed: ${why}`),
    }));
  } catch (e) {
    const err = e as Error & { cause?: { code?: string } };
    line('RESULT', 'UNREACHABLE');
    line('error', err.message);
    line('cause.code', err.cause?.code ?? '(none)');
    console.log(
      '\nEvery attempt failed WITH the pinned intermediate supplied. Either the\n' +
        'ministry is down, or it has changed issuer and intermediate.pem is stale\n' +
        '— run with --discover to see the chain it is presenting now.',
    );
    return 1;
  }

  line('bytes', body.length);
  line('elapsed ms', Date.now() - started);
  const cities = parseHabousCities(body);
  const month = parseHabousMonth(body);
  line('cities parsed', cities.length);
  line('hijri month', month.hijriLabel);
  line('days parsed', month.days.length);
  line('window', `${month.days[0].dateKey} → ${month.days[month.days.length - 1].dateKey}`);
  const today = new Date().toISOString().slice(0, 10);
  line('forward coverage', `${month.days.filter(d => d.dateKey >= today).length} days`);
  line('RESULT', 'OK');
  return 0;
}

/**
 * Hunt for a way to ask for a month other than the current one.
 *
 * Every candidate is judged by what comes BACK — a different Hijri label or
 * a different date window — not by whether it returns 200. A page that
 * ignores an unknown parameter returns 200 and the current month, which
 * looks like success and is not.
 */
async function discover(): Promise<number> {
  const baseline = await fetchMinistryCity(1);
  const base = parseHabousMonth(baseline.body);
  line('baseline month', base.hijriLabel);
  line('baseline window', `${base.days[0].dateKey} → ${base.days[base.days.length - 1].dateKey}`);
  console.log('\nprobing for a month selector — a hit changes the window\n');

  const candidates: string[] = [];
  for (const name of ['mois', 'month', 'm', 'mois_hijri', 'hijri', 'shahr', 'mm']) {
    for (const value of ['2', '10']) {
      candidates.push(`${MINISTRY_BASE}?ville=1&${name}=${value}`);
    }
  }
  // Other scripts the site is known to serve.
  candidates.push('https://habous.gov.ma/prieres/horaire_hijri_fr.php?ville=1');
  candidates.push('https://habous.gov.ma/prieres/horaire_hijri.php?ville=1');
  candidates.push('https://habous.gov.ma/prieres/index.php?ville=1&annee=2027');

  const hits: string[] = [];
  const unparseable: Array<[string, string]> = [];
  for (const url of candidates) {
    try {
      const res = await fetchMinistry(url, { attempts: 1, timeoutMs: 15_000 });
      if (res.status !== 200) {
        line(url.replace(MINISTRY_BASE, '…'), `HTTP ${res.status}`);
        continue;
      }
      let label = '(unparseable)';
      let window = '';
      try {
        const m = parseHabousMonth(res.body);
        label = m.hijriLabel;
        window = `${m.days[0].dateKey} → ${m.days[m.days.length - 1].dateKey}`;
      } catch {
        // Worth seeing: a 200 that is not a month table might be a
        // different view onto the same data — a year, a form, a PDF index.
        unparseable.push([url, res.body.replace(/\s+/g, ' ').slice(0, 400)]);
      }
      const changed = label !== base.hijriLabel && label !== '(unparseable)';
      line(url.replace(MINISTRY_BASE, '…'), `${label} ${window}${changed ? '   ← DIFFERENT' : ''}`);
      if (changed) hits.push(url);
    } catch (e) {
      line(url.replace(MINISTRY_BASE, '…'), `failed: ${(e as Error).message}`);
    }
    await new Promise(r => setTimeout(r, 800));
  }

  // The page carries <form method="post">, and the city select only drives
  // GET. A month field might exist on the POST side.
  console.log('\nprobing the POST form\n');
  for (const field of ['mois', 'month', 'mois_hijri', 'hijri_month', 'shahr']) {
    try {
      const res = await fetchMinistry(`${MINISTRY_BASE}?ville=1`, {
        attempts: 1,
        timeoutMs: 15_000,
        method: 'POST',
        form: { ville: '1', [field]: '5' },
      });
      let label = '(unparseable)';
      let window = '';
      try {
        const m = parseHabousMonth(res.body);
        label = m.hijriLabel;
        window = `${m.days[0].dateKey} → ${m.days[m.days.length - 1].dateKey}`;
      } catch {
        /* not a month page */
      }
      const changed = label !== base.hijriLabel && label !== '(unparseable)';
      line(`POST ${field}=5`, `${label} ${window}${changed ? '   ← DIFFERENT' : ''}`);
      if (changed) hits.push(`POST ${field}`);
    } catch (e) {
      line(`POST ${field}=5`, `failed: ${(e as Error).message}`);
    }
    await new Promise(r => setTimeout(r, 800));
  }

  if (unparseable.length > 0) {
    console.log('\nwhat the non-table pages actually returned:\n');
    for (const [url, head] of unparseable) {
      console.log(`  ${url}`);
      console.log(`    ${head}\n`);
    }
  }

  console.log('');
  if (hits.length === 0) {
    line('RESULT', 'no month selector found — the window stays one month');
    console.log(
      '\nThe builder can only ever see the current Hijri month, so forward\n' +
        'coverage decays to nothing as the month runs out and jumps back up\n' +
        'when it turns. Running the build DAILY is then the only lever: it\n' +
        'catches the new month the day it appears.',
    );
  } else {
    line('RESULT', `${hits.length} candidate(s) return a different month`);
    for (const h of hits) console.log(`  ${h}`);
  }
  return 0;
}

async function main(): Promise<number> {
  if (process.argv.includes('--discover')) return discover();
  return readOneCity(Number(process.argv[2] ?? 1));
}

main().then(code => process.exit(code));
