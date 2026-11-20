// Rule tests for src/sim.js. IDs (R1...) map to docs/notes/phase-1.md §4.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, snapshot, ScenarioError } from '../src/sim.js';
import { TUNING as T } from '../src/tuning.js';

const IDLE = { move: [0, 0], cam_yaw_deg: 0, jump: false, interact: false, pulse: false };
const quiet = (extra = {}) => ({ random_motes: false, random_shades: false, motes: [], shades: [], ...extra });

function run(g, n, input = IDLE) {
  const ev = [];
  for (let i = 0; i < n && g.state === 'playing'; i++) ev.push(...step(g, input));
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

test('R3 standing on a mote picks it up: carried +1, score +per_mote', () => {
  const g = createGame(1, quiet({ motes: [[0, 0, T.pickup_radius]] }));
  const ev = run(g, 1);
  assert.deepEqual(ev.map((e) => e.name), ['mote_picked']);
  assert.equal(ev[0].tick, 1);
  assert.deepEqual(ev[0].data, { carried: 1 });
  assert.equal(g.score, T.score.per_mote);
});

test('R4 a full bag does not pick up more', () => {
  const g = createGame(1, quiet({ player: { carried: T.carry_capacity }, motes: [[0, 0, 0]] }));
  assert.equal(run(g, 1).length, 0);
  assert.equal(g.motes.length, 1);
});

test('R5 interact deposits; reaching lantern_cost lights it (+per_lantern)', () => {
  const g = createGame(1, quiet({ player: { carried: T.lantern_cost }, lanterns: [{ id: 'L1', pos: [0, 0, 2] }] }));
  const ev = press(g, 'interact');
  assert.deepEqual(ev.map((e) => e.name), ['deposit', 'lantern_lit']);
  assert.deepEqual(ev[0].data, { lantern_id: 'L1', amount: T.lantern_cost, deposited: T.lantern_cost });
  assert.equal(g.score, T.score.per_lantern);
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

test('R6 lighting the last lantern wins with time + flame bonus', () => {
  const lit = ['L2', 'L3', 'L4', 'L5'].map((id) => ({ id, lit: true }));
  const g = createGame(1, quiet({ player: { carried: T.lantern_cost }, lanterns: [{ id: 'L1', pos: [0, 0, 1] }, ...lit], time_left_s: 100 }));
  const ev = step(g, { ...IDLE, interact: true });
  assert.equal(g.state, 'won');
  assert.deepEqual(ev.at(-1).data, { result: 'won', reason: 'all_lit' });
  const bonus = T.score.per_second_left * Math.floor(100 - 1 / 60) + T.score.per_flame_left * T.flames;
  assert.equal(g.score, T.score.per_lantern + bonus);
});

test('R7 shade contact: lose a flame, drop motes, then invulnerable', () => {
  const g = createGame(1, quiet({ player: { carried: 4 }, shades: [{ pos: [0, 1, 0.5] }] }));
  const ev = run(g, 1);
  assert.deepEqual(ev[0].data, { by: 'shade', flames: T.flames - 1, dropped: Math.floor(4 * T.hit_drop_ratio) });
  const later = run(g, Math.round(T.invuln_s * 60) - 1);
  assert.equal(later.filter((e) => e.name === 'player_hit').length, 0);
  assert.equal(run(g, 1).filter((e) => e.name === 'player_hit').length, 1);
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

test('R9 pulse stuns + pushes shades in range, costs light, has cooldown', () => {
  const g = createGame(1, quiet({ player: { carried: 3 }, shades: [{ id: 'A', pos: [3, 1, 0] }, { id: 'B', pos: [20, 1, 0] }] }));
  const ev = step(g, { ...IDLE, pulse: true });
  assert.deepEqual(ev[0].data, { stunned_ids: ['A'] });
  assert.equal(g.player.carried, 3 - T.pulse_cost);
  assert.equal(g.shades[0].state, 'stunned');
  assert.ok(Math.abs(g.shades[0].pos[0] - (3 + T.pulse_push_m)) < 1e-9);
  assert.equal(g.score, T.score.per_stun);
  step(g, IDLE);
  assert.equal(step(g, { ...IDLE, pulse: true }).length, 0, 'cooldown blocks a second pulse');
  const stunTicks = Math.round(T.pulse_stun_s * 60);
  run(g, stunTicks);
  assert.equal(g.shades[0].state, 'chase');
});

test('R9b pulse without enough light does nothing', () => {
  const g = createGame(1, quiet({ shades: [{ pos: [3, 1, 0] }] }));
  assert.equal(step(g, { ...IDLE, pulse: true }).length, 0);
});

test('R10 shades cannot enter a lantern safe_radius', () => {
  const g = createGame(1, quiet({ player: { pos: [0, 0, 25] }, shades: [{ pos: [0, 1, 10] }] }));
  run(g, 600);
  const s = g.shades[0];
  assert.ok(Math.hypot(s.pos[0], s.pos[2] - 25) >= T.safe_radius - 1e-9);
  assert.equal(g.player.flames, T.flames);
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
});

test('default night 1 has 5 lanterns, L1 at (0,0,25), seeded motes', () => {
  const a = snapshot(createGame(7));
  const b = snapshot(createGame(7));
  const c = snapshot(createGame(8));
  assert.equal(a.lanterns.length, T.lantern_count_night1);
  assert.deepEqual(a.lanterns[0].pos, [0, 0, 25]);
  assert.deepEqual(a.motes, b.motes);
  assert.notDeepEqual(a.motes, c.motes);
});
