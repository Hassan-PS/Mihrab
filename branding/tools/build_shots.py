#!/usr/bin/env python3
"""Rebuild the README and website imagery from a screenshot set.

Sources live in `branding/screenshots-2.14/` — device captures at their own
resolutions (Android 1080x2400, iPhone 1206x2622, a Mac desktop capture with
the app window inside it). This script is what turns them into the fixed
shapes the README and the site ask for, so the next set can be dropped in
and the same command run again.

  python3 branding/tools/build_shots.py

Phone shots are scaled to 1800 tall and centre-cropped to 810 wide, which is
the 9:20 box the site's gallery declares (`aspect-ratio: 9 / 20`) and the
size the README's grid has always used. The Mac window is found by scanning
for the light rectangle inside the wallpaper rather than by hardcoded
coordinates, so a differently-placed window still crops correctly.
"""
import datetime
import os
import re
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'branding/screenshots-2.14')
SITE = os.path.join(ROOT, 'docs/assets/img')
README = os.path.join(ROOT, 'branding/readme')

PHONE = (810, 1800)


def phone(name, out):
    """Scale to the target height, then centre-crop to the target width."""
    im = Image.open(os.path.join(SRC, name + '.png')).convert('RGB')
    tw, th = PHONE
    w = round(im.width * th / im.height)
    im = im.resize((w, th), Image.LANCZOS)
    if w > tw:
        left = (w - tw) // 2
        im = im.crop((left, 0, left + tw, th))
    elif w < tw:
        pad = Image.new('RGB', PHONE, im.getpixel((0, th // 2)))
        pad.paste(im, ((tw - w) // 2, 0))
        im = pad
    im.save(out, optimize=True)
    print('  ', os.path.relpath(out, ROOT), im.size)


def mac_window(name, out, width=1600):
    """Crop the app window out of a full-desktop capture."""
    im = Image.open(os.path.join(SRC, name + '.png')).convert('RGB')
    W, H = im.size

    def light(px):
        r, g, b = px
        return max(r, g, b) - min(r, g, b) < 20 and (r + g + b) / 3 > 200

    midy, midx = H // 2, W // 2
    x0 = next(x for x in range(W) if light(im.getpixel((x, midy))))
    x1 = next(x for x in range(W - 1, -1, -1) if light(im.getpixel((x, midy))))
    y0 = next(y for y in range(H) if light(im.getpixel((midx, y))))
    y1 = next(y for y in range(H - 1, -1, -1) if light(im.getpixel((midx, y))))
    im = im.crop((x0, y0, x1 + 1, y1 + 1))
    h = round(im.height * width / im.width)
    im = im.resize((width, h), Image.LANCZOS)
    im.save(out, optimize=True)
    print('  ', os.path.relpath(out, ROOT), im.size)
    return im.size


# The site gallery: three rows of four, light and dark, phone and desktop.
GALLERY = [
    ('and-home', 'shot-home'),
    ('and-home-dark', 'shot-home-dark'),
    ('and-mushaf', 'shot-mushaf'),
    ('and-mushaf-night', 'shot-mushaf-dark'),
    ('and-quran', 'shot-quran'),
    ('and-qibla', 'shot-qibla'),
    ('and-month', 'shot-month'),
    ('and-month-share', 'shot-month-share'),
    ('and-duas', 'shot-duas'),
    ('and-tasbih', 'shot-tasbih'),
    ('and-log', 'shot-log'),
    ('ios-widgets', 'shot-widgets'),
]

# The README's six, in its grid order.
READMES = [
    ('and-home', '01_home'),
    ('and-mushaf', '02_quran'),
    ('and-duas', '03_duas'),
    ('and-tasbih', '04_tasbih'),
    ('and-qibla', '05_qibla'),
    ('and-log', '06_journal'),
]


def stamp_site(day=None):
    """Bust the browser cache for every image this script just rewrote.

    The site is one hand-written HTML file with no build step, and these
    images keep their filenames from one set to the next — so a visitor who
    has been here before is served the OLD screenshots out of their cache,
    for as long as the cache holds them, with no way to tell. That is not a
    hypothetical: the 2.14 set was live and byte-correct on the server while
    the page still showed August's month view, August's home screen and a
    muṣḥaf with no player.

    So every `shot-*.png` and the OG image carry `?v=<date of the set>`, and
    this runs as part of building them: the stamp cannot drift from the
    images because the same command writes both.
    """
    day = day or datetime.date.today().isoformat()
    path = os.path.join(ROOT, 'docs/index.html')
    html = open(path, encoding='utf-8').read()
    before = html
    html = re.sub(r'(assets/img/(?:shot-[a-z-]+|og-hero)\.png)(\?v=[\d-]+)?',
                  lambda m: f'{m.group(1)}?v={day}', html)
    if html != before:
        open(path, 'w', encoding='utf-8').write(html)
    n = len(re.findall(r'\?v=' + re.escape(day), html))
    print(f'   docs/index.html: {n} image URLs stamped ?v={day}')


def main():
    print('site gallery:')
    for src, dst in GALLERY:
        phone(src, os.path.join(SITE, dst + '.png'))
    print('the spread:')
    mac_window('mac-spread', os.path.join(SITE, 'shot-spread.png'))
    print('readme:')
    for src, dst in READMES:
        phone(src, os.path.join(README, dst + '.png'))
    print('cache:')
    stamp_site()


if __name__ == '__main__':
    main()
