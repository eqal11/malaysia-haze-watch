@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Install Node.js from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)
call SETUP-LOCAL.bat
if errorlevel 1 (
  echo Setup failed. No automatic update has been claimed.
  pause
  exit /b 1
)
set "MHW_PYTHON=%CD%\.venv\Scripts\python.exe"
echo.
echo Malaysia Haze Watch - automatic local collection
echo Open http://127.0.0.1:4177/
echo Data is collected immediately and every 15 minutes while this window is open.
echo Closing this window stops local collection. GitHub Pages is a separate deployment.
echo.
node scripts\serve.mjs
if errorlevel 1 pause
