import { DRIVE_SECONDS, driveFraction, STROKE_SECONDS } from '../app/rowing.ts';
import { boatLength } from '../app/race-v2.ts';
/** Authoritative drag-based propulsion on fixed parallel courses. */
export class RiverPhysics {
 constructor(race){
  this.race=race;this.drives=[];
  const configs=race.config.filter(c=>race.players.some(p=>p.team===c.id));
  race.boatOrder=configs.map(c=>c.id);race.riverWidth=Math.max(40,configs.length*4+24);race.logs=[];
  for(const [i,c] of configs.entries()){
   const crewCount=race.players.filter(p=>p.team===c.id).length,length=boatLength(crewCount);
   race.boats[c.id]={x:(i-(configs.length-1)/2)*4,distance:-length/2,speed:0,heading:0,vx:0,vy:0,angularVelocity:0,length,progress:0,collisions:0,splash:0,crewCount,sync:crewCount===1?1:0,finishTime:null};
  }
 }
 stroke(player,bonus=0){
  const b=this.race.boats[player.team];if(!b)return;
  this.drives.push({id:player.team,age:0,impulse:3.3*this.race.settings.forceMultiplier*(1+Math.min(.1,Math.max(0,bonus)))/b.crewCount});
 }
 step(dt=1/60){
  for(const d of this.drives){const b=this.race.boats[d.id];b.speed+=d.impulse*(driveFraction(d.age+dt)-driveFraction(d.age));d.age+=dt;}
  this.drives=this.drives.filter(d=>d.age<DRIVE_SECONDS);
  for(const id of this.race.boatOrder){const b=this.race.boats[id];b.speed/=1+(.18+.075*b.speed)*dt;b.distance+=b.speed*dt;b.progress=b.distance+b.length/2;b.vy=b.speed;}
 }
 dispose(){this.drives=[];}
}
export const STROKE_MS=STROKE_SECONDS*1000;
