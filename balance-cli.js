#!/usr/bin/env node

/**
 * balance-cli.js
 * 
 * Standalone Node CLI for STL/3MF balance analysis.
 * Outputs JSON with balance metrics and Bambu Studio preset recommendations.
 * 
 * Usage:
 *   node balance-cli.js <model.stl|model.3mf> [options]
 *   
 * Options:
 *   --output <file>          Write JSON to file instead of stdout
 *   --density <g/cm³>        Default part density (default: 1.24)
 *   --ballast-density <g/cm³> Ballast density (default: 7.80)
 *   --target-mode <mode>     Target point: bbox-center, origin, custom, axis-mid (default: bbox-center)
 *   --custom-point <x,y,z>   Custom neutral point in mm (if --target-mode custom)
 *   --axis-start <x,y,z>     Pivot axis start point (default: 0,0,0)
 *   --axis-end <x,y,z>       Pivot axis end point (default: 0,60,0)
 *   --lever-arm <mm>         Ballast pocket lever arm distance (default: 25)
 *   --target-mass <g>        Target assembly mass (default: 0)
 *   --hardware <name,mass,x,y,z>  Add discrete hardware mass (can be used multiple times)
 *   --preset <name>          Bambu slicing intent: general, low-infill, high-stiffness, pivot-part (default: general)
 *   --json                   Force JSON output (no pretty-print)
 * 
 * Example (headless analysis):
 *   node balance-cli.js assembly.stl --density 1.24 --output results.json --json
 * 
 * The CLI reports:
 * - Center of mass (COM) position
 * - Offset to neutral target
 * - Balance class (near-neutral, trim-tunable, requires-correction)
 * - Bambu Studio preset recommendations
 * - Ballast cavity sizing
 * - Lightening cut volumes
 * - Component breakdown
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Minimal 3D Vector3 implementation
class Vec3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  clone() {
    return new Vec3(this.x, this.y, this.z);
  }

  copy(v) {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }

  add(v) {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    return this;
  }

  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;
    return this;
  }

  multiplyScalar(s) {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    return this;
  }

  dot(v) {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  cross(v) {
    const x = this.y * v.z - this.z * v.y;
    const y = this.z * v.x - this.x * v.z;
    const z = this.x * v.y - this.y * v.x;
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  length() {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }

  normalize() {
    const len = this.length();
    if (len > 0) this.multiplyScalar(1 / len);
    return this;
  }

  min(v) {
    this.x = Math.min(this.x, v.x);
    this.y = Math.min(this.y, v.y);
    this.z = Math.min(this.z, v.z);
    return this;
  }

  max(v) {
    this.x = Math.max(this.x, v.x);
    this.y = Math.max(this.y, v.y);
    this.z = Math.max(this.z, v.z);
    return this;
  }
}

// Box3 for bounding boxes
class Box3 {
  constructor(min = new Vec3(Infinity, Infinity, Infinity), max = new Vec3(-Infinity, -Infinity, -Infinity)) {
    this.min = min;
    this.max = max;
  }

  isEmpty() {
    return this.min.x > this.max.x || this.min.y > this.max.y || this.min.z > this.max.z;
  }

  expandByPoint(p) {
    this.min.min(p);
    this.max.max(p);
    return this;
  }

  getSize(target = new Vec3()) {
    return target.copy(this.max).sub(this.min);
  }

  getCenter(target = new Vec3()) {
    return target.copy(this.max).add(this.min).multiplyScalar(0.5);
  }
}

// Parse STL binary or ASCII
function parseSTL(buffer) {
  if (!buffer || buffer.length < 84) throw new Error('STL file too small');

  // Check if ASCII
  const headerStr = buffer.slice(0, 5).toString('ascii');
  if (headerStr === 'solid') {
    return parseSTLASCII(buffer.toString('ascii'));
  }
  return parseSTLBinary(buffer);
}

function parseSTLBinary(buffer) {
  const triangles = [];
  const triangleCount = buffer.readUInt32LE(80);
  let offset = 84;

  for (let i = 0; i < triangleCount && offset + 50 <= buffer.length; i++) {
    const nx = buffer.readFloatLE(offset);
    const ny = buffer.readFloatLE(offset + 4);
    const nz = buffer.readFloatLE(offset + 8);

    const v1x = buffer.readFloatLE(offset + 12);
    const v1y = buffer.readFloatLE(offset + 16);
    const v1z = buffer.readFloatLE(offset + 20);

    const v2x = buffer.readFloatLE(offset + 24);
    const v2y = buffer.readFloatLE(offset + 28);
    const v2z = buffer.readFloatLE(offset + 32);

    const v3x = buffer.readFloatLE(offset + 36);
    const v3y = buffer.readFloatLE(offset + 40);
    const v3z = buffer.readFloatLE(offset + 44);

    triangles.push({
      normal: [nx, ny, nz],
      vertices: [
        [v1x, v1y, v1z],
        [v2x, v2y, v2z],
        [v3x, v3y, v3z]
      ]
    });

    offset += 50;
  }

  return triangles;
}

function parseSTLASCII(str) {
  const triangles = [];
  const facetRegex = /facet normal\s+([-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?)\s+([-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?)\s+([-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?)\s+outer loop\s+vertex\s+([-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?)\s+([-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?)\s+([-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?)\s+vertex\s+([-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?)\s+([-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?)\s+([-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?)\s+vertex\s+([-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?)\s+([-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?)\s+([-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?)/gi;

  let match;
  while ((match = facetRegex.exec(str)) !== null) {
    triangles.push({
      normal: [parseFloat(match[1]), parseFloat(match[3]), parseFloat(match[5])],
      vertices: [
        [parseFloat(match[7]), parseFloat(match[9]), parseFloat(match[11])],
        [parseFloat(match[13]), parseFloat(match[15]), parseFloat(match[17])],
        [parseFloat(match[19]), parseFloat(match[21]), parseFloat(match[23])]
      ]
    });
  }

  return triangles;
}

// Parse 3MF (ZIP with XML)
function parse3MF(buffer) {
  try {
    // Minimal 3MF support: extract STL-like geometry from 3D model XML
    // For now, fallback to error; proper 3MF would need XML parsing
    throw new Error('3MF parsing not yet implemented. Use STL files for now.');
  } catch (e) {
    throw new Error(`3MF parsing error: ${e.message}`);
  }
}

// Compute mass properties from triangles
function computeMassProperties(triangles) {
  let volume = 0;
  let area = 0;
  const moment = new Vec3();
  const min = new Vec3(Infinity, Infinity, Infinity);
  const max = new Vec3(-Infinity, -Infinity, -Infinity);

  triangles.forEach(tri => {
    const a = new Vec3(tri.vertices[0][0], tri.vertices[0][1], tri.vertices[0][2]);
    const b = new Vec3(tri.vertices[1][0], tri.vertices[1][1], tri.vertices[1][2]);
    const c = new Vec3(tri.vertices[2][0], tri.vertices[2][1], tri.vertices[2][2]);

    min.min(a).min(b).min(c);
    max.max(a).max(b).max(c);

    const ab = b.clone().sub(a);
    const ac = c.clone().sub(a);
    const cross = ab.clone().cross(ac);
    area += cross.length() * 0.5;

    const vol = signedTetraVolume(a, b, c);
    volume += vol;
    moment.add(centroidWeighted(a, b, c, vol));
  });

  const signed = volume;
  volume = Math.abs(volume);
  const bbox = new Box3(min, max);
  const com = volume > 1e-9 ? moment.multiplyScalar(1 / signed) : new Vec3();

  return {
    volumeMm3: volume,
    surfaceAreaMm2: area,
    com,
    bbox,
    size: bbox.getSize(new Vec3()),
    bboxCenter: bbox.getCenter(new Vec3()),
    closedLikely: volume > 1e-5
  };
}

function signedTetraVolume(a, b, c) {
  return a.dot(b.clone().cross(c)) / 6;
}

function centroidWeighted(a, b, c, vol) {
  return a.clone().add(b).add(c).multiplyScalar(vol / 4);
}

// Parse command-line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    modelFile: null,
    outputFile: null,
    density: 1.24,
    ballastDensity: 7.80,
    targetMode: 'bbox-center',
    customPoint: null,
    axisStart: new Vec3(0, 0, 0),
    axisEnd: new Vec3(0, 60, 0),
    leverArm: 25,
    targetMass: 0,
    hardware: [],
    preset: 'general',
    prettyJson: true
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--') && !opts.modelFile) {
      opts.modelFile = arg;
    } else if (arg === '--output' && i + 1 < args.length) {
      opts.outputFile = args[++i];
    } else if (arg === '--density' && i + 1 < args.length) {
      opts.density = parseFloat(args[++i]);
    } else if (arg === '--ballast-density' && i + 1 < args.length) {
      opts.ballastDensity = parseFloat(args[++i]);
    } else if (arg === '--target-mode' && i + 1 < args.length) {
      opts.targetMode = args[++i];
    } else if (arg === '--custom-point' && i + 1 < args.length) {
      const [x, y, z] = args[++i].split(',').map(parseFloat);
      opts.customPoint = new Vec3(x, y, z);
    } else if (arg === '--axis-start' && i + 1 < args.length) {
      const [x, y, z] = args[++i].split(',').map(parseFloat);
      opts.axisStart = new Vec3(x, y, z);
    } else if (arg === '--axis-end' && i + 1 < args.length) {
      const [x, y, z] = args[++i].split(',').map(parseFloat);
      opts.axisEnd = new Vec3(x, y, z);
    } else if (arg === '--lever-arm' && i + 1 < args.length) {
      opts.leverArm = parseFloat(args[++i]);
    } else if (arg === '--target-mass' && i + 1 < args.length) {
      opts.targetMass = parseFloat(args[++i]);
    } else if (arg === '--hardware' && i + 1 < args.length) {
      const parts = args[++i].split(',');
      if (parts.length >= 5) {
        opts.hardware.push({
          name: parts[0],
          mass: parseFloat(parts[1]),
          x: parseFloat(parts[2]),
          y: parseFloat(parts[3]),
          z: parseFloat(parts[4])
        });
      }
    } else if (arg === '--preset' && i + 1 < args.length) {
      opts.preset = args[++i];
    } else if (arg === '--json') {
      opts.prettyJson = false;
    }
  }

  if (!opts.modelFile) {
    console.error('Usage: node balance-cli.js <model.stl> [options]');
    console.error('Run with --help for options.');
    process.exit(1);
  }

  return opts;
}

// Compute target point based on mode
function getTargetPoint(mode, bbox, customPoint, axisStart, axisEnd) {
  if (mode === 'origin') return new Vec3(0, 0, 0);
  if (mode === 'custom' && customPoint) return customPoint.clone();
  if (mode === 'axis-mid') {
    return axisStart.clone().add(axisEnd).multiplyScalar(0.5);
  }
  return bbox.isEmpty() ? new Vec3() : bbox.getCenter(new Vec3());
}

// Project point onto line segment
function projectPointToSegment(point, a, b) {
  const ab = b.clone().sub(a);
  const lenSq = Math.max(ab.dot(ab), 1e-9);
  const t = Math.max(0, Math.min(1, point.clone().sub(a).dot(ab) / lenSq));
  return a.clone().add(ab.multiplyScalar(t));
}

// Format vector for output
const fmt = (n, d = 2) => (Number.isFinite(n) ? Number(n).toFixed(d) : '—');
const vecFmt = v => `${fmt(v.x, 1)}, ${fmt(v.y, 1)}, ${fmt(v.z, 1)}`;

// Main analysis
async function analyze() {
  const opts = parseArgs();
  try {
    // Read model file
    if (!fs.existsSync(opts.modelFile)) {
      throw new Error(`File not found: ${opts.modelFile}`);
    }
    const buffer = fs.readFileSync(opts.modelFile);
    const ext = path.extname(opts.modelFile).toLowerCase();

    let triangles;
    if (ext === '.stl') {
      triangles = parseSTL(buffer);
    } else if (ext === '.3mf') {
      triangles = parse3MF(buffer);
    } else {
      throw new Error(`Unsupported format: ${ext}`);
    }

    if (!triangles || triangles.length === 0) {
      throw new Error('No triangles found in model');
    }

    // Compute geometry properties
    const props = computeMassProperties(triangles);
    const volumeCm3 = props.volumeMm3 / 1000;
    const partMass = volumeCm3 * opts.density;

    // Hardware totals
    let hardwareMassTotal = 0;
    const hardwareComponents = [];
    opts.hardware.forEach(hw => {
      hardwareMassTotal += hw.mass;
      hardwareComponents.push({
        name: hw.name,
        type: 'hardware',
        mass: hw.mass,
        position: [hw.x, hw.y, hw.z]
      });
    });

    // Weighted COM
    const weighted = new Vec3();
    weighted.add(props.com.clone().multiplyScalar(partMass));
    opts.hardware.forEach(hw => {
      weighted.add(new Vec3(hw.x, hw.y, hw.z).multiplyScalar(hw.mass));
    });

    const totalMass = partMass + hardwareMassTotal;
    const assemblyCom = totalMass > 0 ? weighted.multiplyScalar(1 / totalMass) : new Vec3();

    // Target and offset
    let overallBBox = props.bbox.isEmpty() ? new Box3() : props.bbox;
    opts.hardware.forEach(hw => {
      overallBBox.expandByPoint(new Vec3(hw.x, hw.y, hw.z));
    });

    const target = getTargetPoint(opts.targetMode, overallBBox, opts.customPoint, opts.axisStart, opts.axisEnd);
    const axisProjection = projectPointToSegment(assemblyCom, opts.axisStart, opts.axisEnd);
    const offset = assemblyCom.clone().sub(target);
    const size = overallBBox.isEmpty() ? new Vec3(100, 100, 100) : overallBBox.getSize(new Vec3());

    // Balance classification
    const offsetMagnitude = offset.length();
    let balanceClass = 'requires-correction';
    if (offsetMagnitude < 1) balanceClass = 'near-neutral';
    else if (offsetMagnitude < 5) balanceClass = 'trim-tunable';

    // Ballast recommendations
    const leverAxis = ['x', 'y', 'z'].map(k => ({ k, v: Math.abs(offset[k]) })).sort((a, b) => b.v - a.v)[0].k;
    const lever = Math.max(opts.leverArm, Math.max(size[leverAxis] / 2, 1));
    const ballastMass = totalMass > 0 ? (totalMass * Math.abs(offset[leverAxis]) / lever) : 0;
    const ballastVolume = ballastMass / opts.ballastDensity;
    const hollowVolume = ballastMass / opts.density;

    // Symmetry score
    const maxDiagonal = Math.max(size.length(), 1);
    const symmetryScore = Math.max(0, Math.min(100, 100 * (1 - offsetMagnitude / maxDiagonal)));

    // Bambu preset recommendation logic
    const presetRecommendation = recommendBambuPreset(balanceClass, offsetMagnitude, symmetryScore, opts.preset);

    // Output result
    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      model: {
        file: opts.modelFile,
        volumeCm3: parseFloat(fmt(volumeCm3, 3)),
        surfaceAreaCm2: parseFloat(fmt(props.surfaceAreaMm2 / 100, 3)),
        closed: props.closedLikely
      },
      assembly: {
        partCount: 1,
        partMass: parseFloat(fmt(partMass, 2)),
        hardwareCount: opts.hardware.length,
        hardwareMass: parseFloat(fmt(hardwareMassTotal, 2)),
        totalMass: parseFloat(fmt(totalMass, 2))
      },
      geometry: {
        boundingBox: [
          [parseFloat(fmt(overallBBox.min.x, 2)), parseFloat(fmt(overallBBox.min.y, 2)), parseFloat(fmt(overallBBox.min.z, 2))],
          [parseFloat(fmt(overallBBox.max.x, 2)), parseFloat(fmt(overallBBox.max.y, 2)), parseFloat(fmt(overallBBox.max.z, 2))]
        ],
        size: [parseFloat(fmt(size.x, 2)), parseFloat(fmt(size.y, 2)), parseFloat(fmt(size.z, 2))]
      },
      balance: {
        assemblyCom: [parseFloat(fmt(assemblyCom.x, 2)), parseFloat(fmt(assemblyCom.y, 2)), parseFloat(fmt(assemblyCom.z, 2))],
        targetPoint: [parseFloat(fmt(target.x, 2)), parseFloat(fmt(target.y, 2)), parseFloat(fmt(target.z, 2))],
        offsetVector: [parseFloat(fmt(offset.x, 2)), parseFloat(fmt(offset.y, 2)), parseFloat(fmt(offset.z, 2))],
        offsetMagnitude: parseFloat(fmt(offsetMagnitude, 2)),
        balanceClass,
        symmetryScore: parseFloat(fmt(symmetryScore, 1))
      },
      pivotAxis: {
        start: [parseFloat(fmt(opts.axisStart.x, 2)), parseFloat(fmt(opts.axisStart.y, 2)), parseFloat(fmt(opts.axisStart.z, 2))],
        end: [parseFloat(fmt(opts.axisEnd.x, 2)), parseFloat(fmt(opts.axisEnd.y, 2)), parseFloat(fmt(opts.axisEnd.z, 2))],
        projection: [parseFloat(fmt(axisProjection.x, 2)), parseFloat(fmt(axisProjection.y, 2)), parseFloat(fmt(axisProjection.z, 2))]
      },
      recommendations: {
        ballastMass: parseFloat(fmt(ballastMass, 2)),
        ballastVolume: parseFloat(fmt(ballastVolume, 3)),
        leverArm: parseFloat(fmt(lever, 1)),
        hollowVolume: parseFloat(fmt(hollowVolume, 3)),
        dominantAxis: leverAxis.toUpperCase()
      },
      bambuPreset: presetRecommendation,
      components: [
        {
          name: path.basename(opts.modelFile),
          type: 'stl',
          mass: parseFloat(fmt(partMass, 2)),
          position: [parseFloat(fmt(props.com.x, 2)), parseFloat(fmt(props.com.y, 2)), parseFloat(fmt(props.com.z, 2))]
        },
        ...hardwareComponents
      ]
    };

    // Output
    const output = opts.prettyJson ? JSON.stringify(result, null, 2) : JSON.stringify(result);
    if (opts.outputFile) {
      fs.writeFileSync(opts.outputFile, output, 'utf8');
      console.log(`Analysis written to: ${opts.outputFile}`);
    } else {
      console.log(output);
    }

    process.exit(0);
  } catch (err) {
    const errorOutput = JSON.stringify({
      success: false,
      error: err.message,
      timestamp: new Date().toISOString()
    }, null, 2);

    if (opts.outputFile) {
      fs.writeFileSync(opts.outputFile, errorOutput, 'utf8');
    }
    console.error('Error:', err.message);
    process.exit(1);
  }
}

// Bambu preset recommendation based on balance class
function recommendBambuPreset(balanceClass, offsetMagnitude, symmetryScore, userPreset) {
  const recommendations = {
    general: {
      name: 'general',
      label: 'General functional part',
      settings: {
        nozzleTemp: 220,
        bedTemp: 60,
        infill: 15,
        shellWalls: 3,
        ballastCavity: balanceClass !== 'near-neutral'
      },
      rationale: 'Standard preset. Add ballast cavity if offset > 1 mm.'
    },
    lowInfill: {
      name: 'low-infill',
      label: 'Low infill shell with ballast cavity',
      settings: {
        nozzleTemp: 220,
        bedTemp: 60,
        infill: 5,
        shellWalls: 4,
        ballastCavity: true,
        supportType: 'tree'
      },
      rationale: 'Lightweight shell optimized for ballast pocket. Good for requires-correction class.'
    },
    highStiffness: {
      name: 'high-stiffness',
      label: 'High stiffness with limited hollowing',
      settings: {
        nozzleTemp: 220,
        bedTemp: 65,
        infill: 35,
        shellWalls: 5,
        gridType: 'gyroid',
        ballastCavity: balanceClass === 'requires-correction'
      },
      rationale: 'Dense structure for rigid assemblies. Minimizes trim cavities; use hardware relocation instead.'
    },
    pivotPart: {
      name: 'pivot-part',
      label: 'Pivot or bearing carrier',
      settings: {
        nozzleTemp: 225,
        bedTemp: 65,
        infill: 20,
        shellWalls: 5,
        ballastCavity: balanceClass !== 'near-neutral',
        supportType: 'linear'
      },
      rationale: 'Reinforced for rotational symmetry. Ballast optional based on offset.'
    }
  };

  // Select recommendation
  let selected = recommendations[userPreset] || recommendations.general;

  if (balanceClass === 'requires-correction' && userPreset === 'general') {
    selected = recommendations.lowInfill;
  }

  return {
    selected: selected.name,
    label: selected.label,
    settings: selected.settings,
    rationale: selected.rationale,
    balanceClass,
    offsetMagnitude,
    symmetryScore,
    availablePresets: Object.keys(recommendations).map(k => ({
      name: k,
      label: recommendations[k].label
    }))
  };
}

// Run
analyze().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
