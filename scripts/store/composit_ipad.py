from PIL import Image, ImageDraw, ImageFont, ImageFilter
import sys

CANVAS_W, CANVAS_H = 2732, 2048          # App Store iPad 12.9"/13" landscape
GREEN = (26, 89, 56)
FONT = "/System/Library/Fonts/SFNSRounded.ttf"

def upright(im):
    # Sim captures landscape content rotated 90° CCW in a portrait framebuffer.
    return im.transpose(Image.ROTATE_270)

def rounded(im, rad):
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0,0,im.size[0]-1,im.size[1]-1], rad, fill=255)
    out = im.convert("RGBA"); out.putalpha(mask); return out

def panel(shot, caption, out):
    im = upright(Image.open(shot).convert("RGB"))
    bg = im.getpixel((6,6))
    canvas = Image.new("RGB", (CANVAS_W, CANVAS_H), bg)
    d = ImageDraw.Draw(canvas)
    f = ImageFont.truetype(FONT, 104)
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
    # args: out, caption, shot
    panel(sys.argv[3], sys.argv[2], sys.argv[1])
