/**
 * The file the reader picked, whatever shape it arrives in.
 *
 * The bug this covers is not hypothetical: QUL's "Download json" button
 * produces `qpc-warsh-script-ayah.json.zip`, and the first version of the
 * import asked for a `.json` and found nothing. So the cases that matter
 * here are the awkward ones — a zip that is not called one, an archive
 * written by a streaming writer, a directory entry before the file.
 */
import { zipSync, strToU8 } from 'fflate';
import {
  looksLikeZip,
  mushafTextFromFile,
  unzipFirstJson,
} from '../src/quran/mushafFile';
import { utf8Encode } from '../src/sync/secureRandom';

/** A muṣḥaf export is Arabic, so every path here has to survive UTF-8. */
const PAYLOAD = JSON.stringify({
  '1:1': 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ',
  '112:1': 'قُلْ هُوَ ٱللَّهُ أَحَدٌ',
});

/**
 * One local file header and its data, built by hand.
 *
 * `fflate` covers the archives a normal writer produces; this covers the
 * ones it will not make — a streamed entry, an unknown compression method
 * — which are exactly the archives that must fail with a message rather
 * than a wrong answer.
 */
function entry(
  name: string,
  data: Uint8Array,
  { method = 0, flags = 0, declareSizes = true } = {},
): Uint8Array {
  const nameBytes = utf8Encode(name);
  const out = new Uint8Array(30 + nameBytes.length + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(6, flags, true);
  view.setUint16(8, method, true);
  view.setUint32(18, declareSizes ? data.length : 0, true);
  view.setUint32(22, declareSizes ? data.length : 0, true);
  view.setUint16(26, nameBytes.length, true);
  out.set(nameBytes, 30);
  out.set(data, 30 + nameBytes.length);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function textOf(result: ReturnType<typeof mushafTextFromFile>): string {
  if (!result.ok) throw new Error(`${result.key}: ${result.detail ?? ''}`);
  return result.text;
}

describe('a plain file', () => {
  it('is read as text', () => {
    const result = mushafTextFromFile('warsh.json', strToU8(PAYLOAD));
    expect(textOf(result)).toBe(PAYLOAD);
  });

  it('keeps the Arabic exactly', () => {
    const result = mushafTextFromFile('warsh.json', strToU8(PAYLOAD));
    expect(JSON.parse(textOf(result))['112:1']).toBe('قُلْ هُوَ ٱللَّهُ أَحَدٌ');
  });

  it('names the file it read', () => {
    const result = mushafTextFromFile('warsh.json', strToU8(PAYLOAD));
    expect(result.ok && result.from).toBe('warsh.json');
  });

  it('refuses an empty one rather than installing nothing', () => {
    const result = mushafTextFromFile('warsh.json', new Uint8Array(0));
    expect(result).toMatchObject({ ok: false, key: 'downloads.riwayahUnreadable' });
  });
});

describe('the file QUL actually gives you', () => {
  const zipped = zipSync({ 'qpc-warsh-script-ayah.json': strToU8(PAYLOAD) });

  it('is recognised as an archive', () => {
    expect(looksLikeZip(zipped)).toBe(true);
    expect(looksLikeZip(strToU8(PAYLOAD))).toBe(false);
  });

  it('is read without being extracted first', () => {
    const result = mushafTextFromFile('qpc-warsh-script-ayah.json.zip', zipped);
    expect(textOf(result)).toBe(PAYLOAD);
  });

  it('reports the entry inside, not the archive', () => {
    const result = mushafTextFromFile('qpc-warsh-script-ayah.json.zip', zipped);
    expect(result.ok && result.from).toBe('qpc-warsh-script-ayah.json');
  });
});

describe('what the archive is called is not evidence', () => {
  it('unzips a zip saved as .json', () => {
    // Browsers and share sheets both do this. Trusting the extension here
    // would hand a reader a zip's bytes as if they were JSON.
    const zipped = zipSync({ 'inner.json': strToU8(PAYLOAD) });
    expect(textOf(mushafTextFromFile('warsh.json', zipped))).toBe(PAYLOAD);
  });

  it('reads plain JSON saved as .zip', () => {
    expect(textOf(mushafTextFromFile('warsh.zip', strToU8(PAYLOAD)))).toBe(
      PAYLOAD,
    );
  });
});

describe('walking to the entry that matters', () => {
  it('skips a stored entry that is not JSON', () => {
    const zipped = zipSync(
      { 'README.txt': strToU8('read me'), 'data.json': strToU8(PAYLOAD) },
      { level: 0 },
    );
    expect(textOf(unzipFirstJson(zipped))).toBe(PAYLOAD);
  });

  it('skips a deflated entry that is not JSON', () => {
    const zipped = zipSync({
      'notes.md': strToU8('x'.repeat(4096)),
      'data.json': strToU8(PAYLOAD),
    });
    expect(textOf(unzipFirstJson(zipped))).toBe(PAYLOAD);
  });

  it('steps over the folder an export is wrapped in', () => {
    const zipped = concat(
      entry('qpc-warsh/', new Uint8Array(0)),
      entry('qpc-warsh/ayah.json', utf8Encode(PAYLOAD)),
    );
    expect(textOf(unzipFirstJson(zipped))).toBe(PAYLOAD);
  });

  it('reads a stored entry as well as a deflated one', () => {
    const stored = zipSync({ 'data.json': strToU8(PAYLOAD) }, { level: 0 });
    expect(textOf(unzipFirstJson(stored))).toBe(PAYLOAD);
  });

  it('says so when there is no JSON inside', () => {
    const zipped = zipSync({ 'README.txt': strToU8('nothing here') });
    expect(mushafTextFromFile('bundle.zip', zipped)).toMatchObject({
      ok: false,
      key: 'downloads.riwayahNoJsonInZip',
    });
  });
});

describe('archives this cannot open say why', () => {
  it('refuses a streamed entry rather than guessing where it ends', () => {
    // Flag bit 3: the sizes are in a descriptor after the data, so there is
    // no length in the header to trust and the entry cannot be located.
    const zipped = concat(
      entry('data.json', utf8Encode(PAYLOAD), {
        flags: 0x08,
        declareSizes: false,
      }),
    );
    const result = mushafTextFromFile('export.zip', zipped);
    expect(result).toMatchObject({
      ok: false,
      key: 'downloads.riwayahZipUnsupported',
    });
    expect(result.ok === false && result.detail).toContain('data.json');
  });

  it('refuses a compression method it does not implement', () => {
    const zipped = entry('data.json', utf8Encode(PAYLOAD), { method: 14 });
    expect(mushafTextFromFile('export.zip', zipped)).toMatchObject({
      ok: false,
      key: 'downloads.riwayahZipUnsupported',
    });
  });

  it('reports a corrupt stream as an archive that would not open', () => {
    const broken = entry('data.json', utf8Encode('not deflate at all'), {
      method: 8,
    });
    expect(mushafTextFromFile('export.zip', broken)).toMatchObject({
      ok: false,
      key: 'downloads.riwayahZipUnreadable',
    });
  });
});

describe('every message it can produce', () => {
  it('is a key the app can translate', () => {
    const en = require('../src/i18n/locales/en.json') as {
      downloads: Record<string, string>;
    };
    const keys = [
      'downloads.riwayahUnreadable',
      'downloads.riwayahZipUnsupported',
      'downloads.riwayahZipUnreadable',
      'downloads.riwayahNoJsonInZip',
      'downloads.riwayahFileTooLarge',
    ];
    // The failures above carry keys as strings, so nothing else checks that
    // they exist — `translationDefaults` only sees literal `t('…')` calls.
    expect(keys.filter(k => !(k.split('.')[1] in en.downloads))).toEqual([]);
  });
});
