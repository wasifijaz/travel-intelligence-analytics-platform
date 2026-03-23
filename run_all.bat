@echo off
cd /d "%~dp0"
echo Loading data...
.venv\Scripts\python scripts\load_synthetic_to_pipeline.py
if errorlevel 1 exit /b 1
echo.
echo Starting API on http://localhost:8000 ...
start "API" cmd /k "cd /d %~dp0 && .venv\Scripts\python run_api.py"
timeout /t 3 /nobreak >nul
echo Starting frontend on http://localhost:5173 ...
start "Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
echo.
echo Data loaded. API and frontend started in new windows.
echo Open http://localhost:5173 in your browser.
pause
