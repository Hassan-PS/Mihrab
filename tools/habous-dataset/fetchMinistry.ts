/**
 * The one way anything in this project talks to habous.gov.ma.
 *
 * Extracted from the probe once it had proved the approach. Everything that
 * fetches the ministry goes through here so the certificate handling and
 * the retry policy exist in one place rather than being reinvented, subtly
 * differently, in each script.
 *
 * ── THE CERTIFICATE ───────────────────────────────────────────────────
 *
 * habous.gov.ma sends only its leaf certificate; the intermediate is
 * missing. SSL Labs grades it B with `chainIssues: 2`. Browsers cope, by
 * caching intermediates and fetching a missing one from the AIA URI in the
 * leaf. Node does not, so a plain `fetch()` fails with
 * UNABLE_TO_VERIFY_LEAF_SIGNATURE against a site that looks perfectly
 * healthy to a human checking it.
 *
 * `intermediate.pem` is that missing link, pinned. It is added to Node's
 * Mozilla root set, never substituted for it, and `rejectUnauthorized`
 * stays on: the chain must still reach a real root by real signatures. All
 * we supply is the link the server neglects to send. Do not be tempted to
 * turn verification off — an app that tells people when to pray does not
 * fetch its times over a connection it will not check.
 *
 * ── THE RETRIES ───────────────────────────────────────────────────────
 *
 * The endpoint is not reliably up. Five probe runs produced, between them,
 * two TLS failures, a connection reset and a connect timeout before
 * succeeding. So every request retries with backoff, and callers are
 * expected to treat a run of failures as "come back later" rather than as
 * data — see the origin-health gate in `build.ts`.
 */
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import tls from 'node:tls';

export const MINISTRY_BASE = 'https://habous.gov.ma/prieres/index.php';

/** The certificate the ministry's server omits. Sectigo ... DV R36, to 2036. */
const PINNED = path.join(__dirname, 'intermediate.pem');

let cachedCa: string[] | null = null;
function extraCa(): string[] {
  if (cachedCa) return cachedCa;
  cachedCa = fs.existsSync(PINNED) ? [fs.readFileSync(PINNED, 'utf8')] : [];
  if (cachedCa.length === 0) {
    console.warn(
      'WARNING: tools/habous-dataset/intermediate.pem is missing. The ministry ' +
        'does not send its intermediate, so every request will fail verification.',
    );
  }
  return cachedCa;
}

export type MinistryResponse = { status: number; body: string };

/** Any URL on the ministry's host, with the certificate handled and retries. */
export async function fetchMinistry(
  url: string,
  opts: { attempts?: number; timeoutMs?: number; onAttempt?: (n: number, why: string) => void } = {},
): Promise<MinistryResponse> {
  const attempts = opts.attempts ?? 3;
  const timeoutMs = opts.timeoutMs ?? 20_000;
  let last: Error | null = null;
  for (let n = 1; n <= attempts; n++) {
    try {
      return await once(url, timeoutMs);
    } catch (e) {
      last = e as Error;
      const why = (last as Error & { cause?: { code?: string } }).cause?.code ?? last.message;
      opts.onAttempt?.(n, why);
      if (n < attempts) await sleep(n * 1500);
    }
  }
  throw last ?? new Error('unreachable');
}

function once(url: string, timeoutMs: number): Promise<MinistryResponse> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        host: u.hostname,
        servername: u.hostname,
        path: `${u.pathname}${u.search}`,
        method: 'GET',
        // ADD to the trust store; never replace it.
        ca: [...tls.rootCertificates, ...extraCa()],
        rejectUnauthorized: true,
        timeout: timeoutMs,
        headers: {
          'user-agent':
            'Mihrab prayer-times dataset (+https://github.com/Hassan-PS/Mihrab)',
          'accept-language': 'ar,fr',
        },
      },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', c => chunks.push(c as Buffer));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * One city's page, with the certificate supplied and transient failures
 * retried. Throws only when every attempt failed; the caller decides
 * whether that means "skip this city" or "the origin is down".
 */
export async function fetchMinistryCity(
  cityId: number,
  opts: { attempts?: number; timeoutMs?: number; onAttempt?: (n: number, why: string) => void } = {},
): Promise<MinistryResponse> {
  const res = await fetchMinistry(`${MINISTRY_BASE}?ville=${cityId}`, opts);
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  return res;
}
