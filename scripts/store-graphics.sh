#!/bin/sh
# Renders docs/store/src/promo.html to the store promo graphics with headless
# Chrome, using a throwaway profile.
set -eu
cd "$(dirname "$0")/.."
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
PORT=8798
python3 -m http.server $PORT --bind 127.0.0.1 >/dev/null 2>&1 & SERVER=$!
PROFILE=$(mktemp -d)
trap 'kill $SERVER; rm -rf "$PROFILE"' EXIT
sleep 0.5
render() { # name width height size
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run --user-data-dir="$PROFILE" \
    --force-device-scale-factor=1 --window-size=$2,$3 --virtual-time-budget=3000 \
    --screenshot="$PWD/docs/store/$1.png" "http://127.0.0.1:$PORT/docs/store/src/promo.html?size=$4" >/dev/null 2>&1
}
render promo-small 440 280 small
render promo-large 1400 560 large
render logo 300 300 logo
