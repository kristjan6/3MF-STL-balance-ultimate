@echo off
REM Pre-slice batch hook for Bambu Studio
REM Usage: bambu-preslice-hook.bat "C:\path\to\model.3mf"
setlocal enabledelayedexpansion
if "%~1"=="" (
  echo No model provided & exit /b 0
)
set MODEL=%~1
set LOGDIR=%LOCALAPPDATA%\BambuStudio\hook-results
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
set LOGFILE=%LOGDIR%\hook-debug.log
echo Preslice hook: analyzing %MODEL% >> "%LOGFILE%"
set SCRIPT_DIR=%~dp0
set NODE_CMD="C:\Program Files\nodejs\node.exe"
for /f "usebackq tokens=2*" %%i in (`where node 2^>nul ^| findstr /r /c:"node.exe"`) do (
  set NODE_CMD=%%i
  goto :foundnode
)
:foundnode
if not exist %NODE_CMD% (
  echo Node not found; skipping analysis >> "%LOGFILE%"
  exit /b 0
)
rem Start bridge if needed (call PowerShell helper)
powershell -NoProfile -ExecutionPolicy Bypass -Command "& {try {Invoke-RestMethod -Uri 'http://localhost:8787/health' -Method GET -ErrorAction Stop}else{Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"%SCRIPT_DIR%start-bridge.ps1\"' -WindowStyle Hidden}}" >> "%LOGFILE%" 2>&1
rem Run analyzer with bridge fallback
%NODE_CMD% "%SCRIPT_DIR%balance-cli.js" "%MODEL%" --format json --bridge --bridge-url "http://localhost:8787/info" > "%LOGDIR%\%~n1.balance.json" 2>> "%LOGFILE%"
if %ERRORLEVEL% neq 0 echo Analyzer exited with %ERRORLEVEL% >> "%LOGFILE%"
exit /b 0
