// Fireflies as Points (one draw call per layer). Colors above 1.0 are HDR, so bloom makes them glow.
// Collectible motes: halo #FFE58A + core #FFF6C2 (Ticket-02 palette).
import * as THREE from 'three';
import { makeRng } from '../sim.js';
import { PAL } from './palette.js';

function pointsLayer(glowTex, max, size) {
  const pos = new Float32Array(max * 3);
  const col = new Float32Array(max * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.PointsMaterial({ size, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return { pts, pos, col, geo };
}

const num = (id) => Number(String(id).replace(/\D/g, '')) || 0;

export function makeMoteLayer(scene, glowTex, max = 80) {
  const halo = pointsLayer(glowTex, max, 1.2);
  const core = pointsLayer(glowTex, max, 0.38);
  const H = new THREE.Color(PAL.moteHalo), C = new THREE.Color(PAL.moteCore);
  scene.add(halo.pts, core.pts);
  return {
    update(motes, t) {
      const n = Math.min(motes.length, max);
      for (let i = 0; i < n; i++) {
        const m = motes[i];
        const k = num(m.id);
        const y = m.pos[1] + 0.75 + 0.18 * Math.sin(t * 2.2 + k); // hover is display-only
        const blink = m.kind === 'dropped' && m.ttl !== null && m.ttl < 120 ? (Math.sin(t * 20) > 0 ? 1 : 0.15) : 1;
        const b = (1.6 + 0.6 * Math.sin(t * 6 + k * 1.7)) * blink;
        for (const [L, c, gain] of [[halo, H, b], [core, C, b * 1.6]]) {
          L.pos.set([m.pos[0], y, m.pos[2]], i * 3);
          L.col.set([c.r * gain, c.g * gain, c.b * gain], i * 3);
        }
      }
      for (const L of [halo, core]) {
        L.geo.setDrawRange(0, n);
        L.geo.attributes.position.needsUpdate = true;
        L.geo.attributes.color.needsUpdate = true;
      }
    },
  };
}

// Decorative fireflies drifting high above the island (dim and small, never collectible).
export function makeAmbientFireflies(scene, glowTex, count = 140) {
  const L = pointsLayer(glowTex, count, 0.3);
  const rng = makeRng(7);
  const seeds = Array.from({ length: count }, () => ({ a: rng() * Math.PI * 2, r: 6 + rng() * 40, y: 4 + rng() * 9, s: 0.05 + rng() * 0.15, p: rng() * 10 }));
  scene.add(L.pts);
  let cx = 0;
  return {
    setCenter(x) { cx = x; },
    update(t) {
      seeds.forEach((q, i) => {
        const a = q.a + t * q.s * 0.2;
        L.pos.set([cx + Math.cos(a) * q.r + Math.sin(t * 0.7 + q.p) * 1.5, q.y + Math.sin(t * 0.9 + q.p), Math.sin(a) * q.r], i * 3);
        const b = 0.5 + 0.4 * Math.max(0, Math.sin(t * 2 + q.p));
        L.col.set([0.8 * b, 0.95 * b, 0.6 * b], i * 3);
      });
      L.geo.attributes.position.needsUpdate = true;
      L.geo.attributes.color.needsUpdate = true;
    },
  };
}

// Leaves blown by the Night 3 wind (warning + gust), around the player.
export function makeWindLeaves(scene, glowTex, count = 90) {
  const L = pointsLayer(glowTex, count, 0.25);
  const rng = makeRng(11);
  const seeds = Array.from({ length: count }, () => ({ x: rng() * 40 - 20, y: 0.3 + rng() * 4, z: rng() * 40 - 20, p: rng() * 10 }));
  scene.add(L.pts);
  return {
    update(t, center, dirDeg, strength) {
      const a = dirDeg === null ? 0 : (dirDeg * Math.PI) / 180;
      const dx = Math.cos(a), dz = Math.sin(a);
      seeds.forEach((q, i) => {
        const travel = ((t * 12 + q.p * 7) % 40) - 20;
        L.pos.set([center[0] + q.x * (1 - Math.abs(dx)) + dx * travel, center[1] + q.y + 0.3 * Math.sin(t * 5 + q.p), center[2] + q.z * (1 - Math.abs(dz)) + dz * travel], i * 3);
        L.col.set([0.55 * strength, 0.75 * strength, 0.35 * strength], i * 3);
      });
      L.geo.attributes.position.needsUpdate = true;
      L.geo.attributes.color.needsUpdate = true;
    },
  };
}
