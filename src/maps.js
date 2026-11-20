// Standard maps from Ticket-02 Part 2. Pure data + geometry queries, no rendering.
// Angles: measured from +X, counter-clockwise seen from above -> (r cos a, h, r sin a).
// Ground model (assumption B9): every walkable area is a solid column with a flat or
// sloped top. tops(x, z) lists the top heights of all columns at that point.

const rad = (d) => (d * Math.PI) / 180;
const ring = (r, startDeg, stepDeg, n, h = 0, cx = 0, cz = 0) =>
  Array.from({ length: n }, (_, i) => {
    const a = rad(startDeg + i * stepDeg);
    return [cx + r * Math.cos(a), h, cz + r * Math.sin(a)];
  });
const lanterns = (list) => list.map((pos, i) => ({ id: `L${i + 1}`, pos }));

// ---------- Night 1: Đảo Bến ----------
const night1 = {
  night: 1,
  name: 'Đảo Bến',
  start: [0, 0, 0],
  lanterns: lanterns([[0, 0, 25], [23.8, 0, 7.7], [14.7, 0, -20.2], [-14.7, 0, -20.2], [-23.8, 0, 7.7]]),
  motePoints: [...ring(12, 0, 45, 8), ...ring(33, 0, 22.5, 16)],
  shadePoints: ring(37, 15, 30, 12),
  shadeEvery: 480,
  shadeMax: 6,
  shadeSpeed: 4,
  charms: [],
  drifters: false,
  wind: false,
  pads: [],
  tops(x, z) {
    return Math.hypot(x, z) <= 40 ? [0] : [];
  },
};

// ---------- Night 2: Đảo Cau ----------
const night2 = {
  night: 2,
  name: 'Đảo Cau',
  start: [0, 0, 0],
  lanterns: lanterns([[0, 0, 20], [17, 0, -10], [-17, 0, -10], [70, 0, 20], [87, 0, -10], [53, 0, -10]]),
  motePoints: [
    ...ring(10, 0, 90, 4), ...ring(22, 0, 45, 8),
    ...ring(10, 0, 90, 4, 0, 70, 0), ...ring(22, 0, 45, 8, 0, 70, 0),
  ],
  shadePoints: [...ring(26, 22.5, 45, 8), ...ring(26, 22.5, 45, 8, 0, 70, 0)],
  shadeEvery: 420,
  shadeMax: 8,
  shadeSpeed: 4,
  charms: [{ id: 'C1', pos: [35, 0, 0] }],
  drifters: true,
  wind: false,
  pads: [
    { pos: [20, 0, 18], target: [70, 0, 0], vy: 14, vh: 24 },
    { pos: [50, 0, -18], target: [0, 0, 0], vy: 14, vh: 24 },
  ],
  tops(x, z) {
    const onA = Math.hypot(x, z) <= 28;
    const onB = Math.hypot(x - 70, z) <= 28;
    const onBridge = x >= 26 && x <= 44 && z >= -2 && z <= 2;
    return onA || onB || onBridge ? [0] : [];
  },
};

// ---------- Night 3: Đảo Chuông ----------
function onRamp(x, z, deg) {
  const a = rad(deg);
  const along = x * Math.cos(a) + z * Math.sin(a); // radial distance along the ramp axis
  const across = -x * Math.sin(a) + z * Math.cos(a);
  if (Math.abs(across) > 1.5 || along < 24 || along > 30) return null;
  return (3 * (30 - along)) / 6; // 0 at r=30, 3 at r=24
}
const night3 = {
  night: 3,
  name: 'Đảo Chuông',
  start: [0, 0, -30], // assumption B8
  lanterns: lanterns([[0, 6, 6], [18, 3, 10], [-18, 3, 10], [35, 0, -10], [-35, 0, -10], [20, 0, -35], [-20, 0, -35]]),
  motePoints: [...ring(34, 0, 20, 18, 0), ...ring(18, 20, 20, 8, 3), ...ring(5, 45, 90, 4, 6)],
  shadePoints: ring(43, 0, 22.5, 16),
  shadeEvery: 360,
  shadeMax: 10,
  shadeSpeed: 4.5,
  charms: [{ id: 'C1', pos: [30, 0, 25] }, { id: 'C2', pos: [-30, 0, 25] }],
  drifters: true,
  wind: true,
  pads: [{ pos: [0, 3, 13], dir: [0, 0, -1], vy: 12, vh: 8 }],
  tower: { r: 2, top: 14 },
  tops(x, z) {
    const r = Math.hypot(x, z);
    if (r > 45) return [];
    const out = [0];
    if (z > 0 && r >= 12 && r <= 24) out.push(3);
    if (r <= 8) out.push(6);
    if (r <= 2) out.push(14); // bell tower (8 m on tier 2), not climbable
    for (const deg of [30, 150]) {
      const h = onRamp(x, z, deg);
      if (h !== null) out.push(h);
    }
    return out;
  },
};

export const MAPS = { 1: night1, 2: night2, 3: night3 };
export const nightDuration = (T, night) => T[`night${night}_duration_s`];

// Highest top that is at or below y + tol (the surface you stand on), or null.
export function supportAt(map, x, z, y, tol) {
  let best = null;
  for (const h of map.tops(x, z)) if (h <= y + tol && (best === null || h > best)) best = h;
  return best;
}
// True if a column top at (x, z) is higher than y + tol (a wall for something at height y).
export function wallAt(map, x, z, y, tol) {
  for (const h of map.tops(x, z)) if (h > y + tol) return true;
  return false;
}
// Highest surface at (x, z), used for things that glide over the ground.
export function topAt(map, x, z) {
  const t = map.tops(x, z);
  return t.length ? Math.max(...t) : null;
}
