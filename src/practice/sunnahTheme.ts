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
export const SUNNAH_GOLD_LIGHT = '#9A7B1F';
export const SUNNAH_GOLD_DARK = '#E8CE7A';

export function sunnahGold(isDark: boolean): string {
  return isDark ? SUNNAH_GOLD_DARK : SUNNAH_GOLD_LIGHT;
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
