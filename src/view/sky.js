// Night sky: gradient dome shader, stars, moon with halo. Warms up as lanterns are lit.
import * as THREE from 'three';
import { makeRng } from '../sim.js';

export function buildSky(scene, glowTex) {
  const uniforms = {
    top: { value: new THREE.Color(0x070414) },
    mid: { value: new THREE.Color(0x1c0f3a) },
    horizon: { value: new THREE.Color(0x4a2350) },
    warm: { value: 0 },
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(260, 32, 16),
    new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform float warm;
        varying vec3 vDir;
        void main() {
          float h = vDir.y;
          vec3 c = mix(horizon, mid, smoothstep(-0.02, 0.22, h));
          c = mix(c, top, smoothstep(0.22, 0.85, h));
          float band = 1.0 - smoothstep(0.0, 0.35, abs(h));
          c += warm * vec3(0.55, 0.28, 0.08) * band;
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  dome.renderOrder = -2;
  scene.add(dome);

  // stars on the upper half of a sphere
  const rng = makeRng(99);
  const N = 1400;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const u = rng() * Math.PI * 2;
    const v = Math.acos(1 - rng() * 0.95);
    const r = 240;
    pos.set([r * Math.sin(v) * Math.cos(u), r * Math.cos(v), r * Math.sin(v) * Math.sin(u)], i * 3);
    const b = 0.4 + rng() * 0.9;
    col.set([b, b * (0.9 + rng() * 0.1), b * (0.95 + rng() * 0.2)], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false }));
  stars.renderOrder = -1;
  scene.add(stars);

  // moon + halo
  const moonDir = new THREE.Vector3(-0.55, 0.42, -0.72).normalize();
  const moon = new THREE.Mesh(new THREE.SphereGeometry(7, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff1cf, fog: false }));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xb9a8ff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  halo.scale.setScalar(70);
  scene.add(moon, halo);

  return {
    moonDir,
    update(camera, warmK) {
      dome.position.copy(camera.position);
      stars.position.copy(camera.position);
      moon.position.copy(camera.position).addScaledVector(moonDir, 220);
      halo.position.copy(moon.position);
      uniforms.warm.value = warmK;
    },
  };
}
