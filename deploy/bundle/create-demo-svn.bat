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
echo Demo repositories are ready in the demo-svn folder. Start the factory (or stop and start it again if it is
echo running): it adds them as the workspaces bank-a-22 and bank-b-25 and imports their code.
pause
