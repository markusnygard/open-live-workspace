@echo off
set PORT=3100
cd /d "%~dp0"
start "" http://localhost:%PORT%
node server.mjs
pause
