// bambu-bridge/server.js
// Local companion server that wraps the Bambu Studio CLI to expose
// real model geometry/mass info to the STL Balance Ultimate web app.
//
// Run this on the SAME machine where Bambu Studio is installed:
//   node server.js
//
// Requires Node.js 18+. No external dependencies.
//
// Usage from the browser app:
//   POST http://localhost:8787/info   (multipart form, field "model", a .3mf or .stl file)
//   -> returns JSON with parsed model info (volume, bbox, object count, etc.)
//
// Config via environment variables:
//   BAMBU_CLI_PATH   Path to BambuStudio executable (default tries common install locations)
//   BRIDGE_PORT       Port to listen on (default 8787)

const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = process.env.BRIDGE_PORT || 8787;

function defaultCliPath() {
  if (process.env.BAMBU_CLI_PATH) return process.env.BAMBU_CLI_PATH;
  const platform = os.platform();
  if (platform === 'win32') {
    const candidates = [
      'C:/Program Files/Bambu Studio/bambu-studio.exe',
      'C:/Program Files/Bambu Studio/bambu-studio-console.exe'
    ];
    return candidates.find(p => fs.existsSync(p)) || candidates[0];
  }
  if (platform === 'darwin') {
    return '/Applications/BambuStudio.app/Contents/MacOS/BambuStudio';
  }
  return 'bambu-studio';
}

const CLI_PATH = defaultCliPath();

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function parseMultipart(buffer, boundary) {
  const parts = [];
  const boundaryBuf = Buffer.from('--' + boundary);
  let start = buffer.indexOf(boundaryBuf);
  while (start !== -1) {
    const next = buffer.indexOf(boundaryBuf, start + boundaryBuf.length);
    if (next === -1) break;
    const part = buffer.slice(start + boundaryBuf.length, next);
    parts.push(part);
    start = next;
  }
  return parts.map(part => {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) return null;
    const header = part.slice(0, headerEnd).toString('utf8');
    let body = part.slice(headerEnd + 4);
    if (body.slice(-2).toString() === '\r\n') body = body.slice(0, -2);
    const nameMatch = header.match(/name="([^"]+)"/);
    const filenameMatch = header.match(/filename="([^"]+)"/);
    return {
      name: nameMatch ? nameMatch[1] : null,
      filename: filenameMatch ? filenameMatch[1] : null,
      body
    };
  }).filter(Boolean);
}

function runBambuInfo(filePath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(CLI_PATH, ['--info', filePath], { windowsHide: true });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('error', err => reject(err));
    proc.on('close', code => {
      if (code !== 0 && !stdout) {
        reject(new Error(stderr || ('Bambu Studio CLI exited with code ' + code)));
      } else {
        resolve(stdout);
      }
    });
  });
}

function parseInfoOutput(raw) {
  // Bambu Studio --info output is plain text key: value style lines
  // grouped per object. We parse it generically into a structured list.
  const objects = [];
  let current = null;
  raw.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const objMatch = trimmed.match(/^object[:\s]+(.*)$/i) || trimmed.match(/^size_?\d*\s*:/i);
    if (/^object[_\s]/i.test(trimmed) || /^name\s*[:=]/i.test(trimmed)) {
      if (/^name\s*[:=]/i.test(trimmed) || /^object[_\s]/i.test(trimmed)) {
        current = { raw: [] };
        objects.push(current);
      }
    }
    if (current) current.raw.push(trimmed);
    const kv = trimmed.match(/^([A-Za-z_ ]+)[:=]\s*(.+)$/);
    if (kv && current) {
      const key = kv[1].trim().toLowerCase().replace(/\s+/g, '_');
      current[key] = kv[2].trim();
    }
  });
  return { objectCount: objects.length, objects, rawText: raw };
}

const server = http.createServer((req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, cliPath: CLI_PATH }));
    return;
  }

  if (req.method === 'POST' && req.url === '/info') {
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(.+)$/);
    if (!boundaryMatch) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Expected multipart/form-data with a model file field named "model".' }));
      return;
    }
    const boundary = boundaryMatch[1];
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', async () => {
      try {
        const buffer = Buffer.concat(chunks);
        const parts = parseMultipart(buffer, boundary);
        const filePart = parts.find(p => p.name === 'model' && p.filename);
        if (!filePart) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No "model" file field found in upload.' }));
          return;
        }
        const tmpPath = path.join(os.tmpdir(), 'bambu-bridge-' + Date.now() + '-' + filePart.filename);
        fs.writeFileSync(tmpPath, filePart.body);
        try {
          const raw = await runBambuInfo(tmpPath);
          const parsed = parseInfoOutput(raw);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(parsed));
        } finally {
          fs.unlink(tmpPath, () => {});
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || String(err) }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found. Use GET /health or POST /info.' }));
});

server.listen(PORT, () => {
  console.log('Bambu bridge server listening on http://localhost:' + PORT);
  console.log('Using Bambu Studio CLI at: ' + CLI_PATH);
  console.log('Override with BAMBU_CLI_PATH env var if this is wrong.');
});
