# Quick Integration Test Guide

This guide helps you verify the Bambu Balance Hook integration is working correctly.

## Pre-Test Checklist

- [ ] Node.js 18+ is installed (`node --version`)
- [ ] Dependencies installed (`npm list jszip xmldom`)
- [ ] Hook files present: `balance-cli.js`, `bambu-preslice-hook.bat`, `bambu-preslice-hook.ps1`
- [ ] Results directory exists: `%LOCALAPPDATA%\BambuStudio\hook-results\`

## Test 1: CLI Basic Functionality

Create a simple test STL file or use an existing model.

```powershell
# Test 1a: Show help and usage
node balance-cli.js 2>&1 | Select-Object -First 5

# Expected output:
# Usage: node balance-cli.js <model.stl> [options]
```

## Test 2: Analyze a Sample Model

```powershell
# If you have a test model
node balance-cli.js C:\path\to\sample.stl

# Expected output: JSON to stdout with success=true
```

## Test 3: Hook Script (Batch)

```powershell
# Test the hook script
& "bambu-preslice-hook.bat" "C:\path\to\model.stl"

# Check results
Get-ChildItem "$env:LOCALAPPDATA\BambuStudio\hook-results\" -Filter "*.json"

# Expected: analysis-model.stl.json file created
```

## Test 4: Hook Script (PowerShell)

```powershell
# Test PowerShell hook
powershell -ExecutionPolicy Bypass -File "bambu-preslice-hook.ps1" "C:\path\to\model.stl" -Debug

# Check results
Get-Content "$env:LOCALAPPDATA\BambuStudio\hook-results\hook-debug.log" | Select-Object -Last 5

# Expected: SUCCESS log entry
```

## Test 5: Bridge Server

```powershell
# Start bridge in background or new terminal
node bambu-bridge\server.js

# Expected output:
# Bambu bridge server listening on http://localhost:8787
# Using Bambu Studio CLI at: C:/Program Files/Bambu Studio/bambu-studio.exe
```

Verify health check:
```powershell
Invoke-RestMethod -Uri "http://localhost:8787/health"

# Expected response:
# {
#   "ok": true,
#   "cliPath": "C:/Program Files/Bambu Studio/bambu-studio.exe"
# }
```

## Test 6: Full Integration Test

1. **Start bridge server**
   ```powershell
   node bambu-bridge\server.js
   ```

2. **Open web UI**
   - Browse to http://localhost:8787 (or open `index.html` in browser)

3. **Upload a model**
   - Click "Add STL parts"
   - Select a `.stl` file
   - Verify it loads in 3D viewer

4. **Run analysis**
   - Click "Analyze now"
   - Review results in "Balance strategy" section
   - Check "Bambu slicing intent" recommendations

## Test 7: Hook Registration with Bambu Studio

1. **Verify hook configuration file**
   ```powershell
   cat "$env:LOCALAPPDATA\BambuStudio\hooks\preslice-hook.ini"
   ```

2. **Check hook is enabled**
   ```ini
   [preslice]
   enabled=true
   script=...
   ```

3. **Load model in Bambu Studio**
   - Open Bambu Studio
   - Load a model
   - Monitor results directory for new JSON files
   - Check `hook-debug.log` for execution details

## Automated Test Script

Save as `test-integration.ps1`:

```powershell
param(
    [string]$ModelFile = "test-model.stl",
    [string]$NodePath = "node"
)

Write-Host "=== Bambu Balance Hook Integration Test ===" -ForegroundColor Green
Write-Host ""

# Test 1: Node.js
Write-Host "Test 1: Node.js installed" -ForegroundColor Cyan
& $NodePath --version
if ($LASTEXITCODE -ne 0) {
    Write-Host "FAIL: Node.js not found" -ForegroundColor Red
    exit 1
}

# Test 2: CLI exists
Write-Host ""
Write-Host "Test 2: CLI script exists" -ForegroundColor Cyan
if (Test-Path "balance-cli.js") {
    Write-Host "PASS: balance-cli.js found" -ForegroundColor Green
} else {
    Write-Host "FAIL: balance-cli.js not found" -ForegroundColor Red
    exit 1
}

# Test 3: Hook exists
Write-Host ""
Write-Host "Test 3: Hook scripts exist" -ForegroundColor Cyan
if (Test-Path "bambu-preslice-hook.bat") {
    Write-Host "PASS: bambu-preslice-hook.bat found" -ForegroundColor Green
} else {
    Write-Host "FAIL: bambu-preslice-hook.bat not found" -ForegroundColor Red
    exit 1
}

# Test 4: Results directory
Write-Host ""
Write-Host "Test 4: Results directory" -ForegroundColor Cyan
$resultsDir = "$env:LOCALAPPDATA\BambuStudio\hook-results"
if (Test-Path $resultsDir) {
    Write-Host "PASS: Results directory exists" -ForegroundColor Green
} else {
    Write-Host "WARN: Results directory will be created on first run" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== All basic tests passed ===" -ForegroundColor Green
```

Run it:
```powershell
powershell -ExecutionPolicy Bypass -File test-integration.ps1
```

## Debugging

### Check CLI logs
```powershell
cat "$env:LOCALAPPDATA\BambuStudio\hook-results\hook-debug.log" -Tail 20
```

### Enable debug mode in hook
Edit `bambu-preslice-hook.ps1`:
```powershell
powershell -ExecutionPolicy Bypass -File "bambu-preslice-hook.ps1" "model.stl" -Debug
```

### Test with specific settings
```powershell
node balance-cli.js model.stl `
  --density 1.24 `
  --preset low-infill `
  --json `
  --output debug.json

cat debug.json | ConvertFrom-Json | Format-List
```

## Expected Results

After successful integration:

1. ✅ CLI runs without errors
2. ✅ Hook creates JSON files in results directory
3. ✅ Bridge server listens on port 8787
4. ✅ Web UI loads and displays analysis
5. ✅ Preset recommendations appear in Bambu Studio config
6. ✅ Debug log shows hook invocation and success

## Next Steps

- [ ] Test with Bambu Studio model load
- [ ] Verify Bambu reads preset recommendations
- [ ] Create sample analysis report
- [ ] Configure firewall if needed
- [ ] Set up automated task (optional)

## Support

If tests fail, review:
1. `%LOCALAPPDATA%\BambuStudio\hook-results\hook-debug.log`
2. Node.js version (`node --version` should be ≥ 18)
3. File permissions on results directory
4. Antivirus/firewall blocking Node.js

For detailed troubleshooting, see `INTEGRATION-SETUP.md` troubleshooting section.
