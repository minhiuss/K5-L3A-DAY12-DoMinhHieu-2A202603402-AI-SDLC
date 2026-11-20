// Pure game logic for Đảo Đèn Lồng. No DOM, no three.js: the window (src/main.js)
// and the headless runner (headless.mjs) both drive this same code at 60 Hz.
// Rule order inside one step is documented in docs/notes/phase-1.md §3.
import { TUNING, WORLD } from './tuning.js';

export const TICK_HZ = 60;
const DT = 1 / TICK_HZ;
const LANTERN_IDS = ['L1', 'L2', 'L3', 'L4', 'L5'];
const BUTTONS = ['jump', 'interact', 'pulse'];

export class ScenarioError extends Error {}

// Seeded RNG (mulberry32): same seed -> same sequence on every machine.
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const secToTicks = (s) => Math.round(s * TICK_HZ);
const distXZ = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(isNum);
const isCount = (v) => Number.isInteger(v) && v >= 0;

function randomOnIsland(rng, rMin, rMax) {
  const r = Math.sqrt(rMin * rMin + rng() * (rMax * rMax - rMin * rMin));
  const ang = rng() * Math.PI * 2;
  return [r * Math.sin(ang), 0, r * Math.cos(ang)];
}

function defaultLanterns() {
  return LANTERN_IDS.map((id, k) => {
    const ang = (k * 2 * Math.PI) / 5;
    const R = WORLD.lantern_ring_radius;
    return { id, pos: [R * Math.sin(ang), 0, R * Math.cos(ang)], lit: false, deposited: 0 };
  });
}

// Build the start state. Building a scenario emits no events and awards no points.
export function createGame(seed = 0, scenario = {}) {
  if (scenario === null || typeof scenario !== 'object' || Array.isArray(scenario)) {
    throw new ScenarioError('scenario must be a JSON object');
  }
  const T = TUNING;
  const rng = makeRng(seed);
  const g = {
    tick: 0,
    state: 'playing',
    score: 0,
    startTime: T.night1_duration_s,
    rng,
    player: { pos: [0, 0, 0], vy: 0, grounded: true, carried: 0, flames: T.flames, invuln: 0, pulseCd: 0 },
    lanterns: defaultLanterns(),
    motes: [],
    shades: [],
    nextMoteId: 1,
    nextShadeNum: 1,
    randomMotes: scenario.random_motes !== false,
    randomShades: scenario.random_shades !== false,
    shadeTimer: secToTicks(WORLD.shade_first_spawn_s),
    moteTimer: secToTicks(WORLD.mote_respawn_s),
    prev: { jump: false, interact: false, pulse: false },
  };

  for (const key of ['random_motes', 'random_shades']) {
    if (key in scenario && typeof scenario[key] !== 'boolean') throw new ScenarioError(`${key} must be boolean`);
  }

  // player
  if ('player' in scenario) {
    const p = scenario.player;
    if (p === null || typeof p !== 'object' || Array.isArray(p)) throw new ScenarioError('player must be an object');
    if ('pos' in p) {
      if (!isVec3(p.pos)) throw new ScenarioError('player.pos must be [x,y,z]');
      g.player.pos = [p.pos[0], Math.max(0, p.pos[1]), p.pos[2]];
      g.player.grounded = g.player.pos[1] === 0;
    }
    if ('carried' in p) {
      if (!isCount(p.carried)) throw new ScenarioError('player.carried must be an integer >= 0');
      g.player.carried = p.carried;
    }
    if ('flames' in p) {
      if (!isCount(p.flames)) throw new ScenarioError('player.flames must be an integer >= 0');
      g.player.flames = p.flames;
    }
  }

  // motes: a listed array replaces the default list
  if ('motes' in scenario) {
    if (!Array.isArray(scenario.motes)) throw new ScenarioError('motes must be an array');
    for (const m of scenario.motes) {
      if (!isVec3(m)) throw new ScenarioError('each mote must be [x,y,z]');
      g.motes.push({ id: g.nextMoteId++, pos: [m[0], 0, m[2]] });
    }
  } else if (g.randomMotes) {
    for (let i = 0; i < WORLD.default_motes; i++) {
      g.motes.push({ id: g.nextMoteId++, pos: randomOnIsland(rng, WORLD.mote_min_r, WORLD.mote_max_r) });
    }
  }

  // shades: a listed array replaces the default list, listed shades start active
  if ('shades' in scenario) {
    if (!Array.isArray(scenario.shades)) throw new ScenarioError('shades must be an array');
    const used = new Set();
    for (const s of scenario.shades) {
      if (s === null || typeof s !== 'object' || !isVec3(s.pos)) throw new ScenarioError('each shade needs pos [x,y,z]');
      if ('id' in s && (typeof s.id !== 'string' || s.id === '' || used.has(s.id))) {
        throw new ScenarioError('shade id must be a unique non-empty string');
      }
      if ('id' in s) used.add(s.id);
      g.shades.push({ id: s.id, pos: [...s.pos], state: 'chase', stun: 0 });
    }
    for (const s of g.shades) {
      if (s.id === undefined) {
        while (used.has(`S${g.nextShadeNum}`)) g.nextShadeNum++;
        s.id = `S${g.nextShadeNum++}`;
        used.add(s.id);
      }
    }
    g.usedShadeIds = used;
  }
  g.usedShadeIds ??= new Set();

  // lanterns: updated by id, unmentioned ones keep their state
  if ('lanterns' in scenario) {
    if (!Array.isArray(scenario.lanterns)) throw new ScenarioError('lanterns must be an array');
    for (const l of scenario.lanterns) {
      if (l === null || typeof l !== 'object') throw new ScenarioError('each lantern must be an object');
      const target = g.lanterns.find((x) => x.id === l.id);
      if (!target) throw new ScenarioError(`unknown lantern id: ${l.id}`);
      if ('pos' in l) {
        if (!isVec3(l.pos)) throw new ScenarioError('lantern pos must be [x,y,z]');
        target.pos = [...l.pos];
      }
      if ('deposited' in l) {
        if (!isCount(l.deposited)) throw new ScenarioError('lantern deposited must be an integer >= 0');
        target.deposited = Math.min(l.deposited, T.lantern_cost);
      }
      if ('lit' in l) {
        if (typeof l.lit !== 'boolean') throw new ScenarioError('lantern lit must be boolean');
        target.lit = l.lit;
      }
      if (target.deposited >= T.lantern_cost) target.lit = true;
      if (target.lit) target.deposited = T.lantern_cost;
    }
  }

  if ('time_left_s' in scenario) {
    if (!isNum(scenario.time_left_s) || scenario.time_left_s <= 0) throw new ScenarioError('time_left_s must be > 0');
    g.startTime = scenario.time_left_s;
  }
  return g;
}

export const timeLeft = (g) => g.startTime - g.tick / TICK_HZ;

function spawnShade(g, emit) {
  while (g.usedShadeIds.has(`S${g.nextShadeNum}`)) g.nextShadeNum++;
  const id = `S${g.nextShadeNum++}`;
  g.usedShadeIds.add(id);
  const ang = g.rng() * Math.PI * 2;
  const R = WORLD.shade_spawn_r;
  g.shades.push({ id, pos: [R * Math.sin(ang), WORLD.shade_y, R * Math.cos(ang)], state: 'chase', stun: 0 });
  emit('shade_spawned', { id });
}

function endGame(g, emit, result, reason) {
  g.state = result;
  emit('game_over', { result, reason });
}

// One fixed step. input = held state for this tick:
// { move:[x,z], cam_yaw_deg, jump, interact, pulse }. Returns events stamped tick+1.
export function step(g, input) {
  const events = [];
  if (g.state !== 'playing') return events;
  const T = TUNING;
  const p = g.player;
  const stamp = g.tick + 1;
  const emit = (name, data) => events.push({ type: 'event', tick: stamp, name, data });

  // 1. timers
  if (p.invuln > 0) p.invuln--;
  if (p.pulseCd > 0) p.pulseCd--;

  // 2. button edges (false -> true)
  const edge = {};
  for (const b of BUTTONS) {
    const held = !!input[b];
    edge[b] = held && !g.prev[b];
    g.prev[b] = held;
  }

  // 3. move + jump (move rotated by camera yaw, normalized if longer than 1)
  let [mx, mz] = input.move ?? [0, 0];
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const th = ((input.cam_yaw_deg ?? 0) * Math.PI) / 180;
  const c = Math.cos(th), s = Math.sin(th);
  p.pos[0] += (mx * c + mz * s) * T.player_speed * DT;
  p.pos[2] += (-mx * s + mz * c) * T.player_speed * DT;
  const r = Math.hypot(p.pos[0], p.pos[2]);
  if (r > WORLD.island_radius) {
    p.pos[0] *= WORLD.island_radius / r;
    p.pos[2] *= WORLD.island_radius / r;
  }
  if (edge.jump && p.grounded) { p.vy = WORLD.jump_speed; p.grounded = false; }
  if (!p.grounded) {
    p.vy -= WORLD.gravity * DT;
    p.pos[1] += p.vy * DT;
    if (p.pos[1] <= 0) { p.pos[1] = 0; p.vy = 0; p.grounded = true; }
  }

  // 4. pick up motes
  for (let i = 0; i < g.motes.length && p.carried < T.carry_capacity; ) {
    if (distXZ(p.pos, g.motes[i].pos) <= T.pickup_radius) {
      g.motes.splice(i, 1);
      p.carried++;
      g.score += T.score.per_mote;
      emit('mote_picked', { carried: p.carried });
    } else i++;
  }

  // 5. interact -> deposit into the nearest unlit lantern in range
  if (edge.interact && p.carried > 0) {
    let best = null, bestD = Infinity;
    for (const l of g.lanterns) {
      const d = distXZ(p.pos, l.pos);
      if (!l.lit && d <= T.interact_radius && d < bestD) { best = l; bestD = d; }
    }
    if (best) {
      const amount = Math.min(p.carried, T.lantern_cost - best.deposited);
      p.carried -= amount;
      best.deposited += amount;
      emit('deposit', { lantern_id: best.id, amount, deposited: best.deposited });
      if (best.deposited >= T.lantern_cost) {
        best.lit = true;
        g.score += T.score.per_lantern;
        emit('lantern_lit', { lantern_id: best.id });
        if (g.lanterns.every((l) => l.lit)) {
          const left = g.startTime - stamp / TICK_HZ;
          g.score += T.score.per_second_left * Math.floor(Math.max(0, left)) + T.score.per_flame_left * p.flames;
          endGame(g, emit, 'won', 'all_lit');
          g.tick = stamp;
          return events;
        }
      }
    }
  }

  // 6. pulse: costs light, stuns + pushes shades in range
  if (edge.pulse && p.pulseCd === 0 && p.carried >= T.pulse_cost) {
    p.carried -= T.pulse_cost;
    p.pulseCd = secToTicks(T.pulse_cooldown_s);
    const stunned = [];
    for (const sh of g.shades) {
      if (distXZ(p.pos, sh.pos) <= T.pulse_radius) {
        sh.state = 'stunned';
        sh.stun = secToTicks(T.pulse_stun_s);
        let dx = sh.pos[0] - p.pos[0], dz = sh.pos[2] - p.pos[2];
        const d = Math.hypot(dx, dz);
        if (d === 0) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
        sh.pos[0] += dx * T.pulse_push_m;
        sh.pos[2] += dz * T.pulse_push_m;
        stunned.push(sh.id);
        g.score += T.score.per_stun;
      }
    }
    emit('pulse', { stunned_ids: stunned.sort() });
  }

  // 7. shades: recover, chase, stay out of lantern safe radius
  for (const sh of g.shades) {
    if (sh.state === 'stunned') {
      sh.stun--;
      if (sh.stun <= 0) { sh.state = 'chase'; sh.stun = 0; }
      continue;
    }
    const dx = p.pos[0] - sh.pos[0], dz = p.pos[2] - sh.pos[2];
    const d = Math.hypot(dx, dz);
    const stepLen = Math.min(d, T.shade_speed * DT);
    if (d > 0) { sh.pos[0] += (dx / d) * stepLen; sh.pos[2] += (dz / d) * stepLen; }
    for (const l of g.lanterns) {
      const ld = distXZ(sh.pos, l.pos);
      if (ld < T.safe_radius) {
        let ox = sh.pos[0] - l.pos[0], oz = sh.pos[2] - l.pos[2];
        if (ld === 0) { ox = 1; oz = 0; } else { ox /= ld; oz /= ld; }
        sh.pos[0] = l.pos[0] + ox * T.safe_radius;
        sh.pos[2] = l.pos[2] + oz * T.safe_radius;
      }
    }
  }

  // 8. hits
  if (p.invuln === 0) {
    const hitter = g.shades.find((sh) => sh.state !== 'stunned' && distXZ(p.pos, sh.pos) <= T.shade_hit_radius);
    if (hitter) {
      p.flames = Math.max(0, p.flames - 1);
      const dropped = Math.floor(p.carried * T.hit_drop_ratio);
      p.carried -= dropped;
      p.invuln = secToTicks(T.invuln_s);
      emit('player_hit', { by: 'shade', flames: p.flames, dropped });
      if (p.flames === 0) {
        endGame(g, emit, 'lost', 'no_flames');
        g.tick = stamp;
        return events;
      }
    }
  }

  // 9. spawns
  if (g.randomShades) {
    g.shadeTimer--;
    if (g.shadeTimer <= 0) {
      if (g.shades.length < WORLD.shade_max) spawnShade(g, emit);
      g.shadeTimer = secToTicks(WORLD.shade_spawn_every_s);
    }
  }
  if (g.randomMotes && g.motes.length < WORLD.default_motes) {
    g.moteTimer--;
    if (g.moteTimer <= 0) {
      g.motes.push({ id: g.nextMoteId++, pos: randomOnIsland(g.rng, WORLD.mote_min_r, WORLD.mote_max_r) });
      g.moteTimer = secToTicks(WORLD.mote_respawn_s);
    }
  }

  // 10. dawn
  g.tick = stamp;
  if (timeLeft(g) <= 1e-9) endGame(g, emit, 'lost', 'dawn');
  return events;
}

const r3 = (v) => {
  const x = Math.round(v * 1000) / 1000;
  return Object.is(x, -0) ? 0 : x;
};
const v3 = (p) => p.map(r3);

export function snapshot(g) {
  return {
    type: 'snapshot',
    tick: g.tick,
    sim_tick: g.tick,
    state: g.state,
    time_left_s: r3(Math.max(0, timeLeft(g))),
    score: g.score,
    player: { pos: v3(g.player.pos), flames: g.player.flames, carried: g.player.carried },
    lanterns: g.lanterns.map((l) => ({ id: l.id, pos: v3(l.pos), lit: l.lit, deposited: l.deposited })),
    shades: g.shades.map((s) => ({ id: s.id, pos: v3(s.pos), state: s.state })),
    motes_active: g.motes.length,
    motes: g.motes.map((m) => v3(m.pos)),
  };
}
