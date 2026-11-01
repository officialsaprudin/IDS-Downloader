@echo off
title IDM Downloader Desktop
cd /d "%~dp0"

echo ========================================================
echo   Memulai IDM Downloader Desktop...
echo ========================================================

start "" /b node server.js

timeout /t 2 /nobreak >nul

set EDGE_EXE="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if exist %EDGE_EXE% (
    start "" %EDGE_EXE% --app="http://127.0.0.1:48912" --window-size=1120,720 --user-data-dir="%TEMP%\idm_app_profile"
) else (
    start http://127.0.0.1:48912
)

echo Aplikasi sedang berjalan di http://127.0.0.1:48912
