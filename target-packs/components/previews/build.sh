#!/usr/bin/env bash
# Builds the React, Angular and React Native galleries into previews/dist, which the factory jar serves at /packs/previews/
# so the Component factory page shows each component as that pack draws it (?only=<id>). The JET pack needs no build:
# the page draws the JET examples itself (gates/jet-gallery.html). Run before mvn when the release should have them;
# without them the page shows the JET example for every pack.
set -euo pipefail
cd "$(dirname "$0")/.."
out="$PWD/previews/dist"
rm -rf "$out"
build() { # <pack folder> <vite config> <out name>
  (cd "$1" && { [ -d node_modules ] || if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi; } && node node_modules/vite/bin/vite.js build --config "$2" --base ./ --outDir "$out/$3" --emptyOutDir --logLevel warn)
}
build react gallery/vite.config.ts react
build angular gallery/vite.config.ts angular
build react-native/gates vite.config.ts react-native
echo "previews built in $out"
