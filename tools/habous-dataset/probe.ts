/**
 * Can a GitHub Actions runner actually reach the Moroccan ministry?
 *
 * This exists because nobody has proved it yet, and the whole Habous
 * dataset rests on it. Ten minutes of a probe beats two days of a pipeline
 * built on an assumption.
 *
 * THE SPECIFIC DOUBT. habous.gov.ma does not send its intermediate
 * certificate. SSL Labs grades it B and reports `chainIssues: 2` —
 * incomplete chain — with one Java trust path failing outright while
 * Mozilla, Apple, Android and Windows pass. Browsers cope: they cache
 * intermediates and will fetch a missing one from the AIA URL in the leaf.
 * Node and curl do neither. So a naive scraper may fail with
 * UNABLE_TO_VERIFY_LEAF_SIGNATURE or UNABLE_TO_GET_ISSUER_CERT_LOCALLY
 * against a site that looks perfectly healthy in a browser.
 *
 * It may equally just work: Node ships Mozilla's roots, and Mozilla trusts
 * this chain. That is the question.
 *
 * What this deliberately does NOT do is disable verification. An app that
 * tells people when to pray does not fetch its times over a connection it
 * refuses to check. If the chain cannot be completed, the answer is to
 * supply the missing intermediate, not to stop looking.
 *
 *   npx tsx tools/habous-dataset/probe.ts [cityId]
 */
import https from 'node:https';
import http from 'node:http';
import tls from 'node:tls';
import { parseHabousCities, parseHabousMonth } from '../../src/providers/habousParser';

const BASE = 'https://habous.gov.ma/prieres/index.php';
const cityId = Number(process.argv[2] ?? 1);

function line(label: string, value: unknown): void {
  console.log(`${label.padEnd(22)} ${String(value)}`);
}

/**
 * Read the certificate the ministry presents, and report where the missing
 * intermediate can be collected from.
 *
 * `rejectUnauthorized: false` HERE AND ONLY HERE. This connection fetches
 * nothing and returns nothing but the certificate the server offered; its
 * entire purpose is to find out why verification fails. The data fetch
 * below stays fully verified — that separation is the point, and it is why
 * this is a distinct function rather than an option on the real request.
 */
async function inspectChain(host: string): Promise<void> {
  console.log('\n── certificate chain, as the server presents it ──');
  await new Promise<void>(resolve => {
    const socket = tls.connect(
      { host, port: 443, servername: host, rejectUnauthorized: false },
      () => {
        let cert = socket.getPeerCertificate(true) as tls.DetailedPeerCertificate | null;
        const seen = new Set<string>();
        let depth = 0;
        while (cert && cert.subject && !seen.has(cert.fingerprint)) {
          seen.add(cert.fingerprint);
          line(`  [${depth}] subject`, cert.subject.CN ?? JSON.stringify(cert.subject));
          line(`  [${depth}] issuer`, cert.issuer?.CN ?? JSON.stringify(cert.issuer));
          if (cert.infoAccess) {
            const issuers = cert.infoAccess['CA Issuers - URI'] ?? [];
            for (const uri of issuers) line(`  [${depth}] AIA caIssuers`, uri);
          }
          const next = cert.issuerCertificate;
          if (!next || next === cert) break;
          cert = next;
          depth++;
        }
        line('  chain length', depth + 1);
        if (depth === 0) {
          console.log(
            '\n  Only the leaf was sent — no intermediate, which is the whole\n' +
              '  problem. Collect the certificate at the AIA caIssuers URI above,\n' +
              '  commit it as tools/habous-dataset/intermediate.pem, and pass it as\n' +
              '  an extra CA so the chain completes WITH verification still on.',
          );
        }
        socket.end();
        resolve();
      },
    );
    socket.on('error', e => {
      line('  inspect failed', (e as Error).message);
      resolve();
    });
  });
}


/** GET a URL as raw bytes, following one redirect. Used for the CA file. */
function getBytes(url: string, redirects = 2): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const req = client.get(url, { timeout: 15_000 }, res => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects <= 0) return reject(new Error('too many redirects'));
        return resolve(getBytes(new URL(res.headers.location, url).toString(), redirects - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c as Buffer));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

/** DER bytes → PEM text. Sectigo publishes the .crt in DER. */
function derToPem(der: Buffer): string {
  const b64 = der.toString('base64').match(/.{1,64}/g)?.join('\n') ?? '';
  return `-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----\n`;
}

/**
 * Fetch the ministry WITH the missing intermediate supplied and verification
 * fully on.
 *
 * This is the fix, and the shape the real builder will use. `ca` ADDS to the
 * trust store rather than replacing it — `tls.rootCertificates` is Node's
 * own Mozilla set — so the chain still has to reach a real root by real
 * signatures. A forged intermediate would fail here exactly as it should;
 * all we have done is hand Node the link the server neglected to send.
 */
function fetchVerified(url: string, extraCa: string[]): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        host: u.hostname,
        servername: u.hostname,
        path: `${u.pathname}${u.search}`,
        method: 'GET',
        ca: [...tls.rootCertificates, ...extraCa],
        rejectUnauthorized: true,
        timeout: 20_000,
        headers: { 'user-agent': 'Mihrab-dataset-probe (+https://github.com/Hassan-PS/Mihrab)' },
      },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', c => chunks.push(c as Buffer));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }),
        );
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

async function main(): Promise<number> {
  const url = `${BASE}?ville=${cityId}`;
  line('url', url);
  line('node', process.version);

  const started = Date.now();
  // A plain AbortController rather than AbortSignal.timeout: this file is
  // type-checked against the app's lib, which does not carry it.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 20_000);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'user-agent': 'Mihrab-dataset-probe (+https://github.com/Hassan-PS/Mihrab)' },
      signal: abort.signal,
    });
  } catch (e) {
    const err = e as Error & { cause?: { code?: string; message?: string } };
    const code = err.cause?.code ?? '(none)';
    line('RESULT', 'FETCH FAILED');
    line('error', err.message);
    line('cause.code', code);
    if (/UNABLE_TO_(VERIFY_LEAF_SIGNATURE|GET_ISSUER_CERT)/.test(code)) {
      console.log(
        '\nThis is the incomplete chain, exactly as predicted. The fix is to\n' +
          'fetch the intermediate named in the leaf certificate’s AIA extension\n' +
          'and pass it as an extra CA — NOT to disable verification.',
      );
      await inspectChain(new URL(url).hostname);
      return await tryWithIntermediate(url);
    }
    return 1;
  } finally {
    clearTimeout(timer);
  }

  line('http status', `${res.status} ${res.statusText}`);
  const html = await res.text();
  line('bytes', html.length);
  line('elapsed ms', Date.now() - started);

  try {
    const cities = parseHabousCities(html);
    const month = parseHabousMonth(html);
    line('cities parsed', cities.length);
    line('city 1', `${cities[0].id} ${cities[0].name}`);
    line('hijri month', month.hijriLabel);
    line('days parsed', month.days.length);
    line('first day', `${month.days[0].dateKey}  ${JSON.stringify(month.days[0].times)}`);
    line('last day', `${month.days[month.days.length - 1].dateKey}`);
    line('RESULT', 'OK — the runner reaches the ministry and the parser reads it');
    return 0;
  } catch (e) {
    line('RESULT', 'FETCHED BUT UNPARSEABLE');
    line('error', (e as Error).message);
    console.log('\nFirst 600 bytes of what came back:\n' + html.slice(0, 600));
    return 2;
  }
}

/**
 * The proposed fix, exercised end to end: collect the intermediate the
 * server omits, then re-request the page with verification ON.
 */
async function tryWithIntermediate(url: string): Promise<number> {
  const AIA = 'http://crt.sectigo.com/SectigoPublicServerAuthenticationCADVR36.crt';
  console.log('\n── retrying with the missing intermediate supplied ──');
  line('  intermediate', AIA);
  let pem: string;
  try {
    const der = await getBytes(AIA);
    line('  fetched bytes', der.length);
    pem = derToPem(der);
  } catch (e) {
    line('  RESULT', 'could not collect the intermediate');
    line('  error', (e as Error).message);
    return 1;
  }

  try {
    const { status, body } = await fetchVerified(url, [pem]);
    line('  http status', status);
    line('  bytes', body.length);
    const cities = parseHabousCities(body);
    const month = parseHabousMonth(body);
    line('  cities parsed', cities.length);
    line('  hijri month', month.hijriLabel);
    line('  days parsed', month.days.length);
    line('  first day', `${month.days[0].dateKey} ${JSON.stringify(month.days[0].times)}`);
    line('  RESULT', 'OK — verified fetch works once the intermediate is supplied');
    console.log('\n  The PEM, for pinning as tools/habous-dataset/intermediate.pem:\n');
    console.log(pem);
    return 0;
  } catch (e) {
    const err = e as Error & { cause?: { code?: string } };
    line('  RESULT', 'STILL FAILING');
    line('  error', err.message);
    line('  cause.code', err.cause?.code ?? '(none)');
    return 1;
  }
}

main().then(code => process.exit(code));
