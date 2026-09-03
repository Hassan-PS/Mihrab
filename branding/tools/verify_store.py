#!/usr/bin/env python3
"""Check every store asset against the rule the store actually enforces.

Written because a whole Play set shipped at 1320x2868 — a ratio of 2.17,
where Play's limit is 2.00 — and nothing in the repo said so. Run it after
`build_store.py`, and before uploading anything:

    python3 branding/tools/verify_store.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

from PIL import Image  # noqa: E402

problems = []
checked = 0


def files(rel, exts=(".png", ".jpg")):
    path = os.path.join(ROOT, rel)
    if not os.path.isdir(path):
        problems.append("%s does not exist" % rel)
        return []
    return [
        os.path.join(path, f)
        for f in sorted(os.listdir(path))
        if f.lower().endswith(exts) and not f.startswith(".")
    ]


def folder(rel, size, mode="RGB", count=None, exts=(".png", ".jpg")):
    """Every image in `rel` must be exactly `size` and exactly `mode`."""
    global checked
    fs = files(rel, exts)
    if count and not (count[0] <= len(fs) <= count[1]):
        problems.append("%s holds %d files, wanted %d-%d" % (rel, len(fs), count[0], count[1]))
    for f in fs:
        checked += 1
        im = Image.open(f)
        name = os.path.relpath(f, ROOT)
        if im.size != size:
            problems.append("%s is %dx%d, wanted %dx%d" % ((name,) + im.size + size))
        if im.mode != mode:
            problems.append("%s is %s, wanted %s" % (name, im.mode, mode))


def play_ratio(rel, limit=2.0, exts=(".png", ".jpg")):
    """Play: the long side may not exceed `limit` times the short side."""
    for f in files(rel, exts):
        w, h = Image.open(f).size
        r = max(w, h) / min(w, h)
        if r > limit + 1e-6:
            problems.append(
                "%s is %dx%d — ratio %.3f, Play allows at most %.2f"
                % (os.path.relpath(f, ROOT), w, h, r, limit)
            )


def exact_ratio(rel, ratio, exts=(".png", ".jpg")):
    """Play tablets: 16:9 landscape or 9:16 portrait, nothing between."""
    for f in files(rel, exts):
        w, h = Image.open(f).size
        r = max(w, h) / min(w, h)
        if abs(r - ratio) > 0.005:
            problems.append(
                "%s is %dx%d — ratio %.3f, Play wants %.3f for tablets"
                % (os.path.relpath(f, ROOT), w, h, r, ratio)
            )
        if min(w, h) < 1080:
            problems.append("%s short side is %d, Play's tablet floor is 1080" % (os.path.relpath(f, ROOT), min(w, h)))


# ---- Apple: 6.9" iPhone and 13" iPad are the two required slots ----
folder("branding/store/ios-6.9", (1320, 2868), count=(3, 10), exts=(".png",))
folder("branding/store-previews", (1320, 2868), count=(3, 10), exts=(".png",))
folder("fastlane/screenshots/ios/6.9", (1320, 2868), count=(3, 10), exts=(".jpg",))
folder("branding/store/ipad-13", (2064, 2752), count=(3, 10), exts=(".png",))
folder("branding/store-previews-ipad", (2064, 2752), count=(3, 10), exts=(".png",))
folder("fastlane/screenshots/ipad/13", (2064, 2752), count=(3, 10), exts=(".jpg",))

# ---- Play ----
folder("branding/play-previews", (1080, 2160), count=(2, 8), exts=(".png",))
play_ratio("branding/play-previews", 2.0)
folder("branding/play-previews-tablet", (2560, 1440), count=(4, 8), exts=(".png",))
exact_ratio("branding/play-previews-tablet", 16 / 9)

for rel, size, mode in (
    ("branding/store/play/feature-graphic-1024x500.png", (1024, 500), "RGB"),
    ("branding/store/play/icon-512.png", (512, 512), "RGBA"),
    ("fastlane/metadata/android/en-US/images/featureGraphic.png", (1024, 500), "RGB"),
    ("fastlane/metadata/android/en-US/images/icon.png", (512, 512), "RGBA"),
):
    p = os.path.join(ROOT, rel)
    if not os.path.isfile(p):
        problems.append("%s is missing" % rel)
        continue
    checked += 1
    im = Image.open(p)
    if im.size != size:
        problems.append("%s is %dx%d, wanted %dx%d" % ((rel,) + im.size + size))
    if im.mode != mode:
        problems.append("%s is %s, wanted %s" % (rel, im.mode, mode))

# ---- F-Droid: real screenshots, no size rule, but still no alpha ----
folder("fastlane/metadata/android/en-US/images/phoneScreenshots", (1080, 2400), count=(2, 8), exts=(".png",))
folder("fastlane/metadata/android/en-US/images/tenInchScreenshots", (2560, 1600), count=(2, 8), exts=(".png",))

if problems:
    print("%d problem(s) across %d files:\n" % (len(problems), checked))
    for p in problems:
        print("  - " + p)
    sys.exit(1)
print("ALL STORE ASSETS PASS (%d files)" % checked)
