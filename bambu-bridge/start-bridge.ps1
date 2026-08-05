# start-bridge.ps1
# Helper to launch bambu-bridge's server.js in a detached/background process on Windows.
# Usage: Right-click -> Run with PowerShell, or run from an elevated PowerShell if needed.
# This script tries to find node in PATH and starts server.js from the same folder.

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Push-Location $scriptDir

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Write-Error "Node.js executable 'node' was not found in PATH. Install Node 18+ and try again."
  Pop-Location
  exit 1
}

$nodePath = $nodeCmd.Source
$logFile = Join-Path $scriptDir ("bambu-bridge-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log")

Write-Output "Starting bambu-bridge using: $nodePath"
Write-Output "Working directory: $scriptDir"
Write-Output "Logging to: $logFile"

# Start node server.js in a new process; allow it to continue after this script exits
Start-Process -FilePath $nodePath -ArgumentList 'server.js' -WorkingDirectory $scriptDir -RedirectStandardOutput $logFile -RedirectStandardError $logFile -WindowStyle Hidden

Start-Sleep -Seconds 1
Write-Output "Launched. Waiting briefly, then checking health..."

try {
  $health = Invoke-RestMethod -Uri 'http://localhost:8787/health' -Method GET -ErrorAction Stop
  Write-Output "Bridge reported: $($health | ConvertTo-Json -Depth 2)"
  Write-Output "Bridge should be available now. If not, check the log: $logFile"
} catch {
  Write-Warning "Could not reach bridge at http://localhost:8787/health yet. Check the log file: $logFile"
}

Pop-Location
