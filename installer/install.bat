@echo off
setlocal EnableDelayedExpansion
title Nexus Bot Hosting - Installer
color 0B

set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%.."
for %%i in ("%ROOT_DIR%") do set "ROOT_DIR=%%~fi"

:: ---------------------------------------------------------------
:: Require Administrator
:: ---------------------------------------------------------------
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  This installer must be run as Administrator.
    echo  Right-click install.bat and choose "Run as administrator".
    echo.
    pause
    exit /b 1
)

cls
echo.
echo   =========================================================
echo.
echo        NEXUS BOT HOSTING  -  Windows VPS Installer
echo.
echo   =========================================================
echo.
echo   This will set up Nexus Bot Hosting on this machine:
echo     - Verify / install Node.js LTS
echo     - Verify Python is installed (for Python bots)
echo     - Install server and client dependencies
echo     - Build the production web client
echo     - Configure your domain and environment
echo     - Open the required firewall port
echo     - Install Nexus as a Windows service (auto-start)
echo.
echo   ---------------------------------------------------------
echo.

:: ---------------------------------------------------------------
:: Domain prompt
:: ---------------------------------------------------------------
set "DEFAULT_DOMAIN=bot.chnexus.net"
set /p "DOMAIN=  Enter the domain users will visit [%DEFAULT_DOMAIN%]: "
if "%DOMAIN%"=="" set "DOMAIN=%DEFAULT_DOMAIN%"

set "DEFAULT_PORT=4000"
set /p "APP_PORT=  Enter the internal port for the app [%DEFAULT_PORT%]: "
if "%APP_PORT%"=="" set "APP_PORT=%DEFAULT_PORT%"

echo.
set /p "RESEND_KEY=  Paste your Resend API key (or leave blank to add later): "

echo.
echo   Detecting this machine's public IP for SFTP connections...
for /f "delims=" %%a in ('powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; try { (Invoke-WebRequest -UseBasicParsing -Uri 'https://ifconfig.me' -TimeoutSec 5).Content.Trim() } catch { '' }"') do set "DETECTED_IP=%%a"
if "!DETECTED_IP!"=="" (
    set /p "SFTP_HOST_VAL=  Could not auto-detect public IP. Enter it manually for SFTP connections: "
) else (
    set /p "SFTP_HOST_VAL=  SFTP host for WinSCP/etc. [!DETECTED_IP!]: "
    if "!SFTP_HOST_VAL!"=="" set "SFTP_HOST_VAL=!DETECTED_IP!"
)

echo.
echo   Using domain:     %DOMAIN%
echo   Using port:       %APP_PORT%
echo   Using SFTP host:  !SFTP_HOST_VAL!
echo.
echo   NOTE: In Cloudflare, point %DOMAIN% (CNAME/A record) at this
echo   machine's public IP, with the orange cloud (proxy) enabled,
echo   and set SSL/TLS mode to "Full" so HTTPS reaches this server.
echo.
echo   IMPORTANT: Cloudflare's proxy only forwards HTTP/HTTPS, so SFTP
echo   (port 2222) will NOT work through %DOMAIN% - users must connect
echo   directly to !SFTP_HOST_VAL! instead. This is already handled;
echo   the dashboard shows the correct SFTP host automatically.
echo.
pause

:: ---------------------------------------------------------------
:: Check / install Node.js
:: ---------------------------------------------------------------
echo.
echo   [1/8] Checking Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo   Node.js not found. Downloading Node.js LTS installer...
    set "NODE_MSI=%TEMP%\node-lts.msi"
    powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri 'https://nodejs.org/dist/v20.17.0/node-v20.17.0-x64.msi' -OutFile '!NODE_MSI!'"
    if not exist "!NODE_MSI!" (
        echo   Failed to download Node.js. Please install it manually from nodejs.org and re-run this installer.
        pause
        exit /b 1
    )
    echo   Installing Node.js ^(this may take a minute^)...
    msiexec /i "!NODE_MSI!" /qn /norestart
    set "PATH=%PATH%;C:\Program Files\nodejs"
) else (
    echo   Node.js found:
    node -v
)

:: ---------------------------------------------------------------
:: Check Python (bots run as native processes on this host - see
:: README for why this installer no longer sets up Docker Desktop)
:: ---------------------------------------------------------------
echo.
echo   [2/8] Checking Python...
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo   WARNING: "python" was not found on PATH. Python bots will fail to
    echo   start until Python 3.x is installed and on PATH. Download it from
    echo   https://www.python.org/downloads/windows/ ^(check "Add to PATH"
    echo   during install^), then restart the NexusBotHosting service.
    pause
) else (
    echo   Python found:
    python --version
)

:: ---------------------------------------------------------------
:: Install dependencies
:: ---------------------------------------------------------------
echo.
echo   [3/8] Installing server dependencies...
pushd "%ROOT_DIR%\server"
call npm install --omit=dev --no-fund --no-audit
if %errorlevel% neq 0 (
    echo   npm install failed for server. Aborting.
    popd & pause & exit /b 1
)
popd

echo.
echo   [4/8] Installing client dependencies and building the site...
pushd "%ROOT_DIR%\client"
call npm install --no-fund --no-audit
if %errorlevel% neq 0 (
    echo   npm install failed for client. Aborting.
    popd & pause & exit /b 1
)
call npm run build
popd

:: ---------------------------------------------------------------
:: Write .env
:: ---------------------------------------------------------------
echo.
echo   [5/8] Writing configuration...

for /f "delims=" %%a in ('powershell -NoProfile -Command "$b=New-Object byte[] 48; (New-Object Security.Cryptography.RNGCryptoServiceProvider).GetBytes($b); [Convert]::ToBase64String($b)"') do set "JWT_SECRET_GEN=%%a"
if "!JWT_SECRET_GEN!"=="" (
    echo   Failed to generate a JWT secret automatically.
    echo   Please enter one manually - any long random string works ^(40+ characters^):
    set /p "JWT_SECRET_GEN=  JWT secret: "
)
if "!JWT_SECRET_GEN!"=="" (
    echo   ERROR: No JWT secret was set. The server will not start without one.
    echo   Re-run this installer and provide a value when prompted.
    pause
    exit /b 1
)

(
  echo PORT=%APP_PORT%
  echo NODE_ENV=production
  echo PUBLIC_DOMAIN=%DOMAIN%
  echo CLIENT_ORIGIN=https://%DOMAIN%
  echo.
  echo JWT_SECRET=%JWT_SECRET_GEN%
  echo JWT_EXPIRES_IN=7d
  echo.
  echo DATA_DIR=./data
  echo BOTS_DIR=../bots
  echo.
  echo RESEND_API_KEY=%RESEND_KEY%
  echo EMAIL_FROM=Nexus Bot Hosting ^<noreply@chnexus.net^>
  echo.
  echo MAX_BOTS_PER_USER=5
  echo MAX_UPLOAD_SIZE_MB=200
  echo.
  echo BOT_CPU_LIMIT=0.5
  echo BOT_MEMORY_LIMIT_MB=256
  echo BOT_MAX_CPU_LIMIT=2
  echo BOT_MAX_MEMORY_LIMIT_MB=1024
  echo.
  echo SFTP_PORT=2222
  echo SFTP_HOST=!SFTP_HOST_VAL!
) > "%ROOT_DIR%\server\.env"

echo   Configuration written to server\.env

:: ---------------------------------------------------------------
:: Firewall rule
:: ---------------------------------------------------------------
echo.
echo   [6/8] Opening firewall ports...
netsh advfirewall firewall show rule name="Nexus Bot Hosting" >nul 2>&1
if %errorlevel% neq 0 (
    netsh advfirewall firewall add rule name="Nexus Bot Hosting" dir=in action=allow protocol=TCP localport=%APP_PORT%
    echo   Firewall rule added for TCP port %APP_PORT%.
) else (
    netsh advfirewall firewall set rule name="Nexus Bot Hosting" new protocol=TCP localport=%APP_PORT%
    echo   Firewall rule updated for TCP port %APP_PORT%.
)

netsh advfirewall firewall show rule name="Nexus Bot Hosting Web" >nul 2>&1
if %errorlevel% neq 0 (
    netsh advfirewall firewall add rule name="Nexus Bot Hosting Web" dir=in action=allow protocol=TCP localport=80,443
    echo   Firewall rule added for TCP ports 80,443 ^(public web traffic^).
) else (
    netsh advfirewall firewall set rule name="Nexus Bot Hosting Web" new protocol=TCP localport=80,443
    echo   Firewall rule updated for TCP ports 80,443.
)

netsh advfirewall firewall show rule name="Nexus Bot Hosting SFTP" >nul 2>&1
if %errorlevel% neq 0 (
    netsh advfirewall firewall add rule name="Nexus Bot Hosting SFTP" dir=in action=allow protocol=TCP localport=2222
    echo   Firewall rule added for TCP port 2222 ^(per-bot SFTP access^).
) else (
    netsh advfirewall firewall set rule name="Nexus Bot Hosting SFTP" new protocol=TCP localport=2222
    echo   Firewall rule updated for TCP port 2222.
)

:: ---------------------------------------------------------------
:: Install Caddy as a reverse proxy (80/443 -> internal app port)
:: ---------------------------------------------------------------
echo.
echo   [7/8] Installing Caddy reverse proxy...

set "CADDY_DIR=%ROOT_DIR%\installer\caddy"
set "CADDY_EXE=!CADDY_DIR!\caddy.exe"
if not exist "!CADDY_EXE!" (
    echo   Downloading Caddy...
    if not exist "!CADDY_DIR!" mkdir "!CADDY_DIR!"
    set "CADDY_ZIP=%TEMP%\caddy.zip"
    del /f /q "!CADDY_ZIP!" >nul 2>&1
    powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/caddyserver/caddy/releases/download/v2.8.4/caddy_2.8.4_windows_amd64.zip' -OutFile '!CADDY_ZIP!'"
    if not exist "!CADDY_ZIP!" (
        echo   Failed to download Caddy. Please install it manually from caddyserver.com and re-run this installer.
        pause
        exit /b 1
    )
    powershell -NoProfile -Command "try { Expand-Archive -Force -LiteralPath '!CADDY_ZIP!' -DestinationPath '!CADDY_DIR!' -ErrorAction Stop } catch { Write-Host $_.Exception.Message; exit 1 }"
    if not exist "!CADDY_EXE!" (
        echo   Failed to extract Caddy ^(the downloaded zip may be corrupt or incomplete^).
        echo   Try re-running this installer, or manually download caddy_2.8.4_windows_amd64.zip
        echo   from https://github.com/caddyserver/caddy/releases and extract caddy.exe into:
        echo     !CADDY_DIR!
        pause
        exit /b 1
    )
)

set "CADDYFILE_SRC=%ROOT_DIR%\installer\Caddyfile"
set "CADDYFILE_DEST=!CADDY_DIR!\Caddyfile"
(
  echo {
  echo 	auto_https off
  echo }
  echo.
  echo :80 {
  echo 	reverse_proxy localhost:%APP_PORT% {
  echo 		header_up X-Forwarded-For {remote_host}
  echo 		header_up X-Forwarded-Proto {scheme}
  echo 	}
  echo }
) > "!CADDYFILE_DEST!"

echo   Caddy installed and configured to forward port 80 -^> localhost:%APP_PORT%.
echo   ^(Using plain HTTP for now - set Cloudflare SSL/TLS mode to "Flexible".^)
echo   ^(To upgrade to end-to-end HTTPS later, add a Cloudflare Origin Certificate
echo    and switch this Caddyfile to use it, then set Cloudflare to "Full ^(strict^)".^)

:: ---------------------------------------------------------------
:: Install as a Windows service via NSSM
:: ---------------------------------------------------------------
echo.
echo   [8/8] Installing Nexus and Caddy as Windows services...

set "NSSM_DIR=%ROOT_DIR%\installer\nssm"
set "NSSM_EXE=%NSSM_DIR%\nssm.exe"
if not exist "%NSSM_EXE%" (
    echo   Downloading NSSM ^(service manager^)...
    set "NSSM_ZIP=%TEMP%\nssm.zip"
    powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri 'https://nssm.cc/release/nssm-2.24.zip' -OutFile '!NSSM_ZIP!'"
    powershell -NoProfile -Command "Expand-Archive -Force '!NSSM_ZIP!' '%TEMP%\nssm_extract'"
    if not exist "!NSSM_DIR!" mkdir "!NSSM_DIR!"
    copy /y "%TEMP%\nssm_extract\nssm-2.24\win64\nssm.exe" "!NSSM_EXE!" >nul
)

for /f "tokens=*" %%n in ('where node') do set "NODE_EXE=%%n"

"%NSSM_EXE%" stop NexusBotHosting >nul 2>&1
"%NSSM_EXE%" remove NexusBotHosting confirm >nul 2>&1

"%NSSM_EXE%" install NexusBotHosting "%NODE_EXE%" "%ROOT_DIR%\server\src\index.js"
"%NSSM_EXE%" set NexusBotHosting AppDirectory "%ROOT_DIR%\server"
"%NSSM_EXE%" set NexusBotHosting AppStdout "%ROOT_DIR%\server\data\service.log"
"%NSSM_EXE%" set NexusBotHosting AppStderr "%ROOT_DIR%\server\data\service.log"
"%NSSM_EXE%" set NexusBotHosting AppRotateFiles 1
"%NSSM_EXE%" set NexusBotHosting Start SERVICE_AUTO_START
"%NSSM_EXE%" start NexusBotHosting

"%NSSM_EXE%" stop NexusBotHostingWeb >nul 2>&1
"%NSSM_EXE%" remove NexusBotHostingWeb confirm >nul 2>&1

"%NSSM_EXE%" install NexusBotHostingWeb "!CADDY_EXE!" "run --config \"!CADDYFILE_DEST!\""
"%NSSM_EXE%" set NexusBotHostingWeb AppDirectory "!CADDY_DIR!"
"%NSSM_EXE%" set NexusBotHostingWeb AppStdout "!CADDY_DIR!\caddy.log"
"%NSSM_EXE%" set NexusBotHostingWeb AppStderr "!CADDY_DIR!\caddy.log"
"%NSSM_EXE%" set NexusBotHostingWeb AppRotateFiles 1
"%NSSM_EXE%" set NexusBotHostingWeb Start SERVICE_AUTO_START

:: Not using NSSM's DependOnService here: Windows SCM can leave a stale
:: dependency reference after a rapid remove/reinstall cycle (seen in testing
:: as WIN32_EXIT_CODE 1068, "dependency service does not exist"), even though
:: the target service is actually running. A short delay before starting
:: Caddy is simpler and avoids that class of failure.
timeout /t 3 /nobreak >nul
"%NSSM_EXE%" start NexusBotHostingWeb

timeout /t 2 /nobreak >nul
echo.
"%NSSM_EXE%" status NexusBotHosting | find /i "RUNNING" >nul
if %errorlevel% neq 0 (
    echo   WARNING: NexusBotHosting service is not running. Check server\data\service.log
)
"%NSSM_EXE%" status NexusBotHostingWeb | find /i "RUNNING" >nul
if %errorlevel% neq 0 (
    echo   WARNING: NexusBotHostingWeb ^(Caddy^) service is not running. Check installer\caddy\caddy.log
    echo   Common cause: another process already using port 80 or 443 ^(e.g. IIS^).
)

echo.
echo   =========================================================
echo.
echo    Nexus Bot Hosting is installed and running as two services.
echo.
echo    Local app URL:  http://localhost:%APP_PORT%
echo    Local web URL:  http://localhost  (Caddy, plain HTTP)
echo    Public URL:     https://%DOMAIN%
echo    SFTP:           port 2222 (per-bot credentials, generated in each
echo                     bot's dashboard - works with WinSCP, FileZilla, etc.)
echo.
echo    Services:
echo      NexusBotHosting     (the Node app, port %APP_PORT% + SFTP on 2222)
echo      NexusBotHostingWeb  (Caddy reverse proxy, port 80)
echo      - Restart:  nssm restart NexusBotHosting ^&^& nssm restart NexusBotHostingWeb
echo      - Logs:     server\data\service.log  /  installer\caddy\caddy.log
echo.
echo    Caddy listens on port 80 and forwards to the Node app on
echo    %APP_PORT% internally, so Cloudflare's proxy (which always
echo    connects to your origin on 80/443) now has something to talk to.
echo.
echo    IMPORTANT: set Cloudflare SSL/TLS mode to "Flexible" (SSL/TLS
echo    -^> Overview in the Cloudflare dashboard). Cloudflare still
echo    serves HTTPS to visitors; only the Cloudflare-to-origin leg is
echo    plain HTTP. Upgrading that leg to HTTPS later requires a
echo    Cloudflare Origin Certificate installed in Caddy - ask if you
echo    want that set up.
echo.
echo    In Cloudflare DNS: bot.chnexus.net -^> A record -^> this
echo    machine's public IP, proxied (orange cloud) on.
echo.
echo   =========================================================
echo.
pause
