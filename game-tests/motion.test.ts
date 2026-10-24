import {test} from 'node:test';
import assert from 'node:assert/strict';
import {StrokeDetector} from '../app/motion.ts';
function trace(detector:StrokeDetector,hz:number,fn:(t:number)=>number,seconds=4){let strokes=0;for(let t=0;t<seconds;t+=1/hz)if(detector.sample(fn(t),1000+t*1000))strokes++;return strokes;}
function cycle(t:number){const p=t%1.3;return p<.3?0:p<.65?-1:p<1?1:0;}
test('rest, jitter, shocks and incomplete gestures do not row',()=>{
 for(const hz of[20,30,60,100]){
  assert.equal(trace(new StrokeDetector(),hz,()=>0),0);
  assert.equal(trace(new StrokeDetector(),hz,t=>.12*Math.sin(t*170)),0);
  assert.equal(trace(new StrokeDetector(),hz,t=>t>.5&&t<.53?-12:0),0);
  assert.equal(trace(new StrokeDetector(),hz,t=>t>.5&&t<1?-1:0),0);
 }
});
test('complete cycles work across sampling rates and gentle thresholds',()=>{
 for(const hz of[20,30,60,100])assert.equal(trace(new StrokeDetector(),hz,cycle),3);
 const gentle=new StrokeDetector();gentle.threshold=.12;assert.equal(trace(gentle,60,t=>cycle(t)*.2),3);
});
test('cancellation, gaps, hysteresis and 700 ms limit prevent queued or extra strokes',()=>{
 const d=new StrokeDetector();trace(d,60,t=>t<.3?0:-1,1);d.reset();assert.equal(trace(d,60,()=>1,1),0);
 const rapid=(t:number)=>{const p=t%.55;return p<.18?0:p<.36?-1:1;};assert.ok(trace(new StrokeDetector(),100,rapid)<=5);
 const gap=new StrokeDetector();gap.sample(0,1);gap.sample(-1,20);assert.equal(gap.sample(1,3000),0);
});

test('calibration, sensor bias, gravity fallback, rowing with rotation, suspension and recalibration',async()=>{
 const {MotionInput}=await import('../app/motion.ts');
 const savedWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),savedDocument=Object.getOwnPropertyDescriptor(globalThis,'document'),savedNow=Object.getOwnPropertyDescriptor(performance,'now');
 let now=1000,active=false,strokes=0;
 const fakeWindow=Object.assign(new EventTarget(),{isSecureContext:true,DeviceMotionEvent:class{static requestPermission=async()=>'granted';}});
 const fakeDocument={hidden:false};Object.defineProperty(globalThis,'window',{value:fakeWindow,configurable:true});Object.defineProperty(globalThis,'document',{value:fakeDocument,configurable:true});Object.defineProperty(performance,'now',{value:()=>now,configurable:true});
 const motion=new MotionInput({enabled:()=>active,sensitivity:()=>1.3,stroke:()=>strokes++,changed:()=>{}});
 const sample=(y:number,gravity=false,rotation=0)=>{const event=new Event('devicemotion');Object.assign(event,{acceleration:gravity?null:{y},accelerationIncludingGravity:{y:9.81+y},rotationRate:{alpha:rotation,beta:0,gamma:0}});fakeWindow.dispatchEvent(event);};
 const feed=(fn:(t:number)=>number,duration:number,gravity=false,rotation=0)=>{for(let t=0;t<duration;t+=.02){now+=20;sample(fn(t),gravity,rotation);}};
 try{
  for(const gravity of[false,true]){
   active=false;await motion.enable();feed(()=>gravity?0:.2,3.2,gravity);assert.equal(motion.state,'strokes');
   feed(t=>cycle(t)+(gravity?0:.2),4,gravity);assert.equal(motion.state,'ready',JSON.stringify({gravity,message:motion.message,peaks:(motion as any).peaks,noise:(motion as any).noise}));
   active=true;const before=strokes;feed(t=>cycle(t)+(gravity?0:.2),4,gravity);assert.ok(strokes>before);
   const beforeRotation=strokes;feed(t=>cycle(t)+(gravity?0:.2),4,gravity,100);assert.ok(strokes>beforeRotation);const after=strokes;
   active=false;feed(t=>cycle(t)+(gravity?0:.2),4,gravity);assert.equal(strokes,after);
   active=true;feed(()=>gravity?0:.2,.5,gravity);assert.equal(strokes,after);fakeDocument.hidden=true;feed(t=>cycle(t)+(gravity?0:.2),4,gravity);assert.equal(strokes,after);fakeDocument.hidden=false;feed(()=>gravity?0:.2,.5,gravity);assert.equal(strokes,after);
  }
  await motion.enable();assert.equal(motion.state,'rest');feed(t=>Math.sin(t*10)*4,3.2);assert.equal(motion.state,'failed');
 }finally{motion.stop();for(const [key,value]of [['window',savedWindow],['document',savedDocument]] as const){if(value)Object.defineProperty(globalThis,key,value);else delete (globalThis as any)[key];}if(savedNow)Object.defineProperty(performance,'now',savedNow);else delete (performance as any).now;}
});

test('continuous sweeps accept either starting side without pauses, at 20–100 Hz',()=>{
 for(const hz of [20,30,60,100])for(const sign of [-1,1]){
  const detector=new StrokeDetector();detector.threshold=.12;
  const count=trace(detector,hz,t=>sign*.4*Math.sin(t*2*Math.PI/1.1),6);
  assert.ok(count>=4&&count<=6,`${hz} Hz: ${count}`);
 }
});

test('calibration learns gentle sideways, forward and rotational rowing in either direction',async()=>{
 const {MotionInput}=await import('../app/motion.ts');
 const descriptors=['window','document'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)] as const),savedNow=Object.getOwnPropertyDescriptor(performance,'now');
 let now=1000,active=true,strokes=0,calibrated=0;
 const target=Object.assign(new EventTarget(),{isSecureContext:true,DeviceMotionEvent:class{static requestPermission=async()=>'granted';}});
 Object.defineProperty(globalThis,'window',{value:target,configurable:true});Object.defineProperty(globalThis,'document',{value:{hidden:false},configurable:true});Object.defineProperty(performance,'now',{value:()=>now,configurable:true});
 const motion=new MotionInput({enabled:()=>active,active:()=>active,sensitivity:()=>1.3,stroke:()=>strokes++,changed:()=>{},calibrated:()=>calibrated++});
 try{
  for(const axis of ['x','y','z','alpha','beta','gamma'])for(const sign of [-1,1]){
   await motion.enable();
   const feed=(duration:number,moving:boolean)=>{for(let t=0;t<duration;t+=.02){now+=20;const acceleration={x:0,y:0,z:0},rotationRate={alpha:0,beta:0,gamma:0};const value=moving?sign*.4*Math.sin(t*2*Math.PI/1.1):0;if(axis in acceleration)(acceleration as any)[axis]=value;else (rotationRate as any)[axis]=value*45;const event=new Event('devicemotion');Object.assign(event,{acceleration,rotationRate});target.dispatchEvent(event);}};
   feed(3.2,false);feed(4.5,true);assert.equal(motion.state,'ready',axis+': '+motion.message);
   const before=strokes;feed(3.3,true);assert.ok(strokes>before,axis);
   active=false;const after=strokes;feed(2,true);assert.equal(strokes,after);active=true;feed(.3,false);assert.equal(strokes,after);
  }
  assert.equal(calibrated,12);
 }finally{motion.stop();for(const [key,value]of descriptors){if(value)Object.defineProperty(globalThis,key,value);else delete (globalThis as any)[key];}if(savedNow)Object.defineProperty(performance,'now',savedNow);else delete (performance as any).now;}
});
