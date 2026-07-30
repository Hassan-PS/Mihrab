#!/usr/bin/env bash
# Dev helper: restart the app on the running emulator, walk to the mushaf
# reader, and screenshot it. Usage: emu_open_mushaf.sh <shot-name> [surah-y]
set -uo pipefail
export PATH="$PATH:$HOME/Library/Android/sdk/platform-tools"
SHOT="${1:-shot}"
SURAH_Y="${2:-1168}"   # y of the surah row to open (Al-Fatihah by default)
OUT="$(cd "$(dirname "$0")/../.." && pwd)/build/shots"
mkdir -p "$OUT"

adb shell am force-stop com.prayer_times
sleep 2
adb shell monkey -p com.prayer_times -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
sleep 12
adb shell input tap 539 1463      # Open the Quran
sleep 5
adb shell input tap 539 "$SURAH_Y" # surah row → mushaf reader
sleep 10
adb exec-out screencap -p > "$OUT/$SHOT.png"
adb logcat -d -t 300 | grep -iE "mushafFont|ReactNativeJS: .Error" | tail -6
echo "wrote $OUT/$SHOT.png"
