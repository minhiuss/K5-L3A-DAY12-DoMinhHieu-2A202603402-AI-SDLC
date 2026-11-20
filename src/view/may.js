// Mây's rigged model (Tripo, public/assets/may.glb) with a nón lá + hanging lantern added on the
// Head bone (PRD-0: "conical hat with a small lantern hanging from it").
// Animation: the glb carries Blender clips (idle, run, sprint, jump, dash, shoot — made by
// art/make_may_clips.py, merged by art/merge_may_anims.mjs). An AnimationMixer cross-fades between them by
// state; `shoot` is additive so the legs keep running while the arms draw. If the clips are missing, the
// old procedural bone rotations below are used instead. The dash flip itself is always the `roller` group.
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
    if (o.isMesh) {
      o.frustumCulled = false; o.castShadow = false;
      // Tripo exports metalness 1: with no environment map a full metal renders near-black,
      // so Mây showed up as a dark silhouette. Cloth/skin are not metal.
      for (const mt of [].concat(o.material)) { mt.metalness = 0; mt.metalnessMap = null; mt.roughness = 0.85; mt.needsUpdate = true; }
    }
  });
  const root = new THREE.Group();
  const rig = new THREE.Group(); // yaw (facing)
  const roller = new THREE.Group(); // dash flip about the sideways (X) axis, pivot at the waist
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
  // The bow slung on her back (material tripo_part_2) was auto-weighted by Tripo to the thighs, calves and
  // left forearm, so any leg/arm motion tore it apart. Bind every bow vertex fully to Spine02 instead.
  model.traverse((o) => {
    if (!o.isSkinnedMesh || ![].concat(o.material).some((m) => m.name === 'Material_tripo_part_2')) return;
    const j = o.skeleton.bones.indexOf(bones.Spine02);
    if (j < 0) return;
    const { skinIndex, skinWeight } = o.geometry.attributes;
    for (let i = 0; i < skinIndex.count; i++) { skinIndex.setXYZW(i, j, 0, 0, 0); skinWeight.setXYZW(i, 1, 0, 0, 0); }
    skinIndex.needsUpdate = skinWeight.needsUpdate = true;
  });

  // Blender clips -> AnimationMixer (null = no clips in the file: use the procedural poses)
  const mixer = gltf.animations.length ? new THREE.AnimationMixer(model) : null;
  const actions = {};
  for (const clip of gltf.animations) {
    if (clip.name === 'shoot') THREE.AnimationUtils.makeClipAdditive(clip); // delta from frame 0 (rest) on top of the legs
    const a = mixer.clipAction(clip);
    if (clip.name === 'dash' || clip.name === 'shoot') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = clip.name === 'dash'; }
    actions[clip.name] = a;
  }
  let state = null;
  function fadeTo(name, dur) {
    const next = actions[name];
    if (!next) return;
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    if (state && actions[state]) actions[state].crossFadeTo(next, dur, false); // old fades out, new fades in
    state = name;
  }
  if (mixer) fadeTo('idle', 0);
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
    mixer, clips: Object.keys(actions), get clip() { return state; },
    roll() { rollT = 0.2; },          // dash = forward flip over the 0.2 s dash
    shoot() { shootT = 0.35; if (actions.shoot) actions.shoot.reset().play(); },
    // walk: 0..1 speed fraction, grounded, t: seconds, dt: frame time
    animate(t, dt, { walk, grounded, sprint }) {
      const ph = t * (sprint ? 13 : 10.5);
      const s = Math.sin(ph) * 0.65 * walk;
      if (mixer) {
        // pick the clip for this frame's state; a change cross-fades (dash snaps in fast: it only lasts 0.2 s)
        const want = rollT > 0 && actions.dash ? 'dash' : !grounded ? 'jump' : walk < 0.08 ? 'idle' : sprint ? 'sprint' : 'run';
        if (want !== state) fadeTo(want, want === 'dash' ? 0.04 : 0.18);
        if (state === 'run') actions.run.timeScale = 0.55 + 0.5 * walk; // slow jog -> full run
        mixer.update(dt);
        shootT = Math.max(0, shootT - dt);
        rig.position.y = grounded ? Math.abs(Math.sin(ph)) * 0.05 * walk : 0;
        if (rollT > 0) {
          rollT = Math.max(0, rollT - dt);
          roller.rotation.x = (1 - rollT / 0.2) * Math.PI * 2; // the clip tucks the knees, the roller flips
        } else roller.rotation.x = 0;
        lampGroup.rotation.z = Math.sin(t * 3) * 0.15 + s * 0.2;
        return;
      }
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
      // dash = forward flip in the dash direction: main.js turns the rig to face p.dashDir, so we spin
      // about the rig's sideways X axis (+angle moves the head toward +Z = forward), knees tucked
      if (rollT > 0) {
        rollT = Math.max(0, rollT - dt);
        const k = 1 - rollT / 0.2;
        roller.rotation.x = k * Math.PI * 2;
        const tuck = Math.sin(k * Math.PI);
        pose('L_Thigh', 'x', -1.4 * tuck); pose('R_Thigh', 'x', -1.4 * tuck);
        pose('L_Calf', 'x', 1.8 * tuck); pose('R_Calf', 'x', 1.8 * tuck);
        pose('Spine01', 'x', 0.4 * tuck);
      } else roller.rotation.x = 0;
      lampGroup.rotation.z = Math.sin(t * 3) * 0.15 + s * 0.2;
    },
  };
}

function countTris(obj) {
  let n = 0;
  obj.traverse((o) => { if (o.isMesh) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  return Math.round(n);
}
