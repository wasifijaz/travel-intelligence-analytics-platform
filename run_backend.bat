@echo off
cd /d "%~dp0"

echo Loading data...
.venv\Scripts\python.exe scripts\load_synthetic_to_pipeline.py
if errorlevel 1 (
  echo Data load failed.
  pause
  exit /b 1
)

echo.
echo Starting API at http://localhost:8000
echo Frontend will use this. Close this window to stop the API.
echo.
.venv\Scripts\python.exe run_api.py
pause
