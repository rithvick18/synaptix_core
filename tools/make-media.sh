#!/usr/bin/env bash
# Regenerates the two demo packs' bundled media into public/packs/.
#
# Both packs are fictional demo patients (SPEC.md §2 — the engine never invents
# autobiographical memory; a caregiver pack is authored content, and this is a demo).
# Nothing here is a real person: portraits are flat illustrations from make-photos.py,
# and the voices are macOS `say` speaking lines written for the demo.
#
# Requires: python3, ffmpeg (or lame), and macOS `say`. Re-run after editing either
# this file or make-photos.py; the output is committed so a clone needs neither.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=public/packs
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "-- photos --"
python3 tools/make-photos.py "$TMP" >/dev/null
for pack in mira raju; do
  mkdir -p "$OUT/$pack"
  for f in "$TMP/$pack"/*.ppm; do
    name="$(basename "${f%.ppm}")"
    ffmpeg -y -loglevel error -i "$f" -q:v 4 "$OUT/$pack/$name.jpg"
    echo "   $pack/$name.jpg"
  done
done

# voice id -> macOS voice. Six distinct voices, so switching packs is audibly
# different and not only a different name on the card (§6 checkpoint C).
say_line() {  # say_line <pack> <id> <voice> <text>
  local pack="$1" id="$2" voice="$3" text="$4"
  say -v "$voice" -o "$TMP/$id.aiff" "$text"
  ffmpeg -y -loglevel error -i "$TMP/$id.aiff" -codec:a libmp3lame -q:a 6 -ac 1 -ar 22050 \
    "$OUT/$pack/$id.mp3"
  echo "   $pack/$id.mp3  ($voice)"
}

echo "-- voices --"
say_line mira ananya Tara      "Hello Nani, it's Ananya. I came to see you for Bihu."
say_line mira bina   Samantha  "Hello Ma, it's Bina. I will visit you on Sunday."
say_line mira rupa   Karen     "Good morning Mira, it's Rupa from next door."
say_line raju manoj  Rishi     "Hello Baba, it's Manoj. I will call you this evening."
say_line raju sarita Grandma   "Raju, it's your sister Sarita. Do eat something warm."
say_line raju iqbal  Aman      "Arre Raju, it's Iqbal. Shall we take the boat out again?"

echo "done"
