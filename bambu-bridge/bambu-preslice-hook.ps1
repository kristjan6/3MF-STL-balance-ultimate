# Example pre-slice PowerShell hook (bambu-preslice-hook.ps1)
# Usage: Bambu Studio should invoke this script with the model path as first arg
param(
  [string]$ModelPath
)

$logDir = Join-Path $env:LOCALAPPDATA 'BambuStudio\hook-results'
if(-not (Test-Path $logDir)){ New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir "hook-debug.log"

function Start-BridgeIfNeeded($bridgeCmd){
  try{
    $health = Invoke-RestMethod -Uri 'http://localhost:8787/health' -Method GET -ErrorAction Stop
    return $true
  } catch {
    # attempt to start bridge
    try{
      Write-Output "Bridge not reachable; starting bridge via: $bridgeCmd" | Out-File -FilePath $logFile -Append
      Start-Process -FilePath 'powershell.exe' -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$bridgeCmd`"" -WindowStyle Hidden
      Start-Sleep -Seconds 2
      # wait up to 15 seconds for health
      for($i=0;$i -lt 15;$i++){
        try{ $h = Invoke-RestMethod -Uri 'http://localhost:8787/health' -Method GET -ErrorAction Stop; return $true } catch { Start-Sleep -Seconds 1 }
      }
      return $false
    } catch {
      Write-Output "Failed to start bridge: $_" | Out-File -FilePath $logFile -Append
      return $false
    }
  }
}

try{
  if(-not $ModelPath){ Write-Output "No model path provided; exiting."; exit 0 }
  Write-Output "Preslice hook: analyzing $ModelPath" | Out-File -FilePath $logFile -Append
  $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
  $analyzer = Join-Path $scriptDir 'balance-cli.js'
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if(-not $node){ Write-Output "Node not found; skipping analysis." | Out-File -FilePath $logFile -Append; exit 0 }

  $bridgeCmd = Join-Path $scriptDir 'start-bridge.ps1'
  # ensure bridge is running (starts it if not)
  Start-BridgeIfNeeded $bridgeCmd | Out-Null

  $outFile = Join-Path $logDir ((Split-Path $ModelPath -Leaf) + '.balance.json')
  # run analyzer with bridge fallback
  & $node $analyzer $ModelPath --format json --bridge --bridge-url 'http://localhost:8787/info' > $outFile 2>> $logFile
  Write-Output "Wrote analysis to $outFile" | Out-File -FilePath $logFile -Append
} catch {
  Write-Output "Hook failed: $_" | Out-File -FilePath $logFile -Append
} finally {
  exit 0
}
