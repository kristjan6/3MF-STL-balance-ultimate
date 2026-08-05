#!/usr/bin/env node
// balance-cli.js
// Simple CLI tool to compute mass properties (volume, surface area, COM, bbox) for STL files.
// Usage: node balance-cli.js <model.stl> [--density 1.24] [--format json]

const fs = require('fs');
const path = require('path');
let JSZip=null, DOMParser=null;
try{
  JSZip = require('jszip');
  DOMParser = require('xmldom').DOMParser;
}catch(e){ /* optional dependencies not installed */ }

function ensure3mfDeps(){ if(!JSZip || !DOMParser) throw new Error('3MF support requires npm modules: jszip and xmldom. Install with: npm install jszip xmldom'); }

function parseArgs(){
  const args = process.argv.slice(2);
  const opts = { density: 1.24, format: 'text', file: null };
  for(let i=0;i<args.length;i++){
    const a=args[i];
    if(a==='--density' || a==='-d'){ opts.density = parseFloat(args[++i]); }
    else if(a==='--format' || a==='-f'){ opts.format = args[++i]; }
    else if(!opts.file) opts.file = a;
  }
  return opts;
}

function vec(x,y,z){ return {x:+x,y:+y,z:+z}; }
function sub(a,b){ return vec(a.x-b.x,a.y-b.y,a.z-b.z); }
function cross(a,b){ return vec(a.y*b.z-a.z*b.y, a.z*b.x-a.x*b.z, a.x*b.y-a.y*b.x); }
function dot(a,b){ return a.x*b.x + a.y*b.y + a.z*b.z; }
function add(a,b){ return vec(a.x+b.x,a.y+b.y,a.z+b.z); }
function mulScalar(a,s){ return vec(a.x*s,a.y*s,a.z*s); }

function signedTetraVolume(a,b,c){ return dot(a, cross(b,c)) / 6.0; }
function centroidWeighted(a,b,c,vol){ const s = (vol/4.0); return mulScalar(add(add(a,b),c), s); }

function computeFromTriangles(tris){
  let volume=0, area=0; let moment={x:0,y:0,z:0};
  let min={x:Infinity,y:Infinity,z:Infinity}, max={x:-Infinity,y:-Infinity,z:-Infinity};
  for(const t of tris){
    const a=t[0], b=t[1], c=t[2];
    min.x=Math.min(min.x,a.x); min.y=Math.min(min.y,a.y); min.z=Math.min(min.z,a.z);
    min.x=Math.min(min.x,b.x); min.y=Math.min(min.y,b.y); min.z=Math.min(min.z,b.z);
    min.x=Math.min(min.x,c.x); min.y=Math.min(min.y,c.y); min.z=Math.min(min.z,c.z);
    max.x=Math.max(max.x,a.x); max.y=Math.max(max.y,a.y); max.z=Math.max(max.z,a.z);
    const crossv = cross(sub(b,a), sub(c,a));
    area += Math.sqrt(dot(crossv,crossv))*0.5;
    const vol = signedTetraVolume(a,b,c);
    volume += vol;
    const cw = centroidWeighted(a,b,c,vol);
    moment.x += cw.x; moment.y += cw.y; moment.z += cw.z;
  }
  const signed = volume;
  const absVolume = Math.abs(volume);
  let com = {x:0,y:0,z:0};
  if(Math.abs(signed) > 1e-12){ com = { x: moment.x / signed, y: moment.y / signed, z: moment.z / signed }; }
  const bboxSize = { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z };
  return { volumeMm3: absVolume, surfaceAreaMm2: area, com, bbox:{min,max}, size: bboxSize, bboxCenter:{x:(min.x+max.x)/2,y:(min.y+max.y)/2,z:(min.z+max.z)/2}, signedVolume: signed };
}

async function parse3MF(buf){
  ensure3mfDeps();
  const zip = await JSZip.loadAsync(buf);
  const files = Object.keys(zip.files);
  const modelFile = files.find(f=>/3D\/.*\.model$/i.test(f)) || files.find(f=>/3dmodel\.model$/i);
  if(!modelFile) throw new Error('No 3MF model file found in archive');
  const xmlText = await zip.file(modelFile).async('string');
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');

  // map object id -> geometry (verts, triangles)
  const objectMap = new Map();
  const objectNodes = Array.from(doc.getElementsByTagName('object'));
  objectNodes.forEach(obj=>{
    const id = obj.getAttribute('id');
    const name = obj.getAttribute('name') || id;
    const mesh = obj.getElementsByTagName('mesh')[0];
    if(!mesh) return;
    const verticesNode = mesh.getElementsByTagName('vertices')[0];
    const verts = [];
    if(verticesNode){
      const vnodes = verticesNode.getElementsByTagName('vertex');
      for(let i=0;i<vnodes.length;i++){
        const v = vnodes[i];
        const x = parseFloat(v.getAttribute('x')||'0');
        const y = parseFloat(v.getAttribute('y')||'0');
        const z = parseFloat(v.getAttribute('z')||'0');
        verts.push(vec(x,y,z));
      }
    }
    const triangles = [];
    const trianglesNode = mesh.getElementsByTagName('triangles')[0];
    if(trianglesNode){
      const tnodes = trianglesNode.getElementsByTagName('triangle');
      for(let j=0;j<tnodes.length;j++){
        const t = tnodes[j];
        const v1 = parseInt(t.getAttribute('v1')||'0');
        const v2 = parseInt(t.getAttribute('v2')||'0');
        const v3 = parseInt(t.getAttribute('v3')||'0');
        if(verts[v1] && verts[v2] && verts[v3]) triangles.push([verts[v1], verts[v2], verts[v3]]);
      }
    }
    objectMap.set(id, { id, name, verts, triangles });
  });

  function parseTransformString(s){
    // 3MF transform is 12 floats
    const parts = (s||'').trim().split(/\s+/).map(Number).filter(p=>!isNaN(p));
    if(parts.length!==12) return null;
    // return array in order t0..t11 matching ThreeMF's layout
    return parts;
  }
  function applyTransformToVertex(v, t){
    if(!t) return vec(v.x,v.y,v.z);
    // mapping from ThreeMF parse: x' = t0*x + t3*y + t6*z + t9
    const x = t[0]*v.x + t[3]*v.y + t[6]*v.z + t[9];
    const y = t[1]*v.x + t[4]*v.y + t[7]*v.z + t[10];
    const z = t[2]*v.x + t[5]*v.y + t[8]*v.z + t[11];
    return vec(x,y,z);
  }

  const tris = [];

  // Helper to add an object instance with optional transform
  function addObjectInstance(objectId, transformArray){
    const obj = objectMap.get(objectId);
    if(!obj) return;
    for(const tri of obj.triangles){
      const a = applyTransformToVertex(tri[0], transformArray);
      const b = applyTransformToVertex(tri[1], transformArray);
      const c = applyTransformToVertex(tri[2], transformArray);
      tris.push([a,b,c]);
    }
  }

  // 1) Add top-level build items (no transform)
  const build = doc.getElementsByTagName('build')[0];
  if(build){
    const items = build.getElementsByTagName('item');
    for(let i=0;i<items.length;i++){
      const item = items[i];
      const oid = item.getAttribute('objectid') || item.getAttribute('objectId');
      if(oid) addObjectInstance(oid, null);
    }
  }

  // 2) Add explicit component instances scattered in the model (with transforms)
  const compNodes = doc.getElementsByTagName('component');
  for(let i=0;i<compNodes.length;i++){
    const c = compNodes[i];
    const oid = c.getAttribute('objectid') || c.getAttribute('objectId');
    const t = parseTransformString(c.getAttribute('transform'));
    if(oid) addObjectInstance(oid, t);
  }

  // 3) If no build or components referenced, fall back to adding each object once
  if(tris.length===0){
    for(const key of objectMap.keys()) addObjectInstance(key, null);
  }

  return tris;
}

function parseBinarySTL(buf){
  // header (80), uint32 count (4), then triangles of 50 bytes
  if(buf.length < 84) throw new Error('File too small to be valid binary STL');
  const count = buf.readUInt32LE(80);
  const expected = 84 + count * 50;
  if(expected !== buf.length){
    // Not exact match — still try parsing by count until available
    // fallback to safe parse by iterating while enough bytes
  }
  const tris = [];
  let offset = 84;
  for(let i=0;i<count && offset+50<=buf.length;i++){
    // normal
    // skip normal (12 bytes)
    offset += 12;
    const ax = buf.readFloatLE(offset); const ay = buf.readFloatLE(offset+4); const az = buf.readFloatLE(offset+8); offset += 12;
    const bx = buf.readFloatLE(offset); const by = buf.readFloatLE(offset+4); const bz = buf.readFloatLE(offset+8); offset += 12;
    const cx = buf.readFloatLE(offset); const cy = buf.readFloatLE(offset+4); const cz = buf.readFloatLE(offset+8); offset += 12;
    // attr
    offset += 2;
    tris.push([vec(ax,ay,az), vec(bx,by,bz), vec(cx,cy,cz)]);
  }
  return tris;
}

function parseASCIISTL(text){
  // crude parser: find all 'vertex' lines
  const lines = text.split(/\r?\n/);
  const verts = [];
  for(const l of lines){
    const m = l.match(/vertex\s+([\-\d\.eE\+]+)\s+([\-\d\.eE\+]+)\s+([\-\d\.eE\+]+)/);
    if(m) verts.push(vec(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])));
  }
  const tris = [];
  for(let i=0;i+2<verts.length;i+=3) tris.push([verts[i], verts[i+1], verts[i+2]]);
  return tris;
}

(async function main(){
  const opts = parseArgs();
  if(!opts.file){ console.error('Usage: node balance-cli.js <file.stl> [--density 1.24] [--format json|text]'); process.exit(2); }
  const fp = path.resolve(opts.file);
  if(!fs.existsSync(fp)){ console.error('File not found:', fp); process.exit(2); }
  const ext = path.extname(fp).toLowerCase();
  let tris = [];
  if(ext === '.stl'){
    const buf = fs.readFileSync(fp);
    // detect binary by size heuristic
    let isBinary = false;
    if(buf.length >= 84){
      const count = buf.readUInt32LE(80);
      if(84 + count*50 === buf.length) isBinary = true;
    }
    if(isBinary){ try{ tris = parseBinarySTL(buf); } catch(e){ console.error('Binary STL parse failed:', e.message); process.exit(3); } }
    else { const txt = buf.toString('utf8'); tris = parseASCIISTL(txt); }
  } else if(ext === '.3mf'){
    try{
      const buf = fs.readFileSync(fp);
      tris = await parse3MF(buf);
    }catch(e){ console.error('3MF parse failed:', e.message); console.error('Ensure dependencies are installed: npm install jszip xmldom'); process.exit(3); }
  } else {
    console.error('Only STL and 3MF input are supported. Got:', ext);
    process.exit(3);
  }

  const props = computeFromTriangles(tris);
  const volumeCm3 = props.volumeMm3 / 1000.0;
  const mass = volumeCm3 * opts.density;
  const report = {
    file: fp,
    triangles: tris.length,
    volume_mm3: props.volumeMm3,
    volume_cm3: volumeCm3,
    surface_area_mm2: props.surfaceAreaMm2,
    surface_area_cm2: props.surfaceAreaMm2 / 100.0,
    mass_g: mass,
    density_g_cm3: opts.density,
    com_mm: props.com,
    bbox: props.bbox,
    size_mm: props.size
  };

  if(opts.format === 'json'){
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('Balance CLI report for', fp);
    console.log('Triangles:', report.triangles);
    console.log('Volume: %s mm^3  (%s cm^3)', report.volume_mm3.toFixed(3), report.volume_cm3.toFixed(3));
    console.log('Surface area: %s mm^2  (%s cm^2)', report.surface_area_mm2.toFixed(3), report.surface_area_cm2.toFixed(3));
    console.log('Mass (ρ=' + report.density_g_cm3 + ' g/cm^3):', report.mass_g.toFixed(3), 'g');
    console.log('COM (mm):', `${report.com_mm.x.toFixed(3)}, ${report.com_mm.y.toFixed(3)}, ${report.com_mm.z.toFixed(3)}`);
    console.log('BBox min:', report.bbox.min, 'max:', report.bbox.max);
    console.log('Size (mm):', report.size_mm);
  }
})();
