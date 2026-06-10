@echo off
title Portfolio Dashboard

:: ══════════════════════════════════════════════════════════════════
::  CONFIGURE THIS LINE — path to your IBKR gateway folder
set GATEWAY=C:\Users\97252\Downloads\clientportal.gw
:: ══════════════════════════════════════════════════════════════════

set PORTFOLIO=%~dp0

:: ── Check gateway folder ──────────────────────────────────────────
if not exist "%GATEWAY%\bin\run.bat" (
    echo.
    echo  ERROR: Gateway not found at: %GATEWAY%
    echo  Open launch.bat in Notepad and fix the GATEWAY= line.
    echo.
    pause
    exit /b 1
)

:: ── Check Python ──────────────────────────────────────────────────
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not installed. Get it from python.org
    pause
    exit /b 1
)

:: ── Install deps silently ─────────────────────────────────────────
python -m pip install -r "%PORTFOLIO%requirements.txt" -q --disable-pip-version-check

:: ── Start gateway in background ───────────────────────────────────
echo Starting IBKR Gateway...
start "IBKR Gateway" cmd /k "cd /d "%GATEWAY%" && bin\run.bat root\conf.yaml"
timeout /t 6 /nobreak >nul

:: ── Open login page ───────────────────────────────────────────────
echo Opening login page — log in and the dashboard will update automatically...
start https://localhost:5000

:: ── Wait for login then run update ───────────────────────────────
python "%PORTFOLIO%wait_and_update.py" --file "%PORTFOLIO%dashboard.html"

:: ── Start web server (WiFi + Tailscale) ──────────────────────────
echo.
echo Starting web server so you can open the dashboard on iPhone...
start "Portfolio Server" python "%PORTFOLIO%serve.py"
