# Architecture Overview

## System Design

This document describes the architecture of the Bambu Studio Balance Ultimate Hook integration.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Bambu Studio (User)                              │
│                                                                     │
│  1. User loads model.stl in Bambu Studio                           │
│  2. Pre-slice hook triggers automatically                          │
│  3. Hook script (bambu-preslice-hook.bat) executes                 │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 Pre-Slice Hook Execution                            │
│                                                                     │
│  bambu-preslice-hook.bat / .ps1                                     │
│  ├─ Receives: model file path                                      │
│  ├─ Creates: results directory if missing                          │
│  ├─ Invokes: node balance-cli.js <model> --output results.json     │
│  └─ Ensures: slicing continues even if analysis fails (exit 0)     │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   CLI Analyzer                                      │
│                                                                     │
│  balance-cli.js                                                     │
│  ├─ Parse: STL binary/ASCII geometry                               │
│  ├─ Compute: Center of mass, offset, balance class                 │
│  ├─ Analyze: Ballast requirements, preset recommendations          │
│  ├─ Generate: Bambu Studio preset JSON                             │
│  └─ Output: JSON to file or stdout                                 │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│            Results Directory                                        │
│                                                                     │
│  %LOCALAPPDATA%\BambuStudio\hook-results\                           │
│  ├─ analysis-model.stl.json    (Balance JSON)                      │
│  ├─ hook-debug.log              (Execution log)                    │
│  └─ (Bambu Studio can read these files)                            │
└────────────────┬────────────────────────────────────────────────────┘
                 │
                 ├──────────────┬──────────────┬──────────────┐
                 ▼              ▼              ▼              ▼
            ┌────────┐    ┌────────────┐ ┌─────────┐  ┌──────────┐
            │ Bambu  │    │  Web UI    │ │ Scripts │  │ Reports  │
            │ Studio │    │(Browser)   │ │ (CLI)   │  │ (Export) │
            │ Presets│    └────────────┘ └─────────┘  └──────────┘
            └────────┘
```

## Component Architecture

### 1. Pre-Slice Hook (Orchestrator)

**Files**: `bambu-preslice-hook.bat`, `bambu-preslice-hook.ps1`

**Responsibilities**:
- Receives model file path from Bambu Studio
- Ensures results directory exists
- Spawns CLI analyzer as subprocess
- Logs execution details
- **Always exits with code 0** (fail-safe: slicing continues)

**Flow**:
```
Bambu Studio
    ↓ (calls hook with model path)
bambu-preslice-hook.bat
    ↓ (validates input)
    ├─ Check model file exists
    ├─ Create results dir
    └─ Spawn: node balance-cli.js
         ↓
    Wait for exit
         ↓
    Log result
         ↓
    Exit 0 (always)
         ↓
Back to Bambu Studio (slicing continues)
```

**Failure Handling**:
- If model file missing → Log warning, exit 0
- If CLI fails → Log error, exit 0
- If timeout → Terminated by caller, exit 0
- **Never blocks slicing**

### 2. CLI Analyzer (Core Engine)

**File**: `balance-cli.js`

**Input**:
- Model file path (.stl or .3mf)
- Optional: density, pivot axis, hardware masses, preset name

**Processing**:
```
Parse STL/3MF
    ↓
Extract triangles
    ↓
Compute mass properties
    ├─ Volume (signed tetrahedron sum)
    ├─ Center of mass (weighted centroid)
    ├─ Bounding box
    └─ Surface area
         ↓
Add discrete hardware masses
    ↓
Calculate assembly COM
    ↓
Compute offset to neutral target
    ↓
Classify balance (near-neutral / trim-tunable / requires-correction)
    ↓
Recommend Bambu preset
    ├─ General (balanced)
    ├─ Low-infill (needs ballast)
    ├─ High-stiffness (requires minimal trim)
    └─ Pivot-part (rotational loads)
         ↓
Output JSON
```

**Output Structure**:
```json
{
  "success": true,
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
  "balance": {
    "assemblyCom": [x, y, z],
    "offsetMagnitude": 4.56,
    "balanceClass": "trim-tunable",
    "symmetryScore": 87.5
  },
  "bambuPreset": {
    "selected": "low-infill",
    "settings": { ... },
    "rationale": "..."
  }
}
```

### 3. Bridge Server (API)

**File**: `bambu-bridge/server.js`

**Purpose**: HTTP interface for web UI integration

**Endpoints**:
- `GET /health` → Server status, CLI path
- `POST /info` → Multipart file upload, returns Bambu CLI parsed data

**Port**: 8787 (configurable via `BRIDGE_PORT` env var)

**Flow**:
```
Browser
    ↓ (uploads model via POST /info)
Bridge Server
    ├─ Parse multipart form
    ├─ Write temp file
    ├─ Spawn: Bambu Studio --info model.stl
    ├─ Parse output
    ├─ Clean up temp
    └─ Return JSON
```

### 4. Web UI (Visualization)

**File**: `index.html`

**Technology**: Vanilla JavaScript + Three.js (WebGL)

**Features**:
- STL file loading and parsing
- 3D geometry visualization
- Mass property editing
- Interactive analysis
- Preset selection
- Report generation

**Data Flow**:
```
User loads STL
    ↓
Client-side parse (jszip for 3MF)
    ↓
Compute geometry (browser)
    ↓
3D visualization (Three.js)
    ↓
Update metrics/recommendations
    ↓
Display Bambu presets
```

## File Organization

```
project-root/
├── balance-cli.js                    # Core analyzer
├── bambu-preslice-hook.bat           # Hook entry point (batch)
├── bambu-preslice-hook.ps1           # Hook entry point (PowerShell)
├── bambu-bridge/
│   └── server.js                     # HTTP bridge
├── index.html                        # Web UI
├── start-bridge.bat                  # Server launcher
├── bambu-balance-ultimate-installer.nsi  # NSIS installer
├── package.json                      # Dependencies
├── INTEGRATION-SETUP.md              # Setup guide
├── QUICK-TEST.md                     # Test procedures
├── ARCHITECTURE.md                   # This file
├── LICENSE.txt                       # MIT license
└── README.md                         # Main documentation
```

## Dependency Graph

```
Bambu Studio
    ↓ calls
bambu-preslice-hook.bat/ps1
    ↓ invokes
balance-cli.js (no dependencies)
    ↓ outputs
analysis-*.json
    ↓ read by
index.html (web UI) — optional
    ↑ HTTP requests
bambu-bridge/server.js (optional)
```

## Data Flow: Pre-Slice Integration

### Scenario: User Loads Model in Bambu Studio

1. **Bambu Studio loads model.stl**
   - User clicks "Open" → Bambu loads geometry
   - Pre-slice event triggered (if hook registered)

2. **Hook invoked by Bambu**
   - `bambu-preslice-hook.bat "C:\path\to\model.stl"`
   - Receives model file path as argument

3. **Hook prepares environment**
   - Ensure `%LOCALAPPDATA%\BambuStudio\hook-results\` exists
   - Generate output filename: `analysis-model.stl.json`

4. **CLI analyzer runs**
   - `node balance-cli.js C:\path\to\model.stl --output results.json --json`
   - Parses STL geometry
   - Computes center of mass
   - Recommends Bambu preset
   - Writes JSON to results file

5. **Hook completes**
   - Logs success to debug log
   - Exits with code 0
   - Returns to Bambu Studio

6. **Slicing proceeds**
   - User can now slice with recommended preset

7. **Results available**
   - User can review JSON in results folder
   - Import into web UI for detailed visualization (optional)

## Failure Modes & Resilience

### Graceful Degradation

```
Scenario: CLI analyzer crashes
  ↓
Hook catches exit code ≠ 0
  ↓
Logs error with diagnostic info
  ↓
Exits with code 0 (success) anyway
  ↓
Bambu Studio slicing continues unimpeded
  ↓
User can still slice (no preset recommendation)
```

### Error Handling

1. **Missing model file**
   - Log: "File not found"
   - Exit: 0 (continue)

2. **Corrupted STL**
   - Log: "No triangles found"
   - Exit: 0 (continue)

3. **Insufficient disk space**
   - Log: "Write failed"
   - Exit: 0 (continue)

4. **Node.js not in PATH**
   - Log: "node.exe not found"
   - Exit: 0 (continue)
   - **Mitigation**: Installer sets PATH

## Security Considerations

1. **File Paths**: Quoted to handle spaces
2. **Subprocess Spawning**: No shell injection (Node spawn() is safe)
3. **Temporary Files**: Auto-cleaned up
4. **Permissions**: User-writable AppData directory only
5. **Network**: Bridge server on localhost only (no remote access)
6. **STL Parsing**: Limit to 1,000,000 triangles (prevent OOM)

## Performance Characteristics

| Operation | Time | Notes |
|-----------|------|-------|
| STL parse (1KB) | ~10ms | Geometry extraction |
| COM computation | ~50ms | Per-triangle iteration |
| JSON output | ~5ms | Serialization |
| **Total (typical)** | **~100ms** | For 100K triangle model |
| Hook overhead | ~500ms | Subprocess spawn + I/O |

## Extensibility

### Adding New Presets

Edit `balance-cli.js`:
```javascript
function recommendBambuPreset(...) {
  const recommendations = {
    myNewPreset: {
      name: 'my-preset',
      label: 'My Custom Preset',
      settings: { ... },
      rationale: '...'
    }
  };
}
```

### Adding New Output Formats

Create export function:
```javascript
function exportCSV(analysis) {
  // Transform JSON to CSV
  // Write file
}
```

### Supporting 3MF

Implement in `balance-cli.js`:
```javascript
function parse3MF(buffer) {
  // Extract ZIP
  // Parse model.xml
  // Return triangles
}
```

## Integration Points with Bambu Studio

**Current Assumptions**:
1. Bambu Studio supports pre-slice hooks via config file
2. Hook receives model file path as argument
3. Hook can write results to `%LOCALAPPDATA%\BambuStudio\`
4. Bambu reads hook results for preset recommendations

**If Bambu hook system differs**:
- Use Bambu CLI to monitor file system for new models
- Trigger analysis via polling or file watcher
- Use Bambu API (if available) to apply presets programmatically

## Testing Strategy

1. **Unit Tests**:
   - STL parsing (binary, ASCII)
   - Vector math (COM, offset)
   - Preset recommendation logic

2. **Integration Tests**:
   - Hook invocation
   - CLI analysis end-to-end
   - Bridge server endpoints
   - Web UI file loading

3. **System Tests**:
   - Installer → Hook registration
   - Bambu Studio model load → Hook trigger
   - Results verification

4. **Stress Tests**:
   - Large models (1M+ triangles)
   - Concurrent requests (bridge server)
   - Rapid hook invocations

## Deployment

### Installer Distribution
- Sign .exe (optional)
- Create installer.zip with docs
- Host on GitHub releases

### Updates
- Check version in registry
- Prompt user if newer available
- Auto-backup old config

### Uninstall
- Remove files and shortcuts
- Clean registry
- Keep results (user may need them)

## Future Enhancements

1. **3MF Native Support**: Parse XML for multi-material analysis
2. **Hardware Database**: Pre-defined masses for common components
3. **Optimization Engine**: Suggest minimum material removal
4. **Export to CAD**: Write cavity sketches to STEP
5. **Team Collaboration**: Share analyses via cloud
6. **Advanced Analytics**: Predict vibration modes, stress distribution
7. **Multi-Part Assembly**: Analyze BOMs with sub-assemblies
8. **Machine Learning**: Train on successful print feedback

## Backward Compatibility

- Maintain JSON schema (add fields only)
- Keep CLI argument compatibility
- Support legacy INI format in Bambu config
- Version file format in JSON output

## Migration Strategy

For users upgrading from v0.x:
1. Auto-detect old installation
2. Backup existing results
3. Re-register hook with new paths
4. Notify user of changes
