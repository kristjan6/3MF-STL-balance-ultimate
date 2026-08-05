Bambu Bridge — local helper for STL/3MF metadata

This folder provides a small local bridge used by the web app to query Bambu Studio's CLI for accurate model geometry and mass info.

Files
- server.js             : Bridge server (Node 18+). POST /info accepts multipart form field "model" and returns parsed info.
- start-bridge.ps1      : Helper to start the bridge in background (non-elevated).
- start-bridge-elevate.bat : One-click elevated launcher (UAC) that runs start-bridge.ps1 with admin privileges.

Quick start (recommended)
1. Ensure Node.js 18+ is installed and in PATH.
2. Open PowerShell and run (non-elevated):
   cd "C:\Users\krist\3MF-STL-balance-ultimate\bambu-bridge"
   powershell -NoProfile -ExecutionPolicy Bypass -File .\start-bridge.ps1

If you prefer a UAC prompt to run elevated (useful if the bridge needs permission):
- Double-click start-bridge-elevate.bat in File Explorer.
- Or right-click -> Run as administrator.

Command-line balance analyzer (CLI plugin)
- A lightweight CLI tool that computes volume, surface area, COM and estimated mass for STL files is included: balance-cli.js.
- The CLI now supports 3MF files if the optional dependencies are installed.

Install optional 3MF support (recommended):
  cd bambu-bridge
  npm install jszip xmldom

Example usage from PowerShell / cmd:
    node balance-cli.js C:\path\to\part.stl --density 1.24
  Output is human-readable. Add --format json to get JSON.

3MF usage:
    node balance-cli.js C:\path\to\assembly.3mf --format json

Integrating with Bambu Studio / slicer CLI
- Bambu's CLI or post-processing hooks can call this script automatically after model export or before slicing.
- Example wrapper that Bambu can call:
    node C:\Users\krist\3MF-STL-balance-ultimate\bambu-bridge\balance-cli.js "%INPUT_FILE%" --density 1.24 --format json > "%OUTPUT_FILE%"
- A PowerShell helper wrapper that runs the analyzer and recommends a Bambu preset is included: bambu-autobalance-wrapper.ps1
  Example:
    .\bambu-autobalance-wrapper.ps1 -ModelPath C:\path\to\model.stl -BambuCliPath 'C:\Program Files\Bambu Studio\bambu-studio-console.exe' -Density 1.24 -Threshold 5 -AutoRun

Troubleshooting
- If the CLI reports a missing dependency for 3MF, run the npm install command above.
- For very large models, ensure Node has enough memory (use NODE_OPTIONS="--max-old-space-size=4096" if necessary).

Security note
- The CLI only reads local files and prints analysis. Review scripts before running.
