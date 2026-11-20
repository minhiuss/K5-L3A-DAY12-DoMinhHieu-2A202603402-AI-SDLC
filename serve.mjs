#!/usr/bin/env node
// Runs the built game (dist/) with a tiny local server that also stores the leaderboard on disk.
//   node serve.mjs [--port 5173] [--no-open]          play
//   node serve.mjs --export-leaderboard out.json      write {"entries": [...]} and exit
// Only Node built-ins: the v1.0.0 release zip runs with just Node >= 18.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { load, defaultFile, handleApi } from './server/leaderboard.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? undefined : process.argv[i + 1]; };
const LB_FILE = process.env.DDL_LEADERBOARD || defaultFile(ROOT);

const exportTo = arg('export-leaderboard');
if (exportTo !== undefined) {
  if (!exportTo) { process.stderr.write('serve: --export-leaderboard needs a file name\n'); process.exit(1); }
  fs.writeFileSync(exportTo, JSON.stringify({ entries: load(LB_FILE) }, null, 2) + '\n');
  process.stdout.write(`leaderboard exported to ${exportTo}\n`);
  process.exit(0);
}

const DIST = path.join(ROOT, 'dist');
if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  process.stderr.write('serve: dist/ not found. Run "npm run build" first.\n');
  process.exit(1);
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/leaderboard') return handleApi(LB_FILE, req, res);
  let file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)));
  if (!file.startsWith(DIST)) { res.statusCode = 403; return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
  return undefined;
});

const port = Number(arg('port') || process.env.PORT || 5173);
server.listen(port, '127.0.0.1', () => {
  const url = `http://localhost:${port}/`;
  process.stdout.write(`Đảo Đèn Lồng: ${url}  (leaderboard: ${path.relative(ROOT, LB_FILE)})\n`);
  if (!process.argv.includes('--no-open')) {
    const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    try { spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); } catch { /* no browser opener: print only */ }
  }
});
