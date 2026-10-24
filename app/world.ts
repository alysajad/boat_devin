/** Shared metre-scale geometry: rendering and collision detection use the same footprint. */
export type Point = readonly [number, number]; // local/world x,z; river forward is -z
export const LATERAL_SCALE = 1 / .19;
export const LANE_OFFSET = 5.4;
export const LANE_HALF_WIDTH = .83 * LATERAL_SCALE;
export const WATER_LEVEL = -.12;
export const LOG_HALF_LENGTH = 1.325;
export const LOG_RADIUS = .2;
export const LOG_HEADING = .09;
// A curved canoe outline shared by the visible shell, rails and collision polygon.
const halfHull: Point[] = [];
for (let section = 0; section < 2; section++) for (let i = 0; i <= 12; i++) {
  if (section && i === 0) continue;
  const t = i / 12, u = 1 - t;
  const controls = section === 0 ? [[0,-4.9],[.65,-4.2],[.74,-2.6],[.74,0]] : [[.74,0],[.74,2.3],[.6,4],[0,4.9]];
  halfHull.push([u*u*u*controls[0][0]+3*u*u*t*controls[1][0]+3*u*t*t*controls[2][0]+t*t*t*controls[3][0],
    u*u*u*controls[0][1]+3*u*u*t*controls[1][1]+3*u*t*t*controls[2][1]+t*t*t*controls[3][1]]);
}
export const HULL: readonly Point[] = [...halfHull, ...halfHull.slice(1,-1).reverse().map(([x,z]):Point=>[-x,z])];
export const laneCenter = (team: 'coral' | 'gold') => team === 'coral' ? -LANE_OFFSET : LANE_OFFSET;
export const seatZ = (index: number) => -2.35 + index * .94;
export function footprint(points: readonly Point[], x: number, z: number, heading: number): Point[] {
  const c = Math.cos(heading), s = Math.sin(heading);
  return points.map(([px, pz]) => [x + c * px - s * pz, z + s * px + c * pz]);
}
export const LOG_FOOTPRINT: readonly Point[] = footprint([
  [-LOG_HALF_LENGTH, -LOG_RADIUS], [LOG_HALF_LENGTH, -LOG_RADIUS],
  [LOG_HALF_LENGTH, LOG_RADIUS], [-LOG_HALF_LENGTH, LOG_RADIUS],
], 0, 0, LOG_HEADING);
/** Convex polygons overlap iff no edge normal separates them (touching counts as contact). */
export function overlaps(a: readonly Point[], b: readonly Point[]): boolean {
  for (const polygon of [a, b]) for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length];
    const nx = -(q[1] - p[1]), nz = q[0] - p[0];
    let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
    for (const [x,z] of a) { const dot = x * nx + z * nz; aMin = Math.min(aMin, dot); aMax = Math.max(aMax, dot); }
    for (const [x,z] of b) { const dot = x * nx + z * nz; bMin = Math.min(bMin, dot); bMax = Math.max(bMax, dot); }
    if (aMax < bMin || bMax < aMin) return false;
  }
  return true;
}
