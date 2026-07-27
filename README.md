stl-balance-ultimate/
├── index.html        # from stl-balance-ultimate.html
└── README.md         # public-facing usage docs
# STL Balance Ultimate

Browser-based assembly balance utility for STL parts before slicing in Bambu Studio.

## Features

- Load multiple STL parts with per-part translation and rotation.
- Add discrete hardware masses (battery, bearings, magnets, camera, etc.).
- Compute assembly center of mass (COM) under uniform-density assumptions.
- Target neutral point: bounding-box center, origin, custom point, or pivot-axis midpoint.
- Visualize COM, neutral target, pivot axis projection, and offset in 3D.
- Suggest ballast cavities, hollowing, and hardware relocation for better balance.
- Export TXT, JSON, CSV, and a printable balance worksheet.

## Usage

1. Download `index.html`.
2. Open it in a modern desktop browser (Chrome, Edge, Firefox).
3. Load STL files and configure your assembly and hardware masses.
4. Use the report and worksheet to adjust CAD/mesh and Bambu Studio slicing.

No accounts, no backend — everything runs client-side in your browser.
