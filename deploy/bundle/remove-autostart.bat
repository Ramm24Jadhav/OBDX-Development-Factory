@echo off
rem Stops starting OBDX Development Factory at Windows sign-in and removes the desktop shortcut.
powershell -NoProfile -Command "Remove-Item -ErrorAction SilentlyContinue ([Environment]::GetFolderPath('Startup') + '\OBDX Factory.lnk'), ([Environment]::GetFolderPath('Desktop') + '\OBDX Factory.url'), ([Environment]::GetFolderPath('Desktop') + '\OBDX Factory.lnk')"
echo The factory no longer starts at sign-in. It keeps running until you close its window.
pause
