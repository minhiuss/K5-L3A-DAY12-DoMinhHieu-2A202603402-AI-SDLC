// Builds the scenery of one night from its standard map (src/maps.js), all in code:
// floating islands over a cloud sea, bridge, tiers, ramps, bell tower, jump pads,
// grass, trees, mushrooms, stepping-stone paths. Decoration uses its own seed.
import * as THREE from 'three';
import { makeRng } from '../sim.js';
import { PAL } from './palette.js';

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
const angleDist = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

function discsOf(map) {
  if (map.night === 2) return [{ cx: 0, cz: 0, r: 28 }, { cx: 70, cz: 0, r: 28 }];
  return [{ cx: 0, cz: 0, r: map.night === 1 ? 40 : 45 }];
}

export function buildWorld(map, glowTex) {
  const group = new THREE.Group();
  const rng = makeRng(2026 + map.night);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const grassC = new THREE.Color(PAL.grass), sandC = new THREE.Color(PAL.sand);
  const rockMat = std(0x3b3546, { flatShading: true });
  const grassMat = std(PAL.grass);
  const woodMat = std(PAL.wood);
  const discs = discsOf(map);
  const groundTop = (x, z) => {
    const t = map.tops(x, z).filter((h) => h < 10);
    return t.length ? Math.max(...t) : null;
  };
  const nearLantern = (x, z, d) => map.lanterns.some((l) => Math.hypot(x - l.pos[0], z - l.pos[2]) < d);
  const nearPad = (x, z, d) => map.pads.some((p) => Math.hypot(x - p.pos[0], z - p.pos[2]) < d);

  // floating islands: grassy top with sandy rim, rocky underside
  for (const d of discs) {
    const top = new THREE.RingGeometry(0.001, d.r, 96, 24);
    top.rotateX(-Math.PI / 2);
    const pos = top.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const r = Math.hypot(x, z);
      const n = 0.94 + 0.12 * (0.5 + 0.5 * Math.sin(x * 0.23 + Math.cos(z * 0.19) * 2));
      color.copy(grassC).multiplyScalar(n);
      if (r > d.r - 2.2) color.lerp(sandC, Math.min(1, (r - (d.r - 2.2)) / 1.6));
      cols.set([color.r, color.g, color.b], i * 3);
    }
    top.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    top.translate(d.cx, 0, d.cz);
    group.add(new THREE.Mesh(top, std(0xffffff, { vertexColors: true, roughness: 0.95 })));
    const side = new THREE.Mesh(new THREE.CylinderGeometry(d.r, d.r * 0.6, 6, 72, 1, true), rockMat);
    side.position.set(d.cx, -3.0, d.cz);
    const under = new THREE.Mesh(new THREE.ConeGeometry(d.r * 0.6, d.r * 0.35, 40), rockMat);
    under.rotation.x = Math.PI;
    under.position.set(d.cx, -6 - d.r * 0.175, d.cz);
    group.add(side, under);
  }

  // cloud sea far below (falling = Y < -10)
  const sea = new THREE.Mesh(new THREE.CircleGeometry(600, 48), new THREE.MeshLambertMaterial({ color: PAL.cloudSea }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -16;
  group.add(sea);
  const puffMat = new THREE.SpriteMaterial({ map: glowTex, color: 0x6f8fa8, transparent: true, opacity: 0.22, depthWrite: false });
  const puffs = [];
  for (let i = 0; i < 70; i++) {
    const a = rng() * Math.PI * 2, r = 30 + rng() * 140;
    const s = new THREE.Sprite(puffMat);
    s.scale.set(18 + rng() * 22, 8 + rng() * 8, 1);
    s.position.set(35 * (map.night === 2 ? 1 : 0) + r * Math.cos(a), -14 + rng() * 5, r * Math.sin(a));
    s.userData.v = 0.3 + rng() * 0.6;
    puffs.push(s);
    group.add(s);
  }

  // night 2: bamboo bridge (no railing)
  if (map.night === 2) {
    const planks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.14, 4), woodMat, 30);
    for (let i = 0; i < 30; i++) {
      dummy.position.set(26.3 + i * 0.6, -0.05, 0);
      dummy.rotation.set(0, (rng() - 0.5) * 0.04, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      planks.setMatrixAt(i, dummy.matrix);
    }
    const rails = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 18, 6), woodMat);
    rails.rotation.z = Math.PI / 2;
    rails.position.set(35, -0.15, 1.9);
    const rails2 = rails.clone();
    rails2.position.z = -1.9;
    group.add(planks, rails, rails2);
  }

  // night 3: tier 1 half ring (z > 0), tier 2 disc, bell tower, two ramps
  if (map.night === 3) {
    const shape = new THREE.Shape();
    shape.moveTo(24, 0);
    shape.absarc(0, 0, 24, 0, Math.PI, false);
    shape.lineTo(-12, 0);
    shape.absarc(0, 0, 12, Math.PI, 0, true);
    shape.closePath();
    const tier1 = new THREE.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: false, curveSegments: 48 });
    tier1.rotateX(Math.PI / 2); // shape (x, y) -> world (x, z); extrudes downward
    const t1 = new THREE.Mesh(tier1, [grassMat, rockMat]);
    t1.position.y = 3;
    const t2 = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 6, 48), [rockMat, grassMat, rockMat]);
    t2.position.y = 3;
    const stone = std(0x8a8494, { flatShading: true });
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.2, 8, 20), stone);
    tower.position.y = 10;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.8, 2.2, 8), std(0x6e2a20, { flatShading: true }));
    roof.position.y = 15.1;
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), std(PAL.gold, { metalness: 0.6, roughness: 0.4, emissive: PAL.gold, emissiveIntensity: 0.2 }));
    bell.position.y = 14.6;
    group.add(t1, t2, tower, roof, bell);
    const slope = Math.atan2(3, 6);
    for (const deg of [30, 150]) {
      const a = (deg * Math.PI) / 180;
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(6 / Math.cos(slope), 0.4, 3), woodMat);
      ramp.position.set(27 * Math.cos(a), 1.5 - 0.2 / Math.cos(slope), 27 * Math.sin(a));
      ramp.rotation.set(0, -a, -slope);
      group.add(ramp);
    }
  }

  // jump pads
  for (const p of map.pads) {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.1, 0.14, 32), std(PAL.gold, { emissive: PAL.gold, emissiveIntensity: 0.9, metalness: 0.3 }));
    pad.position.set(p.pos[0], p.pos[1] + 0.02, p.pos[2]);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: PAL.gold, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(4);
    glow.position.set(p.pos[0], p.pos[1] + 0.6, p.pos[2]);
    group.add(pad, glow);
  }

  // stepping stones from each island centre to its lanterns (nights 1, 2)
  if (map.night !== 3) {
    const stones = [];
    for (const l of map.lanterns) {
      const d = discs.find((q) => Math.hypot(l.pos[0] - q.cx, l.pos[2] - q.cz) <= q.r);
      const vx = l.pos[0] - d.cx, vz = l.pos[2] - d.cz, len = Math.hypot(vx, vz);
      for (let s = 3.5; s < len - 3.5; s += 1.5) {
        const j = (rng() - 0.5) * 0.5;
        stones.push([d.cx + (vx / len) * s + j * (vz / len), d.cz + (vz / len) * s - j * (vx / len)]);
      }
    }
    const sm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.5, 0.1, 7), std(0x5a5866), stones.length);
    stones.forEach(([x, z], i) => {
      dummy.position.set(x, 0.03, z); dummy.rotation.set(0, rng() * 3, 0); dummy.scale.setScalar(0.85 + rng() * 0.3); dummy.updateMatrix();
      sm.setMatrixAt(i, dummy.matrix);
    });
    group.add(sm);
  }

  // grass (one draw call)
  const area = discs.reduce((s, d) => s + d.r * d.r, 0);
  const GRASS = Math.round(2400 * (area / 1600));
  const grassGeo = new THREE.ConeGeometry(0.055, 0.5, 3);
  grassGeo.translate(0, 0.25, 0);
  const grass = new THREE.InstancedMesh(grassGeo, new THREE.MeshLambertMaterial(), GRASS);
  let gi = 0;
  for (let tries = 0; gi < GRASS && tries < GRASS * 4; tries++) {
    const d = discs[Math.floor(rng() * discs.length)];
    const r = Math.sqrt(rng()) * (d.r - 2.4), a = rng() * Math.PI * 2;
    const x = d.cx + r * Math.cos(a), z = d.cz + r * Math.sin(a);
    const y = groundTop(x, z);
    if (y === null || nearLantern(x, z, 2.2) || nearPad(x, z, 1.6) || Math.abs(y - Math.round(y)) > 0.01) continue;
    dummy.position.set(x, y, z);
    dummy.rotation.set((rng() - 0.5) * 0.4, rng() * Math.PI, (rng() - 0.5) * 0.4);
    dummy.scale.set(1, 0.6 + rng() * 0.9, 1);
    dummy.updateMatrix();
    grass.setMatrixAt(gi, dummy.matrix);
    grass.setColorAt(gi, color.copy(grassC).multiplyScalar(0.75 + rng() * 0.5));
    gi++;
  }
  grass.count = gi;
  group.add(grass);

  // trees along each rim, away from lanterns, pads and the bridge
  const trees = [];
  for (const d of discs) {
    const want = Math.round(d.r * 0.8);
    for (let tries = 0, n = 0; n < want && tries < 400; tries++) {
      const a = rng() * Math.PI * 2, r = d.r - 2 - rng() * 4;
      const x = d.cx + r * Math.cos(a), z = d.cz + r * Math.sin(a);
      if (nearLantern(x, z, 6) || nearPad(x, z, 4) || (map.night === 2 && Math.abs(z) < 5 && x > 20 && x < 50)) continue;
      if (map.night === 3 && [30, 150].some((deg) => angleDist(a, (deg * Math.PI) / 180) < 0.2)) continue;
      trees.push([x, groundTop(x, z) ?? 0, z, 0.8 + rng() * 0.6]);
      n++;
    }
  }
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.28, 2.6, 6);
  trunkGeo.translate(0, 1.3, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, woodMat, trees.length);
  const canopies = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.5, 0), std(0x24524a, { flatShading: true }), trees.length * 3);
  trees.forEach(([x, y, z, s], i) => {
    dummy.position.set(x, y, z); dummy.rotation.set(0, rng() * 3, 0); dummy.scale.setScalar(s); dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    for (let k = 0; k < 3; k++) {
      dummy.position.set(x + (rng() - 0.5) * 1.2 * s, y + (2.6 + k * 0.7) * s, z + (rng() - 0.5) * 1.2 * s);
      dummy.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      dummy.scale.setScalar(s * (1 - k * 0.22));
      dummy.updateMatrix();
      canopies.setMatrixAt(i * 3 + k, dummy.matrix);
      canopies.setColorAt(i * 3 + k, color.setHSL(0.45 + rng() * 0.05, 0.4, 0.17 + rng() * 0.08));
    }
  });
  group.add(trunks, canopies);

  // glowing mushrooms near trees (cool cyan so they never read as fireflies)
  const SH = Math.min(90, trees.length * 3);
  const shrooms = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), std(0x103a44, { emissive: 0x2fd6e0, emissiveIntensity: 1.6 }), SH);
  for (let i = 0; i < SH; i++) {
    const t = trees[i % trees.length];
    const a = rng() * Math.PI * 2, dd = 0.9 + rng() * 2.2;
    dummy.position.set(t[0] + Math.sin(a) * dd, t[1] + 0.02, t[2] + Math.cos(a) * dd);
    dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(0.6 + rng() * 0.9); dummy.updateMatrix();
    shrooms.setMatrixAt(i, dummy.matrix);
  }
  group.add(shrooms);

  return {
    group,
    update(t) {
      for (const s of puffs) s.position.x += Math.sin(t * 0.05 + s.userData.v) * 0.01 * s.userData.v;
    },
    dispose() {
      group.traverse((o) => { o.geometry?.dispose(); });
    },
  };
}
