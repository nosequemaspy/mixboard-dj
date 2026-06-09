@echo off
echo === MixBoard Starting ===

start "MixBoard Backend" cmd /c "cd /d "%~dp0..\backend" && call ..\venv\Scripts\activate.bat && uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

timeout /t 3 >nul

start "MixBoard Frontend" cmd /c "cd /d "%~dp0..\frontend" && npm run dev"

echo.
echo Frontend: http://localhost:5173
echo Backend:  http://localhost:8000
echo API Docs: http://localhost:8000/docs
echo.
echo Close the terminal windows to stop.
pause
