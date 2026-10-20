@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
set PYTHONUTF8=1
if not exist ".venv\Scripts\python.exe" goto install
".venv\Scripts\python.exe" -c "import torch, numpy" >nul 2>nul
if not errorlevel 1 goto menu
:install
call INSTALL_WINDOWS.cmd
if errorlevel 1 exit /b 1
:menu
echo.
echo IMPERIUM - experimental neural core
echo 1. Check hardware and save report
echo 2. Train a new demo model
echo 3. Continue demo training
echo 4. Try a conversation with the saved demo model
echo 5. Exit
choice /c 12345 /n /m "Select: "
if errorlevel 5 exit /b 0
if errorlevel 4 goto chat
if errorlevel 3 goto resume
if errorlevel 2 goto train
".venv\Scripts\python.exe" -m imperium_ai hardware --output hardware-report.json
goto finished
:train
".venv\Scripts\python.exe" -m imperium_ai train --data data\demo.txt --output runs\demo.pt --steps 300
goto finished
:resume
".venv\Scripts\python.exe" -m imperium_ai train --data data\demo.txt --output runs\demo.pt --steps 300 --resume
goto finished
:chat
".venv\Scripts\python.exe" -m imperium_ai chat --checkpoint runs\demo.pt
:finished
pause
goto menu
