import { rankings, type Race } from './race-v2.ts';
export type Shot = 'overview'|'side'|'chase'|'bow'|'finish';
/** Six-second shots; urgent finishes can cut after four seconds. Manual choices persist. */
export class Director {
 private since=-Infinity;
 private round=-1;
 private index=0;
 private shot:Shot='overview';
 private boat='';
 select(race:Race,now:number,manual='auto',follow=''){
  const order=rankings(race),lead=order[0];
  if(this.round!==race.round){this.round=race.round;this.since=now;this.index=0;this.shot='overview';this.boat=lead;}
  if(manual!=='auto'||follow)return{shot:(manual==='auto'?'chase':manual) as Shot,boat:follow||lead};
  const near=race.settings.format==='distance'&&race.settings.distance-race.boats[lead].progress<35;
  if(now-this.since>=6000||(near&&this.shot!=='finish'&&now-this.since>=4000)){
   this.since=now;this.index++;
   const pair=order.slice(0,-1).map((id,i)=>({id,gap:race.boats[id].progress-race.boats[order[i+1]].progress})).sort((a,b)=>a.gap-b.gap)[0];
   this.boat=pair&&pair.gap<12?pair.id:lead;
   this.shot=near?'finish':(['side','chase','bow','overview'] as Shot[])[(this.index-1)%4];
  }
  return{shot:this.shot,boat:this.boat};
 }
}
