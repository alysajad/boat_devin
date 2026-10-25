export type Team = string;
export type Side = 'left' | 'right';
export type ControllerMode = 'motion' | 'swipe';
export type RaceSettings = { format: 'distance' | 'timed'; distance: number; duration: number; forceMultiplier: number; motionSensitivity: number };
export const defaultSettings = (): RaceSettings => ({ format: 'distance', distance: 250, duration: 60, forceMultiplier: 1.5, motionSensitivity: 1.3 });
export function settingsError(v: RaceSettings) {
  return !v || !['distance','timed'].includes(v.format) || !Number.isInteger(v.distance) || v.distance < 100 || v.distance > 1000 || !Number.isInteger(v.duration) || v.duration < 30 || v.duration > 180 || !Number.isFinite(v.forceMultiplier) || v.forceMultiplier < .5 || v.forceMultiplier > 3 || !Number.isFinite(v.motionSensitivity) || v.motionSensitivity < .5 || v.motionSensitivity > 2.5 ? 'Choose 100–1,000 m, 30–180 seconds, 0.5–3× force and 0.5–2.5× sensitivity.' : '';
}
export type Phase = 'lobby' | 'countdown' | 'racing' | 'paused' | 'results' | 'interrupted';
export type BoatConfig = { id: string; name: string; color: string; seats: number };
export type Player = { id: string; name: string; team: string; seat: number; side: Side; ready: boolean; connected: boolean; strokes: number; lastStroke: number; lastSide: Side; mode: ControllerMode | null; cadence: number };
export type Boat = { x: number; distance: number; speed: number; heading: number; vx: number; vy: number; angularVelocity: number; roll: number; rollVelocity: number; balance: number; soloAssist: boolean; contact: boolean; length: number; progress: number; collisions: number; splash: number; crewCount: number; sync: number; finishTime: number | null };
export type RiverLog = { id: number; x: number; distance: number; heading: number };
export type Race = { schema: 4; settings: RaceSettings; elapsed: number; room: string; round: number; phase: Phase; config: BoatConfig[]; boatOrder: string[]; players: Player[]; boats: Record<string,Boat>; remaining: number; countdown: number; revision: number; seed: number; riverWidth: number; message: string; serverTime: number; logs: RiverLog[] };
export type Snapshot = Pick<Race,'phase'|'remaining'|'countdown'|'revision'|'round'|'serverTime'|'elapsed'> & { frames: [string,number,number,number,number,number,number,number,number,number,number,number,number | null,number,number,number,boolean,boolean][]; logs: [number,number,number,number][]; strokes: [number,number,number,Side,number][] };
export type ControllerStatus = Pick<Race,'phase'|'remaining'|'countdown'|'revision'|'round'|'serverTime'|'elapsed'> & { boats: Record<string, Pick<Boat,'progress'|'speed'|'sync'|'finishTime'|'balance'|'soloAssist'>>; players: Pick<Player,'id'|'strokes'|'cadence'>[] };
export type Session = { code: string; token: string; id: string; role: 'admin'|'player'|'watch'; waiting?: boolean; bootId: string; name: string };
export const COLORS = ['#ed684f','#e9bd54','#53b4b0','#7897df','#b993cf','#c2c573','#eaa17e','#87bdb1','#b8a8e8','#d990ab'];
export const boatLength = (crew: number) => Math.max(14, 10 + .95 * Math.ceil(crew / 2));
export const crewSeatZ = (index: number, count: number) => (Math.floor(index / 2) - (Math.ceil(count / 2) - 1) / 2) * .95;
export const defaultConfig = (count=2,seats=1):BoatConfig[] => Array.from({length:count},(_,i)=>({id:`boat-${i+1}`,name:i===0?'Coral crew':i===1?'Golden crew':`Crew ${i+1}`,color:COLORS[i],seats}));
export function configError(value: unknown):string {
  if(!Array.isArray(value)||value.length<2||value.length>10)return 'Configure between 2 and 10 boats.';
  if(value.some(b=>!b||typeof b.id!=='string'||!/^boat-[1-9][0-9]?$/.test(b.id)||typeof b.name!=='string'||!b.name.trim()||b.name.length>24||!/^#[0-9a-f]{6}$/i.test(b.color)||!Number.isInteger(b.seats)||b.seats<1||b.seats>25))return 'Each boat needs a name, color and 1–25 seats.';
  if(new Set(value.map(b=>b.id)).size!==value.length)return 'Boat IDs must be unique.';

  return '';
}
export function rankings(race:Race){return [...race.boatOrder].sort((a,b)=>(race.boats[a].finishTime ?? Infinity) - (race.boats[b].finishTime ?? Infinity) || race.boats[b].progress-race.boats[a].progress);}
export function startReason(race:Race){
  if(new Set(race.players.map(p=>p.team)).size<2)return 'One ready player in each of at least two boats is enough to race.';
  if(race.players.some(p=>!p.connected))return 'Reconnect or remove the offline players before starting.';
  if(race.players.some(p=>!p.ready))return 'Waiting for every seated player to get ready.';
  return '';
}

export function winners(race:Race){const order=rankings(race),first=race.boats[order[0]];return order.filter(id=>first?.finishTime!=null ? Math.abs((race.boats[id].finishTime??Infinity)-first.finishTime)<.001 : Math.abs((first?.progress??0)-race.boats[id].progress)<.001);}
