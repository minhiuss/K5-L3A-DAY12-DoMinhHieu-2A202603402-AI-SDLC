// Mây's rigged model (Tripo, public/assets/may.glb) with a nón lá + hanging lantern added on the
// Head bone (PRD-0: "conical hat with a small lantern hanging from it"). The file has no animation
// clips, so walk / idle / jump / barrel roll / bow pose are procedural bone rotations.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { contactShadow } from './textures.js';
import { PAL } from './palette.js';

const HEIGHT = 1.65; // meters (model is normalized to 1 m)
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

function makeHat() {
  const hat = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.2, 28), std(0xe3cf95, { roughness: 0.7, flatShading: true }));
  cone.position.y = 0.1;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.012, 4, 36), std(PAL.gold));
  rim.rotation.x = Math.PI / 2;
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.38, 5), std(PAL.wood));
  stick.position.set(0.3, 0.07, 0.18);
  stick.rotation.z = -1.0;
  const lampGroup = new THREE.Group();
  lampGroup.position.set(0.47, -0.04, 0.18);
  const lamp = new THREE.MeshStandardMaterial({ color: PAL.lanternLit, emissive: PAL.lanternLit, emissiveIntensity: 1, roughness: 0.6, flatShading: true });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), lamp);
  body.scale.y = 1.25;
  const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.08, 5), std(PAL.scarf));
  tassel.position.y = -0.12;
  tassel.rotation.x = Math.PI;
  lampGroup.add(body, tassel);
  const light = new THREE.PointLight(PAL.lanternLit, 2, 0, 2);
  light.position.copy(lampGroup.position);
  hat.add(cone, rim, stick, lampGroup, light);
  return { hat, lamp, lampGroup, light };
}

export async function loadMay(url, shadowTex) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  const model = gltf.scene;
  model.scale.setScalar(HEIGHT);
  model.traverse((o) => {
    if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; }
  });
  const root = new THREE.Group();
  const rig = new THREE.Group(); // yaw (facing)
  const roller = new THREE.Group(); // barrel roll about the forward (+Z) axis, pivot at the waist
  roller.position.y = 0.85;
  const orient = new THREE.Group(); // the Tripo model faces +X: turn it to face +Z
  orient.rotation.y = -Math.PI / 2;
  orient.position.y = -0.85;
  root.add(rig);
  rig.add(roller);
  roller.add(orient);
  orient.add(model);
  root.updateMatrixWorld(true);

  const bones = {};
  model.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  // remember rest pose + each bone's parent orientation in rig space, so we can rotate about rig axes
  const rigInv = new THREE.Quaternion();
  const rest = {};
  for (const [name, b] of Object.entries(bones)) {
    const parentQ = new THREE.Quaternion();
    b.parent.getWorldQuaternion(parentQ);
    rest[name] = { q: b.quaternion.clone(), parentInv: rigInv.clone().multiply(parentQ).invert() };
  }
  const tmp = new THREE.Quaternion();
  const axisL = new THREE.Vector3();
  // rotate bone about an axis given in rig space (x = Mây's left, y = up, z = forward)
  function pose(name, axis, angle) {
    const b = bones[name];
    if (!b) return;
    const r = rest[name];
    axisL.copy(AX[axis]).applyQuaternion(r.parentInv);
    tmp.setFromAxisAngle(axisL, angle);
    b.quaternion.copy(tmp).multiply(r.q);
  }
  function poseMulti(name, list) {
    const b = bones[name];
    if (!b) return;
    const r = rest[name];
    b.quaternion.copy(r.q);
    for (const [axis, angle] of list) {
      axisL.copy(AX[axis]).applyQuaternion(r.parentInv);
      tmp.setFromAxisAngle(axisL, angle);
      b.quaternion.premultiply(tmp);
    }
  }

  // hat on the Head bone, placed at the top of the head in world space, then re-parented
  const { hat, lamp, lampGroup, light } = makeHat();
  const head = bones.Head;
  const headPos = new THREE.Vector3();
  head.getWorldPosition(headPos);
  hat.position.set(headPos.x, HEIGHT * 0.955, headPos.z + 0.01);
  rig.add(hat);
  root.updateMatrixWorld(true);
  head.attach(hat);
  // red scarf around the neck (palette: scarf #C8102E)
  const neck = bones.NeckTwist01 || head;
  const neckPos = new THREE.Vector3();
  neck.getWorldPosition(neckPos);
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.028, 8, 20), std(PAL.scarf));
  scarf.rotation.x = Math.PI / 2;
  scarf.position.copy(neckPos);
  rig.add(scarf);
  root.updateMatrixWorld(true);
  neck.attach(scarf);

  const shadow = contactShadow(shadowTex, 0.6);
  root.add(shadow);
  // soft warm fill so the textured model reads at night (display only)
  const fill = new THREE.PointLight(0xffd9a8, 3, 5, 2);
  fill.position.set(0, 1.4, 1.2);
  rig.add(fill);

  let rollT = 0, shootT = 0;
  return {
    root, rig, lamp, rest: () => { for (const [n, b] of Object.entries(bones)) b.quaternion.copy(rest[n].q); }, lampGroup, lampLight: light, shadow, bones, model, triangles: countTris(model),
    roll() { rollT = 0.2; },          // dash = barrel roll over the 0.2 s dash
    shoot() { shootT = 0.35; },
    // walk: 0..1 speed fraction, grounded, t: seconds, dt: frame time
    animate(t, dt, { walk, grounded, sprint }) {
      const ph = t * (sprint ? 13 : 10.5);
      const s = Math.sin(ph) * 0.65 * walk;
      if (grounded) {
        pose('L_Thigh', 'x', -s);
        pose('R_Thigh', 'x', s);
        pose('L_Calf', 'x', Math.max(0, s) * 1.1);
        pose('R_Calf', 'x', Math.max(0, -s) * 1.1);
      } else {
        pose('L_Thigh', 'x', -0.7);
        pose('R_Thigh', 'x', -0.2);
        pose('L_Calf', 'x', 1.0);
        pose('R_Calf', 'x', 0.5);
      }
      const breathe = Math.sin(t * 2.2) * 0.03 * (1 - walk);
      pose('Spine01', 'x', (sprint ? -0.18 : -0.06) * walk + breathe);
      // arms: rest pose is an A-pose; swing opposite to the legs; right arm draws forward while shooting
      shootT = Math.max(0, shootT - dt);
      poseMulti('L_Upperarm', [['x', s * 0.6], ['z', shootT > 0 ? 0.6 : 0]]);
      if (shootT > 0) poseMulti('R_Upperarm', [['x', -1.35], ['z', -0.5]]);
      else poseMulti('R_Upperarm', [['x', -s * 0.6]]);
      rig.position.y = grounded ? Math.abs(Math.sin(ph)) * 0.05 * walk : 0;
      // barrel roll around the forward axis during a dash
      if (rollT > 0) {
        rollT = Math.max(0, rollT - dt);
        roller.rotation.z = (1 - rollT / 0.2) * Math.PI * 2;
      } else roller.rotation.z = 0;
      lampGroup.rotation.z = Math.sin(t * 3) * 0.15 + s * 0.2;
    },
  };
}

function countTris(obj) {
  let n = 0;
  obj.traverse((o) => { if (o.isMesh) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  return Math.round(n);
}
