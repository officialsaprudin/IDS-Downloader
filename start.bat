@echo off
title IDM Downloader Pro - Desktop Server
cd /d "%~dp0"

echo ========================================================
echo   IDM Downloader Pro (Windows 11)
echo   Server sedang berjalan di: http://127.0.0.1:48912
echo   (Biarkan jendela ini tetap terbuka saat mengunduh)
echo ========================================================

set EDGE_EXE="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if exist %EDGE_EXE% (
    start "" %EDGE_EXE% --app="http://127.0.0.1:48912" --window-size=1120,720 --user-data-dir="%TEMP%\idm_app_profile"
) else (
    start http://127.0.0.1:48912
)

node server.js
pause
