#!/bin/sh
# Adds the CA certificates (*.crt, PEM) in the given folder to the system and Java trust stores of the image.
set -e
dir="$1"
found=0
for cert in "$dir"/*.crt; do
  [ -f "$cert" ] || continue
  found=1
  name=$(basename "$cert" .crt)
  cp "$cert" "/usr/local/share/ca-certificates/$name.crt"
  keytool -importcert -noprompt -cacerts -storepass changeit -alias "factory-$name" -file "$cert" > /dev/null
  echo "Trusted CA certificate $name"
done
if [ "$found" = 1 ]; then
  update-ca-certificates > /dev/null
fi
