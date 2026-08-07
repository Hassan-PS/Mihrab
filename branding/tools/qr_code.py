"""The QR code printed on the shared month image.

    python3 branding/tools/qr_code.py

Regenerates `assets/qr-code.png`. It is worth having as a script rather than
a one-off export because the thing it encodes changes: the first one pointed
at the GitHub repo and carried the app's old mosque-and-crescent icon, and
both were still going out on every shared month long after the app had a
website and a different logo. A shared image is the one artefact that leaves
the phone and lands in front of people who do not have the app — it is the
worst place to be a version behind.

Error correction is H (30%), which is what makes a logo in the middle safe:
the decoder can lose that much of the symbol and still read it. The centre
sits on a white pad so the icon's dark green does not merge into the modules
around it.
"""
import pathlib
import sys

import qrcode
from qrcode.constants import ERROR_CORRECT_H
from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parents[2]
URL = "https://mihrab.elghamri.se/"
LOGO = ROOT / "assets" / "app-icon-rounded.png"
OUT = ROOT / "assets" / "qr-code.png"
SIZE = 1024
# Share of the QR's width taken by the logo. 0.22 is comfortably inside what
# H-level correction can lose; past ~0.3 scanning starts to depend on the
# camera and the light.
LOGO_FRACTION = 0.22


def build(url: str = URL, out: pathlib.Path = OUT) -> pathlib.Path:
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_H, border=3, box_size=10)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    img = img.resize((SIZE, SIZE), Image.NEAREST)

    logo_px = int(SIZE * LOGO_FRACTION)
    pad = int(logo_px * 0.14)
    logo = Image.open(LOGO).convert("RGBA").resize(
        (logo_px, logo_px), Image.LANCZOS
    )

    # White rounded plate behind the mark, so the icon reads as a separate
    # object rather than as a blob of modules.
    plate = logo_px + pad * 2
    box = Image.new("RGB", (plate, plate), "white")
    mask = Image.new("L", (plate, plate), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, plate - 1, plate - 1], radius=int(plate * 0.22), fill=255
    )
    at = ((SIZE - plate) // 2, (SIZE - plate) // 2)
    img.paste(box, at, mask)
    img.paste(logo, (at[0] + pad, at[1] + pad), logo)

    img.save(out)
    return out


if __name__ == "__main__":
    target = build(sys.argv[1] if len(sys.argv) > 1 else URL)
    print(f"wrote {target.relative_to(ROOT)} → {URL}")
