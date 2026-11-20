// Phase 1 rule tests, updated to the Ticket-02 standard numbers.
// Every change vs Phase 1 is listed in docs/notes/phase-2.md §1 with its reason.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, snapshot, ScenarioError } from '../src/sim.js';
import { TUNING as T, RULES as R } from '../src/tuning.js';

const IDLE = { move: [0, 0], cam_yaw_deg: 0, jump: false, interact: false, pulse: false, dash: false, pause: false };
const quiet = (extra = {}) => ({ random_motes: false, random_shades: false, random_drifters: false, motes: [], shades: [], ...extra });

function run(g, n, input = IDLE) {
  const ev = [];
  for (let i = 0; i < n && (g.state === 'playing' || g.state === 'paused'); i++) ev.push(...step(g, input));
  return ev;
}
const press = (g, button) => [...step(g, { ...IDLE, [button]: true }), ...step(g, IDLE)];

test('R1 move [0,1] at yaw 0 for 60 ticks goes +Z by player_speed', () => {
  const g = createGame(1, quiet());
  run(g, 60, { ...IDLE, move: [0, 1] });
  assert.ok(Math.abs(g.player.pos[2] - T.player_speed) < 1e-9);
  assert.ok(Math.abs(g.player.pos[0]) < 1e-9);
});

test('R2 yaw 90 turns move [0,1] into +X; long vectors are normalized', () => {
  const g = createGame(1, quiet());
  run(g, 60, { ...IDLE, move: [0, 1], cam_yaw_deg: 90 });
  assert.ok(Math.abs(g.player.pos[0] - T.player_speed) < 1e-9);
  const h = createGame(1, quiet());
  run(h, 60, { ...IDLE, move: [1, 1] });
  assert.ok(Math.abs(Math.hypot(h.player.pos[0], h.player.pos[2]) - T.player_speed) < 1e-9);
});

test('R3 standing on a mote picks it up: carried +1 (v1.1: no points until deposit)', () => {
  const g = createGame(1, quiet({ motes: [[0, 0, T.pickup_radius]] }));
  const ev = run(g, 1);
  assert.deepEqual(ev.map((e) => e.name), ['mote_picked']);
  assert.equal(ev[0].tick, 1);
  assert.deepEqual(ev[0].data, { carried: 1 });
  assert.equal(g.score, 0);
});

test('R3b pickup needs height difference <= 1.5 m', () => {
  const g = createGame(1, quiet({ motes: [[0, 1.6, 0.5]] }));
  assert.equal(run(g, 1).length, 0);
  const h = createGame(1, quiet({ motes: [[0, 1.5, 0.5]] }));
  assert.equal(run(h, 1).length, 1);
});

test('R4 a full bag (10) does not pick up more', () => {
  const g = createGame(1, quiet({ player: { carried: T.carry_capacity }, motes: [[0, 0, 0]] }));
  assert.equal(run(g, 1).length, 0);
  assert.equal(g.motes.length, 1);
});

test('R5 interact deposits (+10 each); reaching 10 lights it (+100)', () => {
  const g = createGame(1, quiet({ player: { carried: T.lantern_cost }, lanterns: [{ id: 'L1', pos: [0, 0, 2] }] }));
  const ev = press(g, 'interact');
  assert.deepEqual(ev.map((e) => e.name), ['deposit', 'lantern_lit']);
  assert.deepEqual(ev[0].data, { lantern_id: 'L1', amount: T.lantern_cost, deposited: T.lantern_cost });
  assert.equal(g.score, T.score.per_mote * T.lantern_cost + T.score.per_lantern);
  assert.equal(g.player.carried, 0);
});

test('R5b interact only triggers on false->true, holding does nothing more', () => {
  // carried is refilled every tick, so only the edge rule can stop a second deposit
  const g = createGame(1, quiet({ player: { carried: 1 }, lanterns: [{ id: 'L1', pos: [0, 0, 1] }] }));
  let deposits = 0;
  for (let i = 0; i < 3; i++) {
    g.player.carried = 1;
    deposits += step(g, { ...IDLE, interact: true }).filter((e) => e.name === 'deposit').length;
  }
  assert.equal(deposits, 1);
});

test('R5c lantern remembers progress; ties go to the smaller id', () => {
  const g = createGame(1, quiet({ player: { carried: 4 }, lanterns: [{ id: 'L2', pos: [1, 0, 0] }, { id: 'L1', pos: [-1, 0, 0] }] }));
  const ev = press(g, 'interact');
  assert.equal(ev[0].data.lantern_id, 'L1');
  g.player.carried = 3;
  press(g, 'interact');
  assert.equal(g.lanterns[0].deposited, 7);
});

// R6 REPLACED by Ticket-03 (v1.2): lighting every lantern no longer ends the night (no early win,
// 'all_lit' reason removed). New rule: win at dawn with >= ceil(0.6 x lanterns) lit -> 'dawn_survived'.
test('R6 (v1.2) lighting the last lantern does NOT end the night; dawn with enough lit wins', () => {
  const lit = ['L2', 'L3', 'L4', 'L5'].map((id) => ({ id, lit: true }));
  const g = createGame(1, quiet({ player: { carried: T.lantern_cost }, lanterns: [{ id: 'L1', pos: [0, 0, 1] }, ...lit], time_left_s: 2 }));
  const ev = step(g, { ...IDLE, interact: true });
  assert.ok(ev.some((e) => e.name === 'lantern_lit'));
  assert.equal(g.state, 'playing', 'no early win');
  const ev2 = run(g, 200);
  assert.equal(g.tick, 120); // time_left_s 2 -> dawn at 2 x 60 = 120 ticks
  assert.deepEqual(ev2.at(-1).data, { result: 'won', reason: 'dawn_survived' });
});

test('R7 shade contact: -1 flame, drop floor(n/2) into a 1.5-2.5 m ring, invulnerable 90 ticks', () => {
  const g = createGame(1, quiet({ player: { carried: 5 }, shades: [{ pos: [0, 1, 0.5] }] }));
  const ev = run(g, 1);
  assert.deepEqual(ev[0].data, { by: 'shade', flames: T.flames - 1, dropped: 2 });
  const dropped = g.motes.filter((m) => m.kind === 'dropped');
  assert.equal(dropped.length, 2);
  for (const m of dropped) {
    const r = Math.hypot(m.pos[0] - g.player.pos[0], m.pos[2] - g.player.pos[2]);
    assert.ok(r >= 1.5 - 1e-9 && r <= 2.5 + 1e-9, `ring radius ${r}`);
  }
  assert.equal(g.player.invuln, 90);
});

test('R8 last flame lost -> lost no_flames; time runs out -> lost dawn', () => {
  const g = createGame(1, quiet({ player: { flames: 1 }, shades: [{ pos: [0, 1, 0] }] }));
  const ev = run(g, 1);
  assert.equal(g.state, 'lost');
  assert.deepEqual(ev.at(-1).data, { result: 'lost', reason: 'no_flames' });
  const d = createGame(1, quiet({ time_left_s: 1 }));
  const ev2 = run(d, 1000);
  assert.equal(d.tick, 60);
  assert.deepEqual(ev2.at(-1).data, { result: 'lost', reason: 'dawn' });
});

test('R9 pulse: costs 3, 3D radius 5 from feet+0.8, stun 120, push 4 m over 15 ticks, cooldown 3 s, +5 each', () => {
  const g = createGame(1, quiet({ player: { carried: 5 }, shades: [{ id: 'A', pos: [3, 1, 0] }, { id: 'B', pos: [5.1, 1, 0] }] }));
  const ev = step(g, { ...IDLE, pulse: true });
  assert.deepEqual(ev.find((e) => e.name === 'pulse').data, { stunned_ids: ['A'] });
  assert.equal(g.player.carried, 5 - T.pulse_cost);
  assert.equal(g.score, T.score.per_stun);
  assert.equal(g.shades[0].state, 'stunned');
  run(g, 14);
  assert.ok(Math.abs(g.shades[0].pos[0] - (3 + T.pulse_push_m)) < 1e-9);
  step(g, IDLE);
  assert.equal(step(g, { ...IDLE, pulse: true }).filter((e) => e.name === 'pulse').length, 0, 'cooldown blocks a second pulse');
  run(g, 120);
  assert.notEqual(g.shades[0].state, 'stunned');
});

test('R9b pulse without 3 fireflies does nothing', () => {
  const g = createGame(1, quiet({ player: { carried: 2 }, shades: [{ pos: [3, 1, 0] }] }));
  assert.equal(step(g, { ...IDLE, pulse: true }).filter((e) => e.name === 'pulse').length, 0);
});

test('R10 shades cannot enter the safe radius of a LIT lantern (unlit lanterns do not protect)', () => {
  const g = createGame(1, quiet({ player: { pos: [0, 0, 25] }, lanterns: [{ id: 'L1', lit: true }], shades: [{ pos: [0, 1, 14] }] }));
  run(g, 600);
  assert.ok(Math.hypot(g.shades[0].pos[0], g.shades[0].pos[2] - 25) >= T.safe_radius - 1e-9);
  assert.equal(g.player.flames, T.flames);
  const u = createGame(1, quiet({ player: { pos: [0, 0, 25] }, shades: [{ pos: [0, 1, 14] }] }));
  run(u, 600);
  assert.ok(u.player.flames < T.flames, 'unlit lantern gives no protection');
});

test('R11 building a scenario emits no events and awards no points', () => {
  const g = createGame(1, quiet({ lanterns: [{ id: 'L1', lit: true }], player: { carried: 5 } }));
  assert.equal(g.score, 0);
  assert.equal(g.tick, 0);
  assert.equal(snapshot(g).lanterns[0].lit, true);
});

test('scenario lists replace defaults; unknown lantern id is rejected', () => {
  const g = createGame(1, { motes: [[1, 0, 1]], shades: [] });
  assert.equal(g.motes.length, 1);
  assert.equal(g.shades.length, 0);
  assert.throws(() => createGame(1, { lanterns: [{ id: 'L9' }] }), ScenarioError);
  assert.throws(() => createGame(1, { player: { pos: [0, 0] } }), ScenarioError);
  assert.throws(() => createGame(1, { shades: [{ pos: [1, 1, 1], state: 'angry' }] }), ScenarioError);
});

test('default night 1: standard lanterns, 20 seeded motes on 20 different spawn points', () => {
  const a = snapshot(createGame(7));
  const b = snapshot(createGame(7));
  assert.equal(a.lanterns.length, T.lantern_count_night1);
  assert.deepEqual(a.lanterns.map((l) => l.pos), [[0, 0, 25], [23.8, 0, 7.7], [14.7, 0, -20.2], [-14.7, 0, -20.2], [-23.8, 0, 7.7]]);
  assert.equal(a.motes.length, R.mote_start);
  assert.equal(new Set(a.motes.map((m) => m.pos.join())).size, R.mote_start);
  assert.deepEqual(a.motes, b.motes);
  for (const m of a.motes) {
    const r = Math.hypot(m.pos[0], m.pos[2]);
    assert.ok(Math.abs(r - 12) < 1e-3 || Math.abs(r - 33) < 1e-3);
  }
});
