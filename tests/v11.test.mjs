// Ticket-02 new features: one or more scenarios per feature (P1..P13 in docs/notes/phase-2.md §3).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, snapshot } from '../src/sim.js';
import { TUNING as T, RULES as R } from '../src/tuning.js';

const IDLE = { move: [0, 0], cam_yaw_deg: 0, jump: false, interact: false, pulse: false, dash: false, pause: false };
const quiet = (extra = {}) => ({ random_motes: false, random_shades: false, random_drifters: false, wind_enabled: false, motes: [], shades: [], ...extra });
function run(g, n, input = IDLE) {
  const ev = [];
  for (let i = 0; i < n && (g.state === 'playing' || g.state === 'paused'); i++) ev.push(...step(g, input));
  return ev;
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('P1 dash: 14 m/s for 12 ticks (2.8 m) in the moving direction, cooldown 90 ticks from start', () => {
  const g = createGame(1, quiet());
  const ev = step(g, { ...IDLE, move: [0, 1], dash: true });
  assert.ok(ev.some((e) => e.name === 'dash'));
  run(g, 11);
  assert.ok(near(g.player.pos[2], T.dash_speed * T.dash_duration_s), `z=${g.player.pos[2]}`);
  run(g, 47);
  assert.equal(step(g, { ...IDLE, dash: true }).filter((e) => e.name === 'dash').length, 0, 'still cooling down at tick 60');
  run(g, 29); // dash started at tick 1, so tick 90 is still 1 tick short
  assert.equal(step(g, { ...IDLE, dash: true }).filter((e) => e.name === 'dash').length, 0, 'not yet at tick 90');
  step(g, IDLE);
  assert.equal(step(g, { ...IDLE, dash: true }).filter((e) => e.name === 'dash').length, 1, 'ready 90 ticks after the start (tick 91+)');
});

test('P1b dash standing still goes where Mây faces; in the air it keeps altitude', () => {
  const g = createGame(1, quiet());
  run(g, 1, { ...IDLE, move: [0, 1], cam_yaw_deg: 90 }); // now facing +X
  const x0 = g.player.pos[0];
  step(g, { ...IDLE, dash: true });
  run(g, 11);
  assert.ok(near(g.player.pos[0] - x0, 2.8));
  const h = createGame(1, quiet());
  step(h, { ...IDLE, jump: true });
  run(h, 9);
  const y = h.player.pos[1];
  step(h, { ...IDLE, dash: true });
  const ys = [];
  for (let i = 0; i < 11; i++) { step(h, IDLE); ys.push(h.player.pos[1]); }
  assert.ok(ys.every((v) => near(v, y)), 'altitude kept during dash');
});

test('P2 falling off (Y < -10): once, -1 flame, lose all, wait 60 ticks, respawn at start with 90 invuln ticks', () => {
  // walk off to +X: move [x,z] = [1,0] at yaw 0 is +X
  const h = createGame(1, quiet({ player: { pos: [39.5, 0, 0], carried: 4 } }));
  const ev2 = run(h, 200, { ...IDLE, move: [1, 0] });
  const hits = ev2.filter((e) => e.name === 'player_hit');
  assert.equal(hits.length, 1);
  assert.deepEqual(hits[0].data, { by: 'fall', flames: T.flames - 1, dropped: 0, lost: 4 });
  const fallTick = hits[0].tick;
  const k = createGame(1, quiet({ player: { pos: [39.5, 0, 0], carried: 4 } }));
  run(k, fallTick, { ...IDLE, move: [1, 0] });
  run(k, R.respawn_wait - 1);
  assert.notDeepEqual(k.player.pos, [0, 0, 0]);
  step(k, IDLE);
  assert.deepEqual(k.player.pos, [0, 0, 0]);
  assert.equal(k.player.invuln, 90);
});

test('P2b falling with the last flame loses at once', () => {
  const g = createGame(1, quiet({ player: { pos: [39.5, 0, 0], flames: 1 } }));
  const ev = run(g, 200, { ...IDLE, move: [1, 0] });
  assert.deepEqual(ev.at(-1).data, { result: 'lost', reason: 'no_flames' });
});

test('P3 dropped motes live 480 ticks and can be picked up again', () => {
  const g = createGame(1, quiet({ motes: [{ pos: [10, 0, 10], kind: 'dropped' }] }));
  run(g, R.dropped_ttl - 1);
  assert.equal(g.motes.length, 1);
  run(g, 1);
  assert.equal(g.motes.length, 0);
  const h = createGame(1, quiet({ motes: [{ pos: [0, 0, 0.5], kind: 'dropped' }] }));
  assert.equal(run(h, 1).filter((e) => e.name === 'mote_picked').length, 1);
});

test('P3b hit shade recoils 2 m over 60 ticks and does no damage meanwhile', () => {
  const g = createGame(1, quiet({ player: { invuln_ticks: 0 }, shades: [{ id: 'S1', pos: [0.5, 1, 0] }] }));
  run(g, 1);
  assert.equal(g.shades[0].state, 'recoil');
  const x0 = g.shades[0].pos[0];
  run(g, 59);
  assert.ok(near(g.shades[0].pos[0] - x0, 2 * 59 / 60, 1e-6));
});

test('P4 pulse again refreshes stun; spawning shade schedule (2 at tick 300, then every 480, ids S1..)', () => {
  const g = createGame(1, quiet({ player: { carried: 9 }, shades: [{ pos: [2, 1, 0] }] }));
  step(g, { ...IDLE, pulse: true });
  run(g, 179);
  step(g, { ...IDLE, pulse: true });
  assert.equal(g.shades[0].state, 'stunned');
  assert.equal(g.shades[0].t, 120);
  const s = createGame(1, { random_motes: false, random_drifters: false });
  const ev = run(s, 300);
  assert.deepEqual(ev.filter((e) => e.name === 'shade_spawned').map((e) => [e.tick, e.data.id]), [[300, 'S1'], [300, 'S2']]);
  assert.ok(s.shades.every((sh) => sh.state === 'spawning' && Math.hypot(sh.pos[0], sh.pos[2]) > 36.9));
  const ev2 = run(s, 480);
  assert.deepEqual(ev2.filter((e) => e.name === 'shade_spawned').map((e) => [e.tick, e.data.id]), [[780, 'S3']]);
});

test('P5 lighting a lantern evicts shades inside its 6 m zone within 30 ticks, no damage meanwhile', () => {
  const g = createGame(1, quiet({ player: { carried: 10 }, lanterns: [{ id: 'L1', pos: [0, 0, 1.5] }], shades: [{ id: 'S1', pos: [0, 1, 3] }] }));
  const ev = run(g, 1, { ...IDLE, interact: true });
  assert.ok(ev.some((e) => e.name === 'lantern_lit'));
  const ev2 = run(g, 29);
  assert.equal(ev2.filter((e) => e.name === 'player_hit').length, 0);
  assert.ok(Math.hypot(g.shades[0].pos[0], g.shades[0].pos[2] - 1.5) >= T.safe_radius - 1e-9);
  const ev3 = run(g, 300);
  assert.equal(ev3.filter((e) => e.name === 'player_hit').length, 0, 'player inside the zone stays safe');
});

test('P6 Gió Lạc: idle -> chase (>=5 carried, <=15 m) -> steals min(3,n) -> flee 240 ticks -> removed', () => {
  const g = createGame(1, quiet({ player: { carried: 6 }, drifters: [{ pos: [6, 1.2, 0] }] }), 2);
  const ev = run(g, 60);
  const steal = ev.find((e) => e.name === 'drifter_steal');
  assert.deepEqual(steal.data, { drifter_id: 'D1', amount: 3, carried: 3 });
  // 6 m away at 7 m/s, touch at <= 1.2 m: needs ceil((6 - 1.2) / (7/60)) = 42 moves -> tick 42
  assert.equal(steal.tick, 42);
  assert.equal(g.drifters[0].state, 'flee');
  run(g, 240);
  assert.equal(g.drifters[0].state, 'removed');
  const idle = createGame(1, quiet({ player: { carried: 4 }, drifters: [{ pos: [6, 1.2, 0] }] }), 2);
  run(idle, 60);
  assert.equal(idle.drifters[0].state, 'idle', 'carrying < 5 does not attract it');
});

test('P6b pulse on a chasing drifter -> flee without stealing; on a fleeing one with loot -> drops it', () => {
  const g = createGame(1, quiet({ player: { carried: 8 }, drifters: [{ pos: [4, 1.2, 0], state: 'chase' }] }), 2);
  const ev = step(g, { ...IDLE, pulse: true });
  assert.equal(g.drifters[0].state, 'flee');
  assert.equal(ev.filter((e) => e.name === 'drifter_steal').length, 0);
  const h = createGame(1, quiet({ player: { carried: 3 }, drifters: [{ pos: [3, 1.2, 0], state: 'flee', stolen: 3 }] }), 2);
  const ev2 = step(h, { ...IDLE, pulse: true });
  assert.deepEqual(ev2.find((e) => e.name === 'drifter_drop').data, { drifter_id: 'D1', amount: 3 });
  assert.equal(h.motes.filter((m) => m.kind === 'dropped').length, 3);
  run(h, 120);
  assert.equal(h.drifters[0].state, 'removed');
});

test('P7 Bùa Gió: 600 ticks, speed 7.2, dash without cooldown, respawns after 2700 ticks', () => {
  const g = createGame(1, quiet({ player: { pos: [35, 0, 0] } }), 2);
  const ev = step(g, IDLE);
  assert.deepEqual(ev.find((e) => e.name === 'charm_picked').data, { charm_id: 'C1', charm_ticks: 600 });
  const x0 = g.player.pos[0];
  run(g, 60, { ...IDLE, move: [-1, 0] }); // -X along the bridge
  assert.ok(near(x0 - g.player.pos[0], R.charm_speed));
  let dashes = 0;
  for (let i = 0; i < 30; i++) dashes += step(g, { ...IDLE, dash: i % 14 === 0 }).filter((e) => e.name === 'dash').length;
  assert.equal(dashes, 3);
  assert.equal(snapshot(g).charms[0].available, false);
  run(g, R.charm_respawn - 91); // picked at tick 1; 1 + 60 + 30 + 2609 = tick 2700
  assert.equal(g.charms[0].available, false);
  run(g, 1); // tick 2701 = 2700 ticks after pickup
  assert.equal(g.charms[0].available, true);
});

test('P8 pause: tick grows, sim_tick and time stand still, snapshot says paused', () => {
  const g = createGame(1, quiet());
  run(g, 5);
  const ev = step(g, { ...IDLE, pause: true });
  assert.deepEqual(ev.map((e) => e.name), ['paused']);
  run(g, 10, { ...IDLE, move: [0, 1] });
  const s = snapshot(g);
  assert.equal(s.state, 'paused');
  assert.equal(s.tick, 16);
  assert.equal(s.sim_tick, 5);
  assert.equal(s.player.pos[2], 0);
  const ev2 = step(g, { ...IDLE, pause: true });
  assert.deepEqual(ev2.map((e) => e.name), ['resumed']);
  assert.equal(g.simTick, 6);
});

test('P9 night 2: jump pad (20,0,18) throws Mây onto island B in ~1.4 s; bridge walkable, off the bridge falls', () => {
  const g = createGame(1, quiet({ player: { pos: [20, 0, 18] } }), 2);
  let t = 0;
  step(g, IDLE);
  while (!g.player.grounded && t < 200) { step(g, IDLE); t++; }
  assert.ok(Math.hypot(g.player.pos[0] - 70, g.player.pos[2]) <= 28, `landed at ${g.player.pos}`);
  assert.ok(t >= 80 && t <= 90, `flight ${t} ticks`);
  const b = createGame(1, quiet({ player: { pos: [24, 0, 0] }, charms: [] }), 2); // no charm: it would speed Mây up
  run(b, 180, { ...IDLE, move: [1, 0] });
  assert.ok(near(b.player.pos[0], 42) && b.player.grounded && b.player.pos[1] === 0);
  const f = createGame(1, quiet({ player: { pos: [35, 0, 0] }, charms: [] }), 2);
  const ev = run(f, 200, { ...IDLE, move: [0, 1] });
  assert.ok(ev.some((e) => e.name === 'player_hit' && e.data.by === 'fall'));
});

test('P10 night 3: cliffs block, 30° ramp climbs to tier 1, pad (0,3,13) lands on tier 2, wind blows at 1800', () => {
  const w = createGame(1, quiet({ player: { pos: [0, 0, 27] } }), 3);
  run(w, 120, { ...IDLE, move: [0, -1] });
  assert.ok(w.player.pos[2] >= 24 - 1e-9 && w.player.pos[1] === 0, 'tier-1 cliff blocks walking up');
  const a = Math.PI / 6;
  const r = createGame(1, quiet({ player: { pos: [31 * Math.cos(a), 0, 31 * Math.sin(a)] } }), 3);
  run(r, 90, { ...IDLE, move: [-Math.cos(a), -Math.sin(a)] });
  assert.ok(near(r.player.pos[1], 3) && r.player.grounded, `on tier 1, y=${r.player.pos[1]}`);
  const p = createGame(1, quiet({ player: { pos: [0, 3, 13] } }), 3);
  step(p, IDLE);
  let t = 0;
  while (!p.player.grounded && t < 200) { step(p, IDLE); t++; }
  assert.ok(near(p.player.pos[1], 6) && Math.hypot(p.player.pos[0], p.player.pos[2]) <= 8, `pad landing ${p.player.pos}`);
  const wind = createGame(1, { ...quiet(), wind_enabled: true }, 3);
  run(wind, 1679);
  assert.equal(snapshot(wind).wind.dir_deg, null);
  run(wind, 1);
  assert.notEqual(snapshot(wind).wind.dir_deg, null, 'warning starts 2 s early');
  run(wind, 120);
  assert.equal(snapshot(wind).wind.active, true);
  const x0 = wind.player.pos[0], z0 = wind.player.pos[2];
  run(wind, 60);
  assert.ok(near(Math.hypot(wind.player.pos[0] - x0, wind.player.pos[2] - z0), R.wind_speed, 1e-6));
});

test('P11 win is checked after the tick: all lit on the very last tick still wins', () => {
  const lit = ['L2', 'L3', 'L4', 'L5'].map((id) => ({ id, lit: true }));
  const g = createGame(1, quiet({ player: { carried: 10 }, lanterns: [{ id: 'L1', pos: [0, 0, 1] }, ...lit], time_left_s: 1 / 60 }));
  const ev = step(g, { ...IDLE, interact: true });
  assert.deepEqual(ev.at(-1).data, { result: 'won', reason: 'all_lit' });
});

test('P12 nights 2 and 3 load their standard lanterns and spawn points', () => {
  const n2 = snapshot(createGame(1, {}, 2));
  const n3 = snapshot(createGame(1, {}, 3));
  assert.deepEqual(n2.lanterns.map((l) => l.id), ['L1', 'L2', 'L3', 'L4', 'L5', 'L6']);
  assert.deepEqual(n3.lanterns.map((l) => l.pos), [[0, 6, 6], [18, 3, 10], [-18, 3, 10], [35, 0, -10], [-35, 0, -10], [20, 0, -35], [-20, 0, -35]]);
  assert.equal(n2.motes.length, 20);
  assert.equal(n3.charms.length, 2);
  assert.equal(n2.time_left_s, 330);
  assert.equal(n3.time_left_s, 360);
});
