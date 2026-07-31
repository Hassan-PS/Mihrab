from PIL import Image, ImageDraw, ImageFont, ImageFilter
import sys

CANVAS_W, CANVAS_H = 2732, 2048          # App Store iPad 12.9"/13" landscape
GREEN = (26, 89, 56)
FONT = "/System/Library/Fonts/SFNSRounded.ttf"

def upright(im):
    # A RAW `simctl io ... screenshot` of a device held in LANDSCAPE arrives as
    # a portrait framebuffer with the content rotated 90 deg CCW. Only those
    # need this. Shots that are already the right way up -- including genuine
    # portrait shots -- must be passed with --no-rotate.
    return im.transpose(Image.ROTATE_270)

def rounded(im, rad):
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0,0,im.size[0]-1,im.size[1]-1], rad, fill=255)
    out = im.convert("RGBA"); out.putalpha(mask); return out

def fit_font(d, caption, max_w, start=104, floor=56):
    size = start
    while size > floor:
        f = ImageFont.truetype(FONT, size)
        tb = d.textbbox((0,0), caption, font=f)
        if tb[2]-tb[0] <= max_w:
            return f
        size -= 4
    return ImageFont.truetype(FONT, floor)

def panel(shot, caption, out, rotate=True):
    im = Image.open(shot).convert("RGB")
    if rotate:
        im = upright(im)
    bg = im.getpixel((6,6))
    canvas = Image.new("RGB", (CANVAS_W, CANVAS_H), bg)
    d = ImageDraw.Draw(canvas)
    f = fit_font(d, caption, CANVAS_W - 320)
    tb = d.textbbox((0,0), caption, font=f); tw = tb[2]-tb[0]
    d.text(((CANVAS_W-tw)//2, 96), caption, font=f, fill=GREEN)
    top = 320
    aw, ah = CANVAS_W-240, CANVAS_H-top-110
    s = min(aw/im.size[0], ah/im.size[1])
    nw, nh = int(im.size[0]*s), int(im.size[1]*s)
    im2 = rounded(im.resize((nw,nh), Image.LANCZOS), 44)
    x, y = (CANVAS_W-nw)//2, top+(ah-nh)//2
    sh = Image.new("RGBA",(CANVAS_W,CANVAS_H),(0,0,0,0))
    shm = Image.new("L",(nw,nh),0); ImageDraw.Draw(shm).rounded_rectangle([0,0,nw-1,nh-1],44,fill=70)
    sh.paste((0,0,0),(x,y+22),shm); sh = sh.filter(ImageFilter.GaussianBlur(30))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), sh).convert("RGB")
    canvas.paste(im2,(x,y),im2)
    canvas.save(out); print("wrote", out, canvas.size)

if __name__ == "__main__":
    # usage: composit_ipad.py <out.png> "<caption>" <shot.png> [--no-rotate]
    a = [x for x in sys.argv[1:] if not x.startswith("--")]
    panel(a[2], a[1], a[0], rotate="--no-rotate" not in sys.argv)
