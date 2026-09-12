@echo off
title Aceline Core Plus
echo Starting Aceline Core Plus...

REM Kill any existing backend on port 8547
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8547 " ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1

REM Kill any existing UI server on port 8548
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8548 " ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1

REM Wait a moment
timeout /t 2 /nobreak >nul

REM Start the backend in a minimized window
start "Aceline Backend" /min cmd /c "cd /d C:\Users\hawpe\CascadeProjects\soulmate\inc_llm_v1 && C:\Users\hawpe\.local\bin\python3.11.exe -m uvicorn inc_llm.server:app --host 0.0.0.0 --port 8547"

REM Wait for backend to start (up to 90 seconds)
echo Waiting for backend to start...
set /a count=0
:waitloop
timeout /t 5 /nobreak >nul
set /a count+=5
curl -s -m 3 http://localhost:8547/v1/health >nul 2>&1
if %errorlevel%==0 goto :started
if %count% geq 90 goto :timeout
goto :waitloop

:started
echo Backend is running!

REM Start the UI server in a minimized window
start "Aceline UI Server" /min cmd /c "cd /d C:\Users\hawpe\CascadeProjects\soulmate\aceline-ui && C:\Users\hawpe\.local\bin\python3.11.exe -m http.server 8548"

REM Wait for UI server
timeout /t 3 /nobreak >nul

REM Open the browser
echo Opening Aceline Core Plus in your browser...
start "" "http://127.0.0.1:8548/index.html"

echo.
echo Aceline Core Plus is running!
echo Backend: http://localhost:8547
echo UI: http://127.0.0.1:8548/index.html
echo.
echo Close this window to keep Aceline running in the background.
echo To stop Aceline, close the "Aceline Backend" and "Aceline UI Server" windows.
echo.
pause
exit

:timeout
echo Backend took too long to start. Check the backend window for errors.
pause
exit
