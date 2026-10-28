@echo off
rem Opens OBDX Development Factory in the browser, and starts it first if it is not running.
rem The "OBDX Factory" desktop shortcut (install-autostart.bat) runs this.
setlocal
cd /d "%~dp0"
for /f "tokens=2 delims==" %%p in ('findstr /b "FACTORY_PORT=" settings.properties') do set "PORT=%%p"
powershell -NoProfile -Command "try { $null = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 'http://localhost:%PORT%/actuator/health'; exit 0 } catch { exit 1 }"
if not errorlevel 1 goto open

echo Starting OBDX Development Factory; the browser opens when it is ready (a minute or two).
start "OBDX Development Factory" /min "%~dp0start.bat" /background
powershell -NoProfile -Command "for ($i = 0; $i -lt 150; $i++) { try { $null = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://localhost:%PORT%/actuator/health'; exit 0 } catch { Start-Sleep 2 } }; exit 1"
if errorlevel 1 goto failed

:open
start "" "http://localhost:%PORT%/"
exit /b 0

:failed
echo The factory did not start. Open the "OBDX Development Factory" window on the taskbar to see why.
pause
exit /b 1
