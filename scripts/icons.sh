#!/bin/sh
# Renders icons/src/icon.svg to the extension's PNG icons. Needs rsvg-convert
# (brew install librsvg).
set -eu
cd "$(dirname "$0")/.."
for size in 16 32 48 128; do
  rsvg-convert -w $size -h $size icons/src/icon.svg -o icons/icon$size.png
done
