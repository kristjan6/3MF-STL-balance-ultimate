stl-balance-ultimate/
├── index.html                           # Web UI with 3D visualization
├── balance-cli.js                       # Node CLI analyzer
├── bambu-preslice-hook.bat              # Pre-slice hook (batch)
├── bambu-preslice-hook.ps1              # Pre-slice hook (PowerShell)
├── bambu-bridge/server.js               # HTTP bridge for web UI
├── bambu-balance-ultimate-installer.nsi # Windows installer (NSIS)
├── start-bridge.bat                     # Bridge server launcher
├── package.json                         # Node.js dependencies
├── INTEGRATION-SETUP.md                 # Complete setup guide
├── QUICK-TEST.md                        # Integration test guide
└── README.md                            # This file

# STL Balance Ultimate - Bambu Studio Integration

Complete assembly balance analysis solution for Bambu Studio with automatic pre-slice hook integration.

## Overview

**STL Balance Ultimate** provides balance analysis before you slice. The package includes:

- **Web UI** (index.html): Interactive 3D visualization and manual analysis
- **CLI Analyzer** (balance-cli.js): Headless analysis with Bambu preset recommendations
- **Pre-Slice Hook**: Automatic analysis when loading models in Bambu Studio
- **Bridge Server** (bambu-bridge/server.js): HTTP API for web UI integration
- **Windows Installer**: One-click setup with automatic hook registration

## Features

### Web UI (Browser)
- Load multiple STL parts with per-part translation and rotation.
- Add discrete hardware masses (battery, bearings, magnets, camera, etc.).
- Compute assembly center of mass (COM) under uniform-density assumptions.
- Target neutral point: bounding-box center, origin, custom point, or pivot-axis midpoint.
- Visualize COM, neutral target, pivot axis projection, and offset in 3D.
- Suggest ballast cavities, hollowing, and hardware relocation for better balance.
- Export TXT, JSON, CSV, and a printable balance worksheet.

### CLI Analyzer (Node.js)
- Standalone STL/3MF analysis without UI
- JSON output compatible with Bambu Studio presets
- Batch processing and scripting support
- Hardware mass configuration via command line

### Pre-Slice Hook (Bambu Studio Integration)
- Automatically analyzes models when loading in Bambu Studio
- Writes balance JSON to `%LOCALAPPDATA%\BambuStudio\hook-results\`
- Recommends Bambu preset settings based on balance class
- Graceful failure (slicing continues even if analysis fails)
- Debug logging for troubleshooting

### Bambu Preset Recommendations
- **General**: Standard functional parts (15% infill, 3 walls)
- **Low-Infill Shell**: Lightweight with ballast pocket (5% infill, 4 walls, tree supports)
- **High-Stiffness**: Rigid structures with minimal hollowing (35% infill, gyroid grid)
- **Pivot/Bearer**: Optimized for rotation (20% infill, 5 walls, linear supports)

## Quick Start

### Option 1: Installer (Recommended)

1. Download `bambu-balance-ultimate-1.0.0.exe`
2. Run installer
3. Done! Hook is registered and ready

### Option 2: Manual Setup

1. **Install Node.js 18+** from https://nodejs.org/
2. **Clone the repo**: `git clone https://github.com/kristjan6/3MF-STL-balance-ultimate.git`
3. **Install dependencies**: `npm install jszip@3.10.1 xmldom`
4. **Start web UI**: `node bambu-bridge/server.js`
5. **Open browser**: http://localhost:8787

### Option 3: Standalone CLI

Analyze a model without UI:
```powershell
node balance-cli.js assembly.stl --output results.json
cat results.json
```

## Usage

### 1. Web UI (Interactive)

1. Open `index.html` in a browser or run `start-bridge.bat`
2. Load STL files via "Add STL part"
3. Add hardware masses (battery, camera, bearings, etc.)
4. Click "Analyze now"
5. Review balance recommendations and 3D visualization
6. Export results (TXT, JSON, CSV, 3MF)

### 2. Pre-Slice Hook (Automatic in Bambu Studio)

1. **Installer registers hook automatically**
2. **Load model in Bambu Studio**
3. **Hook runs automatically** before slicing
4. **Results appear in**: `%LOCALAPPDATA%\BambuStudio\hook-results\`
5. **Review analysis JSON** and apply preset recommendations

### 3. CLI (Headless/Batch)

Analyze single model:
```powershell
node balance-cli.js model.stl --density 1.24 --preset low-infill --output results.json
```

Batch analyze:
```powershell
Get-ChildItem "*.stl" | ForEach-Object {
  node balance-cli.js $_.FullName --output "$($_.BaseName).json"
}
```

Add hardware:
```powershell
node balance-cli.js model.stl `
  --hardware "battery,45.0,10,20,30" `
  --hardware "camera,35.5,40,50,60" `
  --output analysis.json
```

## Configuration

### Bambu Hook Settings

Edit `%LOCALAPPDATA%\BambuStudio\hooks\preslice-hook.ini`:

```ini
[preslice]
enabled=true
script=C:\Program Files\BambuBalanceHook\bambu-preslice-hook.bat
timeout=60000
failureMode=continue
logDir=%LOCALAPPDATA%\BambuStudio\hook-results
```

### Bridge Server Port

Set before starting:
```powershell
$env:BRIDGE_PORT = 8888
node bambu-bridge/server.js
```

### Custom Analysis Settings

Via CLI options:
```powershell
node balance-cli.js model.stl `
  --density 1.24 `
  --ballast-density 7.80 `
  --target-mode bbox-center `
  --lever-arm 25 `
  --preset general
```

## Output Format

Analysis results are JSON with structure:

```json
{
  "success": true,
  "balance": {
    "assemblyCom": [x, y, z],
    "offsetMagnitude": 4.56,
    "balanceClass": "trim-tunable",
    "symmetryScore": 87.5
  },
  "recommendations": {
    "ballastMass": 12.34,
    "ballastVolume": 1.58,
    "dominantAxis": "Z"
  },
  "bambuPreset": {
    "selected": "low-infill",
    "settings": {
      "infill": 5,
      "shellWalls": 4,
      "ballastCavity": true
    },
    "rationale": "..."
  }
}
```

## Troubleshooting

### Hook not running

```powershell
# Check if hook is registered
cat "$env:LOCALAPPDATA\BambuStudio\hooks\preslice-hook.ini"

# Check debug log
cat "$env:LOCALAPPDATA\BambuStudio\hook-results\hook-debug.log" -Tail 20
```

### CLI analysis fails

```powershell
# Verify Node.js
node --version

# Test CLI directly
node balance-cli.js model.stl --json

# Check for errors
node balance-cli.js model.stl 2>&1
```

### Web UI not responding

```powershell
# Start bridge with debug
node bambu-bridge/server.js

# Check port availability
netstat -ano | findstr :8787
```

See `INTEGRATION-SETUP.md` for complete troubleshooting guide.

## Documentation

- **INTEGRATION-SETUP.md**: Complete setup, configuration, and usage guide
- **QUICK-TEST.md**: Integration test procedures
- **index.html**: Web UI (open in browser)
- **package.json**: Node.js dependencies and scripts

## Requirements

- **Node.js 18+** (https://nodejs.org/)
- **Bambu Studio** (any recent version)
- **Windows 10/11** (64-bit recommended)
- ~100 MB disk space

## Installation Methods

### Installer
- **File**: `bambu-balance-ultimate-1.0.0.exe`
- **Install time**: ~2 minutes
- **Auto-detection**: Node.js, Bambu Studio paths
- **Hook registration**: Automatic
- **Uninstall**: Via Windows Apps & features

### Manual (Git)
```powershell
git clone https://github.com/kristjan6/3MF-STL-balance-ultimate.git
cd 3MF-STL-balance-ultimate
npm install jszip@3.10.1 xmldom
```

### Manual (Zip)
1. Extract `stl-balance-ultimate.zip`
2. Open PowerShell in folder
3. Run `npm install jszip@3.10.1 xmldom`
4. Copy hook scripts to `%LOCALAPPDATA%\BambuStudio\hooks\`

## Development

### Build Installer
```powershell
# Requires NSIS 3.x
makensis bambu-balance-ultimate-installer.nsi
```

### Extend CLI
- Add STL/3MF parsers in `balance-cli.js`
- Extend recommendation logic in `recommendBambuPreset()`
- Add output formats (CSV, XML, etc.)

### Modify Web UI
- Edit `index.html` (vanilla JavaScript + Three.js)
- Recompile from source or use as-is for browser deployment

## Support & Feedback

- **GitHub Issues**: https://github.com/kristjan6/3MF-STL-balance-ultimate/issues
- **GitHub Discussions**: https://github.com/kristjan6/3MF-STL-balance-ultimate/discussions

## License

MIT - See LICENSE.txt

## Credits

Built for **Bambu Studio** users who care about assembly balance before printing.
