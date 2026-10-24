import { HULL, LOG_FOOTPRINT, LATERAL_SCALE, LANE_HALF_WIDTH, footprint, overlaps } from './world.ts';
import { DRIVE_SECONDS, STROKE_SECONDS, driveFraction } from './rowing.ts';
export type Team = 'coral' | 'gold';
export type Side = 'left' | 'right';
export type Phase = 'lobby' | 'countdown' | 'racing' | 'paused' | 'results' | 'interrupted';
export type Player = { id: string; name: string; team: Team; side: Side; ready: boolean; connected: boolean; strokes: number };
export type Boat = { x: number; distance: number; speed: number; heading: number; collisions: number; hit: number[]; splash: number; bankCooldown: number; yawVelocity?: number; drives?: { age: number; impulse: number; turn: number }[] };
export type Race = { schema: 1; room: string; organizer: string; round: number; phase: Phase; players: Player[]; boats: Record<Team, Boat>; remaining: number; countdown: number; resume: boolean; revision: number; message: string; seed: number };
export type Guest = { id: string; instance: string; name: string; mode: 'host' | 'player' | 'watch'; team: Team; ready: boolean; heartbeat: number; stroke: { seq: number; round: number }; };
export const TEAMS: Team[] = ['coral', 'gold'];
export const TEAM_NAMES = { coral: 'Coral crew', gold: 'Golden crew' };
export const ROUND_SECONDS = 60;
export const STROKE_COOLDOWN = STROKE_SECONDS * 1000;
const boat = (): Boat => ({ x: 0, distance: 0, speed: 0, heading: 0, collisions: 0, hit: [], splash: 0, bankCooldown: 0, yawVelocity: 0 });
export function newRace(room: string, organizer: string): Race {
  return { schema: 1, room, organizer, round: 1, phase: 'lobby', players: [], boats: { coral: boat(), gold: boat() }, remaining: ROUND_SECONDS, countdown: 5, resume: false, revision: 0, message: '', seed: 7 };
}
export function startReason(state: Race): string {
  const counts = TEAMS.map(t => state.players.filter(p => p.team === t).length);
  if (counts.some(n => n < 2)) return 'Gather at least 2 paddlers in each crew.';
  if (counts[0] !== counts[1]) return 'Balance the crews before casting off.';
  if (counts.some(n => n > 6)) return 'Each boat has room for 6 paddlers.';
  if (state.players.some(p => !p.connected)) return 'Waiting for every paddler to reconnect.';
  if (state.players.some(p => !p.ready)) return 'Waiting for every paddler to get ready.';
  return '';
}
export function assignSide(state: Race, team: Team, index: number): Side {
  return (index + state.round - 1) % 2 === 0 ? 'left' : 'right';
}
export function beginRace(state: Race): boolean {
  if (!['lobby', 'paused'].includes(state.phase) || startReason(state)) return false;
  state.resume = state.phase === 'paused';
  state.phase = 'countdown'; state.countdown = state.resume ? 3 : 5; state.message = '';
  return true;
}
export function rematch(state: Race): void {
  state.round++; state.phase = 'lobby'; state.boats = { coral: boat(), gold: boat() };
  state.remaining = ROUND_SECONDS; state.countdown = 5; state.resume = false; state.message = '';
  state.players.forEach(p => { p.strokes = 0; p.ready = false; });
  for (const team of TEAMS) state.players.filter(p => p.team === team).forEach((p, i) => { p.side = assignSide(state, team, i); });
}
let cachedSeed = NaN;
let course: ReadonlyArray<{ id: number; distance: number; x: number }> = [];
export function obstacles(seed = 7) {
  if (seed !== cachedSeed) {
    cachedSeed = seed;
    course = Array.from({ length: 24 }, (_, i) => ({ id: i, distance: 35 + i * 27, x: [-0.42, 0.35, 0, 0.48, -0.32][((i + seed) % 5 + 5) % 5] }));
  }
  return course;
}
export type InputMemory = Map<string, { seq: number; at: number; round: number }>;
export function applyStroke(state: Race, id: string, input: { seq: number; round: number }, now: number, memory: InputMemory): boolean {
  const p = state.players.find(p => p.id === id);
  if (state.phase !== 'racing' || !p?.connected || input.round !== state.round || !Number.isSafeInteger(input.seq) || input.seq < 1) return false;
  const previous = memory.get(id);
  if (previous?.round === state.round && input.seq <= previous.seq) return false;
  // Consume rejected bursts too: reconnects cannot replay a backlog of strokes.
  memory.set(id, { seq: input.seq, at: previous?.at ?? -Infinity, round: state.round });
  if (previous?.round === state.round && now - previous.at < STROKE_COOLDOWN) return false;
  memory.set(id, { seq: input.seq, at: now, round: state.round });
  const b = state.boats[p.team];
  const count = state.players.filter(q => q.team === p.team && q.side === p.side).length;
  // A stroke applies force throughout the submerged drive, never during recovery.
  // Crew normalization is an intentional game rule, not measured boat mass.
  (b.drives ??= []).push({ age: 0, impulse: 1.65 / Math.max(1, count), turn: (p.side === 'left' ? 1 : -1) * .28 / Math.max(1, count) });
  b.splash++; p.strokes++;
  return true;
}
function integrateBoat(b: Boat, dt: number, logs: ReturnType<typeof obstacles>) {
  for (const drive of b.drives ?? []) {
    const fraction = driveFraction(drive.age + dt) - driveFraction(drive.age);
    b.speed += drive.impulse * fraction;
    b.yawVelocity = (b.yawVelocity || 0) + drive.turn * fraction;
    drive.age += dt;
  }
  if (b.drives?.length) b.drives = b.drives.filter(drive => drive.age < DRIVE_SECONDS);
  // Linear skin drag plus quadratic pressure drag; neither can reverse a resting hull.
  b.speed = Math.max(0, b.speed / (1 + (.18 + .075 * b.speed) * dt));
  b.yawVelocity = (b.yawVelocity || 0) * Math.exp(-(1.5 + .1 * b.speed) * dt);
  b.heading = Math.max(-.85, Math.min(.85, b.heading + b.yawVelocity * dt));
  b.distance += Math.cos(b.heading) * b.speed * dt;
  b.x += Math.sin(b.heading) * b.speed * dt / LATERAL_SCALE;
  b.bankCooldown = Math.max(0, b.bankCooldown - dt);
  // The whole rotated hull must stay inside its marked lane, including the bow and stern.
  let hull = footprint(HULL, b.x * LATERAL_SCALE, -b.distance, b.heading);
  const left = Math.min(...hull.map(p => p[0])), right = Math.max(...hull.map(p => p[0]));
  const correction = left < -LANE_HALF_WIDTH ? -LANE_HALF_WIDTH - left : right > LANE_HALF_WIDTH ? LANE_HALF_WIDTH - right : 0;
  if (correction) {
    b.x += correction / LATERAL_SCALE;
    b.yawVelocity = Math.sign(correction) * Math.abs(b.yawVelocity) * .3;
    // Leave heading continuous; inward angular response moves the bow off the boundary.
    b.heading *= Math.exp(-2 * dt);
    if (b.bankCooldown === 0) { b.speed *= .45; b.collisions++; b.bankCooldown = 1; }
    hull = footprint(HULL, b.x * LATERAL_SCALE, -b.distance, b.heading);
  }
  for (const log of logs) {
    if (b.hit.includes(log.id) || Math.abs(b.distance - log.distance) > 6.5 || Math.abs(b.x - log.x) * LATERAL_SCALE > 6.5) continue;
    const logHull = footprint(LOG_FOOTPRINT, log.x * LATERAL_SCALE, -log.distance, 0);
    if (overlaps(hull, logHull)) {
      b.hit.push(log.id); b.speed *= .35; b.yawVelocity *= .5; b.collisions++;
    }
  }
}
export function step(state: Race, dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(dt, .1);
  if (state.phase === 'countdown') {
    const consumed = Math.min(dt, state.countdown);
    state.countdown = Math.max(0, state.countdown - consumed);
    dt -= consumed;
    if (state.countdown <= .0000001) state.phase = 'racing';
    else return;
  }
  if (state.phase !== 'racing' || dt <= 0) return;
  const duration = Math.min(dt, state.remaining), logs = obstacles(state.seed);
  // Substeps prevent fast boats tunnelling through a log and keep collisions frame-rate independent.
  let remaining = duration;
  while (remaining > 1e-9) {
    const slice = Math.min(1 / 120, remaining);
    for (const team of TEAMS) integrateBoat(state.boats[team], slice, logs);
    remaining -= slice;
  }
  state.remaining = Math.max(0, state.remaining - duration);
  if (state.remaining <= .0000001) { state.remaining = 0; state.phase = 'results'; }
}
export function winner(state: Race): Team | 'draw' {
  const a = Math.round(state.boats.coral.distance), b = Math.round(state.boats.gold.distance);
  return a === b ? 'draw' : a > b ? 'coral' : 'gold';
}
export function validGuest(g: unknown): g is Guest {
  const v = g as Guest;
  return !!v && typeof v.id === 'string' && v.id.length <= 64 && typeof v.instance === 'string' && typeof v.name === 'string' && v.name.length <= 24 && ['host', 'player', 'watch'].includes(v.mode) && TEAMS.includes(v.team) && typeof v.ready === 'boolean' && Number.isFinite(v.heartbeat) && !!v.stroke && Number.isSafeInteger(v.stroke.seq) && Number.isSafeInteger(v.stroke.round);
}
