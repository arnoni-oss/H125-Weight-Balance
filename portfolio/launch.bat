@echo off
title IBKR Gateway — Portfolio

:: ══════════════════════════════════════════════════════════════════
::  Only needed once per session: starts the IBKR Gateway and opens
::  the login page.  After login, use the /update URL on any device.
::
::  CONFIGURE THIS LINE — path to your IBKR gateway folder
set GATEWAY=C:\Users\97252\Downloads\clientportal.gw
:: ══════════════════════════════════════════════════════════════════

:: ── Check gateway folder ──────────────────────────────────────────
if not exist "%GATEWAY%\bin\run.bat" (
    echo.
    echo  ERROR: Gateway not found at: %GATEWAY%
    echo  Open launch.bat in Notepad and fix the GATEWAY= line.
    echo.
    pause
    exit /b 1
)

:: ── Start gateway ─────────────────────────────────────────────────
echo Starting IBKR Gateway...
start "IBKR Gateway" cmd /k "cd /d "%GATEWAY%" && bin\run.bat root\conf.yaml"
timeout /t 4 /nobreak >nul

:: ── Open login page ───────────────────────────────────────────────
echo.
echo Log in at https://localhost:5000
echo Then tap the /update URL on your phone or PC to refresh the dashboard.
echo.
start https://localhost:5000
