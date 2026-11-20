// npm run proof -- <phase>: regenerate evidence in docs/proof/phase-<N>/ from real runs.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const phase = process.argv[2] ?? '1';
const dir = path.join(root, 'docs', 'proof', `phase-${phase}`);
fs.mkdirSync(dir, { recursive: true });
const node = (args) => spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
const rel = (f) => path.relative(root, f).replaceAll('\\', '/');
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

// 1. tests
const t = node(['--test', 'tests/']);
fs.writeFileSync(path.join(dir, 'test-report.txt'), t.stdout + t.stderr);
console.log(`tests: exit ${t.status}`);

// 2. sample headless runs
const runs = [
  ['run-default-seed42.jsonl', ['--seed', '42', '--night', '1', '--ticks', '3600', '--snapshot-every', '600']],
  ['run-pickup.jsonl', ['--seed', '1', '--night', '1', '--scenario', 'scenarios/pickup.json', '--inputs', 'scenarios/walk_forward.json', '--ticks', '60']],
  ['run-win.jsonl', ['--seed', '1', '--night', '1', '--scenario', 'scenarios/win_one_left.json', '--inputs', 'scenarios/interact_once.json', '--ticks', '600']],
  ['run-night2-seed42.jsonl', ['--seed', '42', '--night', '2', '--ticks', '3600', '--snapshot-every', '600']],
  ['run-night3-seed42.jsonl', ['--seed', '42', '--night', '3', '--ticks', '3600', '--snapshot-every', '600']],
];
for (const [name, args] of runs) {
  const r = node(['headless.mjs', ...args, '--out', path.join(dir, name)]);
  console.log(`${name}: exit ${r.status}`);
}

// 3. determinism: same args twice -> same bytes
const a = path.join(os.tmpdir(), 'ddl-a.jsonl'), b = path.join(os.tmpdir(), 'ddl-b.jsonl');
const dargs = ['headless.mjs', '--seed', '7', '--night', phase === '1' ? '1' : '3', '--inputs', 'scenarios/walk_forward.json', '--ticks', '21600', '--snapshot-every', '1'];
const t0 = performance.now();
node([...dargs, '--out', a]);
const ms = performance.now() - t0;
node([...dargs, '--out', b]);
const [ha, hb] = [sha(a), sha(b)];
fs.writeFileSync(path.join(dir, 'determinism.txt'),
  `command: node ${dargs.join(' ')} --out <file>\nrun 1 sha256: ${ha}\nrun 2 sha256: ${hb}\nidentical: ${ha === hb}\n` +
  `bytes: ${fs.statSync(a).size}\nwall time run 1 (up to 21600 ticks, snapshot every tick; limit 30 s): ${ms.toFixed(0)} ms\n`);
console.log(`determinism identical: ${ha === hb}`);

// 4. exit codes for malformed files
const bad = path.join(os.tmpdir(), 'ddl-bad.json');
fs.writeFileSync(bad, '{"frames": [{"tick": 3}, {"tick": 3}]}');
const lines = [];
for (const [label, extra] of [['duplicate tick in inputs', ['--inputs', bad]], ['scenario is not JSON', ['--scenario', 'README.md']], ['valid run', []]]) {
  const r = node(['headless.mjs', '--seed', '1', '--night', '1', '--ticks', '5', '--out', path.join(os.tmpdir(), 'ddl-x.jsonl'), ...extra]);
  lines.push(`${label}: exit ${r.status}${r.stderr ? ` · stderr: ${r.stderr.trim()}` : ''}`);
}
fs.writeFileSync(path.join(dir, 'exit-codes.txt'), lines.join('\n') + '\n');

// 5. machine
fs.writeFileSync(path.join(dir, 'machine.txt'),
  `os: ${os.type()} ${os.release()} ${os.arch()}\ncpu: ${os.cpus()[0]?.model} x${os.cpus().length}\nnode: ${process.version}\n` +
  `git: ${spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim()}\n`);
console.log(`evidence written to ${rel(dir)}`);
process.exit(t.status === 0 && ha === hb ? 0 : 1);
