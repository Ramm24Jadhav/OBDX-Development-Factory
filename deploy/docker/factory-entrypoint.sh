#!/bin/sh
# Starts the factory. Without FACTORY_SECRET_KEY, a key is generated once and kept in the data volume, so stored SVN
# passwords stay readable across restarts. Back up the volume (or set FACTORY_SECRET_KEY yourself) to keep it.
set -e
if [ -z "$FACTORY_SECRET_KEY" ]; then
  key_file="$FACTORY_DATA_DIR/secret.key"
  if [ ! -s "$key_file" ]; then
    (umask 077 && head -c 32 /dev/urandom | base64 > "$key_file")
    echo "Generated the secret key that encrypts stored SVN passwords: $key_file"
  fi
  FACTORY_SECRET_KEY=$(cat "$key_file")
  export FACTORY_SECRET_KEY
fi
# shellcheck disable=SC2086
exec java $JAVA_OPTS -jar /opt/obdx-factory/obdx-factory.jar "$@"
