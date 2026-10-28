@echo off
title NetOne Dynamic Antenna Intelligence

echo ================================================
echo   NETONE DYNAMIC ANTENNA INTELLIGENCE
echo ================================================
echo.

where py >nul 2>nul
if errorlevel 1 (
    echo Python launcher "py" was not found.
    echo Install Python 3.10+ and try again.
    pause
    exit /b 1
)

echo Installing/checking Python packages...
py -m pip install -r requirements.txt

echo.
echo Starting backend...
start "NetOne AI Backend" cmd /k "py backend/server.py"

timeout /t 2 /nobreak >nul

echo Starting frontend...
start "NetOne Frontend" cmd /k "py -m http.server 8000 --directory frontend"

timeout /t 2 /nobreak >nul

echo.
echo ================================================
echo   DEMO READY
echo ================================================
echo Backend:  http://127.0.0.1:5001
echo Frontend: http://127.0.0.1:8000
echo.
echo Open the frontend URL in your browser.
echo ================================================

start http://127.0.0.1:8000

pause
