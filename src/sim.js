// Pure game logic for Đảo Đèn Lồng, Test Contract v1.1. No DOM, no three.js: the window
// (src/main.js) and the headless runner (headless.mjs) drive this same code at 60 Hz.
// One step follows Ticket-02's 12-phase order exactly (numbered comments below).
// Assumptions B1..B21: docs/notes/phase-2.md.
import { TUNING as T, RULES as R } from './tuning.js';
import { MAPS, nightDuration, supportAt, wallAt, topAt } from './maps.js';

export const TICK_HZ = 60;
const DT = 1 / TICK_HZ;
const BUTTONS = ['jump', 'interact', 'pulse', 'dash', 'pause'];
const SHADE_STATES = ['spawning', 'wander', 'chase', 'recoil', 'stunned', 'drain'];
const DRIFTER_STATES = ['idle', 'chase', 'flee', 'removed'];

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

const ticks = (s) => Math.round(s * TICK_HZ);
const distXZ = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(isNum);
const isCount = (v) => Number.isInteger(v) && v >= 0;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
function dirXZ(from, to) {
  const dx = to[0] - from[0], dz = to[2] - from[2];
  const d = Math.hypot(dx, dz);
  return d === 0 ? [1, 0] : [dx / d, dz / d];
}

function need(cond, msg) {
  if (!cond) throw new ScenarioError(msg);
}

// v1.2 fuel is stored as integer 1/60 units (ADR-001): 100 fuel = 6000.
const FUEL_MAX = T.fuel_max * TICK_HZ;
const FUEL_LOW = T.low_fuel_threshold * TICK_HZ;
const FUEL_PER_MOTE = T.fuel_per_mote * TICK_HZ;
const zoneActive = (l) => l.lit && l.fuel >= FUEL_LOW; // exactly 30 still protects
const lightCost = (l) => (l.everLit ? T.relight_cost : T.lantern_cost);
export const capacityOf = (p) => Math.min(T.capacity_max, R.capacity_base + R.capacity_per_light * p.lights);

// ---------- build ----------
export function createGame(seed = 0, scenario = {}, night = 1) {
  need(isObj(scenario), 'scenario must be a JSON object');
  const map = MAPS[night];
  need(map, `unknown night ${night}`);
  const rng = makeRng(seed);
  for (const k of ['random_motes', 'random_shades', 'random_drifters', 'wind_enabled']) {
    need(!(k in scenario) || typeof scenario[k] === 'boolean', `${k} must be boolean`);
  }
  const g = {
    night, map, rng,
    tick: 0, simTick: 0, state: 'playing', score: 0,
    startTime: nightDuration(T, night),
    player: {
      pos: [...map.start], vy: 0, vel: [0, 0, 0], grounded: true, facing: [0, 1],
      carried: 0, flames: T.flames, invuln: 0, dashCd: 0, pulseCd: 0, charm: 0,
      dash: 0, dashDir: [0, 1], launch: null, wait: 0, lights: 0,
    },
    lanterns: map.lanterns.map((l) => ({ id: l.id, pos: [...l.pos], lit: false, deposited: 0, fuel: 0, everLit: false, relitCount: 0 })),
    motes: [], nextMote: 1,
    shades: [], nextShade: 1, shadeIds: new Set(),
    drifters: [], nextDrifter: 1,
    charms: map.charms.map((c) => ({ id: c.id, pos: [...c.pos], available: true, respawn: 0 })),
    randomMotes: scenario.random_motes !== false,
    randomShades: scenario.random_shades !== false,
    randomDrifters: scenario.random_drifters !== false,
    windEnabled: 'wind_enabled' in scenario ? scenario.wind_enabled : map.wind,
    wind: { active: false, warn: false, dir: null },
    prev: Object.fromEntries(BUTTONS.map((b) => [b, false])),
  };
  const p = g.player;

  if ('player' in scenario) {
    const sp = scenario.player;
    need(isObj(sp), 'player must be an object');
    if ('pos' in sp) { need(isVec3(sp.pos), 'player.pos must be [x,y,z]'); p.pos = [...sp.pos]; }
    const counts = { carried: 'carried', flames: 'flames', invuln_ticks: 'invuln', dash_cd_ticks: 'dashCd', pulse_cd_ticks: 'pulseCd', charm_ticks: 'charm', successful_lights: 'lights' };
    for (const [k, field] of Object.entries(counts)) {
      if (k in sp) { need(isCount(sp[k]), `player.${k} must be an integer >= 0`); p[field] = sp[k]; }
    }
  }
  const sup = supportAt(map, p.pos[0], p.pos[2], p.pos[1], 1e-6);
  p.grounded = sup !== null && Math.abs(p.pos[1] - sup) < 1e-6;

  // motes: listed array replaces the default 20
  if ('motes' in scenario) {
    need(Array.isArray(scenario.motes), 'motes must be an array');
    for (const m of scenario.motes) {
      const pos = Array.isArray(m) ? m : m?.pos;
      need(isVec3(pos), 'each mote must be [x,y,z] or {pos:[x,y,z]}');
      const kind = isObj(m) && m.kind === 'dropped' ? 'dropped' : 'random';
      const ttl = kind === 'dropped' ? (isObj(m) && isNum(m.ttl_s) ? ticks(m.ttl_s) : R.dropped_ttl) : null;
      g.motes.push({ id: `M${g.nextMote++}`, pos: [...pos], kind, ttl });
    }
  } else if (g.randomMotes) {
    const pts = map.motePoints.map((q) => [...q]);
    for (let i = 0; i < Math.min(R.mote_start, pts.length); i++) {
      const j = i + Math.floor(rng() * (pts.length - i));
      [pts[i], pts[j]] = [pts[j], pts[i]];
      g.motes.push({ id: `M${g.nextMote++}`, pos: pts[i], kind: 'random', ttl: null });
    }
  }

  // shades: listed array replaces the default (none); listed shades start active
  if ('shades' in scenario) {
    need(Array.isArray(scenario.shades), 'shades must be an array');
    for (const s of scenario.shades) {
      need(isObj(s) && isVec3(s.pos), 'each shade needs pos [x,y,z]');
      if ('id' in s) need(typeof s.id === 'string' && s.id !== '' && !g.shadeIds.has(s.id), 'shade id must be a unique non-empty string');
      const state = s.state ?? 'wander';
      need(SHADE_STATES.includes(state), `shade state must be one of ${SHADE_STATES.join(', ')}`);
      if ('state_ticks_left' in s) need(isCount(s.state_ticks_left), 'state_ticks_left must be an integer >= 0');
      const defT = { spawning: R.shade_spawning_ticks, recoil: R.shade_recoil_ticks, stunned: ticks(T.pulse_stun_s) }[state] ?? 0;
      const sh = { id: s.id, pos: [...s.pos], state, t: s.state_ticks_left ?? defT, push: 0, pushDir: [1, 0], recoilDir: dirXZ(p.pos, s.pos), evict: 0, evictFrom: null, targetId: null, drainTicks: 0 };
      if ('target_lantern_id' in s) {
        need(map.lanterns.some((l) => l.id === s.target_lantern_id), `unknown target_lantern_id: ${s.target_lantern_id}`);
        sh.targetId = s.target_lantern_id;
      }
      if (s.id) g.shadeIds.add(s.id);
      g.shades.push(sh);
    }
    for (const sh of g.shades) if (sh.id === undefined) sh.id = nextShadeId(g);
  }

  if ('drifters' in scenario) {
    need(Array.isArray(scenario.drifters), 'drifters must be an array');
    for (const d of scenario.drifters) {
      need(isObj(d) && isVec3(d.pos), 'each drifter needs pos [x,y,z]');
      const state = d.state ?? 'idle';
      need(DRIFTER_STATES.includes(state), `drifter state must be one of ${DRIFTER_STATES.join(', ')}`);
      if ('stolen' in d) need(isCount(d.stolen), 'drifter stolen must be an integer >= 0');
      if ('state_ticks_left' in d) need(isCount(d.state_ticks_left), 'state_ticks_left must be an integer >= 0');
      g.drifters.push({
        id: typeof d.id === 'string' && d.id ? d.id : `D${g.nextDrifter}`,
        pos: [...d.pos], home: [...d.pos], phase: 0, state, stolen: d.stolen ?? 0,
        t: d.state_ticks_left ?? (state === 'flee' ? R.drifter_flee_ticks : 0), stoleOnce: (d.stolen ?? 0) > 0,
      });
      g.nextDrifter++;
    }
  }

  if ('charms' in scenario) {
    need(Array.isArray(scenario.charms), 'charms must be an array');
    g.charms = scenario.charms.map((c) => {
      need(isObj(c) && typeof c.id === 'string', 'each charm needs an id');
      const def = map.charms.find((x) => x.id === c.id);
      const pos = c.pos ?? def?.pos;
      need(isVec3(pos), `charm ${c.id} needs pos [x,y,z]`);
      if ('available' in c) need(typeof c.available === 'boolean', 'charm available must be boolean');
      return { id: c.id, pos: [...pos], available: c.available ?? true, respawn: isCount(c.respawn_ticks) ? c.respawn_ticks : 0 };
    });
  }

  if ('lanterns' in scenario) {
    need(Array.isArray(scenario.lanterns), 'lanterns must be an array');
    for (const l of scenario.lanterns) {
      need(isObj(l), 'each lantern must be an object');
      const tgt = g.lanterns.find((x) => x.id === l.id);
      need(tgt, `unknown lantern id: ${l.id}`);
      if ('pos' in l) { need(isVec3(l.pos), 'lantern pos must be [x,y,z]'); tgt.pos = [...l.pos]; }
      if ('ever_lit' in l) { need(typeof l.ever_lit === 'boolean', 'lantern ever_lit must be boolean'); tgt.everLit = l.ever_lit; }
      if ('deposited' in l) { need(isCount(l.deposited), 'lantern deposited must be an integer >= 0'); tgt.deposited = Math.min(l.deposited, lightCost(tgt)); }
      if ('lit' in l) { need(typeof l.lit === 'boolean', 'lantern lit must be boolean'); tgt.lit = l.lit; }
      if ('fuel' in l) { need(isNum(l.fuel) && l.fuel >= 0 && l.fuel <= T.fuel_max, 'lantern fuel must be 0..100'); }
      if (tgt.deposited >= lightCost(tgt)) tgt.lit = true;
      if (tgt.lit) {
        tgt.deposited = lightCost(tgt);
        tgt.fuel = 'fuel' in l ? Math.round(l.fuel * TICK_HZ) : FUEL_MAX; // lit without fuel -> 100
        if (!('ever_lit' in l)) tgt.everLit = true; // assumption C7
        if (tgt.fuel <= 0) { tgt.lit = false; tgt.fuel = 0; tgt.deposited = 0; }
      } else tgt.fuel = 0;
    }
  }

  if ('time_left_s' in scenario) {
    need(isNum(scenario.time_left_s) && scenario.time_left_s > 0, 'time_left_s must be > 0');
    g.startTime = scenario.time_left_s;
  }
  return g;
}

function nextShadeId(g) {
  while (g.shadeIds.has(`S${g.nextShade}`)) g.nextShade++;
  const id = `S${g.nextShade++}`;
  g.shadeIds.add(id);
  return id;
}

export const timeLeft = (g) => g.startTime - g.simTick / TICK_HZ;

function groundUnder(g, x, z, y) {
  const s = supportAt(g.map, x, z, y, R.step_up);
  return s === null ? y : s;
}
function addDropped(g, pos) {
  g.motes.push({ id: `M${g.nextMote++}`, pos, kind: 'dropped', ttl: R.dropped_ttl });
}
function glideY(g, x, z, lift) {
  const top = topAt(g.map, x, z);
  return (top === null ? 0 : top) + lift;
}
const insideLitZone = (g, pos) => g.lanterns.find((l) => zoneActive(l) && distXZ(pos, l.pos) < T.safe_radius);
function pushOutOfZones(g, sh) {
  for (const l of g.lanterns) {
    if (!zoneActive(l)) continue;
    const d = distXZ(sh.pos, l.pos);
    if (d < T.safe_radius) {
      const [ox, oz] = d === 0 ? [1, 0] : [(sh.pos[0] - l.pos[0]) / d, (sh.pos[2] - l.pos[2]) / d];
      sh.pos[0] = l.pos[0] + ox * T.safe_radius;
      sh.pos[2] = l.pos[2] + oz * T.safe_radius;
    }
  }
}

// ---------- one tick ----------
export function step(g, input) {
  const events = [];
  if (g.state === 'won' || g.state === 'lost') return events;
  const stamp = g.tick + 1;
  const emit = (name, data) => events.push({ type: 'event', tick: stamp, name, data });
  const p = g.player;
  const map = g.map;

  // 1. read input; pause first
  const edge = {};
  for (const b of BUTTONS) {
    const held = !!input[b];
    edge[b] = held && !g.prev[b];
    g.prev[b] = held;
  }
  if (edge.pause) {
    if (g.state === 'paused') { g.state = 'playing'; emit('resumed', {}); }
    else { g.state = 'paused'; emit('paused', {}); g.tick = stamp; return events; }
  } else if (g.state === 'paused') { g.tick = stamp; return events; }

  // 2. counters: time, cooldowns, invuln, stun/states, charm, dropped TTL, charm respawn, wind
  g.simTick++;
  for (const k of ['invuln', 'dashCd', 'pulseCd', 'charm']) if (p[k] > 0) p[k]--;
  if (p.charm > 0) p.dashCd = 0;
  if (p.wait > 0) {
    p.wait--;
    if (p.wait === 0 && p.flames > 0) {
      p.pos = [...map.start]; p.vy = 0; p.vel = [0, 0, 0]; p.grounded = true;
      p.launch = null; p.dash = 0; p.invuln = ticks(T.invuln_s); p.facing = [0, 1];
    }
  }
  for (const sh of g.shades) {
    if (sh.state === 'spawning' || sh.state === 'recoil' || sh.state === 'stunned') {
      sh.t--;
      if (sh.t <= 0) {
        sh.t = 0; sh.push = 0;
        // v1.2: stun ends in wander; spawning / recoil keep the Phase 2 rule (assumption C5)
        sh.state = sh.state === 'stunned' ? 'wander' : distXZ(sh.pos, p.pos) <= R.shade_detect ? 'chase' : 'wander';
      }
    }
  }
  // v1.2 fuel: lit lanterns burn 1/tick, each draining shade takes 5/tick more (all in 1/60 units)
  for (const l of g.lanterns) {
    if (!l.lit) continue;
    const drainers = g.shades.filter((sh) => sh.state === 'drain' && sh.targetId === l.id);
    l.fuel -= T.fuel_decay_per_s + T.drain_per_s * drainers.length;
    for (const sh of drainers) {
      sh.drainTicks++;
      if (sh.drainTicks % R.drain_event_every === 0) emit('fuel_drain', { lantern_id: l.id, shade_id: sh.id, fuel: r1(Math.max(0, l.fuel)) });
    }
  }
  // right after phase 2: empty lanterns go out
  for (const l of g.lanterns) {
    if (l.lit && l.fuel <= 0) {
      l.lit = false; l.fuel = 0; l.deposited = 0; l.everLit = true;
      emit('lantern_out', { lantern_id: l.id });
    }
  }
  for (const d of g.drifters) {
    if (d.state === 'flee') { d.t--; if (d.t <= 0) { d.state = 'removed'; d.stolen = 0; } }
  }
  g.motes = g.motes.filter((m) => m.kind !== 'dropped' || --m.ttl > 0);
  for (const c of g.charms) if (!c.available && --c.respawn <= 0) { c.available = true; c.respawn = 0; }
  if (g.windEnabled) {
    const m = g.simTick % R.wind_every;
    if (m === R.wind_every - R.wind_warn) g.wind.dir = Math.floor(g.rng() * 360);
    g.wind.active = g.simTick >= R.wind_every && m < R.wind_len;
    g.wind.warn = m >= R.wind_every - R.wind_warn;
    if (!g.wind.active && !g.wind.warn) g.wind.dir = null;
  }

  // 3. move Mây (jump, dash, jump pads, wind) then fall check
  if (p.wait === 0) movePlayer(g, input, edge, emit);

  // 4. pick up motes and charms
  if (p.wait === 0) {
    for (let i = 0; i < g.motes.length && p.carried < capacityOf(p); ) {
      const m = g.motes[i];
      if (distXZ(p.pos, m.pos) <= T.pickup_radius && Math.abs(p.pos[1] - m.pos[1]) <= R.height_tolerance) {
        g.motes.splice(i, 1);
        p.carried++;
        emit('mote_picked', { carried: p.carried });
      } else i++;
    }
    for (const c of g.charms) {
      if (c.available && distXZ(p.pos, c.pos) <= T.pickup_radius && Math.abs(p.pos[1] - c.pos[1]) <= R.height_tolerance) {
        c.available = false;
        c.respawn = R.charm_respawn;
        p.charm = R.charm_ticks;
        p.dashCd = 0;
        emit('charm_picked', { charm_id: c.id, charm_ticks: R.charm_ticks });
      }
    }
  }

  // 5. lanterns: only lanterns that can take fireflies (unlit, or lit and not full);
  //    nearest, ties -> smaller id. Lit -> refuel (v1.2), unlit -> light / relight.
  const refuelUse = (l) => Math.min(p.carried, Math.ceil((FUEL_MAX - l.fuel) / FUEL_PER_MOTE));
  if (edge.interact && p.carried > 0 && p.wait === 0) {
    let best = null, bestD = Infinity;
    for (const l of g.lanterns) {
      const d = distXZ(p.pos, l.pos);
      const accepts = !l.lit || refuelUse(l) > 0;
      if (accepts && d <= T.interact_radius && Math.abs(p.pos[1] - l.pos[1]) <= R.height_tolerance && d < bestD) { best = l; bestD = d; }
    }
    if (best && best.lit) {
      const used = refuelUse(best);
      p.carried -= used;
      best.fuel = Math.min(FUEL_MAX, best.fuel + FUEL_PER_MOTE * used);
      g.score += T.score.per_mote * used;
      emit('refuel', { lantern_id: best.id, amount: used, fuel: r1(best.fuel) });
    } else if (best) {
      const cost = lightCost(best);
      const amount = Math.min(p.carried, cost - best.deposited);
      p.carried -= amount;
      best.deposited += amount;
      g.score += T.score.per_mote * amount;
      emit('deposit', { lantern_id: best.id, amount, deposited: best.deposited });
      if (best.deposited >= cost) {
        const relight = best.everLit;
        best.lit = true;
        best.fuel = FUEL_MAX;
        best.everLit = true;
        if (relight) { best.relitCount++; g.score += R.score_relight; } else g.score += T.score.per_lantern;
        p.lights++;
        emit('lantern_lit', { lantern_id: best.id, relight });
      }
    }
  }

  // 6. safe zones: shades caught inside a lit lantern's zone get evicted over <= 30 ticks
  for (const sh of g.shades) {
    if (sh.evict > 0) continue;
    const l = insideLitZone(g, sh.pos);
    if (l) {
      sh.evict = R.safe_evict_ticks;
      sh.evictFrom = l;
      if (sh.state === 'drain') { sh.state = 'wander'; sh.targetId = null; } // refuelled to >= 30
    }
  }

  // 7. Tỏa Sáng (pulse)
  if (edge.pulse && p.pulseCd === 0 && p.carried >= T.pulse_cost && p.wait === 0) {
    p.carried -= T.pulse_cost;
    p.pulseCd = ticks(T.pulse_cooldown_s);
    const center = [p.pos[0], p.pos[1] + R.pulse_center_y, p.pos[2]];
    const stunned = [];
    for (const sh of g.shades) {
      if (dist3(center, sh.pos) <= T.pulse_radius) {
        g.score += sh.state === 'drain' ? R.score_stun_drain : T.score.per_stun; // v1.2: 15 total if it was draining
        sh.state = 'stunned';
        sh.targetId = null;
        sh.t = ticks(T.pulse_stun_s);
        sh.push = R.shade_push_ticks;
        sh.pushDir = dirXZ(center, sh.pos);
        stunned.push(sh.id);
      }
    }
    emit('pulse', { stunned_ids: stunned });
    for (const d of g.drifters) {
      if (d.state === 'removed' || dist3(center, d.pos) > T.pulse_radius) continue;
      if (d.state === 'chase') { d.state = 'flee'; d.t = R.drifter_flee_ticks; d.stoleOnce = true; }
      else if (d.state === 'flee' && d.stolen > 0) {
        const amount = d.stolen;
        for (let i = 0; i < amount; i++) addDropped(g, [d.pos[0], groundUnder(g, d.pos[0], d.pos[2], d.pos[1]), d.pos[2]]);
        d.stolen = 0;
        d.t = R.drifter_drop_vanish;
        emit('drifter_drop', { drifter_id: d.id, amount });
      }
    }
  }

  // 8. move shades and drifters
  const shadeStep = map.shadeSpeed * DT;
  for (const sh of g.shades) {
    if (sh.evict > 0) {
      const l = sh.evictFrom;
      const d = distXZ(sh.pos, l.pos);
      const [ox, oz] = d === 0 ? [1, 0] : [(sh.pos[0] - l.pos[0]) / d, (sh.pos[2] - l.pos[2]) / d];
      const nd = d + Math.max(0, T.safe_radius - d) / sh.evict;
      sh.pos[0] = l.pos[0] + ox * nd;
      sh.pos[2] = l.pos[2] + oz * nd;
      sh.evict--;
      if (sh.evict === 0) sh.evictFrom = null;
    } else if (sh.state === 'wander' || sh.state === 'chase' || sh.state === 'drain') {
      const d = distXZ(sh.pos, p.pos);
      if (sh.state === 'drain') {
        const l = g.lanterns.find((x) => x.id === sh.targetId);
        if (d <= R.drain_break) sh.state = 'chase';
        else if (!l || !l.lit || l.fuel >= FUEL_LOW || distXZ(sh.pos, l.pos) > R.drain_reach) { sh.state = 'wander'; sh.targetId = null; }
      } else if (sh.state === 'wander' && d <= R.shade_detect) sh.state = 'chase';
      else if (sh.state === 'chase' && d > R.shade_lose) sh.state = 'wander';
      if (sh.state === 'wander') {
        // v1.2: go to the nearest weak lit lantern (fuel < 30), else the nearest unlit one (assumption C1)
        let target = null, best = Infinity;
        for (const l of g.lanterns) {
          const ld = distXZ(sh.pos, l.pos);
          if (l.lit && l.fuel < FUEL_LOW && ld < best) { target = l; best = ld; }
        }
        if (target && best <= R.drain_reach) { sh.state = 'drain'; sh.targetId = target.id; sh.drainTicks = 0; }
        else {
          if (!target) for (const l of g.lanterns) { const ld = distXZ(sh.pos, l.pos); if (!l.lit && ld < best) { target = l; best = ld; } }
          if (target && best > R.drain_reach) {
            const s = Math.min(best - R.drain_reach, shadeStep);
            const [dx, dz] = dirXZ(sh.pos, target.pos);
            sh.pos[0] += dx * s;
            sh.pos[2] += dz * s;
            pushOutOfZones(g, sh);
          }
        }
      }
      if (sh.state === 'chase' && d > 0) {
        const s = Math.min(d, shadeStep);
        const [dx, dz] = dirXZ(sh.pos, p.pos);
        sh.pos[0] += dx * s;
        sh.pos[2] += dz * s;
        pushOutOfZones(g, sh);
      }
    } else if (sh.state === 'recoil') {
      sh.pos[0] += sh.recoilDir[0] * (R.shade_recoil_m / R.shade_recoil_ticks);
      sh.pos[2] += sh.recoilDir[1] * (R.shade_recoil_m / R.shade_recoil_ticks);
      pushOutOfZones(g, sh);
    } else if (sh.state === 'stunned' && sh.push > 0) {
      const s = T.pulse_push_m / R.shade_push_ticks;
      const next = [sh.pos[0] + sh.pushDir[0] * s, sh.pos[1], sh.pos[2] + sh.pushDir[1] * s];
      if (!insideLitZone(g, next)) { sh.pos[0] = next[0]; sh.pos[2] = next[2]; sh.push--; } else sh.push = 0; // blocked: stop
    }
    sh.pos[1] = glideY(g, sh.pos[0], sh.pos[2], R.shade_y);
  }
  for (const d of g.drifters) {
    if (d.state === 'removed') continue;
    const wants = p.wait === 0 && p.carried >= R.drifter_need && distXZ(d.pos, p.pos) <= R.drifter_detect;
    if (d.state === 'idle' && wants && !d.stoleOnce) d.state = 'chase';
    else if (d.state === 'chase' && !wants) d.state = 'idle';
    let target = null, speed = 0, away = false;
    if (d.state === 'idle') {
      d.phase += R.drifter_idle_speed / 4 / TICK_HZ;
      target = [d.home[0] + 4 * Math.cos(d.phase), 0, d.home[2] + 4 * Math.sin(d.phase)];
      speed = R.drifter_idle_speed;
    } else if (d.state === 'chase') { target = p.pos; speed = R.drifter_speed; }
    else if (d.state === 'flee') { target = p.pos; speed = R.drifter_speed; away = true; }
    if (target) {
      let [dx, dz] = dirXZ(d.pos, target);
      const dd = distXZ(d.pos, target);
      if (away) { dx = -dx; dz = -dz; }
      const s = away ? speed * DT : Math.min(dd, speed * DT);
      d.pos[0] += dx * s;
      d.pos[2] += dz * s;
    }
    d.pos[1] = glideY(g, d.pos[0], d.pos[2], R.drifter_y);
  }

  // 9. contact: drifters steal first, then shades hit (by id order)
  if (p.wait === 0) {
    for (const d of g.drifters) {
      if (d.state === 'chase' && !d.stoleOnce && p.carried > 0 && distXZ(d.pos, p.pos) <= R.drifter_touch) {
        const amount = Math.min(R.drifter_steal, p.carried);
        p.carried -= amount;
        d.stolen = amount;
        d.stoleOnce = true;
        d.state = 'flee';
        d.t = R.drifter_flee_ticks;
        emit('drifter_steal', { drifter_id: d.id, amount, carried: p.carried });
      }
    }
    if (p.invuln === 0) {
      const hitter = g.shades.find((sh) => (sh.state === 'wander' || sh.state === 'chase') && sh.evict === 0 &&
        distXZ(sh.pos, p.pos) <= T.shade_hit_radius && Math.abs(p.pos[1] - sh.pos[1]) <= R.height_tolerance);
      if (hitter) {
        p.flames = Math.max(0, p.flames - 1);
        const dropped = Math.floor(p.carried * T.hit_drop_ratio);
        p.carried -= dropped;
        for (let i = 0; i < dropped; i++) {
          const a = g.rng() * Math.PI * 2;
          const r = R.drop_ring[0] + g.rng() * (R.drop_ring[1] - R.drop_ring[0]);
          const x = p.pos[0] + r * Math.cos(a), z = p.pos[2] + r * Math.sin(a);
          addDropped(g, [x, groundUnder(g, x, z, p.pos[1]), z]);
        }
        p.invuln = ticks(T.invuln_s);
        hitter.state = 'recoil';
        hitter.t = R.shade_recoil_ticks;
        hitter.recoilDir = dirXZ(p.pos, hitter.pos);
        emit('player_hit', { by: 'shade', flames: p.flames, dropped });
      }
    }
  }

  // 10. spawns (new things interact from the next tick)
  if (g.randomMotes && g.simTick % R.mote_spawn_every === 0 && g.motes.length < R.mote_cap) {
    const free = map.motePoints.filter((q) => !g.motes.some((m) => m.kind === 'random' && distXZ(m.pos, q) < 1e-6 && Math.abs(m.pos[1] - q[1]) < 1e-6));
    if (free.length) g.motes.push({ id: `M${g.nextMote++}`, pos: [...free[Math.floor(g.rng() * free.length)]], kind: 'random', ttl: null });
  }
  if (g.randomShades) {
    let n = 0;
    if (g.simTick === R.shade_first_spawn) n = 2;
    else if (g.simTick > R.shade_first_spawn && (g.simTick - R.shade_first_spawn) % map.shadeEvery === 0) n = 1;
    for (let i = 0; i < n && g.shades.length < map.shadeMax; i++) {
      const valid = map.shadePoints.filter((q) => distXZ(q, p.pos) >= R.shade_spawn_min_dist);
      if (!valid.length) break;
      const q = valid[Math.floor(g.rng() * valid.length)];
      const id = nextShadeId(g);
      g.shades.push({ id, pos: [q[0], glideY(g, q[0], q[2], R.shade_y), q[2]], state: 'spawning', t: R.shade_spawning_ticks, push: 0, pushDir: [1, 0], recoilDir: [1, 0], evict: 0, evictFrom: null });
      emit('shade_spawned', { id });
    }
  }
  if (map.drifters && g.randomDrifters && g.simTick % R.drifter_every === 0) {
    if (g.drifters.filter((d) => d.state !== 'removed').length < R.drifter_max) {
      const q = map.shadePoints[Math.floor(g.rng() * map.shadePoints.length)];
      const pos = [q[0], glideY(g, q[0], q[2], R.drifter_y), q[2]];
      g.drifters.push({ id: `D${g.nextDrifter++}`, pos, home: [...pos], phase: 0, state: 'idle', stolen: 0, t: 0, stoleOnce: false });
    }
  }

  // 11. win / lose
  g.tick = stamp;
  // v1.2: no early win; at dawn you win with >= ceil(0.6 x lanterns) lit
  if (p.flames <= 0) { g.state = 'lost'; emit('game_over', { result: 'lost', reason: 'no_flames' }); }
  else if (timeLeft(g) <= 1e-9) {
    const lit = g.lanterns.filter((l) => l.lit);
    if (lit.length >= Math.ceil(T.win_ratio * g.lanterns.length - 1e-9)) {
      for (const l of lit) g.score += R.score_dawn_lantern + Math.floor(l.fuel / TICK_HZ);
      g.score += T.score.per_flame_left * p.flames;
      g.state = 'won';
      emit('game_over', { result: 'won', reason: 'dawn_survived' });
    } else { g.state = 'lost'; emit('game_over', { result: 'lost', reason: 'dawn' }); }
  }
  // 12. snapshot: written by the caller
  return events;
}

function movePlayer(g, input, edge, emit) {
  const p = g.player;
  const map = g.map;
  let [mx, mz] = input.move ?? [0, 0];
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const th = ((input.cam_yaw_deg ?? 0) * Math.PI) / 180;
  const c = Math.cos(th), s = Math.sin(th);
  const wx = mx * c + mz * s, wz = -mx * s + mz * c;
  const wl = Math.hypot(wx, wz);
  if (wl > 1e-9) p.facing = [wx / wl, wz / wl];

  if (edge.dash && p.dash === 0 && (p.dashCd === 0 || p.charm > 0)) {
    p.dash = ticks(T.dash_duration_s);
    p.dashDir = wl > 1e-9 ? [wx / wl, wz / wl] : [...p.facing];
    p.dashCd = p.charm > 0 ? 0 : ticks(T.dash_cooldown_s);
    emit('dash', {});
  }

  let hx, hz;
  const speed = p.charm > 0 ? R.charm_speed : T.player_speed;
  if (p.dash > 0) { hx = p.dashDir[0] * T.dash_speed; hz = p.dashDir[1] * T.dash_speed; }
  else if (p.launch) { [hx, hz] = p.launch; }
  else { hx = wx * speed; hz = wz * speed; }
  if (g.wind.active) {
    const a = (g.wind.dir * Math.PI) / 180;
    hx += Math.cos(a) * R.wind_speed;
    hz += Math.sin(a) * R.wind_speed;
  }

  // horizontal move, blocked per axis by walls (ledges higher than step_up)
  const y0 = p.pos[1];
  const free = (x, z) => !wallAt(map, x, z, y0, R.step_up);
  let nx = p.pos[0] + hx * DT, nz = p.pos[2] + hz * DT;
  if (!free(nx, nz)) {
    if (free(nx, p.pos[2])) { nz = p.pos[2]; hz = 0; }
    else if (free(p.pos[0], nz)) { nx = p.pos[0]; hx = 0; }
    else { nx = p.pos[0]; nz = p.pos[2]; hx = 0; hz = 0; }
  }
  p.pos[0] = nx;
  p.pos[2] = nz;

  const dashing = p.dash > 0;
  if (dashing) {
    p.dash--;
    p.vy = 0; // dash in the air keeps altitude
    if (p.grounded) {
      const sup = supportAt(map, nx, nz, y0, R.step_up);
      if (sup !== null && y0 - sup <= R.step_up) p.pos[1] = sup;
      else p.grounded = false;
    }
  } else {
    if (p.grounded) {
      const sup = supportAt(map, nx, nz, y0, R.step_up);
      if (sup !== null && y0 - sup <= R.step_up) { p.pos[1] = sup; p.vy = 0; }
      else { p.grounded = false; p.vy = 0; } // walked off a ledge
    }
    if (edge.jump && p.grounded) { p.vy = R.jump_speed; p.grounded = false; }
    if (!p.grounded) {
      p.vy -= R.gravity * DT;
      const ny = p.pos[1] + p.vy * DT;
      const land = p.vy <= 0 ? supportAt(map, nx, nz, p.pos[1], 1e-6) : null;
      if (land !== null && ny <= land) { p.pos[1] = land; p.vy = 0; p.grounded = true; p.launch = null; }
      else p.pos[1] = ny;
    }
  }

  // jump pads: feet on the pad -> launch (velocity kept until landing)
  if (p.grounded && !dashing) {
    for (const pad of map.pads) {
      if (distXZ(p.pos, pad.pos) <= 1 && Math.abs(p.pos[1] - pad.pos[1]) < 1e-6) {
        const dir = pad.dir ? [pad.dir[0], pad.dir[2]] : dirXZ(pad.pos, pad.target);
        p.launch = [dir[0] * pad.vh, dir[1] * pad.vh];
        p.vy = pad.vy;
        p.grounded = false;
        hx = p.launch[0]; hz = p.launch[1];
        break;
      }
    }
  }
  p.vel = [hx, p.vy, hz];

  // fall off the island: once, ignores invuln
  if (p.pos[1] < R.fall_y) {
    const lost = p.carried;
    p.flames = Math.max(0, p.flames - 1);
    p.carried = 0;
    p.wait = R.respawn_wait;
    p.vel = [0, 0, 0]; p.vy = 0; p.dash = 0; p.launch = null;
    emit('player_hit', { by: 'fall', flames: p.flames, dropped: 0, lost });
  }
}

const r3 = (v) => {
  const x = Math.round(v * 1000) / 1000;
  return Object.is(x, -0) ? 0 : x;
};
const v3 = (p) => p.map(r3);
function r1(fuel60) { // fuel in 1/60 units -> fuel with 1 decimal
  const x = Math.round(fuel60 / 6) / 10;
  return Object.is(x, -0) ? 0 : x;
}
const sec = (t) => r3(t / TICK_HZ);

export function snapshot(g) {
  const p = g.player;
  return {
    type: 'snapshot',
    tick: g.tick,
    sim_tick: g.simTick,
    night: g.night,
    state: g.state,
    time_left_s: r3(Math.max(0, timeLeft(g))),
    score: g.score,
    wind: { active: g.wind.active, dir_deg: g.wind.dir },
    player: {
      pos: v3(p.pos), vel: v3(p.vel), grounded: p.grounded, flames: p.flames, carried: p.carried, capacity: capacityOf(p),
      invuln: p.invuln > 0, dash_cd_s: sec(p.dashCd), pulse_cd_s: sec(p.pulseCd), charm_s: sec(p.charm),
    },
    lanterns: g.lanterns.map((l) => ({ id: l.id, pos: v3(l.pos), lit: l.lit, deposited: l.deposited, fuel: l.lit ? r1(l.fuel) : 0, ever_lit: l.everLit, relit_count: l.relitCount })),
    shades: g.shades.map((s) => ({ id: s.id, pos: v3(s.pos), state: s.state })),
    drifters: g.drifters.map((d) => ({ id: d.id, pos: v3(d.pos), state: d.state, stolen: d.stolen })),
    charms: g.charms.map((c) => ({ id: c.id, available: c.available, respawn_s: sec(c.respawn) })),
    motes_active: g.motes.length,
    motes: g.motes.map((m) => ({ id: m.id, pos: v3(m.pos), kind: m.kind, ttl_s: m.ttl === null ? null : sec(m.ttl) })),
  };
}
