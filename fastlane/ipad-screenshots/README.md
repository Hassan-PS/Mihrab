# iPad App Store screenshots (Path A — iPad + "Designed for iPad" on Mac)

Resolution: **2732 × 2048** (landscape) — accepted by App Store Connect for the
iPad 12.9"/13" slots. App Store Connect requires at least one iPad screenshot
before it will let you enable iPad (and therefore Mac) availability.

| File | What it is |
|---|---|
| `01_home_framed.png` | Marketing panel: the adaptive two-column iPad/Mac Home dashboard, captioned, on the app's cream background. Upload this. |
| `01_home_raw.png` | The same screen, raw (un-framed), if you prefer plain screenshots. |

These were rendered from a **Release** simulator build (bundled JS, no dev
overlays) via the compositor at `/tmp/composit_ipad.py`.

## Adding more screens

The iOS Simulator's synthetic tap does not reliably trigger React Native
navigation on this machine, so only the Home screen could be captured
automatically. To add Month / Quran / Duas / Tasbih / Settings panels, capture
them on a **real iPad** (or the TestFlight build, where touch works), then re-run
the compositor:

```sh
python3 /tmp/composit_ipad.py <out.png> "<caption>" <raw_screenshot.png>
```

The compositor rotates a simulator landscape capture upright, rounds the corners,
adds a shadow and caption, and outputs at 2732 × 2048.
