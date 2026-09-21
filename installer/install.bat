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
echo     - Verify / install Docker Desktop (bot sandboxing)
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
echo   Using domain:  %DOMAIN%
echo   Using port:    %APP_PORT%
echo.
echo   NOTE: In Cloudflare, point %DOMAIN% (CNAME/A record) at this
echo   machine's public IP, with the orange cloud (proxy) enabled,
echo   and set SSL/TLS mode to "Full" so HTTPS reaches this server.
echo.
pause

:: ---------------------------------------------------------------
:: Check / install Node.js
:: ---------------------------------------------------------------
echo.
echo   [1/7] Checking Node.js...
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
:: Check / install Docker Desktop
:: ---------------------------------------------------------------
echo.
echo   [2/7] Checking Docker...
where docker >nul 2>&1
if %errorlevel% neq 0 (
    echo   Docker not found. Downloading Docker Desktop installer...
    echo   ^(Docker Desktop requires WSL2 - if this is a fresh Windows Server
    echo    box, you may be prompted to enable WSL2 and reboot.^)
    set "DOCKER_EXE=%TEMP%\DockerDesktopInstaller.exe"
    powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri 'https://desktop.docker.com/win/main/amd64/Docker%%20Desktop%%20Installer.exe' -OutFile '!DOCKER_EXE!'"
    if not exist "!DOCKER_EXE!" (
        echo   Failed to download Docker Desktop. Please install it manually from docker.com and re-run this installer.
        pause
        exit /b 1
    )
    echo   Installing Docker Desktop ^(this may take a few minutes and may require a reboot^)...
    "!DOCKER_EXE!" install --quiet --accept-license
    echo.
    echo   Docker Desktop has been installed. If this is the first install,
    echo   please REBOOT this machine now, then re-run install.bat to continue.
    pause
) else (
    echo   Docker found:
    docker -v
)

:: ---------------------------------------------------------------
:: Install dependencies
:: ---------------------------------------------------------------
echo.
echo   [3/7] Installing server dependencies...
pushd "%ROOT_DIR%\server"
call npm install --omit=dev --no-fund --no-audit
if %errorlevel% neq 0 (
    echo   npm install failed for server. Aborting.
    popd & pause & exit /b 1
)
popd

echo.
echo   [4/7] Installing client dependencies and building the site...
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
echo   [5/7] Writing configuration...

for /f "delims=" %%a in ('powershell -NoProfile -Command "[System.Web.Security.Membership]::GeneratePassword(48,0) 2>$null"') do set "JWT_SECRET_GEN=%%a"
if "%JWT_SECRET_GEN%"=="" (
    for /f "delims=" %%a in ('powershell -NoProfile -Command "-join ((48..57)+(65..90)+(97..122)|Get-Random -Count 48|%%{[char]$_})"') do set "JWT_SECRET_GEN=%%a"
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
  echo DOCKER_SOCKET=//./pipe/docker_engine
  echo BOT_CPU_LIMIT=0.5
  echo BOT_MEMORY_LIMIT_MB=256
) > "%ROOT_DIR%\server\.env"

echo   Configuration written to server\.env

:: ---------------------------------------------------------------
:: Firewall rule
:: ---------------------------------------------------------------
echo.
echo   [6/7] Opening firewall port %APP_PORT%...
netsh advfirewall firewall show rule name="Nexus Bot Hosting" >nul 2>&1
if %errorlevel% neq 0 (
    netsh advfirewall firewall add rule name="Nexus Bot Hosting" dir=in action=allow protocol=TCP localport=%APP_PORT%
    echo   Firewall rule added for TCP port %APP_PORT%.
) else (
    netsh advfirewall firewall set rule name="Nexus Bot Hosting" new protocol=TCP localport=%APP_PORT%
    echo   Firewall rule updated for TCP port %APP_PORT%.
)

:: ---------------------------------------------------------------
:: Install as a Windows service via NSSM
:: ---------------------------------------------------------------
echo.
echo   [7/7] Installing Nexus as a Windows service...

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

echo.
echo   =========================================================
echo.
echo    Nexus Bot Hosting is installed and running as a service.
echo.
echo    Local URL:   http://localhost:%APP_PORT%
echo    Public URL:  https://%DOMAIN%   (once Cloudflare DNS is set)
echo.
echo    Service name: NexusBotHosting
echo      - Restart:  nssm restart NexusBotHosting
echo      - Stop:     nssm stop NexusBotHosting
echo      - Logs:     server\data\service.log
echo.
echo    The server serves the built frontend directly from client\dist,
echo    so port %APP_PORT% is the ONLY port you need to expose.
echo    Point %DOMAIN% at this machine's public IP in Cloudflare
echo    (orange-cloud proxy on, SSL/TLS mode = Full), or use a
echo    Cloudflare Tunnel targeting http://localhost:%APP_PORT%.
echo.
echo   =========================================================
echo.
pause
