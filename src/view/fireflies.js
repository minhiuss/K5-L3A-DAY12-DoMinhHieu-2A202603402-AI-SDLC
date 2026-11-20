// Fireflies as one Points draw call each. Colors above 1.0 are HDR, so bloom makes them glow.
import * as THREE from 'three';
import { makeRng } from '../sim.js';

function pointsLayer(glowTex, max, size) {
  const pos = new Float32Array(max * 3);
  const col = new Float32Array(max * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 500);
  const mat = new THREE.PointsMaterial({ size, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return { pts, pos, col, geo };
}

// The collectible motes from the sim (gold, bright, bob above their ground position).
export function makeMoteLayer(scene, glowTex, max = 80) {
  const L = pointsLayer(glowTex, max, 1.1);
  scene.add(L.pts);
  return {
    update(motes, t) {
      const n = Math.min(motes.length, max);
      for (let i = 0; i < n; i++) {
        const m = motes[i];
        L.pos[i * 3] = m.pos[0];
        L.pos[i * 3 + 1] = 0.75 + 0.18 * Math.sin(t * 2.2 + m.id); // hover is display-only
        L.pos[i * 3 + 2] = m.pos[2];
        const b = 2.2 + 1.0 * Math.sin(t * 6 + m.id * 1.7);
        L.col.set([1.0 * b, 0.78 * b, 0.3 * b], i * 3);
      }
      L.geo.setDrawRange(0, n);
      L.geo.attributes.position.needsUpdate = true;
      L.geo.attributes.color.needsUpdate = true;
    },
  };
}

// Decorative fireflies drifting high above the island (dim and small, never collectible).
export function makeAmbientFireflies(scene, glowTex, count = 140) {
  const L = pointsLayer(glowTex, count, 0.35);
  const rng = makeRng(7);
  const seeds = Array.from({ length: count }, () => ({
    a: rng() * Math.PI * 2, r: 6 + rng() * 40, y: 3 + rng() * 8, s: 0.05 + rng() * 0.15, p: rng() * 10,
  }));
  scene.add(L.pts);
  return {
    update(t) {
      seeds.forEach((q, i) => {
        const a = q.a + t * q.s * 0.2;
        L.pos.set([Math.sin(a) * q.r + Math.sin(t * 0.7 + q.p) * 1.5, q.y + Math.sin(t * 0.9 + q.p), Math.cos(a) * q.r], i * 3);
        const b = 0.6 + 0.5 * Math.max(0, Math.sin(t * 2 + q.p));
        L.col.set([0.85 * b, 1.0 * b, 0.55 * b], i * 3);
      });
      L.geo.attributes.position.needsUpdate = true;
      L.geo.attributes.color.needsUpdate = true;
    },
  };
}
