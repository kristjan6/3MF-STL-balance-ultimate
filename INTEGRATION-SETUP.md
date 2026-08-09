# Bambu Studio Balance Ultimate - Hook Integration Setup

This document describes how to set up and use the pre-slice hook integration for automatic balance analysis in Bambu Studio.

## Overview

The **Bambu Balance Ultimate Hook** integrates balance analysis directly into Bambu Studio's workflow:

1. **Model Load/Analysis**: When you load a model or trigger analysis, the pre-slice hook runs
2. **Analysis JSON**: Balance metrics and Bambu preset recommendations are written to a file
3. **Results**: Analysis appears in the hook results directory for review and debugging
4. **Optional Integration**: Use the web UI for detailed visualization and manual adjustments

## System Requirements

- **Windows 10/11** (64-bit recommended)
- **Node.js 18+** (auto-installed or manually via nodejs.org)
- **Bambu Studio** (any recent version)
- **Disk space**: ~100 MB total (Node.js + dependencies)

## Installation

### Option 1: Automated Installer (Recommended)

1. Download `bambu-balance-ultimate-1.0.0.exe`
2. Run the installer
3. Follow the wizard:
   - Accept the license
   - Choose installation directory (default: `C:\Program Files\BambuBalanceHook`)
   - Optionally install Node.js modules (jszip, xmldom)
   - Let the installer register the hook with Bambu Studio
4. Click "Finish"

**After installation:**
- A "Bambu Balance" folder appears in Start Menu with shortcuts
- Hook is automatically registered and ready to use
- Results will appear in `%LOCALAPPDATA%\BambuStudio\hook-results\`

### Option 2: Manual Setup

If you prefer manual installation:

1. **Install Node.js**
   - Download from https://nodejs.org/ (18 LTS or newer)
   - Run installer, accept defaults
   - Verify: Open PowerShell and run `node --version`

2. **Clone or extract the project**
   ```powershell
   git clone https://github.com/kristjan6/3MF-STL-balance-ultimate.git
   cd 3MF-STL-balance-ultimate
   ```

3. **Install Node dependencies**
   ```powershell
   npm install jszip@3.10.1 xmldom
   ```

4. **Copy hook script to Bambu config**
   ```powershell
   $hookDir = "$env:LOCALAPPDATA\BambuStudio\hooks"
   New-Item -ItemType Directory -Path $hookDir -Force
   Copy-Item "bambu-preslice-hook.bat" $hookDir
   ```

5. **Register hook in Bambu config**
   - Create or edit `$env:LOCALAPPDATA\BambuStudio\hooks\preslice-hook.ini`:
   ```ini
   [preslice]
   enabled=true
   script=C:\path\to\bambu-preslice-hook.bat
   timeout=60000
   failureMode=continue
   logDir=%LOCALAPPDATA%\BambuStudio\hook-results
   ```

## How to Use

### Running the Hook Manually

To test the hook or analyze a model outside Bambu Studio:

```powershell
# Basic usage
node balance-cli.js C:\path\to\model.stl

# With output file
node balance-cli.js C:\path\to\model.stl --output results.json

# With custom settings
node balance-cli.js C:\path\to\model.stl `
  --density 1.24 `
  --ballast-density 7.80 `
  --target-mode bbox-center `
  --preset low-infill `
  --output results.json
```

### From Bambu Studio (Automatic)

1. **Load a model** in Bambu Studio
2. **Pre-slice hook triggers automatically** (if registered)
3. **Check results**: `%LOCALAPPDATA%\BambuStudio\hook-results\`
4. **Open analysis JSON** with any text editor or Python JSON viewer

### Using the Web UI

1. **Start the bridge server**
   ```powershell
   node start-bridge.bat
   # Or: node bambu-bridge/server.js
   ```

2. **Open browser** to http://localhost:8787

3. **Upload your model** to see balance visualization and detailed recommendations

## Configuration

### CLI Options

The `balance-cli.js` tool accepts these options:

```
--output <file>          Write JSON to file instead of stdout
--density <g/cm³>        Default part density (default: 1.24)
--ballast-density <g/cm³> Ballast density (default: 7.80)
--target-mode <mode>     Target point: bbox-center, origin, custom, axis-mid
--custom-point <x,y,z>   Custom neutral point in mm (if --target-mode custom)
--axis-start <x,y,z>     Pivot axis start point (default: 0,0,0)
--axis-end <x,y,z>       Pivot axis end point (default: 0,60,0)
--lever-arm <mm>         Ballast pocket lever arm distance (default: 25)
--target-mass <g>        Target assembly mass (default: 0)
--hardware <name,mass,x,y,z>  Add discrete hardware mass (repeatable)
--preset <name>          Bambu slicing intent: general, low-infill, high-stiffness, pivot-part
--json                   Force JSON output without pretty-printing
```

### Bambu Hook Configuration

Edit `%LOCALAPPDATA%\BambuStudio\hooks\preslice-hook.ini`:

```ini
[preslice]
enabled=true                    # Enable/disable the hook
script=C:\path\to\hook.bat      # Full path to hook script
timeout=60000                   # Max milliseconds to wait for hook
failureMode=continue            # continue or fail
logDir=%LOCALAPPDATA%\BambuStudio\hook-results
```

### Bridge Server Configuration

Set environment variables before running `start-bridge.bat`:

```powershell
$env:BAMBU_CLI_PATH = "C:\Program Files\Bambu Studio\bambu-studio.exe"
$env:BRIDGE_PORT = 8787
node start-bridge.bat
```

## Output Format

### Analysis JSON Structure

The CLI and hook generate JSON with this structure:

```json
{
  "success": true,
  "timestamp": "2024-01-15T10:30:00.000Z",
  "model": {
    "file": "assembly.stl",
    "volumeCm3": 123.45,
    "surfaceAreaCm2": 456.78,
    "closed": true
  },
  "assembly": {
    "partCount": 1,
    "partMass": 150.23,
    "hardwareCount": 2,
    "hardwareMass": 45.67,
    "totalMass": 195.90
  },
  "geometry": {
    "boundingBox": [[-50, -50, -50], [50, 50, 50]],
    "size": [100, 100, 100]
  },
  "balance": {
    "assemblyCom": [1.23, 2.34, 3.45],
    "targetPoint": [0, 0, 0],
    "offsetVector": [1.23, 2.34, 3.45],
    "offsetMagnitude": 4.56,
    "balanceClass": "trim-tunable",
    "symmetryScore": 87.5
  },
  "pivotAxis": {
    "start": [0, 0, 0],
    "end": [0, 60, 0],
    "projection": [0, 30, 0]
  },
  "recommendations": {
    "ballastMass": 12.34,
    "ballastVolume": 1.58,
    "leverArm": 25.0,
    "hollowVolume": 9.96,
    "dominantAxis": "Z"
  },
  "bambuPreset": {
    "selected": "low-infill",
    "label": "Low infill shell with ballast cavity",
    "settings": {
      "nozzleTemp": 220,
      "bedTemp": 60,
      "infill": 5,
      "shellWalls": 4,
      "ballastCavity": true,
      "supportType": "tree"
    },
    "rationale": "Lightweight shell optimized for ballast pocket. Good for requires-correction class.",
    "balanceClass": "trim-tunable",
    "offsetMagnitude": 4.56,
    "symmetryScore": 87.5,
    "availablePresets": [
      {"name": "general", "label": "General functional part"},
      {"name": "low-infill", "label": "Low infill shell with ballast cavity"},
      {"name": "high-stiffness", "label": "High stiffness with limited hollowing"},
      {"name": "pivot-part", "label": "Pivot or bearing carrier"}
    ]
  },
  "components": [
    {
      "name": "assembly.stl",
      "type": "stl",
      "mass": 150.23,
      "position": [1.23, 2.34, 3.45]
    },
    {
      "name": "battery",
      "type": "hardware",
      "mass": 25.00,
      "position": [10, 20, 30]
    }
  ]
}
```

### Results Directory

Analysis results are stored in:
- **Windows**: `%LOCALAPPDATA%\BambuStudio\hook-results\`
- **Full path**: `C:\Users\<YourUsername>\AppData\Local\BambuStudio\hook-results\`

Files:
- `analysis-model.stl.json` - Latest analysis for model.stl
- `hook-debug.log` - Hook execution log (for troubleshooting)

## Using Preset Recommendations

The hook recommends one of four Bambu Studio slicing presets:

### 1. **General Functional Part** (Default)
- **Infill**: 15%
- **Shell**: 3 walls
- **Best for**: Balanced assemblies with minor tweaks
- **Use when**: Offset < 2 mm

### 2. **Low Infill Shell with Ballast Cavity**
- **Infill**: 5%
- **Shell**: 4 walls
- **Support**: Tree (minimal material)
- **Best for**: Lightweight designs needing ballast pocket
- **Use when**: Offset 2-10 mm, plan to add ballast

### 3. **High Stiffness with Limited Hollowing**
- **Infill**: 35%
- **Shell**: 5 walls
- **Grid**: Gyroid (strong diagonal structure)
- **Best for**: Rigid assemblies, bearing carriers
- **Use when**: Offset > 5 mm but structure must be rigid

### 4. **Pivot or Bearing Carrier**
- **Infill**: 20%
- **Shell**: 5 walls
- **Support**: Linear (optimized for rotation)
- **Best for**: Parts that rotate or pivot
- **Use when**: Assembly has rotational symmetry requirements

## Troubleshooting

### Hook not running

1. **Check registration**: Verify `%LOCALAPPDATA%\BambuStudio\hooks\preslice-hook.ini` exists
2. **Check permissions**: Ensure you have write access to `%LOCALAPPDATA%\BambuStudio\hook-results\`
3. **Check Node.js**: Run `node --version` in PowerShell
4. **Review log**: Check `%LOCALAPPDATA%\BambuStudio\hook-results\hook-debug.log`

### Analysis fails or hangs

1. **Timeout**: If analysis takes > 60 seconds, increase timeout in preslice-hook.ini
2. **Large models**: STL parsing may be slow; verify file is not corrupted
3. **No output**: Check if results directory is writable

### Web UI not responding

1. **Start bridge**: Run `start-bridge.bat` or `node start-bridge.bat`
2. **Check port**: Verify 8787 is not in use: `netstat -ano | findstr :8787`
3. **Change port**: Set `BRIDGE_PORT=8888` and visit http://localhost:8888

### Hook results are empty

1. **Verify file**: Check if `.json` files appear in hook-results folder
2. **Review log**: Open `hook-debug.log` for error messages
3. **Test CLI**: Run `node balance-cli.js model.stl` directly to isolate the issue

## Uninstalling

### Installer Method

1. **Windows Settings** → **Apps** → **Apps & features**
2. Search for "Bambu Studio Balance Ultimate Hook"
3. Click **Uninstall**
4. Confirm removal

### Manual Setup

1. Delete the folder you extracted (e.g., `C:\path\to\3MF-STL-balance-ultimate`)
2. Delete `%LOCALAPPDATA%\BambuStudio\hooks\preslice-hook.ini`
3. Remove from Start Menu if you created shortcuts

## Advanced Usage

### Custom Hardware Masses

Add discrete hardware (battery, magnets, camera, etc.) to the analysis:

```powershell
node balance-cli.js assembly.stl `
  --hardware "battery,45.00,10,20,30" `
  --hardware "camera,35.50,40,50,60" `
  --output results.json
```

### Batch Analysis

Analyze multiple models:

```powershell
Get-ChildItem "*.stl" | ForEach-Object {
  node balance-cli.js $_.FullName --output "$($_.BaseName)-analysis.json"
}
```

### Integration with CAD Workflows

Generate a report for export:

```powershell
# Run analysis
node balance-cli.js assembly.stl --output analysis.json

# Convert JSON to CSV for spreadsheet
(Get-Content analysis.json | ConvertFrom-Json).components | Export-Csv -Path components.csv
```

## Development

### Building the Installer

Prerequisites:
- NSIS 3.x installed (https://nsis.sourceforge.io/)
- All project files in the directory

Build:
```powershell
makensis bambu-balance-ultimate-installer.nsi
```

Output: `dist\bambu-balance-ultimate-1.0.0.exe`

### Extending the CLI

The `balance-cli.js` is modular. To add features:

1. **Add parser support**: Extend `parseSTL()` or `parse3MF()` for new formats
2. **Add output formats**: Extend the results JSON or create CSV/XML export
3. **Add analysis modes**: Extend recommendation logic in `recommendBambuPreset()`

## API Reference

### Hook Script Interface

**File**: `bambu-preslice-hook.bat` (or `.ps1`)

**Input**:
- Argument 1: Model file path (absolute)
- Environment: `BAMBU_MODEL_FILE` (fallback)

**Output**:
- Writes JSON to: `%LOCALAPPDATA%\BambuStudio\hook-results\analysis-<filename>.json`
- Logs to: `%LOCALAPPDATA%\BambuStudio\hook-results\hook-debug.log`
- Exit code: Always 0 (success) to allow slicing to continue

**Timeout**: 60 seconds (configurable in preslice-hook.ini)

### Bridge Server Interface

**Endpoint**: `POST http://localhost:8787/info`

**Request**:
```
Content-Type: multipart/form-data
Field name: "model"
Value: Binary STL or 3MF file
```

**Response**:
```json
{
  "objectCount": 1,
  "objects": [...],
  "rawText": "... Bambu CLI output ..."
}
```

## Support & Feedback

- **Issues**: https://github.com/kristjan6/3MF-STL-balance-ultimate/issues
- **Discussions**: https://github.com/kristjan6/3MF-STL-balance-ultimate/discussions
- **License**: MIT

## Changelog

### v1.0.0 (2024-01-15)
- Initial release
- Pre-slice hook integration with Bambu Studio
- Balance analysis CLI with Bambu preset recommendations
- Web UI with 3D visualization
- Windows installer with auto-detection
- Comprehensive documentation and troubleshooting guide
