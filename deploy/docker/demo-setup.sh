#!/bin/sh
# Creates the demo workspaces (one per repository on the demo SVN server) and imports their code, through the
# factory's REST API as the admin user. Safe to run again: existing workspaces are left alone.
set -e
base="${FACTORY_URL:-http://factory:8080}"
svn="${DEMO_SVN_URL:-svn://svn}"
jar=$(mktemp)
trap 'rm -f "$jar"' EXIT

xsrf() { awk '$6 == "XSRF-TOKEN" { print $7 }' "$jar" | tail -1; }
api() { # method path [json]
  curl -fsS -b "$jar" -c "$jar" -X "$1" -H "X-XSRF-TOKEN: $(xsrf)" -H 'Content-Type: application/json' \
    ${3:+--data "$3"} "$base$2"
}

echo "Waiting for the factory at $base"
until curl -fsS "$base/actuator/health" > /dev/null 2>&1; do sleep 3; done
curl -fsS -c "$jar" "$base/api/auth/config" > /dev/null
api POST /api/auth/login "{\"username\":\"admin\",\"password\":\"$FACTORY_ADMIN_PASSWORD\"}" > /dev/null \
  || { echo "Could not sign in as admin. FACTORY_ADMIN_PASSWORD must be the admin password (it is only set on the first start)."; exit 1; }
existing=$(api GET /api/workspaces)

# name|bank|version
for demo in "bank-a-22|Bank A|22.x" "bank-b-25|Bank B|25.x"; do
  name=${demo%%|*}; rest=${demo#*|}; bank=${rest%%|*}; version=${rest#*|}
  if echo "$existing" | grep -q "\"name\":\"$name\""; then
    echo "Workspace $name already exists"
    continue
  fi
  id=$(api POST /api/workspaces \
        "{\"name\":\"$name\",\"bankName\":\"$bank\",\"obdxVersion\":\"$version\",\"svnUrl\":\"$svn/$name/trunk\"}" \
       | sed -n 's/^{"id":"\([^"]*\)".*/\1/p')
  [ -n "$id" ] || { echo "Could not create workspace $name"; exit 1; }
  api PUT "/api/workspaces/$id/svn" \
    "{\"svnUrl\":\"$svn/$name/trunk\",\"svnUsername\":\"$SVN_USER\",\"svnPassword\":\"$SVN_PASSWORD\"}" > /dev/null
  api POST "/api/workspaces/$id/imports" > /dev/null
  echo "Created workspace $name ($bank, OBDX $version) and started importing $svn/$name/trunk"
done
echo "Demo ready: sign in as admin"
