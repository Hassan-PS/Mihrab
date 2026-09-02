"""The fifteen-row grid of ONE page.

The edition-wide block is close but not exact: a page's text sits a few
units higher or lower than the book's average, and its rows a fraction
closer together. On Warsh that drift reaches 14.9 units against a
half-row of 18.1 — an 18% margin before an ayah is read onto the wrong
line, which is no margin at all for a thing that must not be wrong.

The page states its own grid many times over. Every rectangle edge falls
on a row boundary and every ayah medallion on a row centre, so a page
offers thirty or forty samples of `top + pitch x k` at a known k.
Fitting those is well conditioned even when a few of them are the
export's bad ones: the worst tenth are dropped on each pass. The result
is held near the book's own block, because a fit that has gone wrong
does not fail by a little — unclamped, two Warsh pages settled a whole
row out and took every ayah on them along.

Measured over both editions, this takes the worst medallion off its row
centre from 14.9 units to 7.2 on Warsh and from 8.1 to 2.7 on Shu'bah,
and moves no ayah to a different row than the book's own grid gave it.
It is not a correction, then, but a proof: the row an ayah is put on is
no longer a near thing.
"""
LINES_PER_PAGE = 15

# How far a page may depart from the book. A twelfth on the pitch and
# two fifths of a row on the top are more than any page needs and much
# less than the half-row at which the fit would start moving ayahs.
PITCH_GIVE = 0.08
TOP_GIVE = 0.40
TRIM = 0.10
PASSES = 4


def fit(edges, centres, top, pitch, count=LINES_PER_PAGE):
    """(top, pitch) for this page, from its own boundaries and medallions."""
    anchor_top, anchor_pitch = top, pitch
    samples = [(v, 0.0) for v in edges] + [(v, 0.5) for v in centres]
    if len(samples) < 6:
        return top, pitch
    for _ in range(PASSES):
        rows = []
        for v, off in samples:
            k = round((v - top) / pitch - off)
            rows.append(min(count - (1 if off else 0), max(0, k)) + off)
        order = sorted(
            range(len(samples)),
            key=lambda i: abs(samples[i][0] - (top + pitch * rows[i])))
        keep = order[:max(6, int(len(samples) * (1 - TRIM)))]
        xs = [rows[i] for i in keep]
        ys = [samples[i][0] for i in keep]
        n = len(xs)
        mx, my = sum(xs) / n, sum(ys) / n
        var = sum((x - mx) ** 2 for x in xs)
        if var <= 0:
            break
        slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / var
        slope = min(anchor_pitch * (1 + PITCH_GIVE),
                    max(anchor_pitch * (1 - PITCH_GIVE), slope))
        base = my - slope * mx
        base = min(anchor_top + anchor_pitch * TOP_GIVE,
                   max(anchor_top - anchor_pitch * TOP_GIVE, base))
        if abs(base - top) < 1e-6 and abs(slope - pitch) < 1e-6:
            break
        top, pitch = base, slope
    return top, pitch
