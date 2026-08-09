# bambu-preslice-hook.ps1
# 
# Pre-slice hook for Bambu Studio integration (PowerShell version).
# Called by Bambu Studio before slicing a model.
# 
# Features:
#  - Runs balance-cli.js on the model
#  - Writes analysis JSON to Bambu config directory
#  - Graceful error handling (slicing continues if analysis fails)
#  - Comprehensive debug logging
# 
# Usage:
#   powershell -ExecutionPolicy Bypass -File bambu-preslice-hook.ps1 "C:\path\to\model.stl"

param(
    [Parameter(Position = 0)]
    [string]$ModelFile = $env:BAMBU_MODEL_FILE,
    
    [Parameter(Position = 1)]
    [string]$ResultsDir = "$env:LOCALAPPDATA\BambuStudio\hook-results",
    
    [switch]$Debug
)

$ErrorActionPreference = "Continue"

# Setup
$HookDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$CliScript = Join-Path $HookDir "balance-cli.js"
$LogFile = Join-Path $ResultsDir "hook-debug.log"
$NodeExe = "node.exe"

# Ensure results directory exists
if (-not (Test-Path $ResultsDir)) {
    [void](New-Item -ItemType Directory -Path $ResultsDir -Force)
}

# Helper function for logging
function Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] $Message"
    Add-Content -Path $LogFile -Value $logMessage -Encoding UTF8
    if ($Debug) { Write-Host $logMessage -ForegroundColor Cyan }
}

# Validate inputs
if (-not $ModelFile) {
    Log "ERROR: No model file provided as argument or BAMBU_MODEL_FILE env var"
    exit 0
}

if (-not (Test-Path $ModelFile)) {
    Log "ERROR: Model file not found: $ModelFile"
    exit 0
}

# Generate output filename
$modelBasename = Split-Path -Leaf $ModelFile
$resultsFile = Join-Path $ResultsDir "analysis-$modelBasename.json"

# Log invocation
Log "Hook invoked for model: $ModelFile"
Log "Output file: $resultsFile"
Log "CLI script: $CliScript"

# Verify CLI script exists
if (-not (Test-Path $CliScript)) {
    Log "ERROR: CLI script not found at: $CliScript"
    exit 0
}

# Run analysis
Log "Running balance analysis..."
try {
    $output = & $NodeExe $CliScript $ModelFile --output $resultsFile --json 2>&1
    $exitCode = $LASTEXITCODE
    
    if ($exitCode -ne 0) {
        Log "WARNING: balance-cli.js exited with code $exitCode"
        Log "Output: $output"
        # Still exit 0 to allow slicing to continue
        exit 0
    }
    
    if (Test-Path $resultsFile) {
        $fileSize = (Get-Item $resultsFile).Length
        Log "SUCCESS: Analysis complete. Results written ($fileSize bytes) to: $resultsFile"
    } else {
        Log "WARNING: Results file was not created despite successful exit"
    }
}
catch {
    Log "ERROR: Exception running analysis: $_"
    # Still exit 0 to allow slicing to continue
    exit 0
}

exit 0
