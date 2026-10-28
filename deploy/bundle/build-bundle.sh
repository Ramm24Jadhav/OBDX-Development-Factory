#!/bin/sh
# Packs the download: the factory jar, start scripts, settings, README and demo code in one zip.
# Usage: deploy/bundle/build-bundle.sh <obdx-factory.jar> <output.zip> [jre folder]
# With a jre folder (a Java 21 runtime for the target platform), Java is included and need not be installed.
set -e
jar="$1"; out="$2"; jre="$3"
[ -f "$jar" ] && [ -n "$out" ] || { echo "Usage: $0 <obdx-factory.jar> <output.zip> [jre folder]"; exit 1; }
here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
dir="$work/obdx-factory"
mkdir -p "$dir"
cp "$jar" "$dir/obdx-factory.jar"
cp "$here/start.sh" "$here/create-demo-svn.sh" "$dir/"
# Windows files with Windows line endings
for f in start.bat open-factory.bat create-demo-svn.bat install-autostart.bat remove-autostart.bat settings.properties README.txt; do
  sed 's/\r*$/\r/' "$here/$f" > "$dir/$f"
done
cp -r "$here/../docker/demo" "$dir/demo"
if [ -n "$jre" ]; then
  cp -r "$jre" "$dir/jre"
fi
mkdir -p "$(dirname "$out")"
out=$(cd "$(dirname "$out")" && pwd)/$(basename "$out")
rm -f "$out"
(cd "$work" && zip -q -r -X "$out" obdx-factory)
echo "Created $out ($(du -h "$out" | cut -f1))"
