/**
 * Regenerates launcher / App Store icons from assets/app-icon-source.png.
 * Uses uniform scale + center crop so artwork fills the square (and thus
 * circular / squircle / rounded-rect masks) even when edges are clipped.
 *
 * Sharpening: builds a full-size master square from the source, then downsizes
 * each output with bicubic interpolation (clearer than a single aggressive scale).
 *
 * Run: npm run generate-icons
 */
const fs = require('fs');
const path = require('path');
const { Jimp, ResizeStrategy } = require('jimp');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'app-icon-source.png');

/** >1 zooms in before crop so masks that cut corners still look full. 1 = minimal (cover + center crop only). */
const ZOOM = 1;

/**
 * Downscale all outputs from this square for smoother mipmaps (capped at source size).
 * Use a 2048×2048+ `app-icon-source.png` for maximum sharpness on device.
 */
const MASTER_MAX = 2048;

const ANDROID_MIPMAPS = [
  ['mipmap-mdpi', 48],
  ['mipmap-hdpi', 72],
  ['mipmap-xhdpi', 96],
  ['mipmap-xxhdpi', 144],
  ['mipmap-xxxhdpi', 192],
];

const IOS_DIR = path.join(
  ROOT,
  'ios',
  'PrayerApp',
  'Images.xcassets',
  'AppIcon.appiconset',
);

const IOS_SIZES = [
  ['AppIcon-20@2x.png', 40],
  ['AppIcon-20@3x.png', 60],
  ['AppIcon-29@2x.png', 58],
  ['AppIcon-29@3x.png', 87],
  ['AppIcon-40@2x.png', 80],
  ['AppIcon-40@3x.png', 120],
  ['AppIcon-60@2x.png', 120],
  ['AppIcon-60@3x.png', 180],
  ['AppIcon-1024.png', 1024],
];

async function zoomCropSquareRaw(img, size) {
  const w = img.bitmap.width;
  const h = img.bitmap.height;
  const scale = Math.max(size / w, size / h) * ZOOM;
  const nw = Math.max(1, Math.round(w * scale));
  const nh = Math.max(1, Math.round(h * scale));
  const resized = img.clone().resize({ w: nw, h: nh });
  const x = Math.max(0, Math.floor((nw - size) / 2));
  const y = Math.max(0, Math.floor((nh - size) / 2));
  resized.crop({ x, y, w: size, h: size });
  return resized;
}

async function zoomCropSquare(img, size) {
  const sw = img.bitmap.width;
  const sh = img.bitmap.height;
  const masterSide = Math.min(MASTER_MAX, Math.max(sw, sh));
  const master = await zoomCropSquareRaw(img, masterSide);
  if (masterSide === size) {
    return master;
  }
  return master.clone().resize({
    w: size,
    h: size,
    mode: ResizeStrategy.BICUBIC,
  });
}

async function writePng(img, destPath) {
  await img.write(destPath);
}

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error('Missing source:', SRC);
    process.exit(1);
  }

  const base = await Jimp.read(SRC);
  const resDir = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');

  for (const [folder, px] of ANDROID_MIPMAPS) {
    const dir = path.join(resDir, folder);
    fs.mkdirSync(dir, { recursive: true });
    const out = await zoomCropSquare(base, px);
    await writePng(out, path.join(dir, 'ic_launcher.png'));
    await writePng(out.clone(), path.join(dir, 'ic_launcher_round.png'));
    await writePng(out.clone(), path.join(dir, 'ic_launcher_foreground.png'));
  }

  fs.mkdirSync(IOS_DIR, { recursive: true });
  for (const [name, px] of IOS_SIZES) {
    const out = await zoomCropSquare(base, px);
    await writePng(out, path.join(IOS_DIR, name));
  }

  console.log(
    'Icons generated (zoom=%s, master≤%s, bicubic downscale): Android mipmaps + iOS AppIcon.',
    ZOOM,
    MASTER_MAX,
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
