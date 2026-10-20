@echo off
setlocal
cd /d "%~dp0"
if exist ".venv\Scripts\python.exe" goto install
where py >nul 2>nul
if errorlevel 1 goto python_fallback
py -3 -m venv .venv
if errorlevel 1 goto failed
goto install
:python_fallback
python -m venv .venv
if errorlevel 1 goto failed
:install
echo Installing the CPU edition for the first experiment.
echo GPU setup instructions are in README.md.
".venv\Scripts\python.exe" -m pip install -r requirements.txt --index-url https://download.pytorch.org/whl/cpu
if errorlevel 1 goto failed
exit /b 0
:failed
echo Installation failed. Install Python 3.12 64-bit from python.org and try again.
pause
exit /b 1
