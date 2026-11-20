// Ticket-04 (contract v1.3): bench scene, soak, leaderboard, creative mode never touches headless.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGame, createBenchGame, step, snapshot } from '../src/sim.js';
import { validateName, insertEntry, sortEntries, load, save } from '../server/leaderboard.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ddl13-'));
const IDLE = { move: [0, 0], cam_yaw_deg: 0, jump: false, interact: false, pulse: false, dash: false, pause: false };

test('B1 bench scene: 200 wander shades, 100 motes, L1-L3 lit at 100; no burn, no pickup, no damage, no end', () => {
  const g = createBenchGame(42);
  const s0 = snapshot(g);
  assert.equal(s0.shades.length, 200);
  assert.ok(s0.shades.every((s) => s.state === 'wander' && Math.hypot(s.pos[0], s.pos[2]) <= 40));
  assert.equal(s0.motes.length, 100);
  assert.deepEqual(s0.lanterns.map((l) => [l.id, l.lit, l.fuel]), [['L1', true, 100], ['L2', true, 100], ['L3', true, 100], ['L4', false, 0], ['L5', false, 0]]);
  const ev = [];
  for (let i = 0; i < 60 * 300; i++) ev.push(...step(g, IDLE)); // a full night and more
  const s = snapshot(g);
  assert.equal(s.state, 'playing', 'night never ends');
  assert.equal(s.shades.length, 200, 'no spawns');
  assert.equal(s.player.flames, 3, 'no damage');
  assert.equal(s.motes.length, 100, 'no pickup');
  assert.deepEqual(s.lanterns.slice(0, 3).map((l) => l.fuel), [100, 100, 100], 'no fuel burn');
  assert.equal(ev.filter((e) => ['player_hit', 'shade_spawned', 'game_over', 'mote_picked'].includes(e.name)).length, 0);
  assert.deepEqual(snapshot(createBenchGame(42)).shades, s0.shades, 'seeded: same layout every time');
});

test('B2 creative mode (arrow, sprint) is off unless asked: same seed, same inputs -> same state as before', () => {
  const run = (g) => { for (let i = 0; i < 400; i++) step(g, { ...IDLE, move: [0, 1], arrow: i % 50 === 0 }); return JSON.stringify(snapshot(g)); };
  const plain = createGame(5, {}, 1);
  const again = createGame(5, {}, 1);
  assert.equal(run(plain), run(again));
  const creative = createGame(5, { random_shades: false, shades: [{ id: 'S1', pos: [0, 1, 10] }] }, 1, { creative: true });
  const ev = step(creative, { ...IDLE, arrow: true });
  assert.deepEqual(ev.find((e) => e.name === 'arrow').data, { hit_id: 'S1', dir_deg: 0 });
  assert.equal(creative.shades[0].state, 'stunned');
  const off = createGame(5, { random_shades: false, shades: [{ id: 'S1', pos: [0, 1, 10] }] }, 1);
  assert.equal(step(off, { ...IDLE, arrow: true }).filter((e) => e.name === 'arrow').length, 0);
});

test('S1 soak: 10 nights, 0 crashes, memory end <= 1.2 x start, json shape', () => {
  const out = path.join(TMP, 'soak.json');
  const r = spawnSync(process.execPath, ['--expose-gc', path.join(ROOT, 'soak.mjs'), '--seed', '7', '--nights', '10', '--out', out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const s = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(s.nights, 10);
  assert.equal(s.crashes, 0);
  assert.equal(s.results.length, 10);
  assert.ok(s.results.every((x) => x === 'won' || x === 'lost'));
  assert.ok(s.mem_end_mb <= 1.2 * s.mem_start_mb, `${s.mem_end_mb} vs ${s.mem_start_mb}`);
});

test('L1 leaderboard names: 3-12 of letters (Vietnamese ok), digits, _', () => {
  assert.equal(validateName('Mây_01'), null);
  assert.equal(validateName('ab'), 'Tên dài 3–12 ký tự');
  assert.equal(validateName('abcdefghijklm'), 'Tên dài 3–12 ký tự');
  assert.equal(validateName('a b c'), 'Chỉ dùng chữ, số và _');
  assert.equal(validateName('Đỗ_Hiếu'), null);
});

test('L2 leaderboard: top 10, score desc, ties -> earlier achieved_at first', () => {
  const at = (m) => `2026-11-20T10:${String(m).padStart(2, '0')}:00+07:00`;
  let e = [];
  for (let i = 0; i < 12; i++) e = insertEntry(e, { name: `P${String(i).padStart(2, '0')}x`, score: i * 10, nights_won: 1, achieved_at: at(i), seed: i });
  assert.equal(e.length, 10);
  assert.equal(e[0].score, 110);
  assert.equal(e.at(-1).score, 20);
  e = insertEntry(e, { name: 'Late', score: 110, nights_won: 3, achieved_at: at(59), seed: 1 });
  assert.deepEqual(e.slice(0, 2).map((x) => x.name), ['P11x', 'Late'], 'tie: earlier first');
  assert.throws(() => insertEntry(e, { name: 'Bad', score: 1, nights_won: 1, achieved_at: '2026-11-20 10:00', seed: 1 }));
  assert.deepEqual(sortEntries(e), e);
});

test('L3 leaderboard persists on disk and exports with run_cmd --export-leaderboard', () => {
  const file = path.join(TMP, 'lb.json');
  save(file, insertEntry([], { name: 'Mây', score: 1234, nights_won: 3, achieved_at: '2026-11-20T21:00:00+07:00', seed: 42 }));
  assert.equal(load(file)[0].name, 'Mây');
  const out = path.join(TMP, 'export.json');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'serve.mjs'), '--export-leaderboard', out], { encoding: 'utf8', env: { ...process.env, DDL_LEADERBOARD: file } });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(out, 'utf8')), { entries: [{ name: 'Mây', score: 1234, nights_won: 3, achieved_at: '2026-11-20T21:00:00+07:00', seed: 42 }] });
});
