import { unzlibSync, zlibSync } from 'fflate';

/**
 * A one-page A4 PDF wrapped around a captured PNG.
 *
 * ── WHY THIS EXISTS RATHER THAN A LIBRARY ─────────────────────────────
 *
 * The month sheet is a thing people print and pin up in a hallway, and a
 * PNG is not what you hand a printer: it has no page size, so every print
 * dialogue guesses one, and the guesses differ. A PDF that says A4 prints
 * as A4 everywhere.
 *
 * There is no PDF dependency in this app and adding one to draw a single
 * image would be a large amount of code for a small amount of work — the
 * whole document is one image on one page. What that costs is written out
 * below, and it is about a hundred lines.
 *
 * ── WHY THE PIXELS ARE RE-ENCODED ─────────────────────────────────────
 *
 * PNG is not a PDF filter. A PDF image stream can be Flate-compressed —
 * which is the same deflate a PNG uses — but PNG additionally runs a
 * per-row FILTER over the bytes before compressing them, and it may carry
 * an alpha channel that a PDF image cannot hold without a separate soft
 * mask. So the IDAT is inflated, un-filtered, stripped to RGB, and
 * deflated again. Nothing is resampled and nothing is quantised: the
 * bytes that go into the PDF are the exact pixels that came out of the
 * capture.
 *
 * The obvious shortcut — capture JPEG and embed it with DCTDecode, which
 * needs no decoding at all — was rejected on the artefact. This sheet is
 * small text on white, which is precisely what JPEG's chroma subsampling
 * and ringing damage most, and a table of prayer times that has gone soft
 * at the digits is worse than no PDF.
 */

/** A4 in PostScript points, which is the unit a PDF page is measured in. */
export const A4_WIDTH_PT = 595.276;
export const A4_HEIGHT_PT = 841.89;

type Decoded = { width: number; height: number; rgb: Uint8Array };

function be32(b: Uint8Array, at: number): number {
  return (
    ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0
  );
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Undo PNG's per-row filtering and hand back plain RGB.
 *
 * Only the shape a screen capture actually produces is handled — eight
 * bits a channel, truecolour with or without alpha, not interlaced. Every
 * other shape throws rather than being guessed at, because a PDF built
 * from a misread image is a file that opens and is wrong, which is the
 * worst of the three outcomes. The caller falls back to the PNG.
 */
export function decodePng(png: Uint8Array): Decoded {
  for (let i = 0; i < PNG_MAGIC.length; i++) {
    if (png[i] !== PNG_MAGIC[i]) throw new Error('not a PNG');
  }
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Uint8Array[] = [];
  let at = 8;
  while (at + 8 <= png.length) {
    const len = be32(png, at);
    const type = String.fromCharCode(
      png[at + 4],
      png[at + 5],
      png[at + 6],
      png[at + 7],
    );
    const body = at + 8;
    if (type === 'IHDR') {
      width = be32(png, body);
      height = be32(png, body + 4);
      const depth = png[body + 8];
      const colorType = png[body + 9];
      const interlace = png[body + 12];
      if (depth !== 8) throw new Error(`unsupported bit depth ${depth}`);
      if (interlace !== 0) throw new Error('interlaced PNG');
      if (colorType === 2) channels = 3;
      else if (colorType === 6) channels = 4;
      else throw new Error(`unsupported colour type ${colorType}`);
    } else if (type === 'IDAT') {
      idat.push(png.subarray(body, body + len));
    } else if (type === 'IEND') {
      break;
    }
    at = body + len + 4; // + CRC
  }
  if (!width || !height || !channels) throw new Error('PNG has no IHDR');

  let total = 0;
  for (const part of idat) total += part.length;
  const joined = new Uint8Array(total);
  let off = 0;
  for (const part of idat) {
    joined.set(part, off);
    off += part.length;
  }
  const raw = unzlibSync(joined);

  const stride = width * channels;
  const rgb = new Uint8Array(width * height * 3);
  const line = new Uint8Array(stride);
  const prev = new Uint8Array(stride);
  let src = 0;
  let dst = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    for (let i = 0; i < stride; i++) line[i] = raw[src + i];
    src += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let value = line[i];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) {
        throw new Error(`unknown PNG filter ${filter}`);
      }
      line[i] = value & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const s = x * channels;
      rgb[dst++] = line[s];
      rgb[dst++] = line[s + 1];
      rgb[dst++] = line[s + 2];
      // Alpha, where there is one, is dropped: the sheet is composited
      // onto opaque white before it is captured, so there is nothing in
      // it to preserve.
    }
    prev.set(line);
  }
  return { width, height, rgb };
}

function ascii(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

/**
 * The image, centred on an A4 page at the largest size that fits.
 *
 * The sheet is drawn to A4 proportions already, so in practice this
 * scales to the full page; the fit is computed anyway so that a capture
 * whose aspect drifted by a pixel is letterboxed rather than stretched.
 */
export function pngToPdfA4(png: Uint8Array): Uint8Array {
  const { width, height, rgb } = decodePng(png);
  const scale = Math.min(A4_WIDTH_PT / width, A4_HEIGHT_PT / height);
  const drawW = width * scale;
  const drawH = height * scale;
  const x = (A4_WIDTH_PT - drawW) / 2;
  const y = (A4_HEIGHT_PT - drawH) / 2;
  const pixels = zlibSync(rgb, { level: 9 });

  const round = (n: number) => Math.round(n * 100) / 100;
  const content = ascii(
    `q\n${round(drawW)} 0 0 ${round(drawH)} ${round(x)} ${round(y)} cm\n/Im0 Do\nQ\n`,
  );

  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let cursor = 0;
  const push = (chunk: Uint8Array) => {
    parts.push(chunk);
    cursor += chunk.length;
  };
  const obj = (n: number, body: string) => {
    offsets[n] = cursor;
    push(ascii(`${n} 0 obj\n${body}\nendobj\n`));
  };

  push(ascii('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'));
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${round(A4_WIDTH_PT)} ${round(
      A4_HEIGHT_PT,
    )}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
  );

  // Object 4 carries binary, so it cannot go through `obj`.
  offsets[4] = cursor;
  push(
    ascii(
      `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode ` +
        `/Length ${pixels.length} >>\nstream\n`,
    ),
  );
  push(pixels);
  push(ascii('\nendstream\nendobj\n'));

  offsets[5] = cursor;
  push(
    ascii(`5 0 obj\n<< /Length ${content.length} >>\nstream\n`),
  );
  push(content);
  push(ascii('endstream\nendobj\n'));

  const xrefAt = cursor;
  let xref = 'xref\n0 6\n0000000000 65535 f \n';
  for (let n = 1; n <= 5; n++) {
    xref += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  push(ascii(xref));

  const pdf = new Uint8Array(cursor);
  let at2 = 0;
  for (const part of parts) {
    pdf.set(part, at2);
    at2 += part.length;
  }
  return pdf;
}

/** Base64 for a byte array, without leaning on Buffer or btoa. */
export function toBase64(bytes: Uint8Array): string {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += A[b0 >> 2];
    out += A[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    out += i + 1 < bytes.length ? A[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)] : '=';
    out += i + 2 < bytes.length ? A[b2 & 63] : '=';
  }
  return out;
}

/** Bytes for a base64 string — the other half, for what capture returns. */
export function fromBase64(text: string): Uint8Array {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let at = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (A.indexOf(clean[i]) << 18) |
      (A.indexOf(clean[i + 1]) << 12) |
      ((clean[i + 2] ? A.indexOf(clean[i + 2]) : 0) << 6) |
      (clean[i + 3] ? A.indexOf(clean[i + 3]) : 0);
    out[at++] = (n >> 16) & 0xff;
    if (i + 2 < clean.length) out[at++] = (n >> 8) & 0xff;
    if (i + 3 < clean.length) out[at++] = n & 0xff;
  }
  return out.subarray(0, at);
}
