/** Deadline pacing keeps fractional frames on 120/144 Hz displays; it never invents frames. */
export class FramePacer {
 private next=0;
 private previous=0;
 private intervals:number[]=[];
 refresh=60;
 reset(){this.next=0;this.previous=0;this.intervals=[];}
 due(now:number,target:number){
  const delta=now-this.previous;this.previous=now;
  if(delta>3&&delta<40){this.intervals.push(delta);if(this.intervals.length===32){const sorted=this.intervals.slice().sort((a,b)=>a-b);this.refresh=Math.min(240,1000/sorted[6]);this.intervals=[];}}
  const interval=1000/target;
  if(now+.5<this.next)return false;
  this.next=this.next?this.next+Math.max(1,Math.floor((now+.5-this.next)/interval)+1)*interval:now+interval;
  return true;
 }
}
