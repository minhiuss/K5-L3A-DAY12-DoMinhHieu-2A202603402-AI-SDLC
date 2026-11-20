// Windowed game: reads keyboard/mouse, drives src/sim.js at a fixed 60 Hz,
// and only draws the sim state. No game rule lives in this file.
import * as THREE from 'three';
import { createGame, step, timeLeft, TICK_HZ } from './sim.js';
import { TUNING as T, WORLD } from './tuning.js';

// ---------- scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const NIGHT = new THREE.Color(0x140a24);
const DAWNISH = new THREE.Color(0x3a2a3a);
scene.background = NIGHT.clone();
scene.fog = new THREE.Fog(NIGHT.clone(), 25, 90);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 300);
const ambient = new THREE.HemisphereLight(0x8a7bd1, 0x1a0f22, 0.35);
scene.add(ambient);
const moon = new THREE.DirectionalLight(0xb9b4ff, 0.35);
moon.position.set(-20, 40, -10);
scene.add(moon);

const water = new THREE.Mesh(new THREE.CircleGeometry(200, 48), new THREE.MeshLambertMaterial({ color: 0x0c0f2a }));
water.rotation.x = -Math.PI / 2;
water.position.y = -0.6;
scene.add(water);

const islandMat = new THREE.MeshLambertMaterial({ color: 0x24352c, emissive: 0x000000 });
const island = new THREE.Mesh(new THREE.CylinderGeometry(WORLD.island_radius, WORLD.island_radius + 2, 1.2, 64), islandMat);
island.position.y = -0.6;
scene.add(island);

// ---------- actors ----------
const mat = (color, emissive = 0x000000, intensity = 1) =>
  new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, roughness: 0.8 });

function makePlayer() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.8, 4, 12), mat(0x5b7fb8));
  body.position.y = 0.75;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.45, 20), mat(0xd8b46a));
  hat.position.y = 1.65;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), mat(0xffd27a, 0xffa733, 2));
  lamp.position.set(0.55, 1.25, 0.25);
  const light = new THREE.PointLight(0xffb347, 1.5, 9, 1.5);
  light.position.copy(lamp.position);
  g.add(body, hat, lamp, light);
  g.userData = { light, lamp };
  return g;
}
const player = makePlayer();
scene.add(player);

function makeLantern() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 3, 8), mat(0x3b2a1e));
  pole.position.y = 1.5;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 12), mat(0x5a3a2a, 0x000000));
  head.position.y = 3.4;
  const light = new THREE.PointLight(0xffa640, 0, 22, 1.2);
  light.position.y = 3.4;
  const ring = new THREE.Mesh(new THREE.RingGeometry(T.safe_radius - 0.08, T.safe_radius, 64),
    new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.18, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  g.add(pole, head, light, ring);
  g.userData = { head, light, ring };
  return g;
}

const moteGeo = new THREE.SphereGeometry(0.16, 10, 8);
const moteMat = mat(0xfff2a8, 0xffd23a, 2.5);
const shadeGeo = new THREE.SphereGeometry(0.85, 18, 14);
const shadeMat = mat(0x1a0b2a, 0x3d1066, 0.6);
const shadeStunMat = mat(0x6b6aa8, 0x8fa0ff, 0.5);

const lanternMeshes = new Map();
const moteMeshes = [];
const shadeMeshes = new Map();

const pulseRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64),
  new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0, side: THREE.DoubleSide }));
pulseRing.rotation.x = -Math.PI / 2;
pulseRing.position.y = 0.1;
scene.add(pulseRing);
let pulseAnim = 0;

// ---------- game state ----------
let game;
let started = false;
const seedFromUrl = new URLSearchParams(location.search).get('seed');

function newGame() {
  const seed = seedFromUrl !== null ? Number(seedFromUrl) : (Date.now() & 0x7fffffff);
  game = createGame(seed);
  for (const m of shadeMeshes.values()) scene.remove(m);
  shadeMeshes.clear();
  for (const l of game.lanterns) {
    let m = lanternMeshes.get(l.id);
    if (!m) { m = makeLantern(); scene.add(m); lanternMeshes.set(l.id, m); }
    m.position.set(l.pos[0], 0, l.pos[2]);
  }
  prev = { jump: false, interact: false, pulse: false };
}

// ---------- input ----------
const keys = new Set();
let camYaw = 0; // degrees, same meaning as cam_yaw_deg in the inputs file
let pending = { jump: false, interact: false, pulse: false };
let prev = { jump: false, interact: false, pulse: false };

addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Space') { pending.jump = true; e.preventDefault(); }
  if (e.code === 'KeyE') pending.interact = true;
  if (e.code === 'KeyF') pending.pulse = true;
  if (e.code === 'KeyR') { newGame(); started = true; showOverlay(null); }
  if (e.code === 'Enter' && !started) { started = true; showOverlay(null); }
});
addEventListener('keyup', (e) => keys.delete(e.code));
let dragging = false;
renderer.domElement.addEventListener('pointerdown', () => { dragging = true; });
addEventListener('pointerup', () => { dragging = false; });
addEventListener('pointermove', (e) => { if (dragging) camYaw -= e.movementX * 0.3; });

// Screen-right at yaw 0 is world -X (camera looks along +Z), so D sends x = -1.
function readInput() {
  const x = (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0);
  const z = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  const input = { move: [x, z], cam_yaw_deg: camYaw };
  // a key tap may be shorter than one tick: hold it true for one tick, then release,
  // so the sim always sees a clean false -> true edge
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
  const cd = p.pulseCd > 0 ? ` (chờ ${(p.pulseCd / TICK_HZ).toFixed(1)}s)` : '';
  hud.innerHTML =
    `<div>Lửa: <b>${'●'.repeat(p.flames)}${'○'.repeat(Math.max(0, T.flames - p.flames))}</b></div>` +
    `<div>Đom đóm: <b>${p.carried}/${T.carry_capacity}</b></div>` +
    `<div>Đèn đã thắp: <b>${lit}/${game.lanterns.length}</b></div>` +
    `<div>Còn: <b>${fmt(Math.max(0, timeLeft(game)))}</b> đến bình minh</div>` +
    `<div>Điểm: <b>${game.score}</b></div>` +
    `<div>Pulse: tốn ${T.pulse_cost} đom đóm${cd}</div>`;
  const near = game.lanterns.find((l) => !l.lit && distXZ(p.pos, l.pos) <= T.interact_radius);
  promptEl.textContent = near
    ? (p.carried > 0 ? `E: đổ đom đóm vào ${near.id} (${near.deposited}/${T.lantern_cost})` : `${near.id} cần ${T.lantern_cost - near.deposited} đom đóm`)
    : '';
}

// ---------- sync sim -> meshes ----------
function sync(alpha) {
  const p = game.player;
  player.position.set(p.pos[0], p.pos[1], p.pos[2]);
  player.rotation.y = (camYaw * Math.PI) / 180;
  player.userData.light.intensity = 0.6 + p.carried * 0.5;
  player.visible = p.invuln === 0 || Math.floor(p.invuln / 6) % 2 === 0;

  let litCount = 0;
  for (const l of game.lanterns) {
    const m = lanternMeshes.get(l.id);
    const frac = l.deposited / T.lantern_cost;
    m.userData.head.material.emissive.setHex(l.lit ? 0xffa733 : 0x7a3a10);
    m.userData.head.material.emissiveIntensity = l.lit ? 2.2 : frac * 0.8;
    m.userData.light.intensity = l.lit ? 40 : frac * 6;
    if (l.lit) litCount++;
  }
  // the island brightens as lanterns are lit
  const k = litCount / game.lanterns.length;
  ambient.intensity = 0.35 + 0.6 * k;
  islandMat.emissive.setRGB(0.05 * k, 0.04 * k, 0.01 * k);
  scene.background.copy(NIGHT).lerp(DAWNISH, k * 0.6);
  scene.fog.color.copy(scene.background);

  while (moteMeshes.length < game.motes.length) {
    const m = new THREE.Mesh(moteGeo, moteMat);
    scene.add(m);
    moteMeshes.push(m);
  }
  const t = performance.now() / 1000;
  moteMeshes.forEach((m, i) => {
    const mo = game.motes[i];
    m.visible = !!mo;
    if (mo) m.position.set(mo.pos[0], 0.7 + 0.15 * Math.sin(t * 2 + mo.id), mo.pos[2]); // hover = display only
  });

  for (const s of game.shades) {
    let m = shadeMeshes.get(s.id);
    if (!m) { m = new THREE.Mesh(shadeGeo, shadeMat); scene.add(m); shadeMeshes.set(s.id, m); }
    m.material = s.state === 'stunned' ? shadeStunMat : shadeMat;
    m.position.set(s.pos[0], s.pos[1] + 0.1 * Math.sin(t * 3 + s.pos[0]), s.pos[2]);
  }

  // third-person camera behind the player, looking along (sin yaw, cos yaw)
  const yaw = (camYaw * Math.PI) / 180;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  camera.position.set(p.pos[0] - fx * 10, p.pos[1] + 6, p.pos[2] - fz * 10);
  camera.lookAt(p.pos[0] + fx * 2, p.pos[1] + 1.4, p.pos[2] + fz * 2);
  void alpha;
}

function onEvents(events) {
  for (const e of events) {
    if (e.name === 'pulse') { pulseAnim = 1; pulseRing.position.set(game.player.pos[0], 0.1, game.player.pos[2]); }
    if (e.name === 'player_hit') { flash.style.opacity = '1'; setTimeout(() => { flash.style.opacity = '0'; }, 180); }
    if (e.name === 'game_over') {
      const won = e.data.result === 'won';
      const why = { all_lit: 'Cả 5 Đèn Lồng Lớn đã sáng!', dawn: 'Trời đã sáng mà đèn chưa thắp đủ.', no_flames: 'Mây đã hết lửa.' }[e.data.reason];
      showOverlay(`<h1>${won ? 'Thắng rồi!' : 'Thua rồi'}</h1><p>${why}</p><p>Điểm: <b>${game.score}</b></p><button>Chơi lại (R)</button>`);
    }
  }
}

// ---------- fixed 60 Hz loop ----------
let last = performance.now();
let acc = 0;
function frame(now) {
  acc += Math.min(0.25, (now - last) / 1000);
  last = now;
  if (keys.has('ArrowLeft')) camYaw += 120 / 60;
  if (keys.has('ArrowRight')) camYaw -= 120 / 60;
  let steps = 0;
  while (acc >= 1 / TICK_HZ && steps < 8) {
    if (started && game.state === 'playing') onEvents(step(game, readInput()));
    acc -= 1 / TICK_HZ;
    steps++;
  }
  if (pulseAnim > 0) {
    pulseAnim = Math.max(0, pulseAnim - 0.05);
    const r = T.pulse_radius * (1 - pulseAnim);
    pulseRing.scale.set(Math.max(0.01, r), Math.max(0.01, r), 1);
    pulseRing.material.opacity = pulseAnim;
  }
  sync(acc * TICK_HZ);
  drawHud();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

newGame();
showOverlay(
  `<h1>Đảo Đèn Lồng</h1><p>Đêm 1 · Đảo Bến</p>` +
  `<p>Gom đom đóm, mang về thắp lại <b>5 Đèn Lồng Lớn</b> trước bình minh. Né Bóng Mực, dùng pulse (F) để đẩy chúng ra.</p>` +
  `<button>Bắt đầu (Enter)</button>`,
);
window.__game = () => game; // debug hook for verification in the browser
requestAnimationFrame(frame);
