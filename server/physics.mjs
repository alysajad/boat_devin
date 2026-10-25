import RAPIER from '@dimforge/rapier2d-compat';
import { DRIVE_SECONDS, driveFraction, STROKE_SECONDS } from '../app/rowing.ts';
import { boatLength } from '../app/race-v2.ts';
import { chundanFootprint, houseboatFootprint, mooredHouseboat } from '../app/hull-profile.ts';
// Module initialization runs once, before the authority starts accepting rooms.
await RAPIER.init();
const MAX_ROLL=Math.PI/15, ROW_ROLL=8*Math.PI/180;
export const bowProgress=b=>b.distance+Math.cos(b.heading)*b.length/2;
const angle=a=>Math.atan2(Math.sin(a),Math.cos(a))||0;
// Return the first downstream crossing, including rotation between step endpoints.
function crossing(a,b,line){
 const turn=angle(b.heading-a.heading),progress=t=>a.distance+(b.distance-a.distance)*t+Math.cos(a.heading+turn*t)*b.length/2;
 for(let sample=1;sample<=8;sample++){
  let lo=(sample-1)/8,hi=sample/8;if(progress(lo)>=line||progress(hi)<line)continue;
  for(let i=0;i<30;i++){const t=(lo+hi)/2;if(progress(t)>=line)hi=t;else lo=t;}
  return hi;
 }
 return null;
}
const poseKeys=['x','distance','heading','roll','rollVelocity','vx','vy','angularVelocity'];
export class RiverPhysics {
 constructor(race){
  this.race=race;this.drives=[];this.bodies=new Map();this.allocations=new Map();this.sides=new Map();this.activity=new Map();this.contacts=new Map();this.impactAt=new Map();this.time=0;
  this.world=new RAPIER.World({x:0,y:0});this.events=new RAPIER.EventQueue(true);this.colliders=new Map();
  const configs=race.config.filter(c=>race.players.some(p=>p.team===c.id));
  race.boatOrder=configs.map(c=>c.id);race.riverWidth=Math.max(40,configs.length*4+24);race.logs=[];race.boats={};
  const surface=desc=>desc.setFriction(.08).setRestitution(.03).setContactSkin(.01);
  for(const side of [-1,1]){
   const collider=this.world.createCollider(surface(RAPIER.ColliderDesc.cuboid(2,100000).setTranslation(side*(race.riverWidth/2+2),0)));
   this.colliders.set(collider.handle,{bank:side});
  }
  for(let i=0;i<54;i+=3){const m=mooredHouseboat(i,race.riverWidth);this.world.createCollider(surface(RAPIER.ColliderDesc.convexHull(houseboatFootprint()).setTranslation(m.x,m.distance)));}
  for(const [i,c] of configs.entries()){
   const crew=race.players.filter(p=>p.team===c.id),crewCount=crew.length,length=boatLength(crewCount);
   const counts={left:crew.filter(p=>p.side==='left').length,right:crew.filter(p=>p.side==='right').length};
   for(const p of crew){this.allocations.set(p.id,crewCount===1?1:1/(2*counts[p.side]));this.sides.set(p.id,p.side);}
   const b=race.boats[c.id]={x:(i-(configs.length-1)/2)*4,distance:-length/2,speed:0,heading:0,vx:0,vy:0,angularVelocity:0,roll:0,rollVelocity:0,balance:0,soloAssist:crewCount===1,contact:false,length,progress:0,collisions:0,splash:0,crewCount,sync:crewCount===1?1:0,finishTime:null};
   const body=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(b.x,b.distance).setCcdEnabled(true).setCanSleep(false));
   const collider=this.world.createCollider(surface(RAPIER.ColliderDesc.convexPolyline(chundanFootprint(length))).setMassProperties(1,{x:0,y:0},(length*length+1.56**2)/12).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),body);
   this.bodies.set(c.id,body);this.colliders.set(collider.handle,{id:c.id});this.activity.set(c.id,{left:0,right:0});
  }
 }
 updateAssistance(){for(const id of this.race.boatOrder)this.race.boats[id].soloAssist=this.race.players.filter(p=>p.team===id&&p.connected).length===1;}
 stroke(player,bonus=0){
  const b=this.race.boats[player.team],allocation=this.allocations.get(player.id);if(!b||allocation==null)return;
  this.updateAssistance();
  const impulse=3.3*this.race.settings.forceMultiplier*allocation;
  this.drives.push({id:player.team,age:0,impulse,side:b.soloAssist?0:this.sides.get(player.id)==='left'?-1:1});
  if(bonus>0)this.bonus(player,Math.min(.1,bonus));
 }
 bonus(player,bonus){const allocation=this.allocations.get(player.id);if(allocation!=null)this.drives.push({id:player.team,age:0,impulse:3.3*this.race.settings.forceMultiplier*Math.max(0,Math.min(.1,bonus))*allocation,side:0});}
 // State is the public authoritative interface, also allowing deterministic scenario setup.
 writeBody(id){const b=this.race.boats[id],body=this.bodies.get(id);body.setTranslation({x:b.x,y:b.distance},true);body.setRotation(-b.heading,true);body.setLinvel({x:b.vx,y:b.vy},true);body.setAngvel(-b.angularVelocity,true);}
 integrate(dt){
  const r=this.race;this.updateAssistance();this.time+=dt;
  for(const id of r.boatOrder){this.writeBody(id);const a=this.activity.get(id);a.left*=Math.exp(-dt/1.2);a.right*=Math.exp(-dt/1.2);}
  for(const d of this.drives){
   const b=r.boats[d.id],body=this.bodies.get(d.id),amount=d.impulse*(driveFraction(d.age+dt)-driveFraction(d.age));
   const s=Math.sin(b.heading),c=Math.cos(b.heading),side=b.soloAssist?0:d.side;
   body.applyImpulseAtPoint({x:s*amount,y:c*amount},{x:b.x+c*side*.72,y:b.distance-s*side*.72},true);
   if(side)this.activity.get(d.id)[side<0?'left':'right']+=amount;
   d.age+=dt;
  }
  this.drives=this.drives.filter(d=>d.age<DRIVE_SECONDS);
  const beforeVelocity=new Map();
  for(const id of r.boatOrder){
   const b=r.boats[id],body=this.bodies.get(id),a=this.activity.get(id),s=Math.sin(b.heading),c=Math.cos(b.heading),v=body.linvel();
   b.balance=b.soloAssist?0:(a.left-a.right)/Math.max(3.3*r.settings.forceMultiplier/2,a.left+a.right);
   const forward=(v.x*s+v.y*c)/(1+(.18+.075*Math.abs(v.x*s+v.y*c))*dt),lateral=(v.x*c-v.y*s)*Math.exp(-2.8*dt);
   let vx=forward*s+lateral*c,vy=forward*c-lateral*s;
   const assistance=b.soloAssist?3.8:1.8*(1-Math.abs(b.balance))**4;
   let yaw=-body.angvel();yaw+=(-assistance*angle(b.heading)-(b.soloAssist?3.6:2.4)*yaw)*dt;
   for(const pair of this.contacts.values())if(pair.ids.includes(id)&&pair.bank){vx-=pair.bank*.9*dt;yaw+=(-angle(b.heading)*2-yaw)*dt;}
   body.setLinvel({x:vx,y:vy},true);body.setAngvel(-yaw,true);beforeVelocity.set(id,{x:vx,y:vy});
  }
  this.world.timestep=dt;this.world.step(this.events);
  this.events.drainCollisionEvents((h1,h2,started)=>{
   const key=[h1,h2].sort((a,b)=>a-b).join('/'),a=this.colliders.get(h1),b=this.colliders.get(h2);
   if(!started){this.contacts.delete(key);return;}
   const ids=[a?.id,b?.id].filter(Boolean),bank=a?.bank||b?.bank;
   this.contacts.set(key,{ids,bank});
   const va=beforeVelocity.get(a?.id)||{x:0,y:0},vb=beforeVelocity.get(b?.id)||{x:0,y:0};
   if(Math.hypot(va.x-vb.x,va.y-vb.y)>.35&&this.time-(this.impactAt.get(key)??-Infinity)>.5){for(const id of ids)r.boats[id].collisions++;this.impactAt.set(key,this.time);}
  });
  for(const id of r.boatOrder){
   const b=r.boats[id],body=this.bodies.get(id),p=body.translation(),v=body.linvel(),prior=beforeVelocity.get(id);
   b.x=p.x;b.distance=p.y;b.heading=angle(-body.rotation());b.vx=v.x;b.vy=v.y;b.angularVelocity=-body.angvel();b.speed=Math.hypot(v.x,v.y);b.progress=bowProgress(b);
   b.contact=[...this.contacts.values()].some(pair=>pair.ids.includes(id));
   const lateralImpact=(v.x-prior.x)*Math.cos(b.heading)-(v.y-prior.y)*Math.sin(b.heading);
   b.rollVelocity+=Math.max(-.6,Math.min(.6,lateralImpact*.08));
   b.rollVelocity+=(16*(ROW_ROLL*b.balance-b.roll)-8*b.rollVelocity)*dt;b.roll+=b.rollVelocity*dt;
   if(Math.abs(b.roll)>MAX_ROLL){b.roll=Math.sign(b.roll)*MAX_ROLL;if(b.roll*b.rollVelocity>0)b.rollVelocity=0;}
  }
 }
 step(dt=1/60){
  if(!Number.isFinite(dt)||dt<=0)return 0;
  let elapsed=0;
  while(elapsed<dt-1e-10){
   const slice=Math.min(1/60,dt-elapsed),r=this.race,before=Object.fromEntries(r.boatOrder.map(id=>[id,{...r.boats[id]}]));
   this.integrate(slice);
   if(r.settings.format==='distance'){
    const crossings=[];
    for(const id of r.boatOrder){const fraction=crossing(before[id],r.boats[id],r.settings.distance);if(fraction!==null)crossings.push({id,fraction});}
    if(crossings.length){const first=Math.min(...crossings.map(c=>c.fraction));
     const after=Object.fromEntries(r.boatOrder.map(id=>[id,{...r.boats[id]}]));
     // A tie window may straddle a 60 Hz step boundary. Simulate that final millisecond,
     // then restore every hull to the first crossing rather than projecting a winner.
     const extra=.001-slice*(1-first);
     if(extra>0){this.integrate(extra);for(const id of r.boatOrder){if(crossings.some(c=>c.id===id))continue;const fraction=crossing(after[id],r.boats[id],r.settings.distance);if(fraction!==null)crossings.push({id,fraction:1+fraction*extra/slice});}}
     for(const id of r.boatOrder){const b=r.boats[id],a=before[id],end=after[id];Object.assign(b,end);for(const key of poseKeys)b[key]=a[key]+(key==='heading'?angle(end[key]-a[key]):end[key]-a[key])*first;b.progress=bowProgress(b);}
     for(const c of crossings)if(slice*(c.fraction-first)<.001)r.boats[c.id].finishTime=r.elapsed+elapsed+slice*c.fraction;
     this.freeze();r.phase='results';return elapsed+slice*first;
    }
   }
   elapsed+=slice;
  }
  return elapsed;
 }
 freeze(){this.drives=[];for(const id of this.race.boatOrder){const b=this.race.boats[id];b.speed=b.vx=b.vy=b.angularVelocity=b.rollVelocity=0;this.writeBody(id);}}
 dispose(){this.drives=[];this.events.free();this.world.free();}
}
export const STROKE_MS=STROKE_SECONDS*1000;
