/**
 * Whatever the reader picked, as the JSON the verifier wants.
 *
 * ── WHY THIS IS NOT JUST `readFile` ───────────────────────────────────
 *
 * QUL's "Download json" gives you `qpc-warsh-script-ayah.json.zip`. The
 * first version of this feature asked for a `.json`, so the reader had to
 * notice it was a zip, find somewhere to extract it, and come back — for a
 * button whose whole promise was "choose the file you downloaded". Asking
 * someone to unzip something before an app will look at it is asking them
 * to do the app's job.
 *
 * So a zip is a file this understands. It reads the container itself and
 * inflates the first JSON entry inside, which is the shape every export of
 * this kind takes: one archive, one file.
 *
 * ── AND WHY THE CONTAINER IS PARSED HERE ──────────────────────────────
 *
 * A zip is a sequence of local file headers, each followed by its data,
 * with a central directory at the end. `fflate` inflates a DEFLATE stream;
 * it does not, on its own, tell you where in the archive that stream
 * begins. Rather than pull in a second dependency for the container, it is
 * read here — it is a documented format with a fixed header, and the whole
 * of what we need from it is "where does the first .json entry's data
 * start, and how long is it".
 */
import { inflateSync } from 'fflate';
// Hermes has no `TextDecoder`; `secureRandom.ts` is where this app keeps the
// hand-written one, and `hermesGlobals.test.ts` is why. The module is named
// for what first needed it, not for all it holds.
import { utf8Decode } from '../sync/secureRandom';

/** `PK\x03\x04` — the local file header every entry starts with. */
const LOCAL_HEADER = 0x04034b50;

/** Deflate, and stored (uncompressed). Nothing else is worth supporting. */
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

export type MushafFileResult =
  | { ok: true; text: string; from: string }
  | { ok: false; key: string; fallback: string; detail?: string };

function fail(
  key: string,
  fallback: string,
  detail?: string,
): MushafFileResult {
  return { ok: false, key, fallback, detail };
}

/** Little-endian reads — the only byte order a zip uses. */
const u16 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);
const u32 = (b: Uint8Array, at: number) =>
  (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;

/** Does this look like a zip, whatever it happens to be called? */
export function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && u32(bytes, 0) === LOCAL_HEADER;
}

/**
 * The first entry in a zip whose name ends in `.json`, inflated.
 *
 * Walks the local headers rather than the central directory: the entries
 * come first in the file, the first JSON is the one wanted, and stopping
 * at it means never reading the rest of an archive that may be large.
 */
export function unzipFirstJson(bytes: Uint8Array): MushafFileResult {
  let at = 0;
  while (at + 30 <= bytes.length && u32(bytes, at) === LOCAL_HEADER) {
    const method = u16(bytes, at + 8);
    const flags = u16(bytes, at + 6);
    let compressed = u32(bytes, at + 18);
    let uncompressed = u32(bytes, at + 22);
    const nameLength = u16(bytes, at + 26);
    const extraLength = u16(bytes, at + 28);
    const nameStart = at + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = utf8Decode(bytes.subarray(nameStart, nameStart + nameLength));

    // Bit 3 says the sizes are in a data descriptor AFTER the data, which
    // a streaming writer uses because it does not know them in advance.
    // There is no length to trust in the header, so the entry cannot be
    // located by arithmetic and this stops rather than guessing.
    if ((flags & 0x08) !== 0 && compressed === 0) {
      return fail(
        'downloads.riwayahZipUnsupported',
        'That archive is in a form this app cannot open. Extract it and choose the file inside.',
        `streamed entry "${name}"`,
      );
    }

    if (/\.json$/i.test(name) && !name.endsWith('/')) {
      const data = bytes.subarray(dataStart, dataStart + compressed);
      if (method === METHOD_STORED) {
        return { ok: true, text: utf8Decode(data), from: name };
      }
      if (method !== METHOD_DEFLATE) {
        return fail(
          'downloads.riwayahZipUnsupported',
          'That archive is in a form this app cannot open. Extract it and choose the file inside.',
          `compression method ${method}`,
        );
      }
      try {
        // `inflateSync` on the raw deflate stream a zip entry holds. The
        // declared size is a hint that lets it allocate once; a wrong one
        // is not fatal, so it is only passed when it is plausible.
        const out = inflateSync(
          data,
          uncompressed > 0 ? { out: new Uint8Array(uncompressed) } : undefined,
        );
        return { ok: true, text: utf8Decode(out), from: name };
      } catch (e) {
        return fail(
          'downloads.riwayahZipUnreadable',
          'That archive could not be opened.',
          String(e),
        );
      }
    }

    if (compressed === 0 && uncompressed === 0) {
      // A directory entry, or an entry we cannot step over. Either way the
      // walk cannot continue safely.
      compressed = 0;
      uncompressed = 0;
      at = dataStart;
      if (!/\/$/.test(name)) break;
      continue;
    }
    at = dataStart + compressed;
  }
  return fail(
    'downloads.riwayahNoJsonInZip',
    'There is no .json file inside that archive.',
  );
}

/**
 * Decode a picked file into the JSON text the verifier reads.
 *
 * Takes bytes rather than a path so the platform half stays as small as
 * possible: the native side's whole job is "the user chose this, here it
 * is", and everything about what the file turns out to BE is decided here,
 * once, for both platforms, where it can be tested.
 */
export function mushafTextFromFile(
  name: string,
  bytes: Uint8Array,
): MushafFileResult {
  if (bytes.length === 0) {
    return fail('downloads.riwayahUnreadable', 'That file is empty.');
  }
  // The signature, not the extension. A file saved as `export.json` that is
  // really a zip is commoner than it sounds, and the reverse costs nothing
  // to allow.
  if (looksLikeZip(bytes)) return unzipFirstJson(bytes);
  return { ok: true, text: utf8Decode(bytes), from: name };
}
