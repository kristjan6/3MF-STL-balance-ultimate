@echo off
REM start-bridge.bat
REM
REM Starts the Bambu Bridge HTTP server that exposes model analysis to the web UI.
REM
REM The bridge listens on http://localhost:8787 and provides:
REM   GET  /health   - Server status check
REM   POST /info     - Upload and analyze a model
REM
REM Configuration via environment variables:
REM   BAMBU_CLI_PATH   Path to Bambu Studio (auto-detected by default)
REM   BRIDGE_PORT      Port to listen on (default: 8787)
REM

setlocal

echo.
echo ============================================================================
echo   Bambu Balance Ultimate - Bridge Server
echo ============================================================================
echo.
echo Starting HTTP bridge server...
echo.
echo The bridge server will:
echo   - Listen on http://localhost:8787
echo   - Accept STL/3MF file uploads for balance analysis
echo   - Return balance metrics and Bambu preset recommendations
echo.
echo Press Ctrl+C to stop the server.
echo.

cd /d "%~dp0"
node.exe bambu-bridge\server.js

if errorlevel 1 (
    echo.
    echo ERROR: Bridge server failed to start.
    echo Verify that Node.js is installed and accessible from PATH.
    echo.
    pause
)
