#!/bin/sh
# Builds dist/superfavorites-bar-<version>.zip, ready to upload to the Chrome
# Web Store or Edge Add-ons. Only the files the extension needs go in.
set -eu
cd "$(dirname "$0")/.."

FILES="manifest.json background.js content.js icon-themes.js options.html options.js start.html start.js icons"
VERSION=$(python3 -c 'import json; print(json.load(open("manifest.json"))["version"])')

# A release tag (v1.2.3) must match the manifest's version.
if [ -n "${RELEASE_TAG:-}" ] && [ "$RELEASE_TAG" != "v$VERSION" ]; then
  echo "Tag $RELEASE_TAG doesn't match manifest version $VERSION" >&2
  exit 1
fi

for f in background.js content.js icon-themes.js options.js; do node --check "$f"; done

OUT="dist/superfavorites-bar-$VERSION.zip"
mkdir -p dist
rm -f "$OUT"
zip -q -r -X "$OUT" $FILES -x '*.DS_Store' 'icons/src/*'
echo "$OUT"
