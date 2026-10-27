#!/bin/sh
# Demo Subversion server (not for bank code). Creates a repository for each demo codebase on first start, then serves them all with svnserve.
# Anyone may read; committing (the factory's change branches) needs SVN_USER / SVN_PASSWORD.
set -e
: "${SVN_USER:=factory}"
: "${SVN_PASSWORD:=factory-demo}"
for src in /demo/*/; do
  name=$(basename "$src")
  repo="/svn/$name"
  if [ ! -d "$repo" ]; then
    svnadmin create "$repo"
    svn mkdir -q -m "Repository layout" --parents "file://$repo/branches/factory" "file://$repo/tags"
    svn import -q -m "Demo $name code" "$src" "file://$repo/trunk"
    echo "Created demo repository $name"
  fi
  cat > "$repo/conf/svnserve.conf" <<CONF
[general]
anon-access = read
auth-access = write
password-db = /svn/passwd
realm = OBDX Factory demo
CONF
done
printf '[users]\n%s = %s\n' "$SVN_USER" "$SVN_PASSWORD" > /svn/passwd
chmod 600 /svn/passwd
echo "Serving $(ls /svn | grep -v passwd | tr '\n' ' ')on svn://<host>:3690/"
exec svnserve --daemon --foreground --root /svn --listen-port 3690
