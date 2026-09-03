#!/usr/bin/env python3
"""Mihrab store/marketing image compositor.
Composed marketing shot: deep-emerald gradient bg, quiet 8-point-star accent,
app icon + wordmark, cream headline/subhead (SF Pro Rounded), and a floating
device holding the app screenshot with rounded corners + soft shadow."""
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# ---- Brand ----
EMERALD_TOP   = (31, 95, 74)    # #1F5F4A
EMERALD_BOT   = (18, 58, 45)    # deeper
CREAM         = (238, 228, 212) # #EEE4D4
CREAM_SOFT    = (238, 228, 212)
ROUND_FONT    = "/System/Library/Fonts/SFNSRounded.ttf"
TEXT_FONT     = "/System/Library/Fonts/SFNS.ttf"
ICON_PATH     = "/Users/hassan/git/PrayerApp/ios/PrayerApp/Images.xcassets/AppIcon.appiconset/AppIcon-1024.png"

def _font(path, size, weight=None):
    f = ImageFont.truetype(path, size)
    if weight:
        try: f.set_variation_by_name(weight)
        except Exception: pass
    return f

def gradient_bg(W, H):
    top = Image.new("RGB", (1, H))
    for y in range(H):
        t = y / max(1, H - 1)
        # ease
        t = t*t*(3-2*t)
        r = int(EMERALD_TOP[0]+(EMERALD_BOT[0]-EMERALD_TOP[0])*t)
        g = int(EMERALD_TOP[1]+(EMERALD_BOT[1]-EMERALD_TOP[1])*t)
        b = int(EMERALD_TOP[2]+(EMERALD_BOT[2]-EMERALD_TOP[2])*t)
        top.putpixel((0, y), (r, g, b))
    return top.resize((W, H))

def rub_star(size, color, alpha):
    """8-point star (two overlapping squares) on transparent, given box size."""
    S = size
    im = Image.new("RGBA", (S, S), (0,0,0,0))
    d = ImageDraw.Draw(im)
    c = S/2; r = S*0.48
    def square(rot):
        pts=[]
        for k in range(4):
            a = math.radians(rot + k*90)
            pts.append((c + r*math.cos(a), c + r*math.sin(a)))
        return pts
    col = color + (alpha,)
    d.polygon(square(45), fill=col)
    d.polygon(square(0),  fill=col)
    return im

def round_image(im, radius):
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0,0,im.size[0],im.size[1]], radius=radius, fill=255)
    out = Image.new("RGBA", im.size, (0,0,0,0))
    out.paste(im, (0,0), mask)
    return out

def wrap(draw, text, font, max_w):
    words = text.split()
    lines=[]; cur=""
    for w in words:
        test=(cur+" "+w).strip()
        if draw.textlength(test, font=font) <= max_w: cur=test
        else:
            if cur: lines.append(cur)
            cur=w
    if cur: lines.append(cur)
    return lines

def compose(shot_path, out_path, W, H, headline, subhead, screen_radius_frac=0.062, device_w_frac=0.66, device_top_frac=None):
    canvas = gradient_bg(W, H).convert("RGBA")
    # geometry accent: large faint star, bottom-right bleed
    star_sz = int(W*0.9)
    star = rub_star(star_sz, CREAM, 16)
    canvas.alpha_composite(star, (int(W*0.42), int(H*0.60)))
    star2 = rub_star(int(W*0.34), CREAM, 22)
    canvas.alpha_composite(star2, (int(-W*0.10), int(H*0.03)))

    m = int(W*0.085)  # side margin
    d = ImageDraw.Draw(canvas)

    # icon badge + wordmark
    icon_sz = int(W*0.11)
    icon = Image.open(ICON_PATH).convert("RGBA").resize((icon_sz, icon_sz))
    icon = round_image(icon, int(icon_sz*0.24))
    top_y = int(H*0.055)
    canvas.alpha_composite(icon, (m, top_y))
    wm = _font(ROUND_FONT, int(W*0.052), "Bold")
    d.text((m+icon_sz+int(W*0.028), top_y+icon_sz*0.16), "Mihrab", font=wm, fill=CREAM)

    # headline
    hl_font = _font(ROUND_FONT, int(W*0.078), "Bold")
    sub_font = _font(TEXT_FONT, int(W*0.038), "Medium")
    hy = top_y + icon_sz + int(H*0.045)
    hlines=[]
    for part in headline.split("\\n"):
        hlines += wrap(d, part, hl_font, W-2*m)
    for line in hlines:
        d.text((m, hy), line, font=hl_font, fill=CREAM)
        hy += int(hl_font.size*1.13)
    hy += int(H*0.008)
    for line in wrap(d, subhead, sub_font, W-2*m):
        d.text((m, hy), line, font=sub_font, fill=(238,228,212,205))
        hy += int(sub_font.size*1.3)

    # device: screenshot with rounded corners + soft shadow, centered below text
    shot = Image.open(shot_path).convert("RGB")
    # A fixed device top keeps every preview in a set aligned even when one
    # headline wraps onto a second line.
    dev_top = hy + int(H*0.03)
    if device_top_frac is not None:
        dev_top = max(dev_top, int(H*device_top_frac))
    avail_h = H - dev_top - int(H*0.02)
    # fit by width first
    dev_w = int(W*device_w_frac)
    dev_h = int(dev_w * shot.height / shot.width)
    if dev_h > avail_h:  # let it crop slightly below bottom edge if very tall
        dev_h = avail_h
        dev_w = int(dev_h * shot.width / shot.height)
    shot_r = shot.resize((dev_w, dev_h))
    rad = int(dev_w*screen_radius_frac)
    shot_rr = round_image(shot_r, rad)
    dx = (W - dev_w)//2
    # shadow
    sh = Image.new("RGBA", (W, H), (0,0,0,0))
    shm = Image.new("L", (dev_w, dev_h), 0)
    ImageDraw.Draw(shm).rounded_rectangle([0,0,dev_w,dev_h], radius=rad, fill=120)
    sh.paste(Image.new("RGBA",(dev_w,dev_h),(0,0,0,255)), (dx, dev_top+int(H*0.012)), shm)
    sh = sh.filter(ImageFilter.GaussianBlur(int(W*0.03)))
    canvas.alpha_composite(sh)
    # thin cream hairline frame
    frame = Image.new("RGBA",(dev_w,dev_h),(0,0,0,0))
    ImageDraw.Draw(frame).rounded_rectangle([0,0,dev_w-1,dev_h-1], radius=rad, outline=(238,228,212,90), width=max(2,int(W*0.002)))
    canvas.alpha_composite(shot_rr, (dx, dev_top))
    canvas.alpha_composite(frame, (dx, dev_top))
    canvas.convert("RGB").save(out_path, quality=95)
    print("wrote", out_path, (W,H))



def compose_landscape(
    shot_path,
    out_path,
    W,
    H,
    headline,
    subhead,
    screen_radius_frac=0.022,
    device_h_frac=0.80,
    device_x_frac=None,
):
    """The same panel, turned on its side.

    Play wants tablet screenshots at 16:9 or 9:16 exactly, and a tablet is
    read in landscape — so the portrait stack (text above, device below)
    would leave the device a letterbox strip. Here the text takes the left
    third and the device runs off the right edge, which is also how the
    feature graphic is built.
    """
    canvas = gradient_bg(W, H).convert("RGBA")
    canvas.alpha_composite(rub_star(int(H * 1.05), CREAM, 16), (int(W * 0.30), int(H * 0.34)))
    canvas.alpha_composite(rub_star(int(H * 0.34), CREAM, 22), (int(-W * 0.03), int(-H * 0.12)))

    m = int(W * 0.055)
    # Work the device out first: a tablet panel lives or dies on whether the
    # whole screen is visible, so the picture claims its width and the text
    # gets what is left. Cutting a column off the right edge reads as a
    # mistake, not as a bleed.
    shot = Image.open(shot_path).convert("RGB")
    dev_h = int(H * device_h_frac)
    dev_w = int(dev_h * shot.width / shot.height)
    dx = W - dev_w - int(W * 0.035) if device_x_frac is None else int(W * device_x_frac)
    text_w = max(int(W * 0.20), dx - m - int(W * 0.025))
    d = ImageDraw.Draw(canvas)

    icon_sz = int(H * 0.13)
    icon = Image.open(ICON_PATH).convert("RGBA").resize((icon_sz, icon_sz))
    icon = round_image(icon, int(icon_sz * 0.24))
    top_y = int(H * 0.13)
    canvas.alpha_composite(icon, (m, top_y))
    wm = _font(ROUND_FONT, int(H * 0.062), "Bold")
    d.text((m + icon_sz + int(W * 0.014), top_y + icon_sz * 0.16), "Mihrab", font=wm, fill=CREAM)

    hl_font = _font(ROUND_FONT, int(H * 0.076), "Bold")
    sub_font = _font(TEXT_FONT, int(H * 0.042), "Medium")
    hy = top_y + icon_sz + int(H * 0.085)
    hlines = []
    for part in headline.split("\\n"):
        hlines += wrap(d, part, hl_font, text_w)
    for line in hlines:
        d.text((m, hy), line, font=hl_font, fill=CREAM)
        hy += int(hl_font.size * 1.13)
    hy += int(H * 0.018)
    for line in wrap(d, subhead, sub_font, text_w):
        d.text((m, hy), line, font=sub_font, fill=(238, 228, 212, 205))
        hy += int(sub_font.size * 1.32)

    shot_r = shot.resize((dev_w, dev_h))
    rad = int(dev_h * screen_radius_frac)
    dy = (H - dev_h) // 2
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    shm = Image.new("L", (dev_w, dev_h), 0)
    ImageDraw.Draw(shm).rounded_rectangle([0, 0, dev_w, dev_h], radius=rad, fill=120)
    sh.paste(Image.new("RGBA", (dev_w, dev_h), (0, 0, 0, 255)), (dx, dy + int(H * 0.018)), shm)
    sh = sh.filter(ImageFilter.GaussianBlur(int(H * 0.028)))
    canvas.alpha_composite(sh)
    frame = Image.new("RGBA", (dev_w, dev_h), (0, 0, 0, 0))
    ImageDraw.Draw(frame).rounded_rectangle(
        [0, 0, dev_w - 1, dev_h - 1], radius=rad, outline=(238, 228, 212, 90), width=max(2, int(H * 0.002))
    )
    canvas.alpha_composite(round_image(shot_r, rad), (dx, dy))
    canvas.alpha_composite(frame, (dx, dy))
    canvas.convert("RGB").save(out_path, quality=95)
    print("wrote", out_path, (W, H))


if __name__ == "__main__":
    import sys
    a=sys.argv
    compose(a[1], a[2], int(a[3]), int(a[4]), a[5], a[6])
