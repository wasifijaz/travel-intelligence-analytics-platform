@echo off
cd /d "%~dp0"
title Travel Intelligence Dashboard - Port 8501
echo.
echo  ========================================
echo   Travel Intelligence Dashboard
echo  ========================================
echo.
echo  Opening: http://localhost:8501
echo  Keep this window OPEN while using the app.
echo  Close this window to stop the server.
echo.
echo  ----------------------------------------
echo.

:run
py -3.12 -m streamlit run dashboard/app.py --server.port 8501 --server.headless true
echo.
echo  Server stopped. Restart in 3 seconds...
timeout /t 3 /nobreak >nul
goto run
