// Đảo Bến scenery, all generated in code: terrain with beach, grass, stepping-stone
// paths to each lantern, trees, rocks, glowing mushrooms, water, floating lanterns.
// Decoration uses its own fixed seed, so it never touches the game's RNG.
// Gameplay ground stays at Y = 0 inside the play circle (contract: ground is Y = 0).
import * as THREE from 'three';
import { makeRng } from '../sim.js';
import { WORLD } from '../tuning.js';

const PLAY_R = WORLD.island_radius;
const WATER_Y = -0.9;

export function groundY(x, z) {
  const r = Math.hypot(x, z);
  if (r <= PLAY_R) return 0;
  const t = Math.min(1, (r - PLAY_R) / 8);
  return -2.2 * t * t * (3 - 2 * t);
}

const angleDist = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

export function buildIsland(scene, lanternPositions, glowTex) {
  const rng = makeRng(2026);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const lanternAngles = lanternPositions.map((p) => Math.atan2(p[0], p[2]));
  const nearLantern = (x, z, d) => lanternPositions.some((p) => Math.hypot(x - p[0], z - p[2]) < d);

  // terrain: polar grid so the rim can slope into a beach
  const tg = new THREE.RingGeometry(0.001, PLAY_R + 9, 120, 56);
  tg.rotateX(-Math.PI / 2);
  const tp = tg.attributes.position;
  const tc = new Float32Array(tp.count * 3);
  const grassA = new THREE.Color(0x1f4a3a), grassB = new THREE.Color(0x2e6146), sand = new THREE.Color(0x8c7556), wet = new THREE.Color(0x3d3a3c);
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), z = tp.getZ(i);
    const r = Math.hypot(x, z);
    tp.setY(i, groundY(x, z) + (r < PLAY_R - 1 ? 0.0 : 0.04 * Math.sin(x * 0.7) * Math.cos(z * 0.6)));
    const n = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.cos(z * 0.17) * 2.1) * Math.cos(z * 0.13 - x * 0.05);
    color.copy(grassA).lerp(grassB, n);
    if (r > PLAY_R - 2.5) color.lerp(sand, Math.min(1, (r - (PLAY_R - 2.5)) / 3));
    if (r > PLAY_R + 4) color.lerp(wet, Math.min(1, (r - PLAY_R - 4) / 4));
    tc.set([color.r, color.g, color.b], i * 3);
  }
  tg.setAttribute('color', new THREE.BufferAttribute(tc, 3));
  tg.computeVertexNormals();
  scene.add(new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })));

  // water
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(400, 64),
    new THREE.MeshStandardMaterial({ color: 0x0a1630, roughness: 0.18, metalness: 0.55 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_Y;
  scene.add(water);

  // stepping-stone paths from the centre to each lantern
  const stones = [];
  for (const p of lanternPositions) {
    const len = Math.hypot(p[0], p[2]);
    for (let d = 3.5; d < len - 3.2; d += 1.5) {
      const j = (rng() - 0.5) * 0.5;
      stones.push([(p[0] / len) * d + j * (p[2] / len), (p[2] / len) * d - j * (p[0] / len)]);
    }
  }
  const stoneMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.5, 0.1, 7), new THREE.MeshStandardMaterial({ color: 0x45434d, roughness: 0.95 }), stones.length);
  stones.forEach(([x, z], i) => {
    dummy.position.set(x, 0.03, z);
    dummy.rotation.set(0, rng() * Math.PI, 0);
    dummy.scale.setScalar(0.85 + rng() * 0.3);
    dummy.updateMatrix();
    stoneMesh.setMatrixAt(i, dummy.matrix);
  });
  scene.add(stoneMesh);

  // grass blades (one draw call)
  const GRASS = 2600;
  const grassGeo = new THREE.ConeGeometry(0.055, 0.5, 3);
  grassGeo.translate(0, 0.25, 0);
  const grass = new THREE.InstancedMesh(grassGeo, new THREE.MeshLambertMaterial(), GRASS);
  for (let i = 0; i < GRASS; i++) {
    let x, z;
    do {
      const r = Math.sqrt(rng()) * (PLAY_R - 1.5);
      const a = rng() * Math.PI * 2;
      x = r * Math.sin(a); z = r * Math.cos(a);
    } while (nearLantern(x, z, 2.2) || Math.hypot(x, z) < 2);
    dummy.position.set(x, 0, z);
    dummy.rotation.set((rng() - 0.5) * 0.4, rng() * Math.PI, (rng() - 0.5) * 0.4);
    dummy.scale.set(1, 0.6 + rng() * 0.9, 1);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
    grass.setColorAt(i, color.setHSL(0.3 + rng() * 0.1, 0.55, 0.12 + rng() * 0.1));
  }
  scene.add(grass);

  // trees near the rim, away from lantern sight lines
  const trees = [];
  while (trees.length < 34) {
    const a = rng() * Math.PI * 2;
    if (lanternAngles.some((la) => angleDist(a, la) < 0.32)) continue;
    const r = PLAY_R - 5 + rng() * 6;
    trees.push([r * Math.sin(a), r * Math.cos(a), 0.8 + rng() * 0.6]);
  }
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.28, 2.6, 6);
  trunkGeo.translate(0, 1.3, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 1 }), trees.length);
  const canopyGeo = new THREE.IcosahedronGeometry(1.5, 0);
  const canopies = new THREE.InstancedMesh(canopyGeo, new THREE.MeshStandardMaterial({ color: 0x1d3f3a, roughness: 0.9, flatShading: true }), trees.length * 3);
  trees.forEach(([x, z, s], i) => {
    const y = groundY(x, z);
    dummy.position.set(x, y, z); dummy.rotation.set(0, rng() * 3, 0); dummy.scale.setScalar(s); dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    for (let k = 0; k < 3; k++) {
      dummy.position.set(x + (rng() - 0.5) * 1.2 * s, y + (2.6 + k * 0.7) * s, z + (rng() - 0.5) * 1.2 * s);
      dummy.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      dummy.scale.setScalar(s * (1 - k * 0.22));
      dummy.updateMatrix();
      canopies.setMatrixAt(i * 3 + k, dummy.matrix);
      canopies.setColorAt(i * 3 + k, color.setHSL(0.45 + rng() * 0.06, 0.35, 0.16 + rng() * 0.08));
    }
  });
  scene.add(trunks, canopies);

  // rocks on the beach
  const ROCKS = 46;
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.7, 0), new THREE.MeshStandardMaterial({ color: 0x4d4858, roughness: 0.95, flatShading: true }), ROCKS);
  for (let i = 0; i < ROCKS; i++) {
    const a = rng() * Math.PI * 2, r = PLAY_R + 1 + rng() * 5;
    const x = r * Math.sin(a), z = r * Math.cos(a);
    dummy.position.set(x, groundY(x, z) + 0.1, z);
    dummy.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    dummy.scale.set(0.6 + rng() * 1.2, 0.4 + rng() * 0.7, 0.6 + rng() * 1.2);
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
  }
  scene.add(rocks);

  // glowing mushrooms (cool cyan, so they never read as warm fireflies)
  const SHROOMS = 90;
  const capGeo = new THREE.SphereGeometry(0.16, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  const shrooms = new THREE.InstancedMesh(capGeo, new THREE.MeshStandardMaterial({ color: 0x103a44, emissive: 0x2fd6e0, emissiveIntensity: 1.6 }), SHROOMS);
  for (let i = 0; i < SHROOMS; i++) {
    const t = trees[i % trees.length];
    const a = rng() * Math.PI * 2, d = 0.9 + rng() * 2.2;
    dummy.position.set(t[0] + Math.sin(a) * d, 0.02, t[1] + Math.cos(a) * d);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(0.6 + rng() * 0.9);
    dummy.updateMatrix();
    shrooms.setMatrixAt(i, dummy.matrix);
  }
  scene.add(shrooms);

  // floating paper lanterns on the sea (sprites, one material)
  const floatMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffa64a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const floats = [];
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2, r = PLAY_R + 14 + rng() * 60;
    const s = new THREE.Sprite(floatMat);
    s.scale.setScalar(1.6 + rng());
    s.position.set(r * Math.sin(a), WATER_Y + 0.3, r * Math.cos(a));
    s.userData.phase = rng() * 6;
    floats.push(s);
    scene.add(s);
  }

  return {
    update(t) {
      for (const s of floats) s.position.y = WATER_Y + 0.3 + 0.12 * Math.sin(t * 1.3 + s.userData.phase);
    },
  };
}
