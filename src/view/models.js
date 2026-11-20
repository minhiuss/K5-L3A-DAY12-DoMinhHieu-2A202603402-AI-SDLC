// Characters and props built from code (no model files): Mây, the Great Lanterns,
// and the Bóng Mực ink shades. Each factory returns a Group plus handles to animate.
import * as THREE from 'three';
import { contactShadow } from './textures.js';

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });

// Round paper lantern body (lathe profile) — shared geometry.
const lanternProfile = [
  [0.06, -0.5], [0.22, -0.46], [0.38, -0.34], [0.47, -0.16], [0.5, 0],
  [0.47, 0.16], [0.38, 0.34], [0.22, 0.46], [0.06, 0.5],
].map(([r, y]) => new THREE.Vector2(r, y));
const lanternGeo = new THREE.LatheGeometry(lanternProfile, 12);

function paperLantern(scale, paperColor) {
  const g = new THREE.Group();
  const paper = new THREE.MeshStandardMaterial({ color: paperColor, emissive: 0xff7a26, emissiveIntensity: 0, roughness: 0.6, side: THREE.DoubleSide, flatShading: true });
  const body = new THREE.Mesh(lanternGeo, paper);
  const capMat = std(0x2b1a12);
  const capT = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.1, 10), capMat);
  capT.position.y = 0.53;
  const capB = capT.clone();
  capB.position.y = -0.53;
  const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.35, 6), std(0xb3261e));
  tassel.position.y = -0.78;
  tassel.rotation.x = Math.PI;
  g.add(body, capT, capB, tassel);
  g.scale.setScalar(scale);
  return { group: g, paper };
}

// ---------- Mây ----------
export function makeMay(shadowTex) {
  const root = new THREE.Group();
  const rig = new THREE.Group(); // rotated to face the walking direction
  root.add(rig);

  const tunic = std(0x3c6bb0);
  const skin = std(0xf0c39c);
  const pants = std(0x2a2f4a);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.4, 0.82, 12), tunic);
  body.position.y = 0.86;
  const sash = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 6, 16), std(0xc0392b));
  sash.rotation.x = Math.PI / 2;
  sash.position.y = 0.72;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), skin);
  head.position.y = 1.47;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), std(0x1b1420));
  hair.position.set(0, 1.5, -0.03);
  hair.rotation.x = -0.35;
  const eyeMat = std(0x1a1020);
  const eyes = [-0.08, 0.08].map((x) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), eyeMat);
    e.position.set(x, 1.49, 0.23);
    return e;
  });

  // nón lá: wide, flat cone with a rim ring
  const hatMat = std(0xe3cf95, { roughness: 0.7, flatShading: true });
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.78, 0.36, 24), hatMat);
  hat.position.y = 1.78;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.02, 4, 32), std(0xb89c5c));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 1.61;

  // small lantern hanging from a stick on the hat brim
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.7, 5), std(0x5a3d22));
  stick.position.set(0.55, 1.78, 0.32);
  stick.rotation.z = -1.0;
  const lamp = paperLantern(0.32, 0xf2a03d);
  lamp.group.position.set(0.86, 1.62, 0.32);
  const lampLight = new THREE.PointLight(0xffb85c, 2, 0, 2);
  lampLight.position.copy(lamp.group.position);

  const limb = (geoLen, mat, x, y) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.07, geoLen, 6), mat);
    m.position.y = -geoLen / 2;
    pivot.add(m);
    return pivot;
  };
  const legs = [limb(0.48, pants, -0.13, 0.48), limb(0.48, pants, 0.13, 0.48)];
  const arms = [limb(0.5, tunic, -0.34, 1.2), limb(0.5, tunic, 0.34, 1.2)];
  arms[0].rotation.z = -0.25;
  arms[1].rotation.z = 0.25;

  rig.add(body, sash, head, hair, ...eyes, hat, rim, stick, lamp.group, lampLight, ...legs, ...arms);
  root.add(contactShadow(shadowTex, 0.7));
  return { root, rig, legs, arms, lamp: lamp.paper, lampLight, lampGroup: lamp.group };
}

// ---------- Great Lantern ----------
export function makeGreatLantern(shadowTex, glowTex, safeRadius, lanternCost) {
  const root = new THREE.Group();
  const stone = std(0x5b5866, { flatShading: true, roughness: 0.95 });
  const wood = std(0x3b2619);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.15, 0.45, 8), stone);
  base.position.y = 0.22;
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.26, 4.4, 0.26), wood);
  post.position.y = 2.6;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.18, 0.18), wood);
  arm.position.set(0.62, 4.55, 0);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.42, 4), std(0x6e2a20));
  roof.position.y = 5.0;
  roof.rotation.y = Math.PI / 4;
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 4), std(0x222222));
  rope.position.set(1.15, 4.25, 0);

  const lamp = paperLantern(1.25, 0xd8442b);
  lamp.group.position.set(1.15, 3.35, 0);
  const light = new THREE.PointLight(0xff9a3c, 0, 0, 2);
  light.position.set(1.15, 3.35, 0);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa040, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.setScalar(5.5);
  halo.position.copy(light.position);

  // safe-radius ring on the ground
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffb04a, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(safeRadius - 0.12, safeRadius, 72), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  // warm pool of light on the ground once lit
  const poolMat = new THREE.MeshBasicMaterial({ map: glowTex, color: 0xff8a2a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const pool = new THREE.Mesh(new THREE.CircleGeometry(safeRadius + 1, 32), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.05;

  // progress pips: one small bead per firefly needed
  const pipMat = () => new THREE.MeshStandardMaterial({ color: 0x3a2a1a, emissive: 0xffc04a, emissiveIntensity: 0 });
  const pips = [];
  for (let i = 0; i < lanternCost; i++) {
    const a = (i / lanternCost) * Math.PI * 2;
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), pipMat());
    p.position.set(Math.cos(a) * 1.25, 0.55, Math.sin(a) * 1.25);
    pips.push(p);
  }

  root.add(base, post, arm, roof, rope, lamp.group, light, halo, ring, pool, ...pips, contactShadow(shadowTex, 1.6));
  return { root, paper: lamp.paper, light, halo, ringMat, poolMat, pips, lampGroup: lamp.group };
}

// ---------- Bóng Mực ----------
const inkMat = new THREE.MeshStandardMaterial({ color: 0x0d0618, emissive: 0x2a0a4a, emissiveIntensity: 0.45, roughness: 1 });
const inkStunMat = new THREE.MeshStandardMaterial({ color: 0x4d4f86, emissive: 0x6e7bd8, emissiveIntensity: 0.35, roughness: 1 });
const eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xe6c2ff, emissiveIntensity: 3.5 });
const eyeStunMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x9fd8ff, emissiveIntensity: 1.2 });
const blobGeo = new THREE.IcosahedronGeometry(1, 2);

export function makeShade(shadowTex) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const core = new THREE.Mesh(blobGeo, inkMat);
  core.scale.setScalar(0.8);
  const blobs = [];
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(blobGeo, inkMat);
    b.scale.setScalar(0.32 + (i % 3) * 0.08);
    b.userData.phase = i * 1.7;
    blobs.push(b);
  }
  const eyes = [-0.24, 0.24].map((x) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), eyeMat);
    e.scale.set(1, 0.65, 0.6);
    e.position.set(x, 0.18, 0.72);
    return e;
  });
  body.add(core, ...blobs, ...eyes);
  // wisps trailing behind (world space, updated by the view)
  const wisps = [];
  for (let i = 0; i < 5; i++) {
    const w = new THREE.Mesh(blobGeo, inkMat);
    w.scale.setScalar(0.4 - i * 0.065);
    wisps.push(w);
  }
  const shadow = contactShadow(shadowTex, 1.0);
  return { root, body, core, blobs, eyes, wisps, shadow, trail: [] };
}

export function setShadeStunned(s, stunned) {
  const m = stunned ? inkStunMat : inkMat;
  s.core.material = m;
  for (const b of s.blobs) b.material = m;
  for (const w of s.wisps) w.material = m;
  for (const e of s.eyes) e.material = stunned ? eyeStunMat : eyeMat;
}
