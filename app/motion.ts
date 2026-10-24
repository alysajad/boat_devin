/** Motion is a game gesture, never a measurement of physical hand speed. */
export class StrokeDetector {
  threshold = .35;
  private phase=0;
  private direction=0;
  private started=0;
  private dwell=0;
  private previous=0;
  private peak=0;
  private last=-Infinity;
  reset(){this.phase=0;this.direction=0;this.dwell=0;this.previous=0;this.peak=0;}
  sample(value:number,at:number):number {
    if(!Number.isFinite(value)||!Number.isFinite(at)){this.reset();return 0;}
    const dt=this.previous?at-this.previous:0;this.previous=at;
    if(dt<0||dt>180||Math.abs(value)>20){this.reset();return 0;}
    if(this.phase&&at-this.started>2800){this.reset();return 0;}
    this.peak=Math.max(this.peak,Math.abs(value));
    if(!this.phase){
      const sign=Math.abs(value)>=this.threshold?Math.sign(value):0;
      if(!sign){this.dwell=0;return 0;}
      if(sign!==this.direction){this.direction=sign;this.dwell=0;}
      this.dwell+=dt;
      if(this.dwell>=60){this.phase=1;this.started=at-this.dwell;this.dwell=0;}
    }else if(this.phase===1){
      if(value*this.direction < -this.threshold){this.dwell+=dt;if(this.dwell>=60){this.phase=2;this.dwell=0;}}else this.dwell=0;
    }else if(value*this.direction > -this.threshold*.45){
      const duration=at-this.started,peak=this.peak;this.reset();
      if(duration>=350&&at-this.last>=700){this.last=at;return peak;}
    }
    return 0;
  }
}
const labels=['sideways sweep','vertical sweep','forward / back sweep','turning arc','tilting arc','sideways arc'];
export class MotionInput {
  state:'off'|'rest'|'strokes'|'ready'|'failed'='off';
  message='Sweep your phone sideways and return, as if rowing. Start on either side.';
  strength=0;
  detected=0;
  private channels=labels.map(()=>({detector:new StrokeDetector(),rest:[] as number[],peaks:[] as number[],offset:0,noise:0,filtered:0,baseline:NaN}));
  private selected=0;
  private previous=0;
  private started=0;
  private alive=0;
  private generation=0;
  private timer:ReturnType<typeof setInterval>|undefined;
  private suspended=false;
  private options:{enabled:()=>boolean;active?:()=>boolean;sensitivity:()=>number;stroke:()=>void;changed:()=>void;calibrated?:()=>void};
  constructor(options:MotionInput['options']){this.options=options;}
  async enable(){
    this.stop();const generation=this.generation;
    try{
      if(!window.isSecureContext)throw Error('Motion needs HTTPS. Use the event QR, or choose swipe rowing.');
      const Motion=window.DeviceMotionEvent as typeof DeviceMotionEvent & {requestPermission?:()=>Promise<string>};
      if(!Motion)throw Error('Motion sensors are unavailable. Choose swipe rowing.');
      if(Motion.requestPermission&&await Motion.requestPermission()!=='granted')throw Error('Motion permission declined. Choose swipe rowing.');
      if(generation!==this.generation)return;
      this.state='rest';this.message='Keep still for 3 seconds.';this.started=performance.now();this.alive=0;this.detected=0;
      for(const c of this.channels)Object.assign(c,{rest:[],peaks:[],offset:0,noise:0,filtered:0,baseline:NaN});
      window.addEventListener('devicemotion',this.onMotion);
      this.timer=setInterval(()=>{const now=performance.now();if(document.hidden||this.options.active?.()===false||(this.state==='ready'&&!this.options.enabled())){this.alive=now;return;}if(now-(this.alive||this.started)>2500||(['rest','strokes'].includes(this.state)&&now-this.started>30000))this.fail('No complete rowing strokes detected. Try a wider sideways sweep, recalibrate, or choose swipe rowing.');},500);
      this.options.changed();
    }catch(e){if(generation===this.generation)this.fail((e as Error).message);}
  }
  private fail(message:string){this.stop();this.state='failed';this.message=message;this.options.changed();}
  cancel(){for(const c of this.channels){c.detector.reset();c.filtered=c.offset;}this.previous=0;this.strength=0;}
  stop(){this.generation++;window.removeEventListener('devicemotion',this.onMotion);clearInterval(this.timer);this.cancel();this.state='off';}
  private onMotion=(event:DeviceMotionEvent)=>{
    const now=performance.now(),gap=this.previous?now-this.previous:0,dt=gap?Math.min(.1,gap/1000):.02;this.previous=now;
    if(document.hidden||this.options.active?.()===false){this.suspended=true;this.cancel();return;}
    if(this.suspended||gap>180){this.suspended=false;this.cancel();return;}
    const axes=['x','y','z'] as const,rotations=['alpha','beta','gamma'] as const;
    const values=axes.map((axis,i)=>{
      const raw=event.acceleration?.[axis];if(raw!=null&&Number.isFinite(raw))return raw;
      const gravity=event.accelerationIncludingGravity?.[axis];if(gravity==null||!Number.isFinite(gravity))return null;
      const c=this.channels[i];if(!Number.isFinite(c.baseline))c.baseline=gravity;
      c.baseline+=(gravity-c.baseline)*(1-Math.exp(-dt/1.5));return gravity-c.baseline;
    }).concat(rotations.map(axis=>{const v=event.rotationRate?.[axis];return v==null||!Number.isFinite(v)?null:v/45;}));
    if(values.every(v=>v===null))return;this.alive=now;
    this.strength=0;
    for(let i=0;i<values.length;i++){
      const value=values[i],c=this.channels[i];if(value===null)continue;
      c.filtered+=(value-c.filtered)*(1-Math.exp(-dt/.045));
      if(this.state==='rest'){c.rest.push(c.filtered);continue;}
      if(this.state==='ready'&&i!==this.selected)continue;
      c.detector.threshold=Math.max(.1/this.options.sensitivity(),c.noise*4,this.state==='ready'?Math.min(...c.peaks)*.25/this.options.sensitivity():0);
      this.strength=Math.max(this.strength,Math.min(1,Math.abs(c.filtered-c.offset)/c.detector.threshold));
      const peak=c.detector.sample(c.filtered-c.offset,now);if(!peak)continue;
      if(this.state==='strokes'){
        c.peaks.push(peak);
        if(c.peaks.length>=3){this.selected=i;this.state='ready';this.message=`Calibrated for ${labels[i]}. Sweep out and back in a steady rhythm.`;this.cancel();this.options.calibrated?.();}
        else this.message=`Stroke ${Math.max(...this.channels.map(c=>c.peaks.length))+1} of 3: sweep sideways and return. No pause needed.`;
        this.options.changed();
      }else if(this.state==='ready'){this.detected++;if(this.options.enabled())this.options.stroke();}
    }
    if(this.state==='rest'&&now-this.started>=3000){
      const usable=this.channels.filter(c=>c.rest.length>=20);
      if(!usable.length)return this.fail('Too few sensor readings. Choose swipe rowing.');
      for(const c of usable){c.offset=c.rest.reduce((a,b)=>a+b,0)/c.rest.length;c.noise=Math.sqrt(c.rest.reduce((a,b)=>a+(b-c.offset)**2,0)/c.rest.length);}
      if(usable.some(c=>c.noise>.45))return this.fail('The phone moved during rest. Recalibrate while holding still.');
      this.state='strokes';this.message='Stroke 1 of 3: sweep sideways and return, as if rowing.';this.options.changed();
    }
  };
}
