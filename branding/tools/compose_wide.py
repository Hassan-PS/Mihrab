import sys, math
sys.path.insert(0,"branding/tools")
from PIL import Image, ImageDraw, ImageFilter
from compose import gradient_bg, rub_star, round_image, _font, ROUND_FONT, TEXT_FONT, ICON_PATH, CREAM

def device(shot_path, height, radius_frac=0.062):
    shot=Image.open(shot_path).convert("RGB")
    w=int(height*shot.width/shot.height)
    shot=shot.resize((w,height))
    rad=int(w*radius_frac)
    rr=round_image(shot,rad)
    frame=Image.new("RGBA",(w,height),(0,0,0,0))
    ImageDraw.Draw(frame).rounded_rectangle([0,0,w-1,height-1],radius=rad,outline=(238,228,212,90),width=max(2,int(w*0.006)))
    rr.alpha_composite(frame)
    return rr

def paste_with_shadow(canvas, dev, x, y, blur, sh_alpha=130):
    sh=Image.new("RGBA",canvas.size,(0,0,0,0))
    m=Image.new("L",dev.size,0)
    ImageDraw.Draw(m).rounded_rectangle([0,0,dev.size[0],dev.size[1]],radius=int(dev.size[0]*0.062),fill=sh_alpha)
    sh.paste(Image.new("RGBA",dev.size,(0,0,0,255)),(x,y+int(canvas.size[1]*0.012)),m)
    sh=sh.filter(ImageFilter.GaussianBlur(blur))
    canvas.alpha_composite(sh)
    canvas.alpha_composite(dev,(x,y))

def feature_graphic(out, home, W=1024,H=500):
    c=gradient_bg(W,H).convert("RGBA")
    c.alpha_composite(rub_star(int(W*0.5),CREAM,16),(int(W*0.60),int(H*0.35)))
    c.alpha_composite(rub_star(int(W*0.22),CREAM,20),(int(-W*0.05),int(-H*0.15)))
    d=ImageDraw.Draw(c)
    mx=int(W*0.06); iy=int(H*0.20); isz=int(H*0.20)
    icon=round_image(Image.open(ICON_PATH).convert("RGBA").resize((isz,isz)),int(isz*0.24))
    c.alpha_composite(icon,(mx,iy))
    d.text((mx+isz+int(W*0.02), iy+isz*0.08), "Mihrab", font=_font(ROUND_FONT,int(H*0.19),"Bold"), fill=CREAM)
    d.text((mx, iy+isz+int(H*0.06)), "Prayer times · Quran · Dua · Tasbih · Qibla", font=_font(TEXT_FONT,int(H*0.062),"Semibold"), fill=CREAM)
    d.text((mx, iy+isz+int(H*0.20)), "Private. Offline. No ads, no tracking.", font=_font(TEXT_FONT,int(H*0.052),"Medium"), fill=(238,228,212,200))
    # One phone on the right, bleeding off top/bottom. Barely tilted: at 8
    # degrees the prayer rows fell far enough across the width that each time
    # lined up with the NEXT prayer's name, and a graphic whose whole subject
    # is prayer times cannot afford to look like it has them wrong.
    dev=device(home, int(H*1.28))
    dev=dev.rotate(-2.5, expand=True, resample=Image.BICUBIC)
    paste_with_shadow(c, dev, int(W*0.66), int(H*0.06), int(W*0.02))
    c.convert("RGB").save(out); print("wrote",out,(W,H))

def hero(out, home, quran, duas, W=1600,H=900):
    c=gradient_bg(W,H).convert("RGBA")
    c.alpha_composite(rub_star(int(W*0.42),CREAM,14),(int(W*0.60),int(H*0.30)))
    c.alpha_composite(rub_star(int(W*0.16),CREAM,20),(int(-W*0.03),int(-H*0.10)))
    d=ImageDraw.Draw(c)
    mx=int(W*0.055); iy=int(H*0.10); isz=int(H*0.115)
    icon=round_image(Image.open(ICON_PATH).convert("RGBA").resize((isz,isz)),int(isz*0.24))
    c.alpha_composite(icon,(mx,iy))
    d.text((mx+isz+int(W*0.018), iy+isz*0.02), "Mihrab", font=_font(ROUND_FONT,int(H*0.13),"Bold"), fill=CREAM)
    d.text((mx, iy+isz+int(H*0.06)), "The Muslim companion —", font=_font(ROUND_FONT,int(H*0.058),"Semibold"), fill=CREAM)
    d.text((mx, iy+isz+int(H*0.135)), "calm, private, offline-first.", font=_font(ROUND_FONT,int(H*0.058),"Semibold"), fill=CREAM)
    d.text((mx, iy+isz+int(H*0.235)), "Prayer times · Quran · Dua · Tasbih · Qibla", font=_font(TEXT_FONT,int(H*0.040),"Medium"), fill=(238,228,212,205))
    # three devices, staggered, right/bottom
    dh=int(H*0.86)
    dv_home=device(home,dh); dv_q=device(quran,int(dh*0.94)); dv_d=device(duas,int(dh*0.88))
    baseY=int(H*0.20)
    paste_with_shadow(c, dv_d, int(W*0.88), baseY+int(H*0.10), int(W*0.014))
    paste_with_shadow(c, dv_q, int(W*0.70), baseY+int(H*0.05), int(W*0.014))
    paste_with_shadow(c, dv_home, int(W*0.52), baseY, int(W*0.014))
    c.convert("RGB").save(out); print("wrote",out,(W,H))

if __name__=="__main__":
    import sys
    IOS="branding/screenshots-source/Simulator Screenshot - iPhone 17 Pro Max - 2026-05-06 at %s.png"
    home=IOS%"07.59.39"; quran=IOS%"08.05.11"; duas=IOS%"07.59.52"
    feature_graphic("branding/store/play/feature-graphic-1024x500.png", home)
    hero("branding/store/github-hero.png", home, quran, duas)
    # play icon 512
    from PIL import Image
    Image.open(ICON_PATH).convert("RGB").resize((512,512), Image.LANCZOS).save("branding/store/play/icon-512.png")
    print("icon 512 done")
