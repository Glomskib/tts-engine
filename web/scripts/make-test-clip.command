#!/bin/bash
# Double-click this to generate a ~200 MB real .mp4 for testing the AI Editor
# upload path (the 413 / >50 MB fix). Lands on your Desktop as ff-test-200mb.mp4.
#
# Why a real video and not random bytes: a garbage file proves the upload size
# limit is gone, but the pipeline (transcribe + edit + render) needs an actual
# decodable video to "pick it up." This makes one with burned-in counter frames
# so you can eyeball the result later.
set -e
OUT="$HOME/Desktop/ff-test-200mb.mp4"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg isn't installed. Installing via Homebrew (one time)…"
  if ! command -v brew >/dev/null 2>&1; then
    echo "Homebrew isn't installed either. Install it from https://brew.sh then re-run this."
    read -n 1 -s -r -p "Press any key to close."; exit 1
  fi
  brew install ffmpeg
fi

echo "Generating ~200 MB test clip → $OUT"
# ~90s of 1080x1920 (9:16) test pattern at a bitrate tuned to land near 200 MB.
ffmpeg -y \
  -f lavfi -i "testsrc=size=1080x1920:rate=30:duration=90" \
  -f lavfi -i "sine=frequency=440:duration=90" \
  -c:v libx264 -b:v 17M -pix_fmt yuv420p \
  -c:a aac -b:a 128k \
  -movflags +faststart \
  "$OUT"

SIZE=$(du -h "$OUT" | cut -f1)
echo ""
echo "✅ Done: $OUT ($SIZE)"
echo ""
echo "Now test the upload:"
echo "  1. Open the AI Editor → New edit:  https://app.flashflowai.com/admin/editor/new"
echo "     (or whatever your live host is — same path: /admin/editor/new)"
echo "  2. Add it as the Raw clip, pick a mode, hit Start Edit."
echo "  3. Watch the progress bar — you should now see %, MB/s, and time left."
echo "  4. It should upload with NO 413 error and the job should start processing."
echo ""
echo "Repeat once on your iPhone (Safari) and once on desktop Chrome."
read -n 1 -s -r -p "Press any key to close."
