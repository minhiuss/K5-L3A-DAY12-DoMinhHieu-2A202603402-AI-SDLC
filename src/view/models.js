// Characters and props built from code (no model files), in the Ticket-02 palette:
// Mây, Great Lanterns, Bóng Mực, Gió Lạc (drifter ribbon), Bùa Gió (charm).
import * as THREE from 'three';
import { contactShadow } from './textures.js';
import { PAL } from './palette.js';

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });

const lanternProfile = [
  [0.06, -0.5], [0.22, -0.46], [0.38, -0.34], [0.47, -0.16], [0.5, 0],
  [0.47, 0.16], [0.38, 0.34], [0.22, 0.46], [0.06, 0.5],
].map(([r, y]) => new THREE.Vector2(r, y));
const lanternGeo = new THREE.LatheGeometry(lanternProfile, 12);

function paperLantern(scale, paperColor, glowColor) {
  const g = new THREE.Group();
  const paper = new THREE.MeshStandardMaterial({ color: paperColor, emissive: glowColor, emissiveIntensity: 0, roughness: 0.6, side: THREE.DoubleSide, flatShading: true });
  const body = new THREE.Mesh(lanternGeo, paper);
  const capMat = std(PAL.wood);
  const capT = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.1, 10), capMat);
  capT.position.y = 0.53;
  const capB = capT.clone();
  capB.position.y = -0.53;
  const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.35, 6), std(PAL.scarf));
  tassel.position.y = -0.78;
  tassel.rotation.x = Math.PI;
  g.add(body, capT, capB, tassel);
  g.scale.setScalar(scale);
  return { group: g, paper };
}

// ---------- Mây ----------
export function makeMay(shadowTex) {
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);
  const tunic = std(PAL.tunic);
  const skin = std(0xf0c39c);
  const pants = std(0x3a3f5a);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.4, 0.82, 12), tunic);
  body.position.y = 0.86;
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.07, 8, 16), std(PAL.scarf));
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 1.26;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.38, 0.04), std(PAL.scarf));
  tail.position.set(0.1, 1.08, -0.2);
  tail.rotation.x = 0.3;
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
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.78, 0.36, 24), std(0xe3cf95, { roughness: 0.7, flatShading: true }));
  hat.position.y = 1.78;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.02, 4, 32), std(PAL.gold));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 1.61;
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.7, 5), std(PAL.wood));
  stick.position.set(0.55, 1.78, 0.32);
  stick.rotation.z = -1.0;
  const lamp = paperLantern(0.32, PAL.lanternLit, PAL.lanternLit);
  lamp.group.position.set(0.86, 1.62, 0.32);
  const lampLight = new THREE.PointLight(PAL.lanternLit, 2, 0, 2);
  lampLight.position.copy(lamp.group.position);
  const limb = (len, mat, x, y) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.07, len, 6), mat);
    m.position.y = -len / 2;
    pivot.add(m);
    return pivot;
  };
  const legs = [limb(0.48, pants, -0.13, 0.48), limb(0.48, pants, 0.13, 0.48)];
  const arms = [limb(0.5, tunic, -0.34, 1.2), limb(0.5, tunic, 0.34, 1.2)];
  arms[0].rotation.z = -0.25;
  arms[1].rotation.z = 0.25;
  rig.add(body, scarf, tail, head, hair, ...eyes, hat, rim, stick, lamp.group, lampLight, ...legs, ...arms);
  const shadow = contactShadow(shadowTex, 0.7);
  root.add(shadow);
  return { root, rig, legs, arms, lamp: lamp.paper, lampLight, lampGroup: lamp.group, shadow };
}

// ---------- Great Lantern ----------
export function makeGreatLantern(shadowTex, glowTex, safeRadius, lanternCost) {
  const root = new THREE.Group();
  const stone = std(0x5b5866, { flatShading: true, roughness: 0.95 });
  const wood = std(PAL.wood);
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
  const lamp = paperLantern(1.25, PAL.lanternOff, PAL.lanternLit);
  lamp.group.position.set(1.15, 3.35, 0);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), new THREE.MeshBasicMaterial({ color: PAL.lanternCore, transparent: true, opacity: 0 }));
  core.position.copy(lamp.group.position);
  const light = new THREE.PointLight(PAL.lanternLit, 0, 0, 2);
  light.position.set(1.15, 3.35, 0);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: PAL.lanternLit, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.setScalar(5.5);
  halo.position.copy(light.position);
  const ringMat = new THREE.MeshBasicMaterial({ color: PAL.lanternLit, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(safeRadius - 0.12, safeRadius, 72), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  const poolMat = new THREE.MeshBasicMaterial({ map: glowTex, color: PAL.lanternLit, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const pool = new THREE.Mesh(new THREE.CircleGeometry(safeRadius + 1, 32), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.05;
  // progress beads: one per firefly needed (10)
  const pips = [];
  for (let i = 0; i < lanternCost; i++) {
    const a = (i / lanternCost) * Math.PI * 2;
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshStandardMaterial({ color: 0x2a2a30, emissive: PAL.moteHalo, emissiveIntensity: 0 }));
    p.position.set(Math.cos(a) * 1.3, 0.55, Math.sin(a) * 1.3);
    pips.push(p);
  }
  root.add(base, post, arm, roof, rope, lamp.group, core, light, halo, ring, pool, ...pips, contactShadow(shadowTex, 1.6));
  return { root, paper: lamp.paper, core, light, halo, ringMat, poolMat, pips, lampGroup: lamp.group };
}

// ---------- Bóng Mực ----------
const inkMat = new THREE.MeshStandardMaterial({ color: PAL.shadeBody, emissive: PAL.shadeEdge, emissiveIntensity: 0.12, roughness: 1 });
const inkStunMat = new THREE.MeshStandardMaterial({ color: PAL.shadeStun, emissive: PAL.shadeStun, emissiveIntensity: 0.3, roughness: 1 });
const edgeMat = new THREE.MeshBasicMaterial({ color: PAL.shadeEdge, side: THREE.BackSide });
const edgeStunMat = new THREE.MeshBasicMaterial({ color: 0x6a6488, side: THREE.BackSide });
const eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xd9c4ff, emissiveIntensity: 3.5 });
const eyeStunMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x9aa0c8, emissiveIntensity: 0.8 });
const blobGeo = new THREE.IcosahedronGeometry(1, 2);

export function makeShade(shadowTex) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const core = new THREE.Mesh(blobGeo, inkMat);
  core.scale.setScalar(0.8);
  const edge = new THREE.Mesh(blobGeo, edgeMat); // inverted-hull outline
  edge.scale.setScalar(0.87);
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
    e.position.set(x, 0.18, 0.74);
    return e;
  });
  body.add(edge, core, ...blobs, ...eyes);
  const wisps = [];
  for (let i = 0; i < 5; i++) {
    const w = new THREE.Mesh(blobGeo, inkMat);
    w.scale.setScalar(0.4 - i * 0.065);
    wisps.push(w);
  }
  const shadow = contactShadow(shadowTex, 1.0);
  return { root, body, core, edge, blobs, eyes, wisps, shadow, trail: [], spawnT: 0 };
}

export function setShadeLook(s, state) {
  const stunned = state === 'stunned';
  const m = stunned ? inkStunMat : inkMat;
  s.core.material = m;
  for (const b of s.blobs) b.material = m;
  for (const w of s.wisps) w.material = m;
  s.edge.material = stunned ? edgeStunMat : edgeMat;
  for (const e of s.eyes) e.material = stunned ? eyeStunMat : eyeMat;
}

// ---------- Gió Lạc: a grey-blue silk ribbon ----------
export function makeDrifter() {
  const root = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: PAL.drifter, emissive: PAL.drifter, emissiveIntensity: 0.25, side: THREE.DoubleSide, transparent: true, opacity: 0.9, roughness: 0.5 });
  const segs = [];
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.32), mat);
    segs.push(s);
    root.add(s);
  }
  const loot = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: PAL.moteCore }));
  root.add(loot);
  return { root, segs, mat, loot };
}

// ---------- Bùa Gió: red talisman with a gold border ----------
export function makeCharm(glowTex) {
  const root = new THREE.Group();
  const border = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.86, 0.03), std(PAL.gold, { emissive: PAL.gold, emissiveIntensity: 0.6, metalness: 0.4 }));
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.76, 0.05), std(PAL.scarf, { emissive: PAL.scarf, emissiveIntensity: 0.5 }));
  const mark = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 6, 16), std(PAL.gold, { emissive: PAL.gold, emissiveIntensity: 1 }));
  mark.position.z = 0.03;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff6a4a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.setScalar(2.2);
  root.add(border, paper, mark, glow);
  return { root };
}
