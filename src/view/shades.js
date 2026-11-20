// Bóng Mực drawn with InstancedMesh: 6 draw calls for any number of shades (the v1.3 bench has 200).
// Same look as before: ink core + outline + orbiting blobs + glowing eyes + smoke trail + soft shadow.
import * as THREE from 'three';
import { PAL } from './palette.js';

const BLOBS = 6, WISPS = 5, TRAIL = 30;
const blobGeo = new THREE.IcosahedronGeometry(1, 2);

export function makeShadeLayer(scene, shadowTex, max = 256) {
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: PAL.shadeEdge, emissiveIntensity: 0.1, roughness: 1 });
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
  const shadowGeo = new THREE.CircleGeometry(1, 16);
  shadowGeo.rotateX(-Math.PI / 2);
  const mk = (geo, mat, n) => {
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.setColorAt(0, new THREE.Color(1, 1, 1)); // create instanceColor up front (no shader recompile later)
    m.count = 0;
    scene.add(m);
    return m;
  };
  const core = mk(blobGeo, bodyMat, max);
  const edge = mk(blobGeo, edgeMat, max);
  const blobs = mk(blobGeo, bodyMat, max * BLOBS);
  const wisps = mk(blobGeo, bodyMat, max * WISPS);
  const eyes = mk(new THREE.SphereGeometry(0.1, 8, 6), eyeMat, max * 2);
  const shadows = mk(shadowGeo, shadowMat, max);
  shadows.renderOrder = 1;

  const C = {
    body: new THREE.Color(PAL.shadeBody), stun: new THREE.Color(PAL.shadeStun),
    edge: new THREE.Color(PAL.shadeEdge), edgeCb: new THREE.Color(0x00b3ff), edgeStun: new THREE.Color(0x6a6488),
    eye: new THREE.Color(0xd9c4ff).multiplyScalar(3.2), eyeCb: new THREE.Color(0x00b3ff).multiplyScalar(3.2), eyeStun: new THREE.Color(0x9aa0c8).multiplyScalar(0.8),
  };
  const views = new Map(); // id -> { trail, spawnT, spin }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qy = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), off = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Quaternion();

  return {
    reset() { views.clear(); },
    // shades: sim shade list; player: sim player; cb: colour-blind palette on
    update(list, player, t, dt, cb) {
      const n = Math.min(list.length, max);
      for (let i = 0; i < n; i++) {
        const s = list[i];
        let v = views.get(s.id);
        if (!v) { v = { trail: [], spawnT: 0, spin: 0 }; views.set(s.id, v); }
        const stunned = s.state === 'stunned';
        const k = s.state === 'spawning' ? 0.3 + 0.7 * Math.min(1, (v.spawnT += dt)) : 1;
        const bob = 0.12 * Math.sin(t * 3 + s.pos[0]);
        if (stunned) v.spin += dt * 4;
        const yaw = stunned ? v.spin : Math.atan2(player.pos[0] - s.pos[0], player.pos[2] - s.pos[2]);
        qy.setFromAxisAngle(Y, yaw);
        p.set(s.pos[0], s.pos[1] + bob, s.pos[2]);
        const pulse = 1 + 0.05 * Math.sin(t * 5 + s.pos[2]);
        core.setMatrixAt(i, m4.compose(p, qy, sc.setScalar(0.8 * k * pulse)));
        edge.setMatrixAt(i, m4.compose(p, qy, sc.setScalar(0.87 * k * pulse)));
        const bodyC = stunned ? C.stun : C.body;
        core.setColorAt(i, bodyC);
        edge.setColorAt(i, stunned ? C.edgeStun : cb ? C.edgeCb : C.edge);
        for (let b = 0; b < BLOBS; b++) {
          const a = t * 1.6 + b * 1.7;
          off.set(Math.sin(a) * 0.55, Math.sin(a * 1.3) * 0.35, Math.cos(a) * 0.45 - 0.15).multiplyScalar(k).applyQuaternion(qy).add(p);
          blobs.setMatrixAt(i * BLOBS + b, m4.compose(off, one, sc.setScalar((0.32 + (b % 3) * 0.08) * k)));
          blobs.setColorAt(i * BLOBS + b, bodyC);
        }
        for (let e = 0; e < 2; e++) {
          off.set(e ? 0.24 : -0.24, 0.18, 0.74).multiplyScalar(k).applyQuaternion(qy).add(p);
          eyes.setMatrixAt(i * 2 + e, m4.compose(off, qy, sc.set(k, 0.65 * k, 0.6 * k)));
          eyes.setColorAt(i * 2 + e, stunned ? C.eyeStun : cb ? C.eyeCb : C.eye);
        }
        v.trail.unshift([p.x, p.y, p.z]);
        if (v.trail.length > TRAIL) v.trail.length = TRAIL;
        for (let w = 0; w < WISPS; w++) {
          const tp = v.trail[Math.min(v.trail.length - 1, (w + 1) * 5)];
          off.set(tp[0], tp[1] - 0.15 * (w + 1), tp[2]);
          wisps.setMatrixAt(i * WISPS + w, m4.compose(off, one, sc.setScalar((0.4 - w * 0.065) * k)));
          wisps.setColorAt(i * WISPS + w, bodyC);
        }
        p.set(s.pos[0], s.pos[1] - 0.97, s.pos[2]);
        shadows.setMatrixAt(i, m4.compose(p, one, sc.setScalar(k)));
      }
      core.count = edge.count = shadows.count = n;
      blobs.count = n * BLOBS;
      wisps.count = n * WISPS;
      eyes.count = n * 2;
      for (const m of [core, edge, blobs, wisps, eyes, shadows]) {
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
      if (views.size > n * 2 + 32) { const live = new Set(list.map((s) => s.id)); for (const id of views.keys()) if (!live.has(id)) views.delete(id); }
    },
  };
}
