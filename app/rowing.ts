/** Shared timing for the authoritative drive and the visible paddle. Seconds/metres. */
export const DRIVE_SECONDS = .32;
export const STROKE_SECONDS = .7;
export const PADDLE_LEAN = .65;

/** Integrated half-sine force profile: no impulse during the aerial recovery. */
export function driveFraction(age: number) {
  const t = Math.max(0, Math.min(1, age / DRIVE_SECONDS));
  return (1 - Math.cos(t * Math.PI)) / 2;
}

export function paddlePose(age: number, preview = 0) {
  const active = age >= 0 && age < STROKE_SECONDS;
  const drive = active && age < DRIVE_SECONDS;
  const t = drive ? age / DRIVE_SECONDS : active ? (age - DRIVE_SECONDS) / (STROKE_SECONDS - DRIVE_SECONDS) : 0;
  const smooth = t * t * (3 - 2 * t);
  // Recovery lifts the entire blade clear of the water before returning it forward.
  const pull = drive ? smooth : active ? 1 - smooth : 0;
  const lift = drive ? 0 : active ? Math.sin(Math.PI / 2 * Math.min(1, t * 4)) * .32 + Math.sin(Math.PI * t) * .08 : .32;
  return { active, drive, pull, feather: active && !drive ? Math.sin(Math.PI*t)*.7 : 0, y: .71 + lift - (!active ? preview * .18 : 0), z: -.32 + pull * .22, pitch: -.22 + pull * .42 };
}

/** Same long wave as the water shader, used to seat the hull on the surface. */
export function waterHeight(x: number, z: number, seconds: number) {
  return .012 * Math.sin(x * .65 + z * .9 + seconds * .7);
}
