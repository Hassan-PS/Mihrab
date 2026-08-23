// tokens-ok: this surface is deliberately black on white in both themes —
// see the comment below. Theme tokens would break the thing it is for.
import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { encodeQr } from '../../sync/qr';
import { RADIUS } from '../../theme/tokens';

/**
 * The pairing code as a QR, for a camera to read off this screen.
 *
 * ── IT IGNORES THE THEME, ON PURPOSE ──────────────────────────────────
 *
 * Dark modules on a white field, in dark mode too, with the quiet zone the
 * standard requires. A QR drawn in theme colours is a QR that sometimes does
 * not scan: decoders binarise the image, and a low-contrast pair — or an
 * inverted one, which many decoders reject outright — turns a working code
 * into a user who thinks the feature is broken. The white card looks like a
 * deliberate object on a dark screen, which is also what it is.
 *
 * ── ONE PATH, NOT A THOUSAND RECTS ────────────────────────────────────
 *
 * A version 4 symbol is 33x33, so a rect per dark module is up to a thousand
 * views for a picture that never changes. The modules are run-length merged
 * along each row into a single path, which is typically a few dozen
 * subpaths and one node.
 */
type Props = {
  /** The pairing code. Must be QR-alphanumeric; `encode()` always is. */
  code: string;
  /** Side length in points, excluding nothing — the quiet zone is inside. */
  size?: number;
};

/** Modules per side of the quiet zone. Four is what the standard asks for. */
const QUIET = 4;

function PairingQrImpl({ code, size = 220 }: Props) {
  const drawn = useMemo(() => {
    const qr = encodeQr(code);
    let d = '';
    for (let y = 0; y < qr.size; y++) {
      let x = 0;
      while (x < qr.size) {
        if (!qr.modules[y][x]) {
          x++;
          continue;
        }
        let run = 1;
        while (x + run < qr.size && qr.modules[y][x + run]) run++;
        d += `M${x} ${y}h${run}v1h-${run}z`;
        x += run;
      }
    }
    return { path: d, span: qr.size + QUIET * 2 };
  }, [code]);

  return (
    <View style={[styles.frame, { width: size, height: size }]}>
      <Svg
        width={size}
        height={size}
        viewBox={`${-QUIET} ${-QUIET} ${drawn.span} ${drawn.span}`}
      >
        <Rect
          x={-QUIET}
          y={-QUIET}
          width={drawn.span}
          height={drawn.span}
          fill="#FFFFFF"
        />
        <Path d={drawn.path} fill="#000000" />
      </Svg>
    </View>
  );
}

export const PairingQr = memo(PairingQrImpl);

const styles = StyleSheet.create({
  frame: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
    alignSelf: 'center',
  },
});
