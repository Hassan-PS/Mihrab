#!/bin/zsh
# Prove the importer refuses what it says it refuses.
cd /Users/hassan/git/PrayerApp
for f in short backwards empty; do
  printf "  %-10s -> " "$f"
  out=$(npx tsx tools/riwayat/import.ts --riwayah tmpcheck --input "/tmp/$f.json" 2>&1)
  echo "$out" | grep -m1 "✗" || echo "ACCEPTED IT (bad)"
done
rm -rf src/quran/data/tmpcheck
