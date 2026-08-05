@echo off
REM Launch start-bridge.ps1 elevated (UAC prompt)
REM Double-click this .bat or run from Explorer to get an elevation prompt.
powershell -NoProfile -Command "Start-Process -FilePath 'powershell' -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"%~dp0start-bridge.ps1\"' -Verb RunAs"
