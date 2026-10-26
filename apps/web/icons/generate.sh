#!/usr/bin/env sh
# Regenerates the PWA icons in ../public from the SVG sources (needs Inkscape 1.x).
set -eu
cd "$(dirname "$0")"
out=../public
png() { inkscape "$1" --export-type=png --export-filename="$2" -w "$3" -h "$3" >/dev/null 2>&1; }
png icon.svg "$out/pwa-192x192.png" 192
png icon.svg "$out/pwa-512x512.png" 512
png icon-maskable.svg "$out/maskable-512x512.png" 512
png icon-maskable.svg "$out/apple-touch-icon-180x180.png" 180
grep -v "<!--" icon.svg > "$out/favicon.svg"
