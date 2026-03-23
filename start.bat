@echo off
cd /d "%~dp0"

echo ============================================
echo  Travel Intelligence Platform v2.0
echo  Hospitality Demand Shock Analytics
echo ============================================
echo.

echo [1/2] Starting Backend API on http://localhost:8080
echo       Loading data and pre-computing analytics...
start "Backend API" cmd /k "cd /d "%~dp0" && .venv\Scripts\python.exe run_api.py"

echo [2/2] Starting Frontend on http://localhost:5173
echo       Waiting for backend to initialize...
timeout /t 10 /nobreak >nul
start "Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo ============================================
echo  Both servers are starting!
echo.
echo  Backend API:  http://localhost:8080
echo  Frontend UI:  http://localhost:5173
echo.
echo  9 Dashboard Pages:
echo    - Executive Overview
echo    - Global Crisis and Forecast
echo    - Hotel Chains
echo    - OTA Dashboard
echo    - DMC and TMC
echo    - Travel Tech
echo    - Market Intelligence
echo    - Stock Market Analysis
echo    - Raw Metrics
echo.
echo  Open http://localhost:5173 in your browser.
echo  Keep both command windows open.
echo ============================================
pause
