/**
 * The month sheet's PDF.
 *
 * A PNG is not what you hand a printer — it carries no page size, so every
 * print dialogue guesses one and the guesses differ. These tests hold the
 * two things that make the PDF worth having: the page really is A4, and
 * the pixels that come out are the pixels that went in.
 */
import { deflateSync } from 'zlib';
import {
  A4_HEIGHT_PT,
  A4_WIDTH_PT,
  decodePng,
  fromBase64,
  pngToPdfA4,
  toBase64,
} from '../src/share/pngToPdf';

/** A PNG built by hand, so the expected pixels are known exactly. */
function makePng(
  width: number,
  height: number,
  channels: 3 | 4,
  pixel: (x: number, y: number) => number[],
  filter = 0,
): Uint8Array {
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  const rows: number[][] = [];
  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) row.push(...pixel(x, y));
    rows.push(row);
  }
  for (let y = 0; y < height; y++) {
    const at = y * (stride + 1);
    raw[at] = filter;
    for (let i = 0; i < stride; i++) {
      const here = rows[y][i];
      // Only the two filters the tests use are encoded here.
      const left = i >= channels ? rows[y][i - channels] : 0;
      raw[at + 1 + i] = filter === 1 ? (here - left) & 0xff : here;
    }
  }
  const idat = deflateSync(raw);

  const chunk = (type: string, body: Buffer) => {
    const out = Buffer.alloc(body.length + 12);
    out.writeUInt32BE(body.length, 0);
    out.write(type, 4, 'ascii');
    body.copy(out, 8);
    out.writeUInt32BE(0, body.length + 8); // CRC unchecked by the decoder
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = channels === 4 ? 6 : 2;
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', idat),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

const gradient = (x: number, y: number) => [
  (x * 7) & 0xff,
  (y * 11) & 0xff,
  (x * y) & 0xff,
];

describe('reading the capture back', () => {
  it('returns the pixels it was given, unfiltered', () => {
    const png = makePng(9, 5, 3, gradient);
    const { width, height, rgb } = decodePng(png);
    expect([width, height]).toEqual([9, 5]);
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 9; x++) {
        expect(Array.from(rgb.subarray((y * 9 + x) * 3, (y * 9 + x) * 3 + 3)))
          .toEqual(gradient(x, y));
      }
    }
  });

  it('undoes the Sub filter, not just the None one', () => {
    const png = makePng(9, 5, 3, gradient, 1);
    const { rgb } = decodePng(png);
    expect(Array.from(rgb.subarray(0, 3))).toEqual(gradient(0, 0));
    expect(Array.from(rgb.subarray(24, 27))).toEqual(gradient(8, 0));
  });

  it('drops the alpha channel a captured screen carries', () => {
    // The sheet is composited onto opaque white before capture, so there
    // is nothing in the alpha to preserve — but the channel is there.
    const png = makePng(4, 3, 4, (x, y) => [...gradient(x, y), 255]);
    const { rgb } = decodePng(png);
    expect(rgb.length).toBe(4 * 3 * 3);
    expect(Array.from(rgb.subarray(0, 3))).toEqual(gradient(0, 0));
  });

  it('refuses a shape it would have to guess at', () => {
    const png = makePng(4, 3, 3, gradient);
    png[24] = 4; // bit depth 4
    expect(() => decodePng(png)).toThrow(/bit depth/);
    expect(() => decodePng(new Uint8Array([1, 2, 3]))).toThrow(/not a PNG/);
  });
});

describe('the PDF around it', () => {
  const pdf = pngToPdfA4(makePng(40, 56, 3, gradient));
  const text = Buffer.from(pdf).toString('latin1');

  it('is a PDF, and one page of it', () => {
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('/Type /Pages');
    expect(text).toContain('/Count 1');
  });

  it('says A4, which is the whole reason it exists', () => {
    expect(text).toContain(
      `/MediaBox [0 0 ${Math.round(A4_WIDTH_PT * 100) / 100} ${
        Math.round(A4_HEIGHT_PT * 100) / 100
      }]`,
    );
  });

  it('carries the image as lossless Flate, never as JPEG', () => {
    // Small text on white is exactly what JPEG damages most.
    expect(text).toContain('/Filter /FlateDecode');
    expect(text).not.toContain('DCTDecode');
    expect(text).toContain('/ColorSpace /DeviceRGB');
    expect(text).toContain('/BitsPerComponent 8');
    expect(text).toContain('/Width 40');
    expect(text).toContain('/Height 56');
  });

  it('draws it to fill the page without stretching it', () => {
    // 40×56 has A4's aspect to within a hair, so it should reach the
    // full width and be centred vertically by whatever is left.
    const m = text.match(/q\n([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm/);
    expect(m).not.toBeNull();
    const [w, h, x, y] = m!.slice(1).map(Number);
    expect(w / h).toBeCloseTo(40 / 56, 2);
    expect(w).toBeLessThanOrEqual(A4_WIDTH_PT + 0.01);
    expect(h).toBeLessThanOrEqual(A4_HEIGHT_PT + 0.01);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
  });

  it('has a cross-reference table that points at its objects', () => {
    // A wrong offset here is a file that opens in nothing.
    const xrefAt = Number(text.match(/startxref\n(\d+)/)![1]);
    expect(text.slice(xrefAt, xrefAt + 4)).toBe('xref');
    const rows = text
      .slice(xrefAt)
      .split('\n')
      .slice(3, 8) // past "xref", the count line, and the free entry
      .map(line => Number(line.slice(0, 10)));
    rows.forEach((at, i) => {
      expect(text.slice(at, at + 7)).toBe(`${i + 1} 0 obj`);
    });
  });
});

describe('base64, both ways', () => {
  it('round-trips every byte value, at every length remainder', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 255, 256, 257]) {
      const bytes = new Uint8Array(n);
      for (let i = 0; i < n; i++) bytes[i] = (i * 37) & 0xff;
      expect(Array.from(fromBase64(toBase64(bytes)))).toEqual(
        Array.from(bytes),
      );
    }
  });

  it('agrees with what the platform would produce', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253]);
    expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });
});
