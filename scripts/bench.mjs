#!/usr/bin/env node
// Benchmark, Test Contract v1.3 (Ticket-04 §1):
//   node scripts/bench.mjs --seed 42 --duration 30 --out bench.json
// Opens a real (headed) Chromium window with a 1280x720 viewport, vsync and frame-rate limit off,
// loads the standard bench scene (?benchmark=1: night 1, 200 wander shades, 100 motes, L1-L3 lit),
// lets the page measure 3 s warm-up + --duration s of frame times, then writes bench.json and exits 0.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PROCESS_START_EPOCH = performance.timeOrigin; // "from the moment the process starts"
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : process.argv[i + 1]; };
const seed = Number(arg('seed', '42'));
const duration = Number(arg('duration', '30'));
const out = arg('out', 'bench.json');
const fail = (msg) => { process.stderr.write(`bench: ${msg}\n`); process.exit(1); };
if (!Number.isFinite(seed) || !(duration > 0)) fail('--seed must be a number and --duration > 0');
if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) fail('dist/ not found: run "npm run build" first');

let chromium, pwVersion;
try {
  ({ chromium } = await import('playwright'));
  pwVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'playwright', 'package.json'), 'utf8')).version;
} catch { fail('playwright is not installed: run "npm install"'); }

// --- memory: sum RSS of every process started by this one (the browser tree + static server) ---
function descendantsRssMb() {
  return new Promise((resolve) => {
    const win = process.platform === 'win32';
    const cmd = win
      ? 'powershell -NoProfile -Command "Get-CimInstance Win32_Process | ForEach-Object { \\"$($_.ProcessId) $($_.ParentProcessId) $($_.WorkingSetSize)\\" }"'
      : 'ps -A -o pid=,ppid=,rss=';
    exec(cmd, { maxBuffer: 1 << 24, windowsHide: true }, (err, stdout) => {
      if (err) return resolve(null);
      const kids = new Map(), rss = new Map();
      for (const line of stdout.trim().split(/\r?\n/)) {
        const [pid, ppid, mem] = line.trim().split(/\s+/).map(Number);
        if (!Number.isFinite(pid)) continue;
        rss.set(pid, win ? mem / 1048576 : (mem * 1024) / 1048576);
        if (!kids.has(ppid)) kids.set(ppid, []);
        kids.get(ppid).push(pid);
      }
      let total = 0;
      const stack = [...(kids.get(process.pid) || [])];
      while (stack.length) { const p = stack.pop(); total += rss.get(p) || 0; stack.push(...(kids.get(p) || [])); }
      resolve(total);
    });
  });
}

// --- static server (serve.mjs) on a free port ---
const server = spawn(process.execPath, [path.join(ROOT, 'serve.mjs'), '--port', '0', '--no-open'], { cwd: ROOT, env: { ...process.env, DDL_LEADERBOARD: path.join(os.tmpdir(), 'ddl-bench-leaderboard.json') } });
const port = await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => { const m = /localhost:(\d+)/.exec(String(d)); if (m) resolve(Number(m[1])); });
  server.on('exit', (c) => reject(new Error(`serve.mjs exited ${c}`)));
  setTimeout(() => reject(new Error('serve.mjs did not start')), 15000);
}).catch((e) => fail(e.message));

const args = ['--window-size=1280,800', '--disable-gpu-vsync', '--disable-frame-rate-limit',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--ignore-gpu-blocklist'];
let browser, browserName;
for (const channel of [process.env.DDL_BROWSER_CHANNEL, undefined, 'chrome', 'msedge'].filter((c, i, a) => a.indexOf(c) === i)) {
  try {
    browser = await chromium.launch({ headless: false, channel, args });
    browserName = channel || 'chromium (Playwright)';
    break;
  } catch { /* try the next one */ }
}
if (!browser) { server.kill(); fail('no browser found: run "npx playwright install chromium" (part of build_cmd)'); }

let peak = 0, memOk = true;
const sampler = setInterval(async () => { const m = await descendantsRssMb(); if (m === null) memOk = false; else peak = Math.max(peak, m); }, process.platform === 'win32' ? 3000 : 1000);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`http://localhost:${port}/?benchmark=1&seed=${seed}&duration=${duration}`);
  await page.waitForFunction(() => window.__benchResult, null, { timeout: (duration + 120) * 1000, polling: 500 });
  const res = await page.evaluate(() => ({ ...window.__benchResult, first: window.__benchFirstFrameEpoch }));
  clearInterval(sampler);
  const report = {
    contract_version: '1.3',
    avg_fps: res.avg_fps,
    p1_low_fps: res.p1_low_fps,
    frame_ms_p95: res.frame_ms_p95,
    frames: res.frames,
    load_ms: Math.round(res.first - PROCESS_START_EPOCH),
    peak_mem_mb: memOk && peak > 0 ? Math.round(peak) : null,
    vsync_off: true,
    renderer: `three.js r${res.three} WebGL2 in ${browserName} ${browser.version()} (Playwright ${pwVersion}, flags --disable-gpu-vsync --disable-frame-rate-limit); GPU: ${res.gpu}`,
    os: `${os.type()} ${os.release()} ${os.arch()}; CPU ${os.cpus()[0]?.model?.trim()} x${os.cpus().length}; RAM ${Math.round(os.totalmem() / 1073741824)} GB; Node ${process.version}`,
    seed, duration_s: duration,
    viewport: res.size, pixel_ratio: res.pixel_ratio, draw_calls: res.draw_calls, triangles: res.triangles,
    js_heap_peak_mb: res.js_heap_peak_mb,
    mem_note: 'peak_mem_mb = highest summed RSS (working set on Windows) of all processes started by bench.mjs: the browser tree and the static server',
  };
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} catch (e) {
  clearInterval(sampler);
  await browser.close().catch(() => {});
  server.kill();
  fail(e.message);
}
await browser.close();
server.kill();
process.exit(0);
