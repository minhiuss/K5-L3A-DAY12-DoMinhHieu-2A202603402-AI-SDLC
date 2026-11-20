// Windowed game: menu -> night intro -> play -> result -> next night (3 nights) -> dawn -> leaderboard.
// Reads keyboard/mouse, drives src/sim.js at a fixed 60 Hz, and only draws the sim state.
// No game rule lives here or in src/view/.
// URL: ?night=N (jump in) ?seed=N ?q=low ?bench=1 (orbit view) ?benchmark=1&seed=42&duration=30 (v1.3 bench)
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createGame, createBenchGame, step, timeLeft, capacityOf, TICK_HZ } from './sim.js';
import { TUNING as T, RULES as R } from './tuning.js';
import { MAPS } from './maps.js';
import { PAL } from './view/palette.js';
import { glowTexture, shadowTexture } from './view/textures.js';
import { buildSky } from './view/sky.js';
import { buildWorld } from './view/world.js';
import { makeMay, makeGreatLantern, setShadeColorblind, makeDrifter, makeCharm } from './view/models.js';
import { loadMay } from './view/may.js';
import { makeShadeLayer } from './view/shades.js';
import { makeMoteLayer, makeAmbientFireflies, makeWindLeaves } from './view/fireflies.js';
import { makeAudio } from './view/audio.js';

const params = new URLSearchParams(location.search);
const ORBIT = params.has('bench');
const BENCHMARK = params.has('benchmark');
const BENCH_SEED = Number(params.get('seed') ?? 42);
const BENCH_DURATION = Number(params.get('duration') ?? 30);
let quality = params.get('q') === 'low' ? 'low' : 'high';

// ---------- settings (saved between sessions) ----------
const ACTIONS = [
  ['forward', 'Tiến'], ['back', 'Lùi'], ['left', 'Trái'], ['right', 'Phải'], ['jump', 'Nhảy'], ['dash', 'Lướt'],
  ['interact', 'Nạp / châm dầu'], ['pulse', 'Tỏa Sáng'], ['arrow', 'Bắn tên (sáng tạo)'], ['pause', 'Tạm dừng'],
];
const DEFAULT_KEYS = { forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', dash: 'ShiftLeft', interact: 'KeyE', pulse: 'KeyF', arrow: 'KeyQ', pause: 'KeyP' };
const SETTINGS_KEY = 'dao-den-long-settings';
const settings = { volume: 0.7, sensitivity: 1, colorblind: false, reducedMotion: false, largeText: false, creative: true, keys: { ...DEFAULT_KEYS } };
try {
  const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  Object.assign(settings, saved, { keys: { ...DEFAULT_KEYS, ...(saved.keys || {}) } });
} catch { /* private mode: defaults */ }
const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ } };
const audio = makeAudio();
audio.setVolume(settings.volume);
function applySettings() {
  setShadeColorblind(settings.colorblind);
  document.body.classList.toggle('cb', settings.colorblind);
  document.body.classList.toggle('large', settings.largeText);
}
const keyName = (code) => (code || '—').replace(/^Key/, '').replace(/^Digit/, '').replace('Left', ' trái').replace('Right', ' phải').replace('Space', 'Space');
function duplicateKeys() {
  const seen = new Map(), dup = [];
  for (const [a] of ACTIONS) {
    const k = settings.keys[a];
    if (seen.has(k)) dup.push([k, seen.get(k), a]); else seen.set(k, a);
  }
  return dup;
}

// ---------- renderer + post ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'low' || BENCHMARK ? 1 : 1.5));
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
const hemi = new THREE.HemisphereLight(0x8a90d6, 0x1c1a2a, 0.15); // Ticket-02: 0.15 + 0.55 x lit / total
scene.add(hemi);
const sky = buildSky(scene, glowTex);
const moon = new THREE.DirectionalLight(0xbfc4ff, 1.6);
moon.position.copy(sky.moonDir).multiplyScalar(50);
scene.add(moon);
const motes = makeMoteLayer(scene, glowTex, 128);
const ambientFlies = makeAmbientFireflies(scene, glowTex, quality === 'low' ? 60 : 140);
const leaves = makeWindLeaves(scene, glowTex);
const shadeLayer = makeShadeLayer(scene, shadowTex, 256);
const pulseRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 72),
  new THREE.MeshBasicMaterial({ color: PAL.lanternCore, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
pulseRing.rotation.x = -Math.PI / 2;
scene.add(pulseRing);
let pulseAnim = 0;

// creative arrows (visual only; the hit is decided by the sim)
const arrowGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.9, 5);
arrowGeo.rotateX(Math.PI / 2);
const arrowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.lanternCore).multiplyScalar(3) });
const flying = [];

// ---------- Mây: rigged model (async), procedural fallback ----------
function adaptProcedural(m) {
  return {
    ...m, roll() {}, shoot() {},
    animate(t, dt, { walk, grounded }) {
      const swing = Math.sin(t * 11) * 0.7 * walk;
      m.legs[0].rotation.x = grounded ? swing : 0.5; m.legs[1].rotation.x = grounded ? -swing : -0.3;
      m.arms[0].rotation.x = -swing * 0.8; m.arms[1].rotation.x = swing * 0.8;
      m.rig.position.y = Math.abs(Math.sin(t * 11)) * 0.06 * walk;
    },
  };
}
// The procedural Mây is only a fallback: it is never in the scene unless may.glb fails to load
// (before, it stood in the scene during the load and read as a second, frozen "ghost" Mây).
let may = adaptProcedural(makeMay(shadowTex));
const mayReady = loadMay('./assets/may.glb', shadowTex).then((m) => {
  may = m;
  scene.add(may.root);
  return true;
}).catch((e) => {
  console.warn('may.glb failed, using the procedural Mây', e);
  scene.add(may.root);
  return false;
});

// ---------- night state ----------
const INTRO = {
  1: 'Đảo Bến tắt đèn rồi, cháu ạ. Gom đom đóm, thắp lại năm ngọn đèn lớn, rồi giữ cho chúng cháy tới khi trời sáng.',
  2: 'Đảo Cau có hai hòn, nối nhau bằng chiếc cầu tre. Bục đá vàng sẽ ném cháu qua biển mây, đừng nhìn xuống. Coi chừng Gió Lạc, nó thích đom đóm lắm.',
  3: 'Đảo Chuông cao ba tầng, gió ở đây chẳng chiều ai. Leo dốc, nhảy bục, giữ đèn trên tháp chuông sáng tới bình minh.',
};
let mode = 'loading'; // loading | menu | intro | play | result | dawn | benchmark | orbit
let night = 1;
let totalScore = 0;
let nightsWon = 0;
let campaignSeed = 0;
let game = createGame(0, {}, 1);
let world = null;
let nightGroup = null;
let lanterns = new Map(), drifters = new Map(), charms = new Map();
const seedFromUrl = params.get('seed');

function buildNight(n, g) {
  night = n;
  game = g;
  if (nightGroup) scene.remove(nightGroup);
  nightGroup = new THREE.Group();
  scene.add(nightGroup);
  world = buildWorld(MAPS[n], glowTex);
  nightGroup.add(world.group);
  lanterns = new Map(); drifters = new Map(); charms = new Map();
  shadeLayer.reset();
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
  prev = {}; pending = {};
  facing = 0;
  lastPos = [...game.player.pos];
  camPos.set(game.player.pos[0], game.player.pos[1] + 6, game.player.pos[2] - 10);
  lastCountdown = null; lastWindDir = null; lowWarned = new Set();
}
function startNight(n) {
  buildNight(n, createGame(campaignSeed + n - 1, {}, n, { creative: settings.creative }));
}

// ---------- input: rebindable keys, pointer-lock TPS camera ----------
const keys = new Set();
let camYaw = 0;   // degrees, same meaning as cam_yaw_deg in the inputs file
let camPitch = 24; // degrees above the horizon
let camDist = 8;
let pending = {};
let prev = {};
let capturing = null; // action waiting for a new key in the settings screen
const actionOf = (code) => Object.keys(settings.keys).filter((a) => settings.keys[a] === code);
addEventListener('keydown', (e) => {
  if (capturing) { e.preventDefault(); captureKey(e.code); return; }
  keys.add(e.code);
  if (mode === 'play') {
    for (const a of actionOf(e.code)) if (['jump', 'interact', 'pulse', 'dash', 'pause', 'arrow'].includes(a)) pending[a] = true;
    if (e.code === 'Escape') pending.pause = true;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  }
  if (e.code === 'Enter') { const b = card.querySelector('[data-primary]'); if (b && !overlay.classList.contains('hidden') && document.activeElement?.tagName !== 'INPUT') { b.click(); e.preventDefault(); } }
  if (e.code === 'Backquote' || e.code === 'F3') { debug.hidden = !debug.hidden; e.preventDefault(); }
});
addEventListener('keyup', (e) => keys.delete(e.code));
const canvas = renderer.domElement;
canvas.addEventListener('click', () => {
  audio.unlock();
  if (mode === 'play' && game.state === 'playing' && document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
});
document.addEventListener('pointerlockchange', () => {
  // Esc releases pointer lock in every browser: treat it as "pause" while playing
  if (document.pointerLockElement !== canvas && mode === 'play' && game.state === 'playing') pending.pause = true;
});
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas && mode === 'play') {
    camYaw -= e.movementX * 0.15 * settings.sensitivity;
    camPitch = Math.min(70, Math.max(-5, camPitch + e.movementY * 0.12 * settings.sensitivity));
  }
});
addEventListener('wheel', (e) => { camDist = Math.min(16, Math.max(4, camDist + Math.sign(e.deltaY))); }, { passive: true });

// Screen-right at yaw 0 is world -X (camera looks along +Z), so "right" sends x = -1.
function readInput() {
  const k = settings.keys;
  const x = (keys.has(k.left) ? 1 : 0) - (keys.has(k.right) ? 1 : 0);
  const z = (keys.has(k.forward) ? 1 : 0) - (keys.has(k.back) ? 1 : 0);
  const input = { move: [x, z], cam_yaw_deg: camYaw };
  for (const b of ['jump', 'interact', 'pulse', 'dash', 'pause', 'arrow']) {
    input[b] = !!pending[b] && !prev[b];
    prev[b] = input[b];
    if (input[b]) pending[b] = false;
  }
  return input;
}

// ---------- overlay screens ----------
const $ = (id) => document.getElementById(id);
const overlay = $('overlay'), card = $('card'), debug = $('debug'), flash = $('flash'), captions = $('captions');
function show(html, handlers = {}) {
  if (document.pointerLockElement) document.exitPointerLock();
  card.innerHTML = html;
  overlay.classList.remove('hidden');
  for (const [sel, fn] of Object.entries(handlers)) {
    card.querySelectorAll(sel).forEach((el) => { el.onclick = () => { audio.unlock(); audio.sfx.ui(); fn(el); }; });
  }
}
const hide = () => overlay.classList.add('hidden');
const controlsLine = () => `<p class="small">${['forward', 'left', 'back', 'right'].map((a) => keyName(settings.keys[a])).join('')} đi · chuột xoay camera (bấm vào màn hình để khoá chuột) · ${keyName(settings.keys.jump)} nhảy · ${keyName(settings.keys.dash)} lướt · ${keyName(settings.keys.interact)} nạp/châm · ${keyName(settings.keys.pulse)} Tỏa Sáng${settings.creative ? ` · ${keyName(settings.keys.arrow)} bắn tên` : ''} · Esc/${keyName(settings.keys.pause)} dừng</p>`;

function showMenu() {
  mode = 'menu';
  show(`<h1>Đảo Đèn Lồng</h1><p class="sub">Ba đêm, ba hòn đảo, một người giữ đèn nhỏ tuổi.</p>
    <button data-primary data-act="start">Bắt đầu (Enter)</button>
    <div class="row">Chọn Đêm: <button class="ghost" data-night="1">1</button><button class="ghost" data-night="2">2</button><button class="ghost" data-night="3">3</button></div>
    <div class="row"><button class="ghost" data-act="board">Bảng xếp hạng</button><button class="ghost" data-act="settings">Cài đặt</button></div>${controlsLine()}`, {
    '[data-act=start]': () => newCampaign(1),
    '[data-night]': (el) => newCampaign(Number(el.dataset.night)),
    '[data-act=board]': () => showBoard(showMenu),
    '[data-act=settings]': () => showSettings(showMenu),
  });
}
function newCampaign(n) {
  totalScore = 0; nightsWon = 0;
  campaignSeed = seedFromUrl !== null ? Number(seedFromUrl) : (Date.now() & 0x7fffffff);
  startNight(n);
  showIntro();
}
function showIntro() {
  mode = 'intro';
  show(`<p class="sub">Đêm ${night}</p><h1>${MAPS[night].name}</h1>
    <p class="quote">“${INTRO[night]}”<br><span class="small">— Ông Đăng</span></p>
    <p class="small">Giữ ít nhất ${Math.ceil(T.win_ratio * game.lanterns.length)}/${game.lanterns.length} đèn sáng tới bình minh (${Math.round(game.startTime)} giây). Đèn hao dầu: bấm ${keyName(settings.keys.interact)} để châm.</p>
    <button data-primary data-act="go">Vào đêm (Enter)</button>`, { '[data-act=go]': beginPlay });
}
function beginPlay() { mode = 'play'; hide(); audio.unlock(); canvas.requestPointerLock?.(); }
function showPause() {
  show(`<h1>Tạm dừng</h1>
    <button data-primary data-act="resume">Tiếp tục</button>
    <button class="ghost" data-act="restart">Chơi lại Đêm</button>
    <button class="ghost" data-act="settings">Cài đặt</button>
    <button class="ghost" data-act="menu">Về menu</button>`, {
    '[data-act=resume]': () => { pending.pause = true; hide(); canvas.requestPointerLock?.(); },
    '[data-act=restart]': () => { startNight(night); beginPlay(); },
    '[data-act=settings]': () => showSettings(showPause),
    '[data-act=menu]': showMenu,
  });
}
function showSettings(back) {
  const dups = duplicateKeys();
  const dupKeys = new Set(dups.map((d) => d[0]));
  const rows = ACTIONS.map(([a, label]) => `<div class="bind"><span>${label}</span><button class="ghost key${dupKeys.has(settings.keys[a]) ? ' dup' : ''}" data-bind="${a}">${capturing === a ? 'Bấm phím…' : keyName(settings.keys[a])}</button></div>`).join('');
  show(`<h1>Cài đặt</h1>
    <label>Âm lượng <input id="vol" type="range" min="0" max="1" step="0.05" value="${settings.volume}"></label>
    <label>Độ nhạy chuột <input id="sens" type="range" min="0.2" max="2.5" step="0.1" value="${settings.sensitivity}"></label>
    <label>Bảng màu dễ phân biệt <input id="cb" type="checkbox" ${settings.colorblind ? 'checked' : ''}></label>
    <label>Giảm chuyển động (tắt rung, tắt chớp) <input id="rm" type="checkbox" ${settings.reducedMotion ? 'checked' : ''}></label>
    <label>Chữ lớn (×1.25) <input id="lt" type="checkbox" ${settings.largeText ? 'checked' : ''}></label>
    <label>Kỹ năng sáng tạo: bắn tên, chạy nhanh (áp dụng từ Đêm sau) <input id="cr" type="checkbox" ${settings.creative ? 'checked' : ''}></label>
    <h2>Phím</h2><div class="binds">${rows}</div>
    ${dups.length ? `<p class="warn">⚠ Trùng phím: ${dups.map(([k, a, b]) => `${keyName(k)} (${ACTIONS.find((x) => x[0] === a)[1]} / ${ACTIONS.find((x) => x[0] === b)[1]})`).join(', ')}</p>` : ''}
    <div class="row"><button class="ghost" data-act="defaults">Khôi phục mặc định</button><button data-primary data-act="back">Xong</button></div>`, {
    '[data-act=back]': () => { capturing = null; back(); },
    '[data-act=defaults]': () => { settings.keys = { ...DEFAULT_KEYS }; saveSettings(); showSettings(back); },
    '[data-bind]': (el) => { capturing = el.dataset.bind; settingsBack = back; showSettings(back); },
  });
  const bind = (id, key, after) => { $(id).oninput = $(id).onchange = (e) => { settings[key] = e.target.type === 'checkbox' ? e.target.checked : Number(e.target.value); saveSettings(); after?.(); }; };
  bind('vol', 'volume', () => audio.setVolume(settings.volume));
  bind('sens', 'sensitivity');
  bind('cb', 'colorblind', applySettings);
  bind('rm', 'reducedMotion');
  bind('lt', 'largeText', applySettings);
  bind('cr', 'creative');
}
let settingsBack = showMenu;
function captureKey(code) {
  if (code !== 'Escape') settings.keys[capturing] = code;
  capturing = null;
  saveSettings();
  showSettings(settingsBack);
}

// ---------- leaderboard (server on disk; localStorage mirror if the API is missing) ----------
const LB_LOCAL = 'dao-den-long-leaderboard';
const NAME_RE = /^[\p{L}\p{M}\p{N}_]+$/u;
function nameError(raw) {
  const name = raw.normalize('NFC').trim();
  const len = [...name].length;
  if (len < 3 || len > 12) return 'Tên dài 3–12 ký tự';
  if (!NAME_RE.test(name)) return 'Chỉ dùng chữ, số và _';
  return null;
}
function isoLocal(d = new Date()) {
  const pad = (n) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${off >= 0 ? '+' : '-'}${pad(off / 60)}:${pad(off % 60)}`;
}
const sortLocal = (list) => [...list].sort((a, b) => b.score - a.score || Date.parse(a.achieved_at) - Date.parse(b.achieved_at)).slice(0, 10);
async function getBoard() {
  try { const r = await fetch('./api/leaderboard'); if (r.ok) return (await r.json()).entries; } catch { /* offline */ }
  try { return JSON.parse(localStorage.getItem(LB_LOCAL) || '[]'); } catch { return []; }
}
async function postBoard(entry) {
  try {
    const r = await fetch('./api/leaderboard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
    if (r.ok) return (await r.json()).entries;
  } catch { /* fall back below */ }
  const list = sortLocal([...(await getBoard()), entry]);
  try { localStorage.setItem(LB_LOCAL, JSON.stringify(list)); } catch { /* ignore */ }
  return list;
}
async function showBoard(back, highlight = null) {
  const list = await getBoard();
  const rows = list.length
    ? list.map((e, i) => `<tr class="${highlight && e.name === highlight.name && e.achieved_at === highlight.achieved_at ? 'me' : ''}"><td>${i + 1}</td><td>${escapeHtml(e.name)}</td><td>${e.score}</td><td>${e.nights_won}/3</td><td>${e.achieved_at.slice(0, 16).replace('T', ' ')}</td></tr>`).join('')
    : '<tr><td colspan="5">Chưa có ai. Hãy là người đầu tiên!</td></tr>';
  show(`<h1>Bảng xếp hạng</h1><table class="board"><tr><th>#</th><th>Tên</th><th>Điểm</th><th>Đêm</th><th>Lúc</th></tr>${rows}</table>
    <button data-primary data-act="back">Xong (Enter)</button>`, { '[data-act=back]': back });
}
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function saveScoreForm() {
  return `<div class="save"><input id="pname" maxlength="24" placeholder="Tên của bạn (3–12)" autocomplete="off"><button class="ghost" data-act="save">Lưu điểm</button></div><p class="warn" id="perr"></p>`;
}
function wireSave(after) {
  const input = $('pname');
  const btn = card.querySelector('[data-act=save]');
  input?.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.code === 'Enter') btn.click(); });
  if (btn) btn.onclick = async () => {
    const err = nameError(input.value);
    if (err) { $('perr').textContent = `⚠ ${err}`; return; }
    const entry = { name: input.value.normalize('NFC').trim(), score: totalScore, nights_won: nightsWon, achieved_at: isoLocal(), seed: campaignSeed };
    btn.disabled = true;
    await postBoard(entry);
    showBoard(after, entry);
  };
}

function showResult(won, reason) {
  mode = 'result';
  if (won) { totalScore += game.score; nightsWon++; }
  if (won && night === 3) {
    mode = 'dawn';
    show(`<h1 class="dawn">Bình Minh</h1><p>Ba hòn đảo đã sáng tới sáng. Mây về nhà khi mặt trời lên.</p>
      <p class="big">${totalScore} điểm</p>${saveScoreForm()}<button data-primary data-act="menu">Về menu</button>`, { '[data-act=menu]': showMenu });
    wireSave(showMenu);
    return;
  }
  const why = { dawn_survived: 'Đảo còn sáng tới bình minh!', dawn: 'Trời sáng mà số đèn còn sáng chưa đủ.', no_flames: 'Mây đã hết Ngọn Lửa.' }[reason];
  if (won) {
    show(`<p class="sub">Đêm ${night} · ${MAPS[night].name}</p><h1>Đảo đã sáng!</h1><p>${why}</p>
      <p class="big">${game.score} điểm</p><p class="small">Tổng: ${totalScore}</p>
      <button data-primary data-act="next">Đêm ${night + 1} (Enter)</button>`, { '[data-act=next]': () => { startNight(night + 1); showIntro(); } });
  } else {
    show(`<p class="sub">Đêm ${night} · ${MAPS[night].name}</p><h1>Đêm chưa qua…</h1><p>${why}</p>
      <p class="small">Tổng điểm các Đêm đã thắng: ${totalScore}</p>${saveScoreForm()}
      <button data-primary data-act="retry">Chơi lại Đêm ${night} (Enter)</button><button class="ghost" data-act="menu">Về menu</button>`,
    { '[data-act=retry]': () => { startNight(night); beginPlay(); }, '[data-act=menu]': showMenu });
    wireSave(showMenu);
  }
}

// ---------- captions + edge indicators (accessibility) ----------
const capList = [];
function caption(text, kind = 'info', seconds = 3) {
  capList.push({ text, kind, until: performance.now() + seconds * 1000 });
  if (capList.length > 4) capList.shift();
}
const spawnMarks = []; // { id, until }
function drawCaptions(now) {
  for (let i = capList.length - 1; i >= 0; i--) if (capList[i].until < now) capList.splice(i, 1);
  captions.innerHTML = capList.map((c) => `<div class="cap ${c.kind}">${c.kind === 'warn' ? '⚠ ' : ''}${c.text}</div>`).join('');
}

// ---------- HUD ----------
const hudFlames = $('flames'), hudTimer = $('timer'), hudTR = $('tr'), hudBag = $('bag'), hudCd = $('cds'), promptEl = $('prompt'), arrowEl = $('arrow'), edgeBox = $('edges');
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const distXZ = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const v = new THREE.Vector3();
function edgePoint(pos, lift) {
  v.set(pos[0], pos[1] + lift, pos[2]).project(camera);
  const behind = v.z > 1;
  const onScreen = !behind && Math.abs(v.x) < 0.92 && Math.abs(v.y) < 0.88;
  let x = v.x, y = v.y;
  if (behind) { x = -x; y = -y; }
  const a = Math.atan2(y, x);
  const k = Math.min(0.86 / Math.abs(Math.cos(a) || 1e-6), 0.8 / Math.abs(Math.sin(a) || 1e-6));
  return { onScreen, left: (0.5 + 0.5 * Math.cos(a) * k) * 100, top: (0.5 - 0.5 * Math.sin(a) * k) * 100, a };
}
function drawHud(now) {
  const playing = mode === 'play';
  document.body.classList.toggle('playing', playing);
  drawCaptions(now);
  if (!playing) return;
  const p = game.player;
  const lit = game.lanterns.filter((l) => l.lit).length;
  hudFlames.innerHTML = Array.from({ length: T.flames }, (_, i) => `<i class="flame${i < p.flames ? '' : ' out'}"></i>`).join('');
  const tl = Math.max(0, timeLeft(game));
  hudTimer.textContent = `${tl <= 30 ? '⚠ ' : ''}${fmt(Math.ceil(tl - 1e-9))}`;
  hudTimer.classList.toggle('danger', tl <= 30);
  hudTR.innerHTML = `<div>Đèn sáng <b>${lit}/${game.lanterns.length}</b> <span class="small">(cần ${Math.ceil(T.win_ratio * game.lanterns.length)})</span></div><div class="score">${game.score}</div>${totalScore ? `<div class="small">Tổng ${totalScore + game.score}</div>` : ''}`;
  const cap = capacityOf(p);
  hudBag.innerHTML = Array.from({ length: cap }, (_, i) => `<i class="slot${i < p.carried ? ' full' : ''}"></i>`).join('') + `<b class="count">${p.carried}/${cap}</b>`;
  const dashF = p.charm > 0 ? 0 : p.dashCd / (T.dash_cooldown_s * TICK_HZ);
  const pulseF = p.pulseCd / (T.pulse_cooldown_s * TICK_HZ);
  hudCd.innerHTML =
    `<div class="cd${p.charm > 0 ? ' charm' : ''}" style="--f:${dashF}"><span>Lướt</span><small>${keyName(settings.keys.dash)}</small></div>` +
    `<div class="cd${p.carried < T.pulse_cost ? ' off' : ''}" style="--f:${pulseF}"><span>Tỏa Sáng</span><small>${keyName(settings.keys.pulse)} · ${T.pulse_cost}</small></div>` +
    (game.creative ? `<div class="cd" style="--f:${p.arrowCd / R.arrow_cooldown}"><span>Tên</span><small>${keyName(settings.keys.arrow)}</small></div>` : '');
  const nearL = game.lanterns.find((l) => (!l.lit || l.fuel < T.fuel_max * TICK_HZ) && distXZ(p.pos, l.pos) <= T.interact_radius && Math.abs(p.pos[1] - l.pos[1]) <= R.height_tolerance);
  promptEl.textContent = !nearL ? '' : nearL.lit
    ? `${keyName(settings.keys.interact)} — Châm dầu (${Math.floor(nearL.fuel / TICK_HZ)}/${T.fuel_max})`
    : `${keyName(settings.keys.interact)} — Nạp ánh sáng (${nearL.deposited}/${nearL.everLit ? T.relight_cost : T.lantern_cost})`;
  // arrow to the nearest unlit lantern when off screen
  let target = null, best = Infinity;
  for (const l of game.lanterns) { const d = distXZ(p.pos, l.pos); if (!l.lit && d < best) { best = d; target = l; } }
  if (target) {
    const e = edgePoint(target.pos, 3);
    arrowEl.hidden = e.onScreen;
    if (!e.onScreen) { arrowEl.style.left = `${e.left}%`; arrowEl.style.top = `${e.top}%`; arrowEl.style.transform = `translate(-50%, -50%) rotate(${-e.a}rad)`; }
  } else arrowEl.hidden = true;
  // edge arrows for newly spawned shades (3 s)
  for (let i = spawnMarks.length - 1; i >= 0; i--) if (spawnMarks[i].until < now) spawnMarks.splice(i, 1);
  edgeBox.innerHTML = spawnMarks.map((m) => {
    const s = game.shades.find((x) => x.id === m.id);
    if (!s) return '';
    const e = edgePoint(s.pos, 0.5);
    return `<i class="shadeArrow" style="left:${e.left}%;top:${e.top}%;transform:translate(-50%,-50%) rotate(${-e.a}rad)"></i>`;
  }).join('');
}

// ---------- sync sim -> scene ----------
let facing = 0;
let lastPos = [0, 0, 0];
const camPos = new THREE.Vector3(0, 6, -9);
const camLook = new THREE.Vector3();
let shake = 0;
const num = (id) => Number(String(id).replace(/\D/g, '')) || 0;

function sync(t, dt) {
  const p = game.player;
  may.root.position.set(p.pos[0], p.pos[1], p.pos[2]);
  const dx = p.pos[0] - lastPos[0], dz = p.pos[2] - lastPos[2];
  const speed = Math.hypot(dx, dz) / Math.max(dt, 1e-3);
  lastPos = [...p.pos];
  if (p.dash > 0) facing = Math.atan2(p.dashDir[0], p.dashDir[1]); // face the dash so the flip goes that way
  else if (speed > 0.5 && speed < 40) {
    const target = Math.atan2(dx, dz);
    facing += Math.atan2(Math.sin(target - facing), Math.cos(target - facing)) * Math.min(1, dt * 12);
  }
  may.rig.rotation.y = facing;
  const sprint = game.creative && p.runTicks >= R.sprint_after && p.charm === 0;
  may.animate(t, dt, { walk: p.grounded ? Math.min(1, speed / T.player_speed) : 0, grounded: p.grounded, sprint });
  may.lamp.emissiveIntensity = 0.8 + p.carried * 0.25;
  may.lampLight.intensity = 1.5 + p.carried * 0.6;
  may.rig.visible = !p.invuln || Math.floor(p.invuln / 6) % 2 === 0;
  may.shadow.visible = p.grounded;

  let litCount = 0;
  for (const l of game.lanterns) {
    const m = lanterns.get(l.id);
    const frac = l.deposited / T.lantern_cost;
    const flick = 0.92 + 0.08 * Math.sin(t * 9 + l.pos[0]);
    const lowBlink = l.lit && l.fuel < T.low_fuel_threshold * TICK_HZ && Math.floor(t) % 2 === 1; // 1 Hz
    const fuelK = l.lit ? l.fuel / (T.fuel_max * TICK_HZ) : 0;
    m.fuelBar.visible = l.lit && !lowBlink;
    m.fuelFill.scale.x = Math.max(0.001, fuelK);
    m.fuelBar.quaternion.copy(camera.quaternion);
    m.lampGroup.scale.set(1.25, l.lit ? 1.25 : 1.0, 1.25); // unlit: squashed 20%
    m.tear.visible = !l.lit;
    m.paper.color.setHex(l.lit ? PAL.lanternLit : PAL.lanternOff);
    m.paper.emissiveIntensity = l.lit ? (lowBlink ? 0.6 : 2.6 * flick) : frac * 0.6;
    m.core.material.opacity = l.lit ? 1 : 0;
    m.light.intensity = l.lit ? (lowBlink ? 15 : 70 * flick * (0.5 + 0.5 * fuelK)) : frac * 5;
    m.halo.material.opacity = l.lit ? 0.75 : frac * 0.2;
    m.poolMat.opacity = l.lit ? 0.3 : 0;
    m.ringMat.opacity = l.lit && l.fuel >= T.low_fuel_threshold * TICK_HZ ? 0.35 + 0.1 * Math.sin(t * 2) : 0;
    m.lampGroup.rotation.z = Math.sin(t * 0.8 + l.pos[2]) * 0.04;
    m.pips.forEach((pip, i) => { pip.visible = i < (l.everLit ? T.relight_cost : T.lantern_cost); pip.material.emissiveIntensity = !l.lit && i < l.deposited ? 3 : 0; });
    if (l.lit) litCount++;
  }
  const k = litCount / game.lanterns.length;
  hemi.intensity = 0.15 + 0.55 * k; // Ticket-02 ambient rule
  scene.fog.color.copy(FOG).lerp(FOG_WARM, k * 0.6);

  motes.update(game.motes, t);
  shadeLayer.update(game.shades, p, t, dt, settings.colorblind);

  for (const d of game.drifters) {
    let m = drifters.get(d.id);
    if (!m) { m = makeDrifter(); m.trail = []; nightGroup.add(m.root); drifters.set(d.id, m); }
    m.root.visible = d.state !== 'removed';
    if (!m.root.visible) continue;
    m.trail.unshift([d.pos[0], d.pos[1], d.pos[2]]);
    if (m.trail.length > 40) m.trail.length = 40;
    m.segs.forEach((sg, i) => {
      const q = m.trail[Math.min(m.trail.length - 1, i * 4)];
      sg.position.set(q[0], q[1] + 0.25 * Math.sin(t * 6 - i * 0.8), q[2]);
      sg.rotation.set(Math.sin(t * 4 + i) * 0.6, t * 2 + i * 0.5, 0);
    });
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
  for (let i = flying.length - 1; i >= 0; i--) {
    const a = flying[i];
    a.left -= dt;
    a.mesh.position.addScaledVector(a.dir, 45 * dt);
    if (a.left <= 0) { scene.remove(a.mesh); flying.splice(i, 1); }
  }

  // camera
  if (BENCHMARK) {
    // Ticket-04 bench camera: circle r=30 at Y=15 around (0,0,0), start at 0° = (30,15,0), CCW from above, 15 s per lap
    const th = (2 * Math.PI * benchClock()) / 15;
    camera.position.set(30 * Math.cos(th), 15, 30 * Math.sin(th));
    camera.lookAt(0, 0, 0);
  } else if (ORBIT) {
    camera.position.set((night === 2 ? 35 : 0) + Math.sin(t * 0.25) * 40, 18, Math.cos(t * 0.25) * 40);
    camera.lookAt(night === 2 ? 35 : 0, 0, 0);
  } else {
    // third-person: yaw from the mouse, pitch above the horizon; smoothed; never below the cloud line
    const yaw = (camYaw * Math.PI) / 180, pitch = (camPitch * Math.PI) / 180;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const py = Math.max(p.pos[1], -3);
    const want = new THREE.Vector3(p.pos[0] - fx * camDist * Math.cos(pitch), py + 1.5 + camDist * Math.sin(pitch), p.pos[2] - fz * camDist * Math.cos(pitch));
    camPos.lerp(want, Math.min(1, dt * 12));
    camera.position.copy(camPos);
    camLook.set(p.pos[0] + fx * 2, py + 1.4, p.pos[2] + fz * 2);
    if (shake > 0 && !settings.reducedMotion) {
      shake = Math.max(0, shake - dt);
      camera.position.x += (Math.random() - 0.5) * shake; // display only, never game logic
      camera.position.y += (Math.random() - 0.5) * shake;
    }
    camera.lookAt(camLook);
  }

  sky.update(camera, k);
  world.update(t);
  if (!BENCHMARK) {
    ambientFlies.update(t);
    const windStrength = game.wind.active ? 2.2 : game.wind.dir !== null ? 0.8 : 0;
    leaves.update(t, p.pos, game.wind.dir, windStrength);
  }
  if (pulseAnim > 0) {
    pulseAnim = Math.max(0, pulseAnim - dt * 3);
    const r = T.pulse_radius * (1 - pulseAnim) + 0.01;
    pulseRing.scale.set(r, r, 1);
    pulseRing.material.opacity = pulseAnim;
  }
}

// ---------- events -> sound / effects / captions / screens ----------
let lastCountdown = null;
let lastWindDir = null;
let lowWarned = new Set();
function onEvents(events) {
  const s = audio.sfx;
  for (const e of events) {
    switch (e.name) {
      case 'mote_picked': s.pick(); break;
      case 'deposit': case 'refuel': s.deposit(); break;
      case 'lantern_lit': s.lit(); lowWarned.delete(e.data.lantern_id); break;
      case 'lantern_out': s.shade(); caption(`Đèn ${e.data.lantern_id} đã tắt`, 'warn'); break;
      case 'pulse': s.pulse(); pulseAnim = 1; pulseRing.position.set(game.player.pos[0], game.player.pos[1] + 0.1, game.player.pos[2]); break;
      case 'player_hit':
        if (e.data.by === 'fall') s.fall(); else s.hit();
        shake = 0.35;
        if (!settings.reducedMotion) { flash.style.opacity = '1'; setTimeout(() => { flash.style.opacity = '0'; }, 180); }
        caption(e.data.by === 'fall' ? 'Rơi khỏi đảo! −1 Ngọn Lửa' : 'Bị Bóng Mực chạm! −1 Ngọn Lửa', 'warn', 2);
        break;
      case 'dash': s.dash(); may.roll(); break;
      case 'arrow': {
        s.arrow(); may.shoot();
        const th = (e.data.dir_deg * Math.PI) / 180;
        const dir = new THREE.Vector3(Math.sin(th), 0, Math.cos(th));
        const mesh = new THREE.Mesh(arrowGeo, arrowMat);
        mesh.position.set(game.player.pos[0], game.player.pos[1] + 1.3, game.player.pos[2]);
        mesh.lookAt(mesh.position.clone().add(dir));
        scene.add(mesh);
        flying.push({ mesh, dir, left: R.arrow_range / 45 });
        if (e.data.hit_id) caption(`Trúng ${e.data.hit_id}!`, 'info', 1.5);
        break;
      }
      case 'shade_spawned': s.shade(); caption('Bóng Mực xuất hiện', 'warn'); spawnMarks.push({ id: e.data.id, until: performance.now() + 3000 }); break;
      case 'charm_picked': s.charm(); caption('Bùa Gió: chạy nhanh, lướt liên tục 10 giây'); break;
      case 'drifter_steal': s.steal(); caption(`Gió Lạc cướp ${e.data.amount} đom đóm!`, 'warn'); break;
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
  if (tl <= 10 && tl > 0 && tl !== lastCountdown) {
    if (lastCountdown === null || lastCountdown > 10) caption('10 giây cuối tới bình minh!', 'warn', 3);
    lastCountdown = tl;
    audio.sfx.countdown();
  }
  if (game.wind.dir !== null && lastWindDir === null) { audio.sfx.wind(); caption('Gió sắp thổi mạnh', 'warn', 3); }
  lastWindDir = game.wind.dir;
  for (const l of game.lanterns) {
    if (l.lit && l.fuel < T.low_fuel_threshold * TICK_HZ && !lowWarned.has(l.id)) { lowWarned.add(l.id); caption(`Đèn ${l.id} sắp cạn dầu`, 'warn', 3); }
  }
}

// ---------- performance + v1.3 benchmark ----------
const frameTimes = [];
let lowFpsTime = 0;
function perf(dtMs, dt) {
  frameTimes.push(dtMs);
  if (frameTimes.length > 120) frameTimes.shift();
  const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
  if (!BENCHMARK && quality === 'high' && frameTimes.length >= 60 && 1000 / avg < 40) {
    lowFpsTime += dt;
    if (lowFpsTime > 2) { quality = 'low'; bloom.enabled = false; renderer.setPixelRatio(1); composer.setPixelRatio(1); }
  } else lowFpsTime = 0;
  if (!debug.hidden) {
    const info = renderer.info.render;
    debug.textContent = `${(1000 / avg).toFixed(0)} fps · ${avg.toFixed(1)} ms · ${info.calls} draw calls · ${(info.triangles / 1000).toFixed(0)}k tris · ${quality}`;
  }
}
let benchStart = null;
const benchDt = [];
const benchClock = () => (benchStart === null ? 0 : (performance.now() - benchStart) / 1000);
function benchFrame(now, dtMs) {
  if (benchStart === null) {
    benchStart = now;
    window.__benchFirstFrameEpoch = Date.now();
    return;
  }
  const tb = (now - benchStart) / 1000;
  if (tb > 3 && tb <= 3 + BENCH_DURATION) benchDt.push(dtMs);
  if (tb > 3 + BENCH_DURATION && !window.__benchResult) {
    const N = benchDt.length;
    const sum = benchDt.reduce((a, b) => a + b, 0);
    const sorted = [...benchDt].sort((a, b) => a - b);
    const k = Math.max(1, Math.ceil(0.01 * N));
    const worst = sorted.slice(-k);
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    window.__benchResult = {
      avg_fps: +((1000 * N) / sum).toFixed(1),
      p1_low_fps: +(1000 / (worst.reduce((a, b) => a + b, 0) / k)).toFixed(1),
      frame_ms_p95: +sorted[Math.min(N - 1, Math.ceil(0.95 * N) - 1)].toFixed(2),
      frames: N,
      gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'n/a',
      three: THREE.REVISION,
      js_heap_peak_mb: window.__heapPeak ?? null,
      size: [innerWidth, innerHeight],
      pixel_ratio: renderer.getPixelRatio(),
      draw_calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    };
    document.title = 'BENCH_DONE';
  }
  if (performance.memory) window.__heapPeak = Math.max(window.__heapPeak || 0, Math.round(performance.memory.usedJSHeapSize / 1048576));
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
    if (mode === 'play' && (game.state === 'playing' || game.state === 'paused')) {
      const input = readInput();
      onEvents(step(game, input));
      onTickSounds(input);
    } else if (mode === 'benchmark') step(game, { move: [0, 0], cam_yaw_deg: 0 });
    acc -= 1 / TICK_HZ;
    steps++;
  }
  const t = (now - clock0) / 1000;
  sync(t, dt);
  drawHud(now);
  renderer.info.reset();
  composer.render();
  if (mode === 'benchmark') benchFrame(now, dtMs);
  else perf(dtMs, dt);
  requestAnimationFrame(frame);
}

addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- debug / test hooks ----------
window.__game = () => game;
window.__mode = () => mode;
window.__may = () => may;
window.__advance = (n = 1, input = {}) => {
  for (let i = 0; i < n && (game.state === 'playing' || game.state === 'paused'); i++) {
    const inp = { move: [0, 0], cam_yaw_deg: camYaw, ...input };
    onEvents(step(game, inp));
    onTickSounds(inp);
    if (i === 0) input = { ...input, jump: false, interact: false, pulse: false, dash: false, pause: false, arrow: false };
  }
  sync(performance.now() / 1000, 1 / 60);
  drawHud(performance.now());
  renderer.info.reset();
  composer.render();
  return { mode, state: game.state, tick: game.tick };
};
window.__benchSync = (n = 300, opts = {}) => {
  const gl = renderer.getContext();
  const px = new Uint8Array(4);
  if (opts.bloom !== undefined) bloom.enabled = opts.bloom;
  const times = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    if (mode === 'benchmark') step(game, { move: [0, 0], cam_yaw_deg: 0 });
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
    mode, night, frames: n, mean_ms: +mean.toFixed(2), p95_ms: +times[Math.floor(n * 0.95)].toFixed(2), fps_equiv: +(1000 / mean).toFixed(0),
    draw_calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, bloom: bloom.enabled,
    pixel_ratio: renderer.getPixelRatio(), size: [innerWidth, innerHeight], gpu: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'n/a',
  };
};

// ---------- boot ----------
applySettings();
buildNight(1, createGame(0, {}, 1));
card.innerHTML = '<h1>Đảo Đèn Lồng</h1><p class="sub">Đang tải Mây…</p>';
requestAnimationFrame(frame);
mayReady.then(() => {
  const startAt = Number(params.get('night'));
  if (BENCHMARK) {
    buildNight(1, createBenchGame(BENCH_SEED));
    mode = 'benchmark';
    hide();
    document.body.classList.add('benchmark');
  } else if (ORBIT && [1, 2, 3].includes(startAt)) {
    buildNight(startAt, createGame(BENCH_SEED, {}, startAt));
    mode = 'orbit';
    hide();
  } else if ([1, 2, 3].includes(startAt)) {
    campaignSeed = seedFromUrl !== null ? Number(seedFromUrl) : (Date.now() & 0x7fffffff);
    startNight(startAt);
    mode = 'play';
    hide();
  } else showMenu();
});
