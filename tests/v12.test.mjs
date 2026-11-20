// Ticket-03 (contract v1.2): lantern fuel, drain, dawn win, capacity, scoring. IDs F1..F9 in docs/notes/phase-3.md §3.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, snapshot, ScenarioError } from '../src/sim.js';
import { TUNING as T } from '../src/tuning.js';

const IDLE = { move: [0, 0], cam_yaw_deg: 0, jump: false, interact: false, pulse: false, dash: false, pause: false };
const quiet = (extra = {}) => ({ random_motes: false, random_shades: false, random_drifters: false, wind_enabled: false, motes: [], shades: [], ...extra });
function run(g, n, input = IDLE) {
  const ev = [];
  for (let i = 0; i < n && (g.state === 'playing' || g.state === 'paused'); i++) ev.push(...step(g, input));
  return ev;
}
const lantern = (g, id) => snapshot(g).lanterns.find((l) => l.id === id);

test('F1 a lit lantern burns 1 fuel/s; at 0 it goes out, deposited 0, ever_lit stays true', () => {
  const g = createGame(1, quiet({ lanterns: [{ id: 'L1', lit: true, fuel: 2 }] }));
  run(g, 60);
  assert.equal(lantern(g, 'L1').fuel, 1); // 2 - 60 x (1/60) = 1.0
  const ev = run(g, 60);
  const out = ev.find((e) => e.name === 'lantern_out');
  assert.deepEqual(out, { type: 'event', tick: 120, name: 'lantern_out', data: { lantern_id: 'L1' } });
  assert.deepEqual(lantern(g, 'L1'), { id: 'L1', pos: [0, 0, 25], lit: false, deposited: 0, fuel: 0, ever_lit: true, relit_count: 0 });
});

test('F2 refuel: used = min(carried, ceil((100 - fuel)/10)), +5 each; a full lantern is not chosen', () => {
  const g = createGame(1, quiet({ player: { carried: 9 }, lanterns: [{ id: 'L1', pos: [0, 0, 1], lit: true, fuel: 55 }] }));
  const ev = step(g, { ...IDLE, interact: true });
  // fuel after phase 2 = 55 - 1/60; ceil((100 - 54.98)/10) = 5 motes -> min(100, 54.98 + 50) = 100
  assert.deepEqual(ev.find((e) => e.name === 'refuel').data, { lantern_id: 'L1', amount: 5, fuel: 100 });
  assert.equal(g.player.carried, 4);
  assert.equal(g.score, 5 * T.score.per_mote);
  const full = createGame(1, quiet({ player: { carried: 5 }, lanterns: [{ id: 'L1', pos: [0, 0, 1], lit: true }, { id: 'L2', pos: [0, 0, 1.5] }] }));
  full.lanterns[0].fuel = 6000; // exactly full after phase 2? no: phase 2 burns 1 -> 5999 -> needs ceil(1/600) = 1
  const ev2 = step(full, { ...IDLE, interact: true });
  assert.equal(ev2.find((e) => e.name === 'refuel').data.lantern_id, 'L1', 'one tick of burn makes it refuelable');
  const g3 = createGame(1, quiet({ player: { carried: 5 }, lanterns: [{ id: 'L1', pos: [0, 0, 1], lit: true }, { id: 'L2', pos: [0, 0, 1.5] }] }));
  g3.lanterns[0].fuel = 6001; // still full after burning 1 -> used = 0 -> not a candidate, L2 is chosen
  const ev3 = step(g3, { ...IDLE, interact: true });
  assert.equal(ev3.filter((e) => e.name === 'refuel').length, 0);
  assert.equal(ev3.find((e) => e.name === 'deposit').data.lantern_id, 'L2');
});

test('F3 relight costs 5, scores +40, relight: true, relit_count +1, fuel back to 100', () => {
  const g = createGame(1, quiet({ player: { carried: 7 }, lanterns: [{ id: 'L1', pos: [0, 0, 1], ever_lit: true }] }));
  const ev = step(g, { ...IDLE, interact: true });
  assert.deepEqual(ev.find((e) => e.name === 'deposit').data, { lantern_id: 'L1', amount: 5, deposited: 5 });
  assert.deepEqual(ev.find((e) => e.name === 'lantern_lit').data, { lantern_id: 'L1', relight: true });
  assert.equal(g.score, 5 * T.score.per_mote + 40);
  assert.equal(lantern(g, 'L1').relit_count, 1);
  assert.equal(lantern(g, 'L1').fuel, 100);
  const first = createGame(1, quiet({ player: { carried: 10 }, lanterns: [{ id: 'L1', pos: [0, 0, 1] }] }));
  assert.deepEqual(step(first, { ...IDLE, interact: true }).find((e) => e.name === 'lantern_lit').data, { lantern_id: 'L1', relight: false });
});

test('F4 fuel below 30 loses the safe zone; exactly 30 keeps it', () => {
  const at30 = createGame(1, quiet({ player: { pos: [0, 0, 25] }, lanterns: [{ id: 'L1', lit: true, fuel: 100 }], shades: [{ pos: [0, 1, 14] }] }));
  at30.lanterns[0].fuel = 30 * 60 + 600; // 30 + 600 ticks of burn: still >= 30 for the next 600 ticks
  run(at30, 600);
  assert.equal(at30.player.flames, T.flames, 'fuel >= 30: zone holds');
  const low = createGame(1, quiet({ player: { pos: [0, 0, 25] }, lanterns: [{ id: 'L1', lit: true, fuel: 29.9 }], shades: [{ pos: [0, 1, 14] }] }));
  run(low, 600);
  assert.ok(low.player.flames < T.flames, 'fuel < 30: shades get in');
});

test('F5 wander shade goes to the weak lantern, drains 5/s (stacking), fuel_drain every 60 ticks; Mây within 6 m -> chase', () => {
  const g = createGame(1, quiet({ lanterns: [{ id: 'L1', lit: true, fuel: 20 }], shades: [{ id: 'S1', pos: [0, 1, 23.5] }, { id: 'S2', pos: [0, 1, 26.5] }] })); // 1.5 m from L1: within the 2 m drain reach
  run(g, 1);
  assert.deepEqual(g.shades.map((s) => s.state), ['drain', 'drain']);
  const f0 = g.lanterns[0].fuel;
  const ev = run(g, 60);
  assert.equal(f0 - g.lanterns[0].fuel, 60 * (1 + 5 * 2)); // burn 1 + 2 shades x 5, per tick in 1/60 units
  assert.deepEqual(ev.filter((e) => e.name === 'fuel_drain').map((e) => e.data.shade_id), ['S1', 'S2']);
  g.player.pos = [0, 0, 18]; // 5.5 m from S1 at z=23.5 (<= 6)
  run(g, 1);
  assert.equal(g.shades[0].state, 'chase');
});

test('F5b pulse on a draining shade scores 15; stun ends in wander (then drain again if a weak lantern is within 2 m)', () => {
  const g = createGame(1, quiet({ player: { pos: [0, 0, 18], carried: 3 }, lanterns: [{ id: 'L1', lit: true, fuel: 20 }], shades: [{ id: 'S1', pos: [0, 1, 22], state: 'drain', target_lantern_id: 'L1' }] }));
  step(g, { ...IDLE, pulse: true });
  assert.equal(g.score, 15);
  g.player.pos = [0, 0, -30]; // far away, so the 12 m detection rule does not turn it into chase
  run(g, 119);
  assert.equal(g.shades[0].state, 'stunned');
  run(g, 1);
  // stun ends -> wander (phase 2); pushed 22 -> 26 it is 1 m from the weak L1 (<= 2 m), so in phase 8
  // of the same tick the wander rule sends it straight back to drain
  assert.equal(g.shades[0].state, 'drain');
  g.lanterns[0].fuel = 0; // with no weak lantern left, the stun end stays plain wander
  const h = createGame(1, quiet({ player: { carried: 3 }, shades: [{ id: 'S1', pos: [2, 1, 0] }] }));
  step(h, { ...IDLE, pulse: true });
  h.player.pos = [0, 0, -30];
  run(h, 120);
  assert.equal(h.shades[0].state, 'wander');
});

test('F6 refuelling to >= 30 evicts shades inside the zone within 30 ticks, no damage meanwhile', () => {
  const g = createGame(1, quiet({ player: { pos: [0, 0, 26.5], carried: 10, invuln_ticks: 0 }, lanterns: [{ id: 'L1', lit: true, fuel: 10 }], shades: [{ id: 'S1', pos: [0, 1, 23.5], state: 'drain', target_lantern_id: 'L1' }] }));
  g.shades[0].state = 'drain';
  const ev = step(g, { ...IDLE, interact: true });
  assert.ok(ev.some((e) => e.name === 'refuel'));
  const ev2 = run(g, 29);
  assert.equal(ev2.filter((e) => e.name === 'player_hit').length, 0);
  assert.ok(Math.hypot(g.shades[0].pos[0], g.shades[0].pos[2] - 25) >= T.safe_radius - 1e-9);
});

test('F7 dawn: win with >= ceil(0.6 n) lit (+50 + floor(fuel) each, +50 per flame); fewer -> dawn; no flames -> no_flames', () => {
  const g = createGame(1, quiet({ lanterns: [{ id: 'L1', lit: true, fuel: 90 }, { id: 'L2', lit: true, fuel: 90 }, { id: 'L3', lit: true, fuel: 90 }], time_left_s: 1 }));
  const ev = run(g, 100);
  assert.deepEqual(ev.at(-1).data, { result: 'won', reason: 'dawn_survived' });
  assert.equal(g.score, 3 * (50 + 89) + 3 * 50); // fuel 90 - 1 s = 89
  const lose = createGame(1, quiet({ lanterns: [{ id: 'L1', lit: true }, { id: 'L2', lit: true }], time_left_s: 1 }));
  assert.deepEqual(run(lose, 100).at(-1).data, { result: 'lost', reason: 'dawn' });
  const n3 = createGame(1, quiet({ lanterns: ['L1', 'L2', 'L3', 'L4'].map((id) => ({ id, lit: true })), time_left_s: 1 }), 3);
  assert.deepEqual(run(n3, 100).at(-1).data, { result: 'lost', reason: 'dawn' }, 'night 3 needs 5/7');
  const dead = createGame(1, quiet({ player: { flames: 1 }, lanterns: ['L1', 'L2', 'L3'].map((id) => ({ id, lit: true })), shades: [{ pos: [0, 1, 0] }], time_left_s: 1 / 60 }));
  assert.deepEqual(run(dead, 5).at(-1).data, { result: 'lost', reason: 'no_flames' });
});

test('F8 capacity = 10 + 2 x successful lights (relights count), max 20', () => {
  const g = createGame(1, quiet({ player: { carried: 10 }, lanterns: [{ id: 'L1', pos: [0, 0, 1] }] }));
  assert.equal(snapshot(g).player.capacity, 10);
  step(g, { ...IDLE, interact: true });
  assert.equal(snapshot(g).player.capacity, 12);
  const big = createGame(1, quiet({ player: { successful_lights: 7 } }));
  assert.equal(snapshot(big).player.capacity, 20);
  const pre = createGame(1, quiet({ lanterns: [{ id: 'L1', lit: true }] }));
  assert.equal(snapshot(pre).player.capacity, 10, 'scenario lanterns do not count');
});

test('F9 scenario v1.2: lit without fuel -> 100, unknown target_lantern_id rejected, drain state accepted', () => {
  assert.equal(lantern(createGame(1, quiet({ lanterns: [{ id: 'L2', lit: true }] })), 'L2').fuel, 100);
  assert.throws(() => createGame(1, quiet({ shades: [{ pos: [1, 1, 1], target_lantern_id: 'L9' }] })), ScenarioError);
  assert.equal(createGame(1, quiet({ shades: [{ pos: [1, 1, 1], state: 'drain', target_lantern_id: 'L1' }] })).shades[0].state, 'drain');
});

test('F4b boundary: fuel exactly 30.0 after the burn still has a safe zone; 29.98 does not', () => {
  const make = (fuel60) => {
    const g = createGame(1, quiet({ player: { pos: [0, 0, 40] }, lanterns: [{ id: 'L1', lit: true }], shades: [{ id: 'S1', pos: [0, 1, 22] }] }));
    g.lanterns[0].fuel = fuel60; // phase 2 burns 1 unit (1/60) before the zone check in phase 6
    step(g, IDLE);
    return g.shades[0];
  };
  assert.ok(make(30 * 60 + 1).evict > 0, '1801 - 1 = 1800 = 30.0 -> zone active -> shade 3 m inside gets evicted');
  assert.equal(make(30 * 60).evict, 0, '1800 - 1 = 1799 < 30 -> no zone');
});
