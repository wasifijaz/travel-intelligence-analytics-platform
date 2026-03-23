@echo off
REM Start FastAPI backend. Use Python 3.10-3.12 (3.14 has numpy/pandas issues).
cd /d "%~dp0"

REM Use project venv if present (recommended: create with py -3.12 -m venv .venv then pip install -r requirements.txt)
if exist ".venv\Scripts\python.exe" (
  .venv\Scripts\python.exe run_api.py
  exit /b %errorlevel%
)

REM Try py launcher with 3.12
where py >nul 2>&1
if %errorlevel% equ 0 (
  py -3.12 run_api.py
  exit /b %errorlevel%
  py -3.11 run_api.py
  exit /b %errorlevel%
  py -3.10 run_api.py
  exit /b %errorlevel%
)

echo No .venv found. Create one with: py -3.12 -m venv .venv
echo Then: .venv\Scripts\pip install -r requirements.txt
python run_api.py
