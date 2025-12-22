#!/usr/bin/env bash
set -euo pipefail

URL="https://datahub.io/core/nasdaq-listings/_r/-/data/nasdaq-listed-symbols.csv"
OUT="scripts/nasdaq-listed.csv"
TMP="${OUT}.tmp"

echo "Downloading $URL -> $OUT"

if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$URL" -o "$TMP"
elif command -v wget >/dev/null 2>&1; then
  wget -qO "$TMP" "$URL"
else
  echo "Error: curl or wget is required to download files" >&2
  exit 1
fi

# Basic validation: check that the CSV contains a 'Symbol' header
if ! head -n1 "$TMP" | grep -qi "Symbol"; then
  echo "Warning: downloaded file does not appear to be the expected NASDAQ CSV" >&2
fi

mv "$TMP" "$OUT"

echo "Saved $OUT (size $(stat -c%s "$OUT") bytes)"