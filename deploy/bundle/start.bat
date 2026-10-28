@echo off
rem Starts OBDX Development Factory on this computer. Stop it with Ctrl+C or by closing this window.
setlocal
cd /d "%~dp0"

set "JAVA=java"
if exist "jre\bin\java.exe" set "JAVA=jre\bin\java.exe"
"%JAVA%" -XshowSettings:properties -version 2>&1 | findstr /r /c:"java.specification.version = 2[1-9]" >nul
if errorlevel 1 (
  echo Java 21 or later is needed. Download the version of this factory that includes Java, or install Java 21
  echo ^(for example from https://adoptium.net^) and start again.
  pause
  exit /b 1
)

where svn >nul 2>&1
if errorlevel 1 (
  echo Note: the Subversion command line tools ^(svn^) were not found. They are needed to import code. Install
  echo TortoiseSVN with "command line client tools" ticked ^(https://tortoisesvn.net^), then start again.
  echo.
)

if not exist data mkdir data
rem The key that encrypts stored SVN passwords: generated once, keep it with the data folder.
if not exist data\secret.key (
  powershell -NoProfile -Command "$b = New-Object byte[] 32; [Security.Cryptography.RNGCryptoServiceProvider]::new().GetBytes($b); [IO.File]::WriteAllText('data\secret.key', [Convert]::ToBase64String($b))"
)
set /p FACTORY_SECRET_KEY=<data\secret.key

for /f "tokens=2 delims==" %%p in ('findstr /b "FACTORY_PORT=" settings.properties') do set "PORT=%%p"
echo Starting OBDX Development Factory at http://localhost:%PORT%/ (the first start takes a minute or two).
echo Keep this window open while you use the factory; stop it with Ctrl+C or by closing the window.
echo.
rem Open the browser when the factory is ready, unless it was started at Windows sign-in (install-autostart.bat).
if /i not "%~1"=="/background" start "" /b powershell -NoProfile -WindowStyle Hidden -Command "for ($i = 0; $i -lt 150; $i++) { try { $null = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://localhost:%PORT%/actuator/health'; Start-Process 'http://localhost:%PORT%/'; break } catch { Start-Sleep 2 } }"

:run
rem A new version downloaded with "Update now" is installed here; the factory stops with exit code 75 to ask for it.
if exist "update\obdx-factory.jar" (
  move /y "update\obdx-factory.jar" obdx-factory.jar >nul && echo Installed the new version.
)
"%JAVA%" -Xmx2g -Djava.net.useSystemProxies=true -jar obdx-factory.jar --spring.config.additional-location=file:./settings.properties
if %errorlevel%==75 goto run
pause
