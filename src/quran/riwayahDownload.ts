/**
 * Fetching a muṣḥaf the app is not allowed to ship.
 *
 * ── WHAT THIS IS AND IS NOT ───────────────────────────────────────────
 *
 * It is not a download manager. There is no queue, no resume, no
 * background run: one file, a few megabytes, fetched because a reader
 * asked for it and while they are watching.
 *
 * What it IS, and the reason it is its own module, is the boundary
 * between "bytes from the internet" and "scripture on a device". Nothing
 * crosses it without `verifyRiwayahDataset` — the same function the CLI
 * importer runs, so a file that would have been refused on a maintainer's
 * laptop is refused on the phone too. The failure a reader must never
 * have is a muṣḥaf that renders beautifully and is quietly wrong.
 *
 * ── AND WHY MIHRAB DOES NOT HOST IT ───────────────────────────────────
 *
 * The Hafs page fonts come from a Mihrab release, which means the project
 * redistributes them. It cannot do that here: nobody publishes a Warsh
 * text under terms that permit it (`riwayahStore.ts` has the survey). So
 * the URL is the publisher's, or one the reader supplies, and the file
 * travels from them to the reader without passing through anything of
 * ours.
 */
import { MUSHAF_PAGES, MUSHAF_SURAHS } from './pages';
import { installRiwayahDataset } from './riwayahData';
import { verifyRiwayahDataset } from './riwayahImport';
import type { RiwayahProvenance } from './riwayahStore';
import type { RiwayahId } from './riwayat';

/**
 * The largest file worth reading into memory to check.
 *
 * The whole Qur'an as vocalised Arabic text with a page number per ayah
 * is a few megabytes; the word-by-word export is larger but still well
 * inside this. The cap is here so a wrong link — a video, an ISO, an
 * HTML error page that never ends — fails as a size error rather than as
 * an out-of-memory crash with no explanation.
 */
const MAX_BYTES = 48 * 1024 * 1024;

/**
 * Why an install did not happen, as something the UI can translate.
 *
 * A key and a fallback, not a sentence: this module has no `t()` and the
 * app speaks thirteen languages. `detail` carries the verifier's own
 * words — "expected 6236 ayahs, found 6235" — which stay in English on
 * purpose. They are diagnostics about a file, they are what someone would
 * paste into an issue, and inventing thirteen translations of every way a
 * dataset can be wrong would make them less useful, not more.
 */
export type RiwayahInstallError = {
  key: string;
  fallback: string;
  params?: Record<string, string | number>;
  detail?: string;
};

export type RiwayahInstallResult =
  | { ok: true; provenance: RiwayahProvenance }
  | { ok: false; error: RiwayahInstallError };

function fail(
  key: string,
  fallback: string,
  extra?: Omit<RiwayahInstallError, 'key' | 'fallback'>,
): RiwayahInstallResult {
  return { ok: false, error: { key, fallback, ...extra } };
}

/**
 * Install a riwayah from a URL the reader gave us.
 *
 * Every failure names something someone can act on. "Something went
 * wrong" would leave a reader with a link, a blank screen and no idea
 * whether the problem is the link, the network or the file.
 */
export async function installRiwayahFromUrl(
  id: RiwayahId,
  url: string,
  signal?: AbortSignal,
): Promise<RiwayahInstallResult> {
  const trimmed = url.trim();
  if (!/^https:\/\//i.test(trimmed)) {
    // https only. This is scripture arriving over someone's café wifi; a
    // link that can be rewritten in transit is not one to accept.
    return fail('quran.riwayahNeedsHttps', 'The link must start with https://');
  }

  let body: string;
  try {
    const response = await fetch(trimmed, { signal });
    if (!response.ok) {
      return fail(
        'quran.riwayahServerSaidNo',
        'The server answered {{status}}.',
        { params: { status: response.status } },
      );
    }
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > MAX_BYTES) {
      return fail(
        'quran.riwayahTooLarge',
        'That file is much larger than a muṣḥaf dataset. Check the link.',
      );
    }
    body = await response.text();
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') {
      return fail('common.cancelled', 'Cancelled.');
    }
    return fail(
      'quran.riwayahUnreachable',
      'Could not reach that link. Check the address and your connection.',
    );
  }

  if (body.length > MAX_BYTES) {
    return fail(
      'quran.riwayahTooLarge',
      'That file is much larger than a muṣḥaf dataset. Check the link.',
    );
  }
  return finish(id, body, trimmed);
}

/**
 * Install from text the reader already has — a file they opened, a paste.
 *
 * Same verification, different transport, and deliberately the same
 * `finish` rather than a second copy of the checking that agrees today.
 */
export async function installRiwayahFromText(
  id: RiwayahId,
  contents: string,
  from: string,
): Promise<RiwayahInstallResult> {
  return finish(id, contents, from);
}

/** Parse, verify, store. The only way a muṣḥaf reaches the device. */
async function finish(
  id: RiwayahId,
  body: string,
  from: string,
): Promise<RiwayahInstallResult> {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    // Overwhelmingly the commonest wrong link: the resource PAGE rather
    // than the export. Say so, because "invalid JSON" tells a reader
    // nothing about what to do next.
    return body.trimStart().startsWith('<')
      ? fail(
          'quran.riwayahGotAPage',
          'That link returned a web page, not a data file. Use the download link for the JSON export.',
        )
      : fail('quran.riwayahNotJson', 'That file is not a data file.');
  }

  const verified = verifyRiwayahDataset(raw, MUSHAF_SURAHS, MUSHAF_PAGES);
  if (!verified.ok) {
    return fail(
      'quran.riwayahNotAQuran',
      'That file is not a complete Qur’an, so it was not installed.',
      { detail: verified.error },
    );
  }
  // Shape alone is not enough to become scripture on someone's device.
  // `verifyRiwayahDataset` will report a well-formed file it could not
  // read the content of — a build with no reference text of its own — and
  // that is a refusal here rather than an install, because a muṣḥaf that
  // renders beautifully and is quietly wrong is the one failure a reader
  // must never have.
  if (!verified.checked) {
    return fail(
      'quran.riwayahNotAQuran',
      'That file is not a complete Qur’an, so it was not installed.',
      { detail: 'this build has no reference text to check it against' },
    );
  }

  try {
    const provenance = await installRiwayahDataset(id, verified.dataset, from);
    return { ok: true, provenance };
  } catch (e) {
    return fail(
      'quran.riwayahCouldNotSave',
      'Could not save it to this device.',
      { detail: String(e) },
    );
  }
}
