@echo off
echo === MixBoard Setup ===

echo Setting up backend...
cd /d "%~dp0..\backend"
python -m venv ..\venv
call ..\venv\Scripts\activate.bat
pip install -r requirements.txt

echo Setting up frontend...
cd /d "%~dp0..\frontend"
npm install

echo === Setup complete ===
echo Run scripts\start.bat to start the application
pause
