#!/usr/bin/env node
// Headless mode, Test Contract v1.1:
// node headless.mjs --seed <int> --night 1|2|3 [--scenario f.json] [--inputs f.json]
//                   --ticks <int> --out <f.jsonl> [--snapshot-every <int>]
// Exit 0 ok · 1 bad command line · 2 malformed inputs/scenario file.
import fs from 'node:fs';
import path from 'node:path';
import { createGame, step, snapshot, ScenarioError } from './src/sim.js';

class InputError extends Error {}

function fail(code, msg) {
  process.stderr.write(`headless: ${msg}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const out = { snapshotEvery: 10 };
  const need = (i) => {
    if (i + 1 >= argv.length) fail(1, `missing value for ${argv[i]}`);
    return argv[i + 1];
  };
  const int = (v, name, min) => {
    if (!/^-?\d+$/.test(v) || Number(v) < min) fail(1, `${name} must be an integer >= ${min}`);
    return Number(v);
  };
  for (let i = 0; i < argv.length; i += 2) {
    const a = argv[i];
    if (a === '--seed') out.seed = int(need(i), '--seed', -Infinity);
    else if (a === '--night') out.night = int(need(i), '--night', 1);
    else if (a === '--scenario') out.scenario = need(i);
    else if (a === '--inputs') out.inputs = need(i);
    else if (a === '--ticks') out.ticks = int(need(i), '--ticks', 0);
    else if (a === '--out') out.out = need(i);
    else if (a === '--snapshot-every') out.snapshotEvery = int(need(i), '--snapshot-every', 1);
    else fail(1, `unknown argument: ${a}`);
  }
  for (const k of ['seed', 'night', 'ticks', 'out']) if (out[k] === undefined) fail(1, `--${k} is required`);
  if (![1, 2, 3].includes(out.night)) fail(1, `night ${out.night} is not available (1, 2 or 3)`);
  return out;
}

function readJson(file, label) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { fail(2, `cannot read ${label} file ${file}: ${e.message}`); }
  try { return JSON.parse(text); } catch (e) { fail(2, `${label} file is not valid JSON: ${e.message}`); }
}

// Returns Map(tick -> frame). Missing fields keep their previous value (applied in main loop).
export function parseInputs(doc) {
  if (doc === null || typeof doc !== 'object' || !Array.isArray(doc.frames)) throw new InputError('inputs must be {"frames": [...]}');
  const frames = new Map();
  let last = -1;
  for (const f of doc.frames) {
    if (f === null || typeof f !== 'object' || Array.isArray(f)) throw new InputError('each frame must be an object');
    if (!Number.isInteger(f.tick) || f.tick < 0) throw new InputError('frame.tick must be an integer >= 0');
    if (f.tick <= last) throw new InputError(`frame ticks must be strictly increasing (got ${f.tick} after ${last})`);
    last = f.tick;
    if ('move' in f) {
      const m = f.move;
      if (!Array.isArray(m) || m.length !== 2 || !m.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= -1 && v <= 1)) {
        throw new InputError(`frame ${f.tick}: move must be [x, z] with each value in [-1, 1]`);
      }
    }
    if ('cam_yaw_deg' in f && !(typeof f.cam_yaw_deg === 'number' && Number.isFinite(f.cam_yaw_deg))) {
      throw new InputError(`frame ${f.tick}: cam_yaw_deg must be a number`);
    }
    for (const b of ['jump', 'interact', 'pulse', 'dash', 'pause']) {
      if (b in f && typeof f[b] !== 'boolean') throw new InputError(`frame ${f.tick}: ${b} must be boolean`);
    }
    frames.set(f.tick, f);
  }
  return frames;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let frames = new Map();
  if (args.inputs) {
    try { frames = parseInputs(readJson(args.inputs, 'inputs')); } catch (e) {
      if (e instanceof InputError) fail(2, `inputs: ${e.message}`);
      throw e;
    }
  }
  let game;
  try {
    game = createGame(args.seed, args.scenario ? readJson(args.scenario, 'scenario') : {}, args.night);
  } catch (e) {
    if (e instanceof ScenarioError) fail(2, `scenario: ${e.message}`);
    throw e;
  }

  const lines = [JSON.stringify(snapshot(game)), JSON.stringify({ type: 'event', tick: 0, name: 'night_start', data: { night: args.night } })];
  const held = { move: [0, 0], cam_yaw_deg: 0, jump: false, interact: false, pulse: false, dash: false, pause: false };
  for (let k = 0; k < args.ticks && (game.state === 'playing' || game.state === 'paused'); k++) {
    const f = frames.get(k);
    if (f) for (const key of Object.keys(held)) if (key in f) held[key] = f[key];
    for (const ev of step(game, held)) lines.push(JSON.stringify(ev));
    if (game.tick % args.snapshotEvery === 0) lines.push(JSON.stringify(snapshot(game)));
  }
  lines.push(JSON.stringify({ type: 'end', ticks: game.tick, state: game.state, score: game.score }));

  try {
    fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
    fs.writeFileSync(args.out, lines.join('\n') + '\n');
  } catch (e) {
    fail(1, `cannot write ${args.out}: ${e.message}`);
  }
}

main();
