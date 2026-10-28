@echo off
rem Starts OBDX Development Factory when you sign in to Windows (in a minimized window), and puts an
rem "OBDX Factory" shortcut on the desktop that opens it in the browser. Undo with remove-autostart.bat.
setlocal
cd /d "%~dp0"
for /f "tokens=2 delims==" %%p in ('findstr /b "FACTORY_PORT=" settings.properties') do set "PORT=%%p"
powershell -NoProfile -Command "$shell = New-Object -ComObject WScript.Shell; $link = $shell.CreateShortcut([Environment]::GetFolderPath('Startup') + '\OBDX Factory.lnk'); $link.TargetPath = '%~dp0start.bat'; $link.Arguments = '/background'; $link.WorkingDirectory = '%~dp0'; $link.WindowStyle = 7; $link.Description = 'OBDX Development Factory'; $link.Save(); Set-Content -Path ([Environment]::GetFolderPath('Desktop') + '\OBDX Factory.url') -Value \"[InternetShortcut]`r`nURL=http://localhost:%PORT%/\""
if errorlevel 1 (
  echo Could not create the shortcuts.
  pause
  exit /b 1
)
echo The factory now starts when you sign in to Windows, minimized on the taskbar.
echo Open it with the "OBDX Factory" shortcut on your desktop, or at http://localhost:%PORT%/
echo.
echo Start it now as well?
choice /c YN /m "Start the factory now"
if errorlevel 2 exit /b 0
start "OBDX Development Factory" /min "%~dp0start.bat"
