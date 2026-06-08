@echo off
title Portfolio Dashboard Updater

:: ── Check Python ─────────────────────────────────────────────────────────────
python --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo  ERROR: Python is not installed.
    echo  Go to https://python.org, download Python 3, and install it.
    echo  Make sure to tick "Add Python to PATH" during install.
    echo.
    pause
    exit /b 1
)

:: ── Install dependencies (silent, only downloads what is missing) ─────────────
echo Installing / checking dependencies...
python -m pip install -r "%~dp0requirements.txt" -q --disable-pip-version-check

:: ── Check IBKR Gateway is reachable ──────────────────────────────────────────
echo Checking IBKR Client Portal Gateway...
curl -sk https://localhost:5000/v1/api/tickle >nul 2>&1
if errorlevel 1 (
    echo.
    echo  IBKR Gateway not detected at https://localhost:5000
    echo  Please start the Client Portal Gateway, then log in at:
    echo    https://localhost:5000
    echo.
    echo  Opening that page in your browser now...
    start https://localhost:5000
    echo.
    echo  Once logged in, close your browser and run this script again.
    pause
    exit /b 1
)

:: ── Run the updater ───────────────────────────────────────────────────────────
echo.
echo Running update...
echo.
python "%~dp0update_dashboard.py" --file "%~dp0dashboard.html"

:: ── Open result in browser ────────────────────────────────────────────────────
if exist "%~dp0dashboard.html" (
    echo.
    echo Opening dashboard in browser...
    start "" "%~dp0dashboard.html"
)

echo.
pause
