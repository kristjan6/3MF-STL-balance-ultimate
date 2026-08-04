@echo off
REM bambu-preslice-hook.bat
REM 
REM Pre-slice hook for Bambu Studio integration.
REM Called by Bambu Studio before slicing a model.
REM 
REM Bambu Studio passes the model file path as an argument (or via environment variable).
REM This script:
REM  1. Runs balance-cli.js on the model
REM  2. Writes analysis JSON to a file in the Bambu user config directory
REM  3. Returns exit code 0 (success) so slicing continues
REM  4. Logs errors to a debug log file
REM 
REM Expected call from Bambu:
REM   bambu-preslice-hook.bat "C:\path\to\model.stl"
REM   OR via environment: set BAMBU_MODEL_FILE=C:\path\to\model.stl
REM 

setlocal enabledelayedexpansion

REM Configuration
set HOOK_DIR=%~dp0
set RESULTS_DIR=%LOCALAPPDATA%\BambuStudio\hook-results
set LOG_FILE=%RESULTS_DIR%\hook-debug.log
set NODE_EXE=node.exe
set CLI_SCRIPT=%HOOK_DIR%balance-cli.js

REM Ensure results directory exists
if not exist "%RESULTS_DIR%" mkdir "%RESULTS_DIR%"

REM Get model file path from argument or environment
set MODEL_FILE=%1
if "!MODEL_FILE!"=="" set MODEL_FILE=!BAMBU_MODEL_FILE!

REM Validate model file
if "!MODEL_FILE!"=="" (
    echo [!DATE! !TIME!] ERROR: No model file provided as argument or BAMBU_MODEL_FILE env var >> "!LOG_FILE!"
    exit /b 0
)

if not exist "!MODEL_FILE!" (
    echo [!DATE! !TIME!] ERROR: Model file not found: !MODEL_FILE! >> "!LOG_FILE!"
    exit /b 0
)

REM Generate output filename based on model
for %%F in ("!MODEL_FILE!") do set MODEL_BASENAME=%%~nF
set RESULTS_FILE=!RESULTS_DIR!\analysis-!MODEL_BASENAME!.json

REM Log hook invocation
echo [!DATE! !TIME!] Hook invoked for model: !MODEL_FILE! >> "!LOG_FILE!"

REM Run analysis
echo [!DATE! !TIME!] Running balance analysis... >> "!LOG_FILE!"
"%NODE_EXE%" "%CLI_SCRIPT%" "!MODEL_FILE!" --output "!RESULTS_FILE!" --json 2>> "!LOG_FILE!"

if errorlevel 1 (
    echo [!DATE! !TIME!] ERROR: balance-cli.js failed with exit code !ERRORLEVEL! >> "!LOG_FILE!"
    REM Don't exit with error - allow slicing to proceed
    exit /b 0
)

REM Log success
echo [!DATE! !TIME!] Analysis complete. Results written to: !RESULTS_FILE! >> "!LOG_FILE!"
exit /b 0
