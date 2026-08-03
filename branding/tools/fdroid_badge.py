"""The "GET IT ON F-Droid" badge, drawn to match the other three.

F-Droid publishes an official badge, but the four in `branding/badges/` are
all cropped to their ink at 564x168 so one CSS height lines them up on the
site and in the README. Dropping in artwork with different padding would
make the row of buttons sit at four different sizes, so this redraws the
badge to the same box and the same black-pill vocabulary as the Play,
GitHub and Obtainium ones.

    python3 branding/tools/fdroid_badge.py
"""
import sys

sys.path.insert(0, "branding/tools")

from PIL import Image, ImageDraw  # noqa: E402

from compose import ROUND_FONT, TEXT_FONT, _font  # noqa: E402

W, H = 564, 168
# F-Droid's own blue, light-to-dark down the mark.
BLUE_TOP = (86, 176, 226)
BLUE_BOTTOM = (27, 108, 158)
BORDER = (166, 166, 166)


def _vertical_gradient(size, top, bottom):
    """A one-pixel-wide ramp stretched to `size` — cheap and exact enough."""
    w, h = size
    ramp = Image.new("RGB", (1, h))
    px = ramp.load()
    for y in range(h):
        f = y / max(1, h - 1)
        px[0, y] = tuple(round(top[i] + (bottom[i] - top[i]) * f) for i in range(3))
    return ramp.resize((w, h))


def _droid_head(size):
    """
    The F-Droid mark: a rounded head with two antennae and two eyes.

    Simplified from the official artwork on purpose — at 96px inside a badge
    the seams and the body below the head are not resolvable, and drawing
    them adds noise rather than recognition.
    """
    s = size
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    mask = Image.new("L", (s, s), 0)
    m = ImageDraw.Draw(mask)

    # Antennae, drawn first so the head caps them.
    m.line([(s * 0.30, s * 0.30), (s * 0.20, s * 0.10)], fill=255, width=max(2, int(s * 0.055)))
    m.line([(s * 0.70, s * 0.30), (s * 0.80, s * 0.10)], fill=255, width=max(2, int(s * 0.055)))
    # Head.
    m.rounded_rectangle(
        [s * 0.14, s * 0.26, s * 0.86, s * 0.90], radius=s * 0.20, fill=255
    )

    grad = _vertical_gradient((s, s), BLUE_TOP, BLUE_BOTTOM).convert("RGBA")
    img.paste(grad, (0, 0), mask)

    # Eyes are knocked back out of the head, so they read on any background.
    eyes = ImageDraw.Draw(img)
    r = s * 0.075
    for cx in (s * 0.36, s * 0.64):
        eyes.ellipse(
            [cx - r, s * 0.45 - r, cx + r, s * 0.45 + r], fill=(0, 0, 0, 255)
        )
    return img


def build(out="branding/badges/fdroid.png"):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # The pill: black fill, hairline grey edge — as the other three.
    d.rounded_rectangle(
        [2, 2, W - 3, H - 3], radius=20, fill=(0, 0, 0, 255), outline=BORDER, width=3
    )

    mark = _droid_head(104)
    img.alpha_composite(mark, (30, (H - 104) // 2))

    x = 30 + 104 + 22
    d.text((x, 34), "GET IT ON", font=_font(TEXT_FONT, 31, "Semibold"), fill=(255, 255, 255))
    d.text((x - 2, 68), "F-Droid", font=_font(ROUND_FONT, 62, "Medium"), fill=(255, 255, 255))

    img.save(out)
    print("wrote", out, img.size)


if __name__ == "__main__":
    build()
