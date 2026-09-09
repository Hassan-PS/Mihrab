#!/usr/bin/env python3
"""Rebuild the README and website imagery from a screenshot set.

Sources live in `branding/screenshots-2.18/` — device captures at their own
resolutions (Android 1080x2400, iPhone 1320x2868, an Android tablet at
2560x1600). This script is what turns them into the fixed shapes the README
and the site ask for, so the next set can be dropped in and the same command
run again.

  python3 branding/tools/build_shots.py

Phone shots are scaled to 1800 tall and centre-cropped to 810 wide, which is
the 9:20 box the site's gallery declares (`aspect-ratio: 9 / 20`) and the
size the README's grid has always used.

THE SPREAD is the wide one, and it comes from a TABLET now. It used to be a
Mac desktop capture with the window found by scanning for the light
rectangle inside the wallpaper — which needs a Mac whose screen is awake and
unlocked at the moment of the capture, and that is exactly what could not be
arranged for the 2.18 set. A landscape tablet shows the same facing-page
spread the Mac does, at 16:10 rather than the window's ~16:9, so it crops to
the same box and needs no window-finding at all. `mac_window` stays below for
the day a Mac capture is to hand again.
"""
import datetime
import os
import re
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'branding/screenshots-2.18')
SITE = os.path.join(ROOT, 'docs/assets/img')
README = os.path.join(ROOT, 'branding/readme')

PHONE = (810, 1800)
# The site's wide figure: `docs/index.html` declares 1600x878.
SPREAD_W = 1600


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


# Every phone figure the site shows, in the order the page lays them out.
# All of them come from the same set now: the page used to carry a handful
# of images this script did not know about — fasting, memorising, the
# reciters, Tilawah, the Android widgets — which is how they came to be a
# release and a half older than the ones beside them.
GALLERY = [
    ('and-home', 'shot-home'),
    ('and-home-dark', 'shot-home-dark'),
    ('and-home-maliki', 'shot-home-maliki'),
    ('and-mushaf', 'shot-mushaf'),
    ('and-mushaf-night', 'shot-mushaf-dark'),
    ('and-quran', 'shot-quran'),
    ('and-tilawah', 'shot-tilawah'),
    ('and-reciters', 'shot-reciters'),
    ('and-memorize', 'shot-memorize'),
    ('and-qibla', 'shot-qibla'),
    ('and-month', 'shot-month'),
    ('and-month-share', 'shot-month-share'),
    ('and-duas', 'shot-duas'),
    ('and-tasbih', 'shot-tasbih'),
    ('and-log', 'shot-log'),
    ('and-fasting', 'shot-fasting'),
    ('ios-widgets', 'shot-widgets'),
    ('and-widgets', 'shot-widgets-android'),
]

# The README's nine, in its grid order. Every one of them is also a site
# figure built from the same source above, and `shotParity.test.ts` holds
# the two sets byte-identical — so a row missing here is not a smaller
# README, it is a README a release out of date beside the site.
READMES = [
    ('and-home', '01_home'),
    ('and-mushaf', '02_quran'),
    ('and-duas', '03_duas'),
    ('and-tasbih', '04_tasbih'),
    ('and-qibla', '05_qibla'),
    ('and-log', '06_journal'),
    ('and-tilawah', '07_tilawah'),
    ('and-fasting', '08_fasting'),
    ('and-widgets', '09_widgets'),
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
    # THE GENERATOR OWNS THE PAGE. `docs/` is written by
    # `scripts/build-site.js` from `scripts/site/strings.json`, in thirteen
    # languages, and a test runs that generator with --check — so stamping
    # the HTML directly (which is what this did) produced a page the
    # generator disowned on the next run, and a red suite. The stamp lives
    # in the generator's own `SHOT_V` instead, and the pages are rebuilt.
    path = os.path.join(ROOT, 'scripts/build-site.js')
    src = open(path, encoding='utf-8').read()
    before = src
    src = re.sub(r"const SHOT_V = '\?v=[^']*';",
                 f"const SHOT_V = '?v={day}';", src, count=1)
    if src != before:
        open(path, 'w', encoding='utf-8').write(src)
    print(f'   scripts/build-site.js: SHOT_V = ?v={day}')
    print('   run `node scripts/build-site.js` to rewrite the pages')


def wide(name, out, width=SPREAD_W):
    """A landscape tablet capture, scaled to the site's wide figure."""
    im = Image.open(os.path.join(SRC, name + '.png')).convert('RGB')
    h = round(im.height * width / im.width)
    im = im.resize((width, h), Image.LANCZOS)
    im.save(out, optimize=True)
    print('  ', os.path.relpath(out, ROOT), im.size)


def main():
    print('site gallery:')
    for src, dst in GALLERY:
        phone(src, os.path.join(SITE, dst + '.png'))
    print('the spread:')
    wide('tab-spread', os.path.join(SITE, 'shot-spread.png'))
    print('readme:')
    for src, dst in READMES:
        phone(src, os.path.join(README, dst + '.png'))
    print('cache:')
    stamp_site()


if __name__ == '__main__':
    main()
