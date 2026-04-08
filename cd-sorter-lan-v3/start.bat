@echo off
setlocal enabledelayedexpansion
title CD Sorter Setup

echo.
echo  ==============================================
echo   💿  CD Sorter — First Time Setup
echo  ==============================================
echo.

REM ── Check Python ──────────────────────────────
echo [1/6] Checking Python...
python --version >nul 2>&1
if errorlevel 1 (
    py --version >nul 2>&1
    if errorlevel 1 (
        echo.
        echo  ERROR: Python not found on PATH.
        echo  Please install Python from https://python.org
        echo  Make sure to check "Add python.exe to PATH" during install.
        echo.
        pause
        exit /b 1
    )
    set PYTHON=py
) else (
    set PYTHON=python
)
for /f "tokens=*" %%i in ('!PYTHON! --version') do echo  Found: %%i

REM ── Check Node ────────────────────────────────
echo.
echo [2/6] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo  ERROR: Node.js not found.
    echo  Please install Node.js from https://nodejs.org
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do echo  Found: Node %%i

REM ── API Key ───────────────────────────────────
echo.
echo [3/6] Anthropic API key...
if defined ANTHROPIC_API_KEY (
    echo  Found in environment — using existing key.
) else (
    echo.
    echo  No ANTHROPIC_API_KEY found in environment.
    set /p ANTHROPIC_API_KEY="  Paste your API key (sk-ant-...): "
    if "!ANTHROPIC_API_KEY!"=="" (
        echo.
        echo  ERROR: API key is required.
        pause
        exit /b 1
    )
    echo.
    echo  To avoid entering it every time, add it permanently:
    echo  System Properties ^> Environment Variables ^> New
    echo  Name: ANTHROPIC_API_KEY   Value: !ANTHROPIC_API_KEY!
)

REM ── Virtual Environment ───────────────────────
echo.
echo [4/6] Setting up Python Virtual Environment...
if not exist venv\ (
    echo  Creating a new virtual environment...
    !PYTHON! -m venv venv
)
call venv\Scripts\activate.bat

REM ── Python deps ───────────────────────────────
echo.
echo [5/6] Installing Python dependencies...
python -m pip install flask flask-cors flask-sock anthropic --quiet --disable-pip-version-check
if errorlevel 1 (
    echo.
    echo  ERROR: pip install failed. Try running as Administrator.
    pause
    exit /b 1
)
echo  Done.

REM ── Node deps + build ─────────────────────────
echo.
echo [6/6] Installing Node dependencies and building dashboard...

if not exist node_modules (
    echo  Running npm install...
    npm install --silent
    if errorlevel 1 (
        echo  ERROR: npm install failed.
        pause
        exit /b 1
    )
) else (
    echo  node_modules already exists — skipping npm install.
)

echo  Building React dashboard...
npm run build --silent
if errorlevel 1 (
    echo  ERROR: npm run build failed.
    pause
    exit /b 1
)
echo  Done.

REM ── Launch ────────────────────────────────────
echo.
echo  ==============================================
echo   Setup complete! Starting server...
echo  ==============================================
echo.
echo  Open your browser to the URL shown below.
echo  On your phone, open the /mobile URL.
echo.
echo  Press Ctrl+C to stop the server.
echo.

set ANTHROPIC_API_KEY=!ANTHROPIC_API_KEY!
python server.py

pause
