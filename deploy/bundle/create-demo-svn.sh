#!/bin/sh
# Creates local SVN repositories with the demo code (demo folder), to try the factory without a bank's SVN server.
set -e
cd "$(dirname "$0")"
command -v svnadmin > /dev/null || { echo "svnadmin was not found. Install the subversion package, then run this again."; exit 1; }
mkdir -p demo-svn
base=$(pwd)
for src in demo/*/; do
  name=$(basename "$src")
  if [ ! -d "demo-svn/$name" ]; then
    svnadmin create "demo-svn/$name"
    svn mkdir -q -m "Repository layout" --parents "file://$base/demo-svn/$name/branches/factory" "file://$base/demo-svn/$name/tags"
    svn import -q -m "Demo code" "$src" "file://$base/demo-svn/$name/trunk"
  fi
done
echo "Demo repositories are ready. In the factory, create a workspace for each (Workspaces, New workspace):"
echo "  Bank A, OBDX 22.x:  file://$base/demo-svn/bank-a-22/trunk"
echo "  Bank B, OBDX 25.x:  file://$base/demo-svn/bank-b-25/trunk"
echo "then on the Code page press 'Import / update code'."
