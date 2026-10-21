@echo off
setlocal
cd /d "%~dp0"
set "MHW_NODE=node.exe"
where node.exe >nul 2>nul
if errorlevel 1 (
  if exist "%ProgramFiles%\nodejs\node.exe" (
    set "MHW_NODE=%ProgramFiles%\nodejs\node.exe"
  ) else (
    echo Node.js tidak dijumpai / Node.js was not found.
    echo Pasang Node.js daripada https://nodejs.org kemudian cuba semula.
    pause
    exit /b 1
  )
)
echo.
echo Malaysia Haze Watch - ujian tempatan / local preview
echo.
echo Selepas mesej Local muncul, buka alamat ini dalam Chrome atau Edge:
echo http://127.0.0.1:4173
echo.
echo Biarkan tetingkap ini terbuka sepanjang ujian.
echo Tekan Ctrl+C atau tutup tetingkap untuk menghentikan pelayan.
echo.
"%MHW_NODE%" scripts\serve.mjs
if errorlevel 1 pause
