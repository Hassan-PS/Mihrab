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

main().then(code => process.exit(code));
