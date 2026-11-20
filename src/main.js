// Windowed game: reads keyboard/mouse, drives src/sim.js at a fixed 60 Hz,
// and only draws the sim state. No game rule lives in this file or in src/view/.
// URL options: ?seed=N  ?q=low (no bloom, half grass)  ?bench=1 (10 s orbit benchmark)
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createGame, step, timeLeft, TICK_HZ } from './sim.js';
import { TUNING as T } from './tuning.js';
import { glowTexture, shadowTexture } from './view/textures.js';
import { buildSky } from './view/sky.js';
import { buildIsland } from './view/island.js';
import { makeMay, makeGreatLantern, makeShade, setShadeStunned } from './view/models.js';
import { makeMoteLayer, makeAmbientFireflies } from './view/fireflies.js';

const params = new URLSearchParams(location.search);
const BENCH = params.has('bench');
let quality = params.get('q') === 'low' ? 'low' : 'high';

// ---------- renderer + post ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'low' ? 1 : 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.prepend(renderer.domElement);
renderer.info.autoReset = false; // count draw calls over all post passes, reset once per frame

const scene = new THREE.Scene();
const FOG_NIGHT = new THREE.Color(0x1d1033);
const FOG_WARM = new THREE.Color(0x3b2436);
scene.fog = new THREE.FogExp2(FOG_NIGHT.clone(), 0.016);
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 600);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.85, 0.55, 0.62);
composer.addPass(bloom);
composer.addPass(new OutputPass());
bloom.enabled = quality === 'high';

const glowTex = glowTexture();
const shadowTex = shadowTexture();

const hemi = new THREE.HemisphereLight(0x8a7ed6, 0x1c1426, 0.9);
scene.add(hemi);
const sky = buildSky(scene, glowTex);
const moon = new THREE.DirectionalLight(0xbfb6ff, 0.9);
moon.position.copy(sky.moonDir).multiplyScalar(50);
scene.add(moon);

// ---------- actors ----------
let game;
let started = BENCH;
const seedFromUrl = params.get('seed');
game = createGame(seedFromUrl !== null ? Number(seedFromUrl) : Date.now() & 0x7fffffff);

const island = buildIsland(scene, game.lanterns.map((l) => l.pos), glowTex);
const motes = makeMoteLayer(scene, glowTex);
const ambientFlies = makeAmbientFireflies(scene, glowTex, quality === 'low' ? 60 : 140);

const may = makeMay(shadowTex);
scene.add(may.root);
const lanterns = new Map();
const shades = new Map();

const pulseRing = new THREE.Mesh(
  new THREE.RingGeometry(0.85, 1, 72),
  new THREE.MeshBasicMaterial({ color: 0xffe3a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
);
pulseRing.rotation.x = -Math.PI / 2;
scene.add(pulseRing);
let pulseAnim = 0;

function newGame() {
  game = createGame(seedFromUrl !== null ? Number(seedFromUrl) : Date.now() & 0x7fffffff);
  for (const s of shades.values()) { scene.remove(s.root, s.shadow, ...s.wisps); }
  shades.clear();
  for (const l of game.lanterns) {
    let m = lanterns.get(l.id);
    if (!m) {
      m = makeGreatLantern(shadowTex, glowTex, T.safe_radius, T.lantern_cost);
      scene.add(m.root);
      lanterns.set(l.id, m);
    }
    m.root.position.set(l.pos[0], 0, l.pos[2]);
    // hang the paper lantern on the side facing the island centre
    m.root.rotation.y = Math.atan2(-l.pos[0], -l.pos[2]) + Math.PI / 2;
  }
  prev = { jump: false, interact: false, pulse: false };
  facing = 0;
}

// ---------- input ----------
const keys = new Set();
let camYaw = 0; // degrees, same meaning as cam_yaw_deg in the inputs file
let camDist = 9;
let pending = { jump: false, interact: false, pulse: false };
let prev = { jump: false, interact: false, pulse: false };

addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Space') { pending.jump = true; e.preventDefault(); }
  if (e.code === 'KeyE') pending.interact = true;
  if (e.code === 'KeyF') pending.pulse = true;
  if (e.code === 'KeyR') { newGame(); started = true; showOverlay(null); }
  if (e.code === 'Enter' && !started) { started = true; showOverlay(null); }
  if (e.code === 'Backquote' || e.code === 'F3') { debug.hidden = !debug.hidden; e.preventDefault(); }
});
addEventListener('keyup', (e) => keys.delete(e.code));
let dragging = false;
renderer.domElement.addEventListener('pointerdown', () => { dragging = true; });
addEventListener('pointerup', () => { dragging = false; });
addEventListener('pointermove', (e) => { if (dragging) camYaw -= e.movementX * 0.3; });
addEventListener('wheel', (e) => { camDist = Math.min(16, Math.max(5, camDist + Math.sign(e.deltaY))); }, { passive: true });

// Screen-right at yaw 0 is world -X (camera looks along +Z), so D sends x = -1.
function readInput() {
  const x = (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0);
  const z = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  const input = { move: [x, z], cam_yaw_deg: camYaw };
  for (const b of ['jump', 'interact', 'pulse']) {
    input[b] = pending[b] && !prev[b];
    prev[b] = input[b];
    if (input[b]) pending[b] = false;
  }
  return input;
}

// ---------- HUD ----------
const hud = document.getElementById('hud');
const promptEl = document.getElementById('prompt');
const overlay = document.getElementById('overlay');
const card = document.getElementById('card');
const flash = document.getElementById('flash');
const debug = document.getElementById('debug');

function showOverlay(html) {
  if (!html) { overlay.classList.add('hidden'); return; }
  card.innerHTML = html;
  overlay.classList.remove('hidden');
  const btn = card.querySelector('button');
  if (btn) btn.onclick = () => { if (game.state !== 'playing') newGame(); started = true; showOverlay(null); };
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const distXZ = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

function drawHud() {
  const p = game.player;
  const lit = game.lanterns.filter((l) => l.lit).length;
  const flames = Array.from({ length: Math.max(T.flames, p.flames) }, (_, i) => `<i class="flame${i < p.flames ? '' : ' out'}"></i>`).join('');
  const bag = Array.from({ length: T.carry_capacity }, (_, i) => `<i class="mote${i < p.carried ? '' : ' empty'}"></i>`).join('');
  const lamps = game.lanterns.map((l) => `<i class="lamp${l.lit ? ' lit' : ''}" title="${l.id}"></i>`).join('');
  const cdFrac = p.pulseCd / (T.pulse_cooldown_s * TICK_HZ);
  hud.innerHTML =
    `<div class="row"><span>Lửa</span>${flames}</div>` +
    `<div class="row"><span>Đom đóm</span>${bag}</div>` +
    `<div class="row"><span>Đèn</span>${lamps}<b>${lit}/${game.lanterns.length}</b></div>` +
    `<div class="row"><span>Bình minh</span><b>${fmt(Math.max(0, timeLeft(game)))}</b></div>` +
    `<div class="row"><span>Điểm</span><b class="score">${game.score}</b></div>` +
    `<div class="row"><span>Pulse (F)</span><div class="bar"><div style="width:${(1 - cdFrac) * 100}%"></div></div></div>`;
  const near = game.lanterns.find((l) => !l.lit && distXZ(p.pos, l.pos) <= T.interact_radius);
  promptEl.textContent = near
    ? (p.carried > 0 ? `E — đổ đom đóm vào ${near.id} (${near.deposited}/${T.lantern_cost})` : `${near.id} cần thêm ${T.lantern_cost - near.deposited} đom đóm`)
    : '';
}

// ---------- sync sim -> scene ----------
let facing = 0;
let lastPos = [0, 0, 0];
const camPos = new THREE.Vector3(0, 6, -9);
const camLook = new THREE.Vector3();

function sync(t, dt) {
  const p = game.player;
  may.root.position.set(p.pos[0], p.pos[1], p.pos[2]);
  const dx = p.pos[0] - lastPos[0], dz = p.pos[2] - lastPos[2];
  const speed = Math.hypot(dx, dz) / Math.max(dt, 1e-3);
  lastPos = [...p.pos];
  if (speed > 0.5) {
    const target = Math.atan2(dx, dz);
    const diff = Math.atan2(Math.sin(target - facing), Math.cos(target - facing));
    facing += diff * Math.min(1, dt * 12);
  }
  may.rig.rotation.y = facing;
  const walk = Math.min(1, speed / T.player_speed);
  const swing = Math.sin(t * 11) * 0.7 * walk;
  may.legs[0].rotation.x = swing; may.legs[1].rotation.x = -swing;
  may.arms[0].rotation.x = -swing * 0.8; may.arms[1].rotation.x = swing * 0.8;
  may.rig.position.y = Math.abs(Math.sin(t * 11)) * 0.06 * walk;
  may.lampGroup.rotation.z = Math.sin(t * 3) * 0.15 + swing * 0.2;
  may.lamp.emissiveIntensity = 0.8 + p.carried * 0.6;
  may.lampLight.intensity = 1.5 + p.carried * 1.8;
  may.rig.visible = p.invuln === 0 || Math.floor(p.invuln / 6) % 2 === 0;

  let litCount = 0;
  for (const l of game.lanterns) {
    const m = lanterns.get(l.id);
    const frac = l.deposited / T.lantern_cost;
    const flicker = 0.92 + 0.08 * Math.sin(t * 9 + l.pos[0]);
    m.paper.emissiveIntensity = l.lit ? 3.2 * flicker : frac * 0.9;
    m.light.intensity = l.lit ? 70 * flicker : frac * 6;
    m.halo.material.opacity = l.lit ? 0.75 : frac * 0.25;
    m.poolMat.opacity = l.lit ? 0.32 : 0;
    m.ringMat.opacity = l.lit ? 0.35 + 0.1 * Math.sin(t * 2) : 0.1;
    m.lampGroup.rotation.z = Math.sin(t * 0.8 + l.pos[2]) * 0.04;
    m.pips.forEach((pip, i) => { pip.material.emissiveIntensity = i < l.deposited ? 3 : 0; });
    if (l.lit) litCount++;
  }
  const k = litCount / game.lanterns.length;
  hemi.intensity = 0.9 + 0.6 * k;
  scene.fog.color.copy(FOG_NIGHT).lerp(FOG_WARM, k);
  scene.fog.density = 0.016 - 0.005 * k;

  motes.update(game.motes, t);

  for (const s of game.shades) {
    let v = shades.get(s.id);
    if (!v) { v = makeShade(shadowTex); scene.add(v.root, v.shadow, ...v.wisps); shades.set(s.id, v); }
    v.root.position.set(s.pos[0], s.pos[1] + 0.12 * Math.sin(t * 3 + s.pos[0]), s.pos[2]);
    v.shadow.position.set(s.pos[0], 0.03, s.pos[2]);
    const stunned = s.state === 'stunned';
    setShadeStunned(v, stunned);
    if (stunned) v.body.rotation.y += dt * 4;
    else v.body.rotation.y = Math.atan2(p.pos[0] - s.pos[0], p.pos[2] - s.pos[2]);
    v.blobs.forEach((b, i) => {
      const a = t * 1.6 + b.userData.phase;
      b.position.set(Math.sin(a) * 0.55, Math.sin(a * 1.3) * 0.35, Math.cos(a) * 0.45 - 0.15);
    });
    v.core.scale.setScalar(0.8 + 0.05 * Math.sin(t * 5 + s.pos[2]));
    v.trail.unshift(v.root.position.clone());
    if (v.trail.length > 30) v.trail.length = 30;
    v.wisps.forEach((w, i) => {
      const tp = v.trail[Math.min(v.trail.length - 1, (i + 1) * 5)];
      w.position.copy(tp);
      w.position.y -= 0.15 * (i + 1);
    });
  }

  // third-person camera behind the player, smoothed
  const yaw = (camYaw * Math.PI) / 180;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const want = BENCH
    ? new THREE.Vector3(Math.sin(t * 0.25) * 30, 14, Math.cos(t * 0.25) * 30)
    : new THREE.Vector3(p.pos[0] - fx * camDist, p.pos[1] + camDist * 0.55, p.pos[2] - fz * camDist);
  camPos.lerp(want, Math.min(1, dt * 8));
  camera.position.copy(camPos);
  camLook.set(BENCH ? 0 : p.pos[0] + fx * 2, BENCH ? 0 : p.pos[1] + 1.3, BENCH ? 0 : p.pos[2] + fz * 2);
  camera.lookAt(camLook);

  sky.update(camera, k);
  island.update(t);
  ambientFlies.update(t);

  if (pulseAnim > 0) {
    pulseAnim = Math.max(0, pulseAnim - dt * 3);
    const r = T.pulse_radius * (1 - pulseAnim) + 0.01;
    pulseRing.scale.set(r, r, 1);
    pulseRing.material.opacity = pulseAnim;
  }
}

function onEvents(events) {
  for (const e of events) {
    if (e.name === 'pulse') { pulseAnim = 1; pulseRing.position.set(game.player.pos[0], 0.1, game.player.pos[2]); }
    if (e.name === 'player_hit') { flash.style.opacity = '1'; setTimeout(() => { flash.style.opacity = '0'; }, 180); }
    if (e.name === 'game_over') {
      const won = e.data.result === 'won';
      const why = { all_lit: 'Cả 5 Đèn Lồng Lớn đã sáng!', dawn: 'Trời đã sáng mà đèn chưa thắp đủ.', no_flames: 'Mây đã hết lửa.' }[e.data.reason];
      showOverlay(`<h1>${won ? 'Đảo đã sáng lại!' : 'Đêm chưa qua…'}</h1><p>${why}</p><p class="big">${game.score} điểm</p><button>Chơi lại (R)</button>`);
    }
  }
}

// ---------- performance: FPS meter, adaptive quality, benchmark ----------
const frameTimes = [];
let lowFpsTime = 0;
const bench = { samples: [] };
function perf(dtMs, dt) {
  frameTimes.push(dtMs);
  if (frameTimes.length > 120) frameTimes.shift();
  const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
  const fps = 1000 / avg;
  // adaptive: if under 40 fps for 2 s, drop bloom and pixel ratio
  if (quality === 'high' && frameTimes.length >= 60 && fps < 40) {
    lowFpsTime += dt;
    if (lowFpsTime > 2) {
      quality = 'low';
      bloom.enabled = false;
      renderer.setPixelRatio(1);
      composer.setPixelRatio(1);
    }
  } else lowFpsTime = 0;
  if (!debug.hidden) {
    const info = renderer.info.render;
    debug.textContent = `${fps.toFixed(0)} fps · ${avg.toFixed(1)} ms · ${info.calls} draw calls · ${(info.triangles / 1000).toFixed(0)}k tris · quality ${quality}`;
  }
  if (BENCH && started && !window.__bench) {
    bench.t0 ??= performance.now() + 2000; // 2 s warm-up, then measure 10 s
    if (performance.now() > bench.t0) bench.samples.push(dtMs);
    if (performance.now() > bench.t0 + 10000 && bench.samples.length > 10) {
      const s = [...bench.samples].sort((a, b) => a - b);
      const mean = s.reduce((a, b) => a + b, 0) / s.length;
      window.__bench = {
        frames: s.length, mean_ms: +mean.toFixed(2), p95_ms: +s[Math.floor(s.length * 0.95)].toFixed(2),
        fps: +(1000 / mean).toFixed(1), draw_calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
        quality, pixel_ratio: renderer.getPixelRatio(), size: [innerWidth, innerHeight],
      };
      debug.hidden = false;
      debug.textContent = `BENCH ${JSON.stringify(window.__bench)}`;
    }
  }
}

// ---------- fixed 60 Hz loop ----------
let last = performance.now();
let acc = 0;
const clock0 = performance.now();
function frame(now) {
  const dtMs = now - last;
  const dt = Math.min(0.1, dtMs / 1000);
  acc += Math.min(0.25, dtMs / 1000);
  last = now;
  if (keys.has('ArrowLeft')) camYaw += 120 * dt;
  if (keys.has('ArrowRight')) camYaw -= 120 * dt;
  let steps = 0;
  while (acc >= 1 / TICK_HZ && steps < 8) {
    if (started && !BENCH && game.state === 'playing') onEvents(step(game, readInput()));
    acc -= 1 / TICK_HZ;
    steps++;
  }
  const t = (now - clock0) / 1000;
  sync(t, dt);
  drawHud();
  renderer.info.reset();
  composer.render();
  perf(dtMs, dt);
  requestAnimationFrame(frame);
}

addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

newGame();
if (!BENCH) {
  showOverlay(
    `<h1>Đảo Đèn Lồng</h1><p class="sub">Đêm 1 · Đảo Bến</p>` +
    `<p>Gom đom đóm, mang về thắp lại <b>5 Đèn Lồng Lớn</b> trước bình minh. Né Bóng Mực — chúng sợ ánh đèn. Bấm <b>F</b> để toả pulse đẩy chúng ra.</p>` +
    `<button>Bắt đầu (Enter)</button>`,
  );
} else showOverlay(null);
window.__game = () => game; // debug hook for verification in the browser
// Synchronous render benchmark (works even when the tab is hidden and rAF is paused):
// renders n frames of the orbit view and waits for the GPU each frame via readPixels.
window.__benchSync = (n = 300, opts = {}) => {
  const gl = renderer.getContext();
  const px = new Uint8Array(4);
  if (opts.bloom !== undefined) bloom.enabled = opts.bloom;
  const times = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    const t = i / 60;
    sync(t, 1 / 60);
    renderer.info.reset();
    composer.render();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / n;
  return {
    frames: n, mean_ms: +mean.toFixed(2), p95_ms: +times[Math.floor(n * 0.95)].toFixed(2), fps_equiv: +(1000 / mean).toFixed(0),
    draw_calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    bloom: bloom.enabled, pixel_ratio: renderer.getPixelRatio(), size: [innerWidth, innerHeight],
    gpu: (() => { const d = gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'n/a'; })(),
  };
};
requestAnimationFrame(frame);
