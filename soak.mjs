#!/usr/bin/env node
// Soak test, Test Contract v1.3 (Ticket-04 §2):
//   node --expose-gc soak.mjs --seed 7 --nights 10 --out soak.json
// Runs N nights headless in ONE process (night 1 -> 2 -> 3 -> 1 ...), night i (1-based) uses seed + i,
// each until it ends or its standard duration. Seeded random input: new move direction every 30 ticks;
// per tick 5% jump, 3% dash, 2% pulse, 10% interact. RSS measured after loading the first night and
// after resetting from the last one (gc first when --expose-gc is on).
import fs from 'node:fs';
import { createGame, step, makeRng, TICK_HZ } from './src/sim.js';
import { TUNING as T } from './src/tuning.js';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  if (v === undefined) { process.stderr.write(`soak: missing value for --${name}\n`); process.exit(1); }
  return v;
}
const seed = Number(arg('seed', '7'));
const nights = Number(arg('nights', '10'));
const out = arg('out', 'soak.json');
if (!Number.isInteger(seed) || !Number.isInteger(nights) || nights < 1) { process.stderr.write('soak: --seed and --nights must be integers\n'); process.exit(1); }

const rssMb = () => {
  if (global.gc) { global.gc(); global.gc(); }
  return Math.round((process.memoryUsage().rss / 1048576) * 10) / 10;
};

const t0 = performance.now();
const results = [];
let crashes = 0;
let memStart = null;
let game = null;
for (let i = 1; i <= nights; i++) {
  const night = ((i - 1) % 3) + 1;
  const s = seed + i;
  try {
    game = createGame(s, {}, night);
    if (i === 1) memStart = rssMb();
    const rng = makeRng(s ^ 0x5a5a5a5a);
    const maxTicks = T[`night${night}_duration_s`] * TICK_HZ;
    let move = [0, 0];
    for (let k = 0; k < maxTicks && game.state === 'playing'; k++) {
      if (k % 30 === 0) {
        const a = rng() * Math.PI * 2;
        move = [Math.cos(a), Math.sin(a)];
      }
      step(game, {
        move, cam_yaw_deg: 0,
        jump: rng() < 0.05, dash: rng() < 0.03, pulse: rng() < 0.02, interact: rng() < 0.1,
        pause: false,
      });
    }
    results.push(game.state === 'won' ? 'won' : game.state === 'lost' ? 'lost' : 'timeout');
  } catch (e) {
    crashes++;
    results.push('crash');
    process.stderr.write(`soak: night ${i} crashed: ${e.stack}\n`);
  }
  game = null; // reset between nights: drop the whole game state
}
const memEnd = rssMb();
const report = {
  nights, crashes, results,
  mem_start_mb: memStart, mem_end_mb: memEnd,
  duration_s: Math.round((performance.now() - t0) / 100) / 10,
  seed, node: process.version, gc_exposed: !!global.gc,
};
fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify(report) + '\n');
process.exit(crashes ? 1 : 0);
