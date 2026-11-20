// Copy the animation clips from art/source/may_anim.glb (Blender export, armature only) into
// public/assets/may.glb WITHOUT re-encoding the mesh: the meshopt-compressed mesh, skin and materials
// stay byte-identical; only new animation accessors are appended to the binary chunk.
//   node art/merge_may_anims.mjs
// The first run backs up the clip-less model to art/source/may_noanim.glb and always merges into that base,
// so running it again replaces the clips instead of stacking them.
import fs from 'node:fs';

const BASE = 'art/source/may_noanim.glb';
const ANIM = 'art/source/may_anim.glb';
const OUT = 'public/assets/may.glb';
const EPS = 1e-4;

function readGlb(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: not a GLB`);
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString('utf8').replace(/\0+$/, ''));
  const binStart = 20 + jsonLen;
  const bin = binStart < b.length ? b.subarray(binStart + 8, binStart + 8 + b.readUInt32LE(binStart)) : Buffer.alloc(0);
  return { json, bin };
}

function readAccessor(g, i) {
  const a = g.json.accessors[i];
  if (a.componentType !== 5126) throw new Error(`accessor ${i}: expected FLOAT`);
  const n = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type];
  const bv = g.json.bufferViews[a.bufferView];
  const stride = bv.byteStride || n * 4;
  const start = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const out = [];
  for (let k = 0; k < a.count; k++) {
    const v = [];
    for (let c = 0; c < n; c++) v.push(g.bin.readFloatLE(start + k * stride + c * 4));
    out.push(v);
  }
  return out;
}

const near = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < EPS);
const nearQ = (a, b) => near(a, b) || near(a, b.map((x) => -x));

if (!fs.existsSync(BASE)) {
  const cur = readGlb(OUT);
  if (cur.json.animations?.length) throw new Error(`${OUT} already has clips and ${BASE} is missing`);
  fs.copyFileSync(OUT, BASE);
}
const base = readGlb(BASE);
const anim = readGlb(ANIM);
const J = base.json;
const byName = new Map(J.nodes.map((n, i) => [n.name, i]));
const restOf = (n, path) => (path === 'rotation' ? n.rotation || [0, 0, 0, 1] : path === 'scale' ? n.scale || [1, 1, 1] : n.translation || [0, 0, 0]);

// 1) the Blender round trip must keep each bone's rest transform, or the clips would be in the wrong frame
let restBad = 0;
for (const n of anim.json.nodes) {
  const i = byName.get(n.name);
  if (i === undefined || !J.skins[0].joints.includes(i)) continue;
  if (!nearQ(restOf(n, 'rotation'), restOf(J.nodes[i], 'rotation'))) { restBad++; console.warn('rest rotation differs:', n.name); }
}
if (restBad) throw new Error(`${restBad} bones changed rest rotation in the Blender export`);

// 2) copy channels; drop the ones that never leave the rest pose (Blender samples every bone)
const chunks = [];
let offset = Math.ceil(base.bin.length / 4) * 4;
const binStart = offset;
J.accessors = J.accessors.slice();
J.bufferViews = J.bufferViews.slice();
function addAccessor(rows, type) {
  const n = rows[0].length;
  const buf = Buffer.alloc(rows.length * n * 4);
  rows.flat().forEach((v, k) => buf.writeFloatLE(v, k * 4));
  J.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buf.length });
  chunks.push(buf);
  offset += buf.length;
  const acc = { bufferView: J.bufferViews.length - 1, componentType: 5126, count: rows.length, type };
  if (type === 'SCALAR') { acc.min = [Math.min(...rows.flat())]; acc.max = [Math.max(...rows.flat())]; }
  J.accessors.push(acc);
  return J.accessors.length - 1;
}

J.animations = [];
const report = [];
for (const a of anim.json.animations) {
  const out = { name: a.name, channels: [], samplers: [] };
  const timeAcc = new Map();
  for (const ch of a.channels) {
    const nodeName = anim.json.nodes[ch.target.node].name;
    const target = byName.get(nodeName);
    if (target === undefined) continue;
    const s = a.samplers[ch.sampler];
    const values = readAccessor(anim, s.output);
    const rest = restOf(J.nodes[target], ch.target.path);
    const same = ch.target.path === 'rotation' ? nearQ : near;
    if (values.every((v) => same(v, rest))) continue;
    if (ch.target.path !== 'rotation') { console.warn(`${a.name}: keeping ${ch.target.path} on ${nodeName}`); }
    if (!timeAcc.has(s.input)) timeAcc.set(s.input, addAccessor(readAccessor(anim, s.input), 'SCALAR'));
    out.samplers.push({ input: timeAcc.get(s.input), output: addAccessor(values, ch.target.path === 'rotation' ? 'VEC4' : 'VEC3'), interpolation: s.interpolation || 'LINEAR' });
    out.channels.push({ sampler: out.samplers.length - 1, target: { node: target, path: ch.target.path } });
  }
  const times = readAccessor(anim, a.samplers[0].input).flat();
  report.push(`${a.name}: ${out.channels.length} channels, ${times.at(-1).toFixed(3)} s`);
  J.animations.push(out);
}

// 3) write the GLB: JSON chunk + (original bin + padding + new clip data)
const pad = Buffer.alloc(binStart - base.bin.length);
let bin = Buffer.concat([base.bin, pad, ...chunks]);
bin = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
J.buffers[0].byteLength = bin.length;
let json = Buffer.from(JSON.stringify(J), 'utf8');
json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
const ch = (len, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(len, 0); h.writeUInt32LE(type, 4); return h; };
fs.writeFileSync(OUT, Buffer.concat([header, ch(json.length, 0x4e4f534a), json, ch(bin.length, 0x004e4942), bin]));
console.log(report.join('\n'));
console.log(`${OUT}: ${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB (base ${(fs.statSync(BASE).size / 1e6).toFixed(2)} MB)`);
