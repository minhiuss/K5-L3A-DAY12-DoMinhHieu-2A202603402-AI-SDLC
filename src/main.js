// Windowed game: menu -> night intro -> play -> result -> next night (3 nights) -> dawn.
// Reads keyboard/mouse, drives src/sim.js at a fixed 60 Hz, and only draws the sim state.
// No game rule lives here or in src/view/.  URL: ?night=N (jump in) ?seed=N ?q=low ?bench=1
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createGame, step, timeLeft, TICK_HZ } from './sim.js';
import { TUNING as T, RULES as R } from './tuning.js';
import { MAPS } from './maps.js';
import { PAL } from './view/palette.js';
import { glowTexture, shadowTexture } from './view/textures.js';
import { buildSky } from './view/sky.js';
import { buildWorld } from './view/world.js';
import { makeMay, makeGreatLantern, makeShade, setShadeLook, makeDrifter, makeCharm } from './view/models.js';
import { makeMoteLayer, makeAmbientFireflies, makeWindLeaves } from './view/fireflies.js';
import { makeAudio } from './view/audio.js';

const params = new URLSearchParams(location.search);
const BENCH = params.has('bench');
let quality = params.get('q') === 'low' ? 'low' : 'high';

// ---------- settings (saved between sessions) ----------
const SETTINGS_KEY = 'dao-den-long-settings';
const settings = { volume: 0.7, sensitivity: 1 };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch { /* private mode: defaults */ }
const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ } };
const audio = makeAudio();
audio.setVolume(settings.volume);

// ---------- renderer + post ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'low' ? 1 : 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.info.autoReset = false;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const FOG = new THREE.Color(PAL.fog);
const FOG_WARM = new THREE.Color(0x3a2f4a);
scene.fog = new THREE.FogExp2(FOG.clone(), 0.014);
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 700);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.8, 0.55, 0.62);
composer.addPass(bloom);
composer.addPass(new OutputPass());
bloom.enabled = quality === 'high';

const glowTex = glowTexture();
const shadowTex = shadowTexture();
// Ticket-02: ambient light = 0.15 + 0.55 x (lit / total)
const hemi = new THREE.HemisphereLight(0x8a90d6, 0x1c1a2a, 0.15);
scene.add(hemi);
const sky = buildSky(scene, glowTex);
const moon = new THREE.DirectionalLight(0xbfc4ff, 1.6); // moonlight is not "ambient": keeps the 0.15 start readable
moon.position.copy(sky.moonDir).multiplyScalar(50);
scene.add(moon);
const motes = makeMoteLayer(scene, glowTex);
const ambientFlies = makeAmbientFireflies(scene, glowTex, quality === 'low' ? 60 : 140);
const leaves = makeWindLeaves(scene, glowTex);
const may = makeMay(shadowTex);
scene.add(may.root);
const pulseRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 72),
  new THREE.MeshBasicMaterial({ color: PAL.lanternCore, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
pulseRing.rotation.x = -Math.PI / 2;
scene.add(pulseRing);
let pulseAnim = 0;

// ---------- night state ----------
const INTRO = {
  1: 'Đảo Bến tắt đèn rồi, cháu ạ. Gom đom đóm, thắp lại năm ngọn đèn lớn trước khi trời sáng.',
  2: 'Đảo Cau có hai hòn, nối nhau bằng chiếc cầu tre. Bục đá vàng sẽ ném cháu qua biển mây, đừng nhìn xuống. Coi chừng Gió Lạc, nó thích đom đóm lắm.',
  3: 'Đảo Chuông cao ba tầng, gió ở đây chẳng chiều ai. Leo dốc, nhảy bục, thắp đèn trên tháp chuông là cả vùng sáng lại.',
};
let mode = 'menu'; // menu | intro | play | result | dawn
let night = 1;
let totalScore = 0;
let game = createGame(0, {}, 1);
let world = null;
let nightGroup = null;
let lanterns = new Map(), shades = new Map(), drifters = new Map(), charms = new Map();
const seedFromUrl = params.get('seed');

function startNight(n) {
  night = n;
  game = createGame(seedFromUrl !== null ? Number(seedFromUrl) : (Date.now() & 0x7fffffff), {}, n);
  if (nightGroup) scene.remove(nightGroup);
  nightGroup = new THREE.Group();
  scene.add(nightGroup);
  world = buildWorld(MAPS[n], glowTex);
  nightGroup.add(world.group);
  lanterns = new Map(); shades = new Map(); drifters = new Map(); charms = new Map();
  for (const l of game.lanterns) {
    const m = makeGreatLantern(shadowTex, glowTex, T.safe_radius, T.lantern_cost);
    m.root.position.set(l.pos[0], l.pos[1], l.pos[2]);
    m.root.rotation.y = Math.atan2(-l.pos[0], -l.pos[2]) + Math.PI / 2;
    nightGroup.add(m.root);
    lanterns.set(l.id, m);
  }
  for (const c of game.charms) {
    const m = makeCharm(glowTex);
    nightGroup.add(m.root);
    charms.set(c.id, m);
  }
  ambientFlies.setCenter(n === 2 ? 35 : 0);
  prev = { jump: false, interact: false, pulse: false, dash: false, pause: false };
  pending = { jump: false, interact: false, pulse: false, dash: false, pause: false };
  facing = 0;
  lastPos = [...game.player.pos];
  camPos.set(game.player.pos[0], game.player.pos[1] + 6, game.player.pos[2] - 10);
  lastCountdown = null;
}

// ---------- input ----------
const keys = new Set();
let camYaw = 0; // degrees, same meaning as cam_yaw_deg in the inputs file
let camDist = 9;
let pending = {};
let prev = {};
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (mode === 'play') {
    if (e.code === 'Space') { pending.jump = true; e.preventDefault(); }
    if (e.code === 'KeyE') pending.interact = true;
    if (e.code === 'KeyF') pending.pulse = true;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') pending.dash = true;
    if (e.code === 'Escape' || e.code === 'KeyP') pending.pause = true;
  }
  if (e.code === 'Enter') { const b = card.querySelector('[data-primary]'); if (b && !overlay.classList.contains('hidden')) { b.click(); e.preventDefault(); } }
  if (e.code === 'Backquote' || e.code === 'F3') { debug.hidden = !debug.hidden; e.preventDefault(); }
});
addEventListener('keyup', (e) => keys.delete(e.code));
let dragging = false;
renderer.domElement.addEventListener('pointerdown', () => { dragging = true; audio.unlock(); });
addEventListener('pointerup', () => { dragging = false; });
addEventListener('pointermove', (e) => { if (dragging && mode === 'play') camYaw -= e.movementX * 0.3 * settings.sensitivity; });
addEventListener('wheel', (e) => { camDist = Math.min(16, Math.max(5, camDist + Math.sign(e.deltaY))); }, { passive: true });

// Screen-right at yaw 0 is world -X (camera looks along +Z), so D sends x = -1.
function readInput() {
  const x = (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0);
  const z = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  const input = { move: [x, z], cam_yaw_deg: camYaw };
  // a key tap may be shorter than one tick: hold it true for one tick so the sim sees false -> true
  for (const b of ['jump', 'interact', 'pulse', 'dash', 'pause']) {
    input[b] = !!pending[b] && !prev[b];
    prev[b] = input[b];
    if (input[b]) pending[b] = false;
  }
  return input;
}

// ---------- overlay screens ----------
const $ = (id) => document.getElementById(id);
const overlay = $('overlay'), card = $('card'), debug = $('debug'), flash = $('flash');
function show(html, handlers = {}) {
  card.innerHTML = html;
  overlay.classList.remove('hidden');
  for (const [sel, fn] of Object.entries(handlers)) {
    card.querySelectorAll(sel).forEach((el) => { el.onclick = () => { audio.unlock(); audio.sfx.ui(); fn(el); }; });
  }
}
const hide = () => overlay.classList.add('hidden');
const CONTROLS = '<p class="small">WASD đi · kéo chuột xoay · lăn chuột zoom · Space nhảy · Shift lướt · E nạp ánh sáng · F Tỏa Sáng · Esc/P tạm dừng</p>';

function showMenu() {
  mode = 'menu';
  show(`<h1>Đảo Đèn Lồng</h1><p class="sub">Ba đêm, ba hòn đảo, một người giữ đèn nhỏ tuổi.</p>
    <button data-primary data-act="start">Bắt đầu (Enter)</button>
    <div class="row">Chọn Đêm: <button class="ghost" data-night="1">1</button><button class="ghost" data-night="2">2</button><button class="ghost" data-night="3">3</button></div>
    <button class="ghost" data-act="settings">Cài đặt</button>${CONTROLS}`, {
    '[data-act=start]': () => { totalScore = 0; startNight(1); showIntro(); },
    '[data-night]': (el) => { totalScore = 0; startNight(Number(el.dataset.night)); showIntro(); },
    '[data-act=settings]': () => showSettings(showMenu),
  });
}
function showIntro() {
  mode = 'intro';
  show(`<p class="sub">Đêm ${night}</p><h1>${MAPS[night].name}</h1>
    <p class="quote">“${INTRO[night]}”<br><span class="small">— Ông Đăng</span></p>
    <p class="small">Thắp ${game.lanterns.length} đèn · ${Math.round(game.startTime)} giây tới bình minh</p>
    <button data-primary data-act="go">Vào đêm (Enter)</button>`, { '[data-act=go]': beginPlay });
}
function beginPlay() { mode = 'play'; hide(); audio.unlock(); }
function showPause() {
  show(`<h1>Tạm dừng</h1>
    <button data-primary data-act="resume">Tiếp tục</button>
    <button class="ghost" data-act="restart">Chơi lại Đêm</button>
    <button class="ghost" data-act="settings">Cài đặt</button>
    <button class="ghost" data-act="menu">Về menu</button>`, {
    '[data-act=resume]': () => { pending.pause = true; hide(); },
    '[data-act=restart]': () => { startNight(night); beginPlay(); },
    '[data-act=settings]': () => showSettings(showPause),
    '[data-act=menu]': showMenu,
  });
}
function showSettings(back) {
  show(`<h1>Cài đặt</h1>
    <label>Âm lượng <input id="vol" type="range" min="0" max="1" step="0.05" value="${settings.volume}"></label>
    <label>Độ nhạy chuột <input id="sens" type="range" min="0.2" max="2.5" step="0.1" value="${settings.sensitivity}"></label>
    <button data-primary data-act="back">Xong</button>`, { '[data-act=back]': back });
  $('vol').oninput = (e) => { settings.volume = Number(e.target.value); audio.setVolume(settings.volume); saveSettings(); };
  $('sens').oninput = (e) => { settings.sensitivity = Number(e.target.value); saveSettings(); };
}
function showResult(won, reason) {
  mode = 'result';
  if (won) totalScore += game.score;
  if (won && night === 3) {
    mode = 'dawn';
    show(`<h1 class="dawn">Bình Minh</h1><p>Ba hòn đảo đã sáng lại. Mây về nhà khi mặt trời lên.</p>
      <p class="big">${totalScore} điểm</p><button data-primary data-act="menu">Về menu</button>`, { '[data-act=menu]': showMenu });
    return;
  }
  const why = { all_lit: 'Mọi Đèn Lồng Lớn đã sáng!', dawn: 'Trời đã sáng mà đèn chưa thắp đủ.', no_flames: 'Mây đã hết Ngọn Lửa.' }[reason];
  if (won) {
    show(`<p class="sub">Đêm ${night} · ${MAPS[night].name}</p><h1>Đảo đã sáng!</h1><p>${why}</p>
      <p class="big">${game.score} điểm</p><p class="small">Tổng: ${totalScore}</p>
      <button data-primary data-act="next">Đêm ${night + 1} (Enter)</button>`, { '[data-act=next]': () => { startNight(night + 1); showIntro(); } });
  } else {
    show(`<p class="sub">Đêm ${night} · ${MAPS[night].name}</p><h1>Đêm chưa qua…</h1><p>${why}</p>
      <button data-primary data-act="retry">Chơi lại Đêm ${night} (Enter)</button><button class="ghost" data-act="menu">Về menu</button>`,
    { '[data-act=retry]': () => { startNight(night); beginPlay(); }, '[data-act=menu]': showMenu });
  }
}

// ---------- HUD ----------
const hudFlames = $('flames'), hudTimer = $('timer'), hudTR = $('tr'), hudBag = $('bag'), hudCd = $('cds'), promptEl = $('prompt'), arrow = $('arrow'), windWarn = $('windwarn');
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const distXZ = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const v = new THREE.Vector3();
function drawHud() {
  const playing = mode === 'play';
  document.body.classList.toggle('playing', playing);
  if (!playing) return;
  const p = game.player;
  const lit = game.lanterns.filter((l) => l.lit).length;
  hudFlames.innerHTML = Array.from({ length: T.flames }, (_, i) => `<i class="flame${i < p.flames ? '' : ' out'}"></i>`).join('');
  const tl = Math.max(0, timeLeft(game));
  hudTimer.textContent = fmt(Math.ceil(tl - 1e-9));
  hudTimer.classList.toggle('danger', tl <= 30);
  hudTR.innerHTML = `<div>Đèn <b>${lit}/${game.lanterns.length}</b></div><div class="score">${game.score}</div>${totalScore ? `<div class="small">Tổng ${totalScore + game.score}</div>` : ''}`;
  hudBag.innerHTML = Array.from({ length: T.carry_capacity }, (_, i) => `<i class="slot${i < p.carried ? ' full' : ''}"></i>`).join('');
  const dashF = p.charm > 0 ? 0 : p.dashCd / (T.dash_cooldown_s * TICK_HZ);
  const pulseF = p.pulseCd / (T.pulse_cooldown_s * TICK_HZ);
  hudCd.innerHTML =
    `<div class="cd${p.charm > 0 ? ' charm' : ''}" style="--f:${dashF}"><span>Lướt</span><small>Shift</small></div>` +
    `<div class="cd${p.carried < T.pulse_cost ? ' off' : ''}" style="--f:${pulseF}"><span>Tỏa Sáng</span><small>F · ${T.pulse_cost}</small></div>`;
  const near = game.lanterns.find((l) => !l.lit && distXZ(p.pos, l.pos) <= T.interact_radius && Math.abs(p.pos[1] - l.pos[1]) <= R.height_tolerance);
  promptEl.textContent = near ? `E — Nạp ánh sáng (${near.deposited}/${T.lantern_cost})` : '';
  windWarn.textContent = game.wind.active ? 'Gió mạnh!' : game.wind.dir !== null ? 'Gió sắp tới…' : '';
  // arrow to the nearest unlit lantern when it is off screen
  let target = null, best = Infinity;
  for (const l of game.lanterns) { const d = distXZ(p.pos, l.pos); if (!l.lit && d < best) { best = d; target = l; } }
  if (!target) { arrow.hidden = true; return; }
  v.set(target.pos[0], target.pos[1] + 3, target.pos[2]).project(camera);
  const behind = v.z > 1;
  const onScreen = !behind && Math.abs(v.x) < 0.92 && Math.abs(v.y) < 0.88;
  arrow.hidden = onScreen;
  if (!onScreen) {
    let x = v.x, y = v.y;
    if (behind) { x = -x; y = -y; }
    const a = Math.atan2(y, x);
    const k = Math.min(0.86 / Math.abs(Math.cos(a) || 1e-6), 0.8 / Math.abs(Math.sin(a) || 1e-6));
    arrow.style.left = `${(0.5 + 0.5 * Math.cos(a) * k) * 100}%`;
    arrow.style.top = `${(0.5 - 0.5 * Math.sin(a) * k) * 100}%`;
    arrow.style.transform = `translate(-50%, -50%) rotate(${-a}rad)`;
  }
}

// ---------- sync sim -> scene ----------
let facing = 0;
let lastPos = [0, 0, 0];
const camPos = new THREE.Vector3(0, 6, -9);
const camLook = new THREE.Vector3();
const num = (id) => Number(String(id).replace(/\D/g, '')) || 0;

function sync(t, dt) {
  const p = game.player;
  may.root.position.set(p.pos[0], p.pos[1], p.pos[2]);
  const dx = p.pos[0] - lastPos[0], dz = p.pos[2] - lastPos[2];
  const speed = Math.hypot(dx, dz) / Math.max(dt, 1e-3);
  lastPos = [...p.pos];
  if (speed > 0.5 && speed < 40) {
    const target = Math.atan2(dx, dz);
    facing += Math.atan2(Math.sin(target - facing), Math.cos(target - facing)) * Math.min(1, dt * 12);
  }
  may.rig.rotation.y = facing;
  const walk = p.grounded ? Math.min(1, speed / T.player_speed) : 0;
  const swing = Math.sin(t * 11) * 0.7 * walk;
  may.legs[0].rotation.x = p.grounded ? swing : 0.5; may.legs[1].rotation.x = p.grounded ? -swing : -0.3;
  may.arms[0].rotation.x = -swing * 0.8; may.arms[1].rotation.x = swing * 0.8;
  may.rig.position.y = Math.abs(Math.sin(t * 11)) * 0.06 * walk;
  may.lampGroup.rotation.z = Math.sin(t * 3) * 0.15 + swing * 0.2;
  may.lamp.emissiveIntensity = 0.8 + p.carried * 0.3;
  may.lampLight.intensity = 1.5 + p.carried * 0.9;
  may.rig.visible = !p.invuln || Math.floor(p.invuln / 6) % 2 === 0;
  may.shadow.visible = p.grounded;

  let litCount = 0;
  for (const l of game.lanterns) {
    const m = lanterns.get(l.id);
    const frac = l.deposited / T.lantern_cost;
    const flick = 0.92 + 0.08 * Math.sin(t * 9 + l.pos[0]);
    m.paper.color.setHex(l.lit ? PAL.lanternLit : PAL.lanternOff);
    m.paper.emissiveIntensity = l.lit ? 2.6 * flick : frac * 0.6;
    m.core.material.opacity = l.lit ? 1 : 0;
    m.light.intensity = l.lit ? 70 * flick : frac * 5;
    m.halo.material.opacity = l.lit ? 0.75 : frac * 0.2;
    m.poolMat.opacity = l.lit ? 0.3 : 0;
    m.ringMat.opacity = l.lit ? 0.35 + 0.1 * Math.sin(t * 2) : 0;
    m.lampGroup.rotation.z = Math.sin(t * 0.8 + l.pos[2]) * 0.04;
    m.pips.forEach((pip, i) => { pip.material.emissiveIntensity = i < l.deposited ? 3 : 0; });
    if (l.lit) litCount++;
  }
  const k = litCount / game.lanterns.length;
  hemi.intensity = 0.15 + 0.55 * k; // Ticket-02 ambient rule
  scene.fog.color.copy(FOG).lerp(FOG_WARM, k * 0.6);

  motes.update(game.motes, t);

  for (const s of game.shades) {
    let m = shades.get(s.id);
    if (!m) { m = makeShade(shadowTex); nightGroup.add(m.root, m.shadow, ...m.wisps); shades.set(s.id, m); }
    m.root.position.set(s.pos[0], s.pos[1] + 0.12 * Math.sin(t * 3 + s.pos[0]), s.pos[2]);
    m.shadow.position.set(s.pos[0], s.pos[1] - 0.97, s.pos[2]);
    setShadeLook(m, s.state);
    m.root.scale.setScalar(s.state === 'spawning' ? 0.3 + 0.7 * Math.min(1, (m.spawnT += dt)) : 1);
    if (s.state === 'stunned') m.body.rotation.y += dt * 4;
    else m.body.rotation.y = Math.atan2(p.pos[0] - s.pos[0], p.pos[2] - s.pos[2]);
    m.blobs.forEach((b) => {
      const a = t * 1.6 + b.userData.phase;
      b.position.set(Math.sin(a) * 0.55, Math.sin(a * 1.3) * 0.35, Math.cos(a) * 0.45 - 0.15);
    });
    m.trail.unshift(m.root.position.clone());
    if (m.trail.length > 30) m.trail.length = 30;
    m.wisps.forEach((w, i) => { w.position.copy(m.trail[Math.min(m.trail.length - 1, (i + 1) * 5)]); w.position.y -= 0.15 * (i + 1); });
  }

  for (const d of game.drifters) {
    let m = drifters.get(d.id);
    if (!m) { m = makeDrifter(); m.trail = []; nightGroup.add(m.root); drifters.set(d.id, m); }
    m.root.visible = d.state !== 'removed';
    if (!m.root.visible) continue;
    m.trail.unshift([d.pos[0], d.pos[1], d.pos[2]]);
    if (m.trail.length > 40) m.trail.length = 40;
    m.segs.forEach((sg, i) => {
      const q = m.trail[Math.min(m.trail.length - 1, i * 4)];
      sg.position.set(q[0] - m.root.position.x, q[1] + 0.25 * Math.sin(t * 6 - i * 0.8), q[2] - m.root.position.z);
      sg.rotation.set(Math.sin(t * 4 + i) * 0.6, t * 2 + i * 0.5, 0);
    });
    m.root.position.set(0, 0, 0);
    m.mat.opacity = d.state === 'flee' ? 0.55 : 0.9;
    m.loot.visible = d.stolen > 0;
    m.loot.position.set(d.pos[0], d.pos[1] - 0.3, d.pos[2]);
  }

  for (const c of game.charms) {
    const m = charms.get(c.id);
    m.root.visible = c.available;
    m.root.position.set(c.pos[0], c.pos[1] + 1.1 + 0.15 * Math.sin(t * 2 + num(c.id)), c.pos[2]);
    m.root.rotation.y = t * 1.5;
  }

  // third-person camera, smoothed; never follows below the cloud line
  const yaw = (camYaw * Math.PI) / 180;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const py = Math.max(p.pos[1], -3);
  const want = BENCH
    ? new THREE.Vector3((night === 2 ? 35 : 0) + Math.sin(t * 0.25) * 40, 18, Math.cos(t * 0.25) * 40)
    : new THREE.Vector3(p.pos[0] - fx * camDist, py + camDist * 0.55, p.pos[2] - fz * camDist);
  camPos.lerp(want, Math.min(1, dt * 8));
  camera.position.copy(camPos);
  if (BENCH) camLook.set(night === 2 ? 35 : 0, 0, 0);
  else camLook.set(p.pos[0] + fx * 2, py + 1.3, p.pos[2] + fz * 2);
  camera.lookAt(camLook);

  sky.update(camera, k);
  world.update(t);
  ambientFlies.update(t);
  const windStrength = game.wind.active ? 2.2 : game.wind.dir !== null ? 0.8 : 0;
  leaves.update(t, p.pos, game.wind.dir, windStrength);

  if (pulseAnim > 0) {
    pulseAnim = Math.max(0, pulseAnim - dt * 3);
    const r = T.pulse_radius * (1 - pulseAnim) + 0.01;
    pulseRing.scale.set(r, r, 1);
    pulseRing.material.opacity = pulseAnim;
  }
}

// ---------- events -> sound / effects / screens ----------
let lastCountdown = null;
let lastWindDir = null;
function onEvents(events) {
  for (const e of events) {
    const s = audio.sfx;
    switch (e.name) {
      case 'mote_picked': s.pick(); break;
      case 'deposit': s.deposit(); break;
      case 'lantern_lit': s.lit(); break;
      case 'pulse': s.pulse(); pulseAnim = 1; pulseRing.position.set(game.player.pos[0], game.player.pos[1] + 0.1, game.player.pos[2]); break;
      case 'player_hit':
        if (e.data.by === 'fall') s.fall(); else s.hit();
        flash.style.opacity = '1'; setTimeout(() => { flash.style.opacity = '0'; }, 180); break;
      case 'dash': s.dash(); break;
      case 'shade_spawned': s.shade(); break;
      case 'charm_picked': s.charm(); break;
      case 'drifter_steal': s.steal(); break;
      case 'paused': showPause(); break;
      case 'resumed': hide(); break;
      case 'game_over':
        if (e.data.result === 'won') s.win(); else s.lose();
        showResult(e.data.result === 'won', e.data.reason);
        break;
      default:
    }
  }
}
function onTickSounds(input) {
  if (input.jump && game.player.vel[1] > 0) audio.sfx.jump();
  const tl = Math.ceil(timeLeft(game) - 1e-9);
  if (tl <= 10 && tl > 0 && tl !== lastCountdown) { lastCountdown = tl; audio.sfx.countdown(); }
  if (game.wind.dir !== null && lastWindDir === null) audio.sfx.wind();
  lastWindDir = game.wind.dir;
}

// ---------- performance ----------
const frameTimes = [];
let lowFpsTime = 0;
function perf(dtMs, dt) {
  frameTimes.push(dtMs);
  if (frameTimes.length > 120) frameTimes.shift();
  const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
  if (quality === 'high' && frameTimes.length >= 60 && 1000 / avg < 40) {
    lowFpsTime += dt;
    if (lowFpsTime > 2) { quality = 'low'; bloom.enabled = false; renderer.setPixelRatio(1); composer.setPixelRatio(1); }
  } else lowFpsTime = 0;
  if (!debug.hidden) {
    const info = renderer.info.render;
    debug.textContent = `${(1000 / avg).toFixed(0)} fps · ${avg.toFixed(1)} ms · ${info.calls} draw calls · ${(info.triangles / 1000).toFixed(0)}k tris · ${quality}`;
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
  if (mode === 'play') {
    if (keys.has('ArrowLeft')) camYaw += 120 * dt * settings.sensitivity;
    if (keys.has('ArrowRight')) camYaw -= 120 * dt * settings.sensitivity;
  }
  let steps = 0;
  while (acc >= 1 / TICK_HZ && steps < 8) {
    if (mode === 'play' && !BENCH && (game.state === 'playing' || game.state === 'paused')) {
      const input = readInput();
      onEvents(step(game, input));
      onTickSounds(input);
    }
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

// ---------- debug / benchmark hooks ----------
window.__game = () => game;
window.__mode = () => mode;
// Advance the sim n ticks through the same path as the frame loop (events -> sound/screens).
window.__advance = (n = 1, input = {}) => {
  for (let i = 0; i < n && (game.state === 'playing' || game.state === 'paused'); i++) {
    onEvents(step(game, { move: [0, 0], cam_yaw_deg: camYaw, ...input }));
    if (i === 0) input = { ...input, jump: false, interact: false, pulse: false, dash: false, pause: false };
  }
  sync(performance.now() / 1000, 1 / 60);
  drawHud();
  renderer.info.reset();
  composer.render();
  return { mode, state: game.state, tick: game.tick };
};
// Synchronous render benchmark (works even when rAF is paused): waits for the GPU each frame.
window.__benchSync = (n = 300, opts = {}) => {
  const gl = renderer.getContext();
  const px = new Uint8Array(4);
  if (opts.bloom !== undefined) bloom.enabled = opts.bloom;
  const times = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    sync(i / 60, 1 / 60);
    renderer.info.reset();
    composer.render();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / n;
  const d = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    night, frames: n, mean_ms: +mean.toFixed(2), p95_ms: +times[Math.floor(n * 0.95)].toFixed(2), fps_equiv: +(1000 / mean).toFixed(0),
    draw_calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, bloom: bloom.enabled,
    pixel_ratio: renderer.getPixelRatio(), size: [innerWidth, innerHeight], gpu: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'n/a',
  };
};

const startAt = Number(params.get('night'));
if ([1, 2, 3].includes(startAt)) { startNight(startAt); if (BENCH) { mode = 'bench'; hide(); } else beginPlay(); }
else { startNight(1); showMenu(); }
requestAnimationFrame(frame);
