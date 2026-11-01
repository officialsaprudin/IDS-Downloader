@echo off
title IDS Downloader Pro - Desktop Server
cd /d "%~dp0"

set "NODE_CMD="
if exist "%~dp0bin\node.exe" (
    set "NODE_CMD=%~dp0bin\node.exe"
) else if exist "C:\Users\Lenovo\.gemini\antigravity\bin\node.exe" (
    set "NODE_CMD=C:\Users\Lenovo\.gemini\antigravity\bin\node.exe"
) else (
    where node >nul 2>nul
    if %errorlevel% equ 0 set "NODE_CMD=node"
)

if "%NODE_CMD%"=="" (
    echo ========================================================
    echo [ERROR] Program Node.js tidak ditemukan!
    echo ========================================================
    pause
    exit /b 1
)

echo ========================================================
echo   IDS Downloader Pro (Windows 11)
echo   Status: Aktif
echo   URL: http://127.0.0.1:48912
echo   (JANGAN TUTUP jendela hitam ini agar unduhan berjalan)
echo ========================================================

set "EDGE_EXE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE_EXE%" (
    start "" "%EDGE_EXE%" --app="http://127.0.0.1:48912" --window-size=1120,720 --user-data-dir="%TEMP%\ids_app_profile"
) else (
    start http://127.0.0.1:48912
)

"%NODE_CMD%" server.js
pause
