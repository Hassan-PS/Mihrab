/**
 * The gold that means "sunnah", in one place.
 *
 * It has to survive next to the fasting ring, which is `#B45309` light /
 * `#FBBF24` dark — literally the app's amber accent swatch. On the graph the
 * two sit inside each other on a square smaller than a grain of rice, so
 * choosing "a nice gold" is not enough: they are neighbours on the wheel, and
 * a saturated gold inside a saturated amber reads as one fuzzy blob.
 *
 * So the two are separated by LIGHTNESS rather than hue. In light mode the
 * sunnah gold is deeper and yellower than the fast ring's burnt orange; in
 * dark mode it is markedly paler than the fast ring's bright amber. Shape
 * helps too — the fast ring is the outer border, the sunnah ring is inset —
 * but colour alone should still tell them apart for anyone who cannot rely on
 * a 1pt difference in position.
 *
 * Amber is also one of the accent colours a user can pick, which is why this
 * is not derived from the accent: their whole graph could otherwise go gold.
 */
/**
 * The sunnah marker's colour is the app's accent, not a gold of its own
 * (docs/design/redesign-plan.md §2.4). Gold was a third hue on the Log —
 * beside the green ramp, the orange fast ring and the red missed mark —
 * and six colours on one screen read as noise. A sunnah is "more of the
 * same act", so it speaks in the same voice, as a small solid mark where
 * the prayers are a fill.
 */
export function sunnahMark(palette: { accentSolid: string }): string {
  return palette.accentSolid;
}

/**
 * The heart marking a night that held Qiyam al-Layl.
 *
 * White in both themes, deliberately: it sits on top of the day's fill, which
 * ranges from warm paper to deep accent, and white is the only value that
 * stays visible across all of it. On the palest squares it gets a hairline of
 * the fill colour behind it — see the heatmap.
 */
export const QIYAM_MARK = '#FFFFFF';
