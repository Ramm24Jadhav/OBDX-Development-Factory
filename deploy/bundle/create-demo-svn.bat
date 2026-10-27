@echo off
rem Creates local SVN repositories with the demo code (demo folder), to try the factory without a bank's SVN server.
rem Needs the Subversion command line tools (TortoiseSVN with "command line client tools" ticked).
setlocal
cd /d "%~dp0"
where svnadmin >nul 2>&1
if errorlevel 1 (
  echo svnadmin was not found. Install TortoiseSVN with "command line client tools" ticked, then run this again.
  pause
  exit /b 1
)
if not exist demo-svn mkdir demo-svn
set "BASE=%CD:\=/%"
for /d %%d in (demo\*) do (
  if not exist "demo-svn\%%~nxd" (
    svnadmin create "demo-svn\%%~nxd"
    svn mkdir -q -m "Repository layout" --parents "file:///%BASE%/demo-svn/%%~nxd/branches/factory" "file:///%BASE%/demo-svn/%%~nxd/tags"
    svn import -q -m "Demo code" "demo\%%~nxd" "file:///%BASE%/demo-svn/%%~nxd/trunk"
  )
)
echo.
echo Demo repositories are ready. In the factory, create a workspace for each (Workspaces, New workspace):
echo   Bank A, OBDX 22.x:  file:///%BASE%/demo-svn/bank-a-22/trunk
echo   Bank B, OBDX 25.x:  file:///%BASE%/demo-svn/bank-b-25/trunk
echo then on the Code page press "Import / update code".
pause
