/**
 * A QR code for the pairing code, written here rather than installed.
 *
 * ── WHY NOT A LIBRARY ─────────────────────────────────────────────────
 *
 * `react-native-qrcode-svg` would do this, and it pulls `qrcode`, which
 * pulls four more packages, to draw a grid of squares. That is a poor trade
 * for an app that ships on F-Droid, where every node_modules entry is
 * something the recipe has to account for and something a reproducible build
 * has to fetch.
 *
 * It is also a trade we get to make on unusually good terms, because the
 * only thing this ever encodes is a pairing code. That is uppercase base32
 * and hyphens by construction, which is a subset of QR's ALPHANUMERIC mode,
 * so the byte/kanji/ECI machinery that makes a general encoder large is not
 * needed at all. What is left is the part that must be exactly right — the
 * Reed-Solomon, the placement, the masking — and that part is verified in
 * `__tests__/qr.test.ts` against matrices produced by an independent
 * implementation, module for module, rather than by looking at a picture.
 *
 * ── THE CHOICES ───────────────────────────────────────────────────────
 *
 * ERROR CORRECTION LEVEL M, about 15% recoverable. A code being scanned off
 * one phone screen by another phone is close to ideal conditions — no print,
 * no fold, no distance — so H's 30% would only buy a denser grid, and denser
 * is worse when the source is a screen with its own pixel grid.
 *
 * VERSIONS 1 TO 6, which is 154 alphanumeric characters at level M against
 * the 67 a pairing code needs. Everything past 6 needs the version
 * information block and the multi-size block tables, and would be dead code
 * the day it was written. Anything longer throws rather than silently
 * producing a code that cannot be scanned.
 */

/** QR's alphanumeric alphabet, in its defined order. */
const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

/** Mode indicator for alphanumeric. */
const MODE_ALNUM = 0b0010;

/** Character-count indicator width for alphanumeric, versions 1 to 9. */
const COUNT_BITS = 9;

/** Level M's two bits, as they go into the format information. */
const EC_LEVEL_M = 0b00;

/** Pad bytes, alternated, once the terminator and byte alignment are done. */
const PAD_BYTES = [0xec, 0x11];

type VersionSpec = {
  version: number;
  /** Data plus error correction, in codewords. */
  total: number;
  /** Data codewords across all blocks. */
  data: number;
  blocks: number;
};

/**
 * Level M only. Every version here divides into equal blocks, which is why
 * the interleaving below has no short-block/long-block split — a simplifying
 * accident of levels and versions, not a general truth.
 */
const SPECS: VersionSpec[] = [
  { version: 1, total: 26, data: 16, blocks: 1 },
  { version: 2, total: 44, data: 28, blocks: 1 },
  { version: 3, total: 70, data: 44, blocks: 1 },
  { version: 4, total: 100, data: 64, blocks: 2 },
  { version: 5, total: 134, data: 86, blocks: 2 },
  { version: 6, total: 172, data: 108, blocks: 4 },
];

export type QrCode = {
  version: number;
  /** Modules per side, including the function patterns, excluding the quiet zone. */
  size: number;
  mask: number;
  /** `modules[y][x]`, true where the module is dark. */
  modules: boolean[][];
};

export class QrTooLong extends Error {
  constructor(length: number) {
    super(`${length} characters will not fit in a version 6 QR code`);
    this.name = 'QrTooLong';
  }
}

export class QrNotAlphanumeric extends Error {
  constructor(char: string) {
    super(`${JSON.stringify(char)} is not in QR's alphanumeric set`);
    this.name = 'QrNotAlphanumeric';
  }
}

// ── GF(256), the field the error correction lives in ────────────────────

function buildFieldTables(): { exp: Uint8Array; log: Uint8Array } {
  const exp = new Uint8Array(512);
  const log = new Uint8Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) {
    exp[i] = x;
    log[x] = i;
    // x * 2 in GF(256), reduced by the QR standard's primitive polynomial.
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) exp[i] = exp[i - 255];
  return { exp, log };
}

const FIELD = buildFieldTables();

function mul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return FIELD.exp[FIELD.log[a] + FIELD.log[b]];
}

/** The divisor polynomial's coefficients, leading 1 omitted. */
function divisorFor(degree: number): Uint8Array {
  const result = new Uint8Array(degree);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = mul(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = mul(root, 0x02);
  }
  return result;
}

function remainderOf(data: Uint8Array, divisor: Uint8Array): Uint8Array {
  const result = new Uint8Array(divisor.length);
  for (const byte of data) {
    const factor = byte ^ result[0];
    result.copyWithin(0, 1);
    result[result.length - 1] = 0;
    for (let i = 0; i < divisor.length; i++) {
      result[i] ^= mul(divisor[i], factor);
    }
  }
  return result;
}

// ── Encoding the text ───────────────────────────────────────────────────

class BitBuffer {
  private bits: number[] = [];

  push(value: number, width: number): void {
    for (let i = width - 1; i >= 0; i--) {
      this.bits.push((value >>> i) & 1);
    }
  }

  get length(): number {
    return this.bits.length;
  }

  /** Zero-padded up to a whole number of bytes. */
  toBytes(): Uint8Array {
    const out = new Uint8Array(Math.ceil(this.bits.length / 8));
    this.bits.forEach((bit, i) => {
      if (bit) out[i >>> 3] |= 0x80 >>> (i & 7);
    });
    return out;
  }
}

/** Bits an alphanumeric payload of `n` characters occupies, header included. */
function bitsNeeded(n: number): number {
  return 4 + COUNT_BITS + Math.floor(n / 2) * 11 + (n % 2) * 6;
}

/** Whether a string can be carried at all. Pairing codes always can. */
export function isAlphanumeric(text: string): boolean {
  for (const ch of text) {
    if (!ALNUM.includes(ch)) return false;
  }
  return true;
}

function specFor(length: number): VersionSpec {
  const needed = bitsNeeded(length);
  for (const spec of SPECS) {
    if (needed <= spec.data * 8) return spec;
  }
  throw new QrTooLong(length);
}

function dataCodewords(text: string, spec: VersionSpec): Uint8Array {
  const buffer = new BitBuffer();
  buffer.push(MODE_ALNUM, 4);
  buffer.push(text.length, COUNT_BITS);
  for (let i = 0; i + 1 < text.length; i += 2) {
    buffer.push(ALNUM.indexOf(text[i]) * 45 + ALNUM.indexOf(text[i + 1]), 11);
  }
  if (text.length % 2 === 1) {
    buffer.push(ALNUM.indexOf(text[text.length - 1]), 6);
  }

  const capacity = spec.data * 8;
  // Terminator: up to four zero bits, fewer if the buffer is nearly full.
  buffer.push(0, Math.min(4, capacity - buffer.length));
  // Then to the next byte boundary.
  buffer.push(0, (8 - (buffer.length % 8)) % 8);

  const out = new Uint8Array(spec.data);
  out.set(buffer.toBytes());
  for (let i = buffer.length / 8, p = 0; i < spec.data; i++, p++) {
    out[i] = PAD_BYTES[p % 2];
  }
  return out;
}

/** Data and error correction, interleaved as the standard requires. */
function finalCodewords(text: string, spec: VersionSpec): Uint8Array {
  const data = dataCodewords(text, spec);
  const perBlock = spec.data / spec.blocks;
  const ecLength = (spec.total - spec.data) / spec.blocks;
  const divisor = divisorFor(ecLength);

  const blocks: Uint8Array[] = [];
  const eccs: Uint8Array[] = [];
  for (let i = 0; i < spec.blocks; i++) {
    const block = data.subarray(i * perBlock, (i + 1) * perBlock);
    blocks.push(block);
    eccs.push(remainderOf(block, divisor));
  }

  const out = new Uint8Array(spec.total);
  let at = 0;
  for (let i = 0; i < perBlock; i++) {
    for (const block of blocks) out[at++] = block[i];
  }
  for (let i = 0; i < ecLength; i++) {
    for (const ecc of eccs) out[at++] = ecc[i];
  }
  return out;
}

// ── Drawing ─────────────────────────────────────────────────────────────

class Grid {
  readonly size: number;
  readonly modules: boolean[][];
  /** Function patterns may not be masked and may not carry data. */
  readonly reserved: boolean[][];

  constructor(readonly version: number) {
    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () =>
      new Array<boolean>(this.size).fill(false),
    );
    this.reserved = Array.from({ length: this.size }, () =>
      new Array<boolean>(this.size).fill(false),
    );
  }

  setFunction(x: number, y: number, dark: boolean): void {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    this.modules[y][x] = dark;
    this.reserved[y][x] = true;
  }

  drawFinder(cx: number, cy: number): void {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        this.setFunction(cx + dx, cy + dy, dist !== 2 && dist !== 4);
      }
    }
  }

  drawAlignment(cx: number, cy: number): void {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.setFunction(
          cx + dx,
          cy + dy,
          Math.max(Math.abs(dx), Math.abs(dy)) !== 1,
        );
      }
    }
  }

  drawFunctionPatterns(): void {
    for (let i = 0; i < this.size; i++) {
      this.setFunction(6, i, i % 2 === 0);
      this.setFunction(i, 6, i % 2 === 0);
    }
    this.drawFinder(3, 3);
    this.drawFinder(this.size - 4, 3);
    this.drawFinder(3, this.size - 4);
    // Versions 2 to 6 have exactly one alignment pattern, at the far corner
    // from the three finders. Versions 7 and up have a grid of them, and
    // this encoder does not go there.
    if (this.version >= 2) {
      const pos = this.version * 4 + 10;
      this.drawAlignment(pos, pos);
    }
    // Reserved now, drawn for real once the mask is chosen.
    this.drawFormat(0);
  }

  drawFormat(mask: number): void {
    const data = (EC_LEVEL_M << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((bits >>> i) & 1) !== 0;

    for (let i = 0; i <= 5; i++) this.setFunction(8, i, bit(i));
    this.setFunction(8, 7, bit(6));
    this.setFunction(8, 8, bit(7));
    this.setFunction(7, 8, bit(8));
    for (let i = 9; i < 15; i++) this.setFunction(14 - i, 8, bit(i));

    for (let i = 0; i < 8; i++) {
      this.setFunction(this.size - 1 - i, 8, bit(i));
    }
    for (let i = 8; i < 15; i++) {
      this.setFunction(8, this.size - 15 + i, bit(i));
    }
    // The one module that is dark in every valid QR code.
    this.setFunction(8, this.size - 8, true);
  }

  drawCodewords(codewords: Uint8Array): void {
    let i = 0;
    const total = codewords.length * 8;
    for (let right = this.size - 1; right >= 1; right -= 2) {
      // Column 6 is the vertical timing pattern; the zigzag steps over it.
      if (right === 6) right = 5;
      for (let vert = 0; vert < this.size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? this.size - 1 - vert : vert;
          if (!this.reserved[y][x] && i < total) {
            this.modules[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
            i++;
          }
        }
      }
    }
  }

  applyMask(mask: number): void {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (this.reserved[y][x]) continue;
        if (maskAt(mask, x, y)) this.modules[y][x] = !this.modules[y][x];
      }
    }
  }
}

function maskAt(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

// ── Choosing the mask ───────────────────────────────────────────────

const PENALTY_RUN = 3;
const PENALTY_BLOCK = 3;
const PENALTY_FINDER = 40;
const PENALTY_BALANCE = 10;

/** The finder-like sequence rule 3 looks for: dark light dark*3 light dark. */
const FINDER_LIKE = [1, 0, 1, 1, 1, 0, 1];

function runsIn(line: number[]): number {
  let score = 0;
  let previous = -1;
  let run = 0;
  for (const value of line) {
    if (value === previous) {
      run++;
    } else {
      if (run >= 5) score += PENALTY_RUN + (run - 5);
      previous = value;
      run = 1;
    }
  }
  return run >= 5 ? score + PENALTY_RUN + (run - 5) : score;
}

/**
 * Whether `line[from..to)` is entirely light AND entirely inside the symbol.
 *
 * Out of bounds counts as NOT light, which is the choice that decides
 * whether a finder-like pattern touching the symbol edge is penalised. The
 * quiet zone around a QR code is four light modules, so reading the rule the
 * other way is defensible and Nayuki's encoder does exactly that — but ZXing
 * and every decoder-side implementation this code will meet do not, and
 * matching them is what lets the test compare mask choice against an
 * independent encoder instead of just asserting our own output back at us.
 */
function isLight(line: number[], from: number, to: number): boolean {
  if (from < 0 || line.length < to) return false;
  for (let i = from; i < to; i++) {
    if (line[i] === 1) return false;
  }
  return true;
}

function finderLikesIn(line: number[]): number {
  let count = 0;
  for (let i = 0; i + FINDER_LIKE.length <= line.length; i++) {
    let matches = true;
    for (let k = 0; k < FINDER_LIKE.length; k++) {
      if (line[i + k] !== FINDER_LIKE[k]) {
        matches = false;
        break;
      }
    }
    if (!matches) continue;
    if (isLight(line, i - 4, i) || isLight(line, i + 7, i + 11)) count++;
  }
  return count;
}

/**
 * The standard's four penalty rules, lower being better.
 *
 * Worth being clear about what this is and is not. The mask number is
 * written into the format bits, so ALL eight masks scan; picking a different
 * one produces a different but equally valid symbol. This score is a quality
 * heuristic — it exists to avoid large blank areas, 2x2 blocks and shapes a
 * decoder might mistake for a finder — and implementations legitimately
 * disagree at the margins. Ours follows the standard's reading as ZXing
 * implements it, and the test pins the resulting choice against an
 * independent encoder so that a change here is a deliberate one.
 */
function penalty(grid: Grid): number {
  const { size, modules } = grid;
  const rows: number[][] = [];
  const columns: number[][] = [];
  for (let y = 0; y < size; y++) {
    rows.push(modules[y].map(dark => (dark ? 1 : 0)));
  }
  for (let x = 0; x < size; x++) {
    const column: number[] = [];
    for (let y = 0; y < size; y++) column.push(modules[y][x] ? 1 : 0);
    columns.push(column);
  }

  let score = 0;
  for (const line of rows) score += runsIn(line);
  for (const line of columns) score += runsIn(line);
  for (const line of rows) score += finderLikesIn(line) * PENALTY_FINDER;
  for (const line of columns) score += finderLikesIn(line) * PENALTY_FINDER;

  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const colour = modules[y][x];
      if (
        colour === modules[y][x + 1] &&
        colour === modules[y + 1][x] &&
        colour === modules[y + 1][x + 1]
      ) {
        score += PENALTY_BLOCK;
      }
    }
  }

  // Rule 4: how far the proportion of dark modules strays from half, in
  // whole 5% steps. Integer arithmetic throughout, because a rounding
  // difference here changes which mask wins.
  let dark = 0;
  for (const row of modules) {
    for (const module of row) if (module) dark++;
  }
  const total = size * size;
  const steps = Math.floor((Math.abs(dark * 2 - total) * 10) / total);
  return score + steps * PENALTY_BALANCE;
}

/**
 * The QR code for `text`.
 *
 * Throws on anything outside the alphanumeric set or longer than version 6
 * carries, rather than substituting or truncating: a QR that scans to the
 * wrong string is worse than no QR, because the user has no way to tell.
 */
export function encodeQr(text: string): QrCode {
  for (const ch of text) {
    if (!ALNUM.includes(ch)) throw new QrNotAlphanumeric(ch);
  }
  const spec = specFor(text.length);
  const codewords = finalCodewords(text, spec);

  let best: Grid | null = null;
  let bestMask = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const grid = new Grid(spec.version);
    grid.drawFunctionPatterns();
    grid.drawCodewords(codewords);
    grid.applyMask(mask);
    grid.drawFormat(mask);
    const score = penalty(grid);
    if (score < bestScore) {
      bestScore = score;
      bestMask = mask;
      best = grid;
    }
  }

  const grid = best as Grid;
  return {
    version: spec.version,
    size: grid.size,
    mask: bestMask,
    modules: grid.modules,
  };
}

/** For the test, and for anyone who needs a specific mask. */
export function encodeQrWithMask(text: string, mask: number): QrCode {
  const spec = specFor(text.length);
  const grid = new Grid(spec.version);
  grid.drawFunctionPatterns();
  grid.drawCodewords(finalCodewords(text, spec));
  grid.applyMask(mask);
  grid.drawFormat(mask);
  return {
    version: spec.version,
    size: grid.size,
    mask,
    modules: grid.modules,
  };
}
