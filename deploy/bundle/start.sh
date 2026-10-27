#!/bin/sh
# Starts OBDX Development Factory on this computer. Stop it with Ctrl+C.
set -e
cd "$(dirname "$0")"

JAVA=java
[ -x jre/bin/java ] && JAVA=jre/bin/java
if ! "$JAVA" -XshowSettings:properties -version 2>&1 | grep -Eq 'java.specification.version = (2[1-9]|[3-9][0-9])'; then
  echo "Java 21 or later is needed. Install it (for example from https://adoptium.net) and start again."
  exit 1
fi
command -v svn > /dev/null || echo "Note: the Subversion command line tools (svn) were not found. They are needed to import code (package subversion)."
if [ "$(id -u)" = 0 ] && grep -q '^FACTORY_TRIAL_DATABASE=true' settings.properties; then
  echo "The trial database cannot run as root. Start the factory as an ordinary user."
  exit 1
fi

mkdir -p data
# The key that encrypts stored SVN passwords: generated once, keep it with the data folder.
[ -s data/secret.key ] || (umask 077 && head -c 32 /dev/urandom | base64 > data/secret.key)
FACTORY_SECRET_KEY=$(cat data/secret.key)
export FACTORY_SECRET_KEY

port=$(sed -n 's/^FACTORY_PORT=//p' settings.properties)
echo "Starting OBDX Development Factory. When it is ready, open http://localhost:${port:-8080}/ in your browser."
echo "The first start takes a minute or two. Stop it with Ctrl+C."
exec "$JAVA" -Xmx2g -jar obdx-factory.jar --spring.config.additional-location=file:./settings.properties
