@echo off
title Portfolio Dashboard — Full Launch

:: ══════════════════════════════════════════════════════════════════
::  CONFIGURE THIS LINE — path to your IBKR gateway folder
set GATEWAY=C:\Users\97252\Downloads\clientportal.gw
:: ══════════════════════════════════════════════════════════════════

set PORTFOLIO=%~dp0

:: ── Check gateway folder exists ───────────────────────────────────
if not exist "%GATEWAY%\bin\run.bat" (
    echo.
    echo  ERROR: Gateway not found at:
    echo    %GATEWAY%
    echo.
    echo  Open launch.bat in Notepad and update the GATEWAY= line.
    echo.
    pause
    exit /b 1
)

:: ── Start gateway in a separate window ───────────────────────────
echo Starting IBKR Gateway...
start "IBKR Gateway" cmd /k "cd /d "%GATEWAY%" && bin\run.bat root\conf.yaml"

:: ── Wait then open login page ─────────────────────────────────────
timeout /t 6 /nobreak >nul
echo Opening login page...
start https://localhost:5000

:: ── Wait for login ────────────────────────────────────────────────
echo.
echo  ┌─────────────────────────────────────────────────────┐
echo  │  Log in at https://localhost:5000 in your browser   │
echo  │  then come back here and press any key to continue  │
echo  └─────────────────────────────────────────────────────┘
echo.
pause >nul

:: ── Check Python ──────────────────────────────────────────────────
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not installed. Get it from python.org
    pause
    exit /b 1
)

:: ── Install deps ──────────────────────────────────────────────────
python -m pip install -r "%PORTFOLIO%requirements.txt" -q --disable-pip-version-check

:: ── Run the dashboard update ──────────────────────────────────────
echo.
echo Updating dashboard data...
echo.
python "%PORTFOLIO%update_dashboard.py" --file "%PORTFOLIO%dashboard.html"

:: ── Start web server (serves on local WiFi) ───────────────────────
echo.
echo Starting web server...
echo.
python "%PORTFOLIO%serve.py"

:: serve.py keeps running and shows the iPhone URL.
:: Close this window to stop the server.
