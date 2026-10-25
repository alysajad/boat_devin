import {test,expect} from '@playwright/test';
import {DeepstreamClient} from '@deepstream/client';
const base=process.env.RACE_URL||'http://127.0.0.1:8080';
async function api(path:string,body:any,s?:any){const r=await fetch(base+'/api/race/'+path,{method:'POST',headers:{'content-type':'application/json',...(s?{authorization:'Bearer '+s.token}:{})},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(data.error);return data;}
async function setup(page:any){
 await page.goto('/');await page.locator('[data-action=create]').click();await expect(page.locator('.room-code-display')).toBeVisible();const code=await page.locator('.room-code-display').innerText();
 const admin=await page.evaluate((code:string)=>JSON.parse(sessionStorage.getItem(`race-v4:${code}:admin`)),code),actors:any[]=[];
 for(const [name,team]of [['Asha','boat-1'],['Manu','boat-1'],['Riya','boat-2']]){const session=await api('join',{code,name,team});const client=new DeepstreamClient(base.replace(/^http/,'ws')+'/deepstream');client.on('error',()=>{});await client.login({username:`race_v4-${code}/${session.id}`,token:session.token});actors.push({session,client});}
 const heartbeat=setInterval(()=>actors.forEach(({session,client})=>client.event.emit(`race_v4-${code}/heartbeat/${session.id}`,{at:Date.now()})),1000);
 for(const {session}of actors){await api('command',{action:'controller',mode:'swipe'},session);await api('command',{action:'ready',ready:true},session);}
 await expect(page.locator('#race-river')).toHaveAttribute('data-crew-asset','anatomical-rig');await expect(page.locator('#renderer-notice')).toBeHidden({timeout:30000});
 return{code,admin,actors,close:()=>{clearInterval(heartbeat);actors.forEach(a=>a.client.close());}};
}
test('director has live previews, clickable seat POV, authoritative stroke labels and fullscreen start/exit',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const room=await setup(page);
 try{
  await expect(page.locator('#race-river')).toHaveAttribute('data-boat-style','chundan-vallam');await expect(page.locator('.rower-label')).toHaveCount(3);await expect(page.locator('#race-river>canvas')).toHaveCount(1);
  for(const shot of ['overview','side','chase','bow','finish'])await expect(page.locator(`[data-preview=${shot}]`)).toHaveAttribute('data-frame',/\d+/,{timeout:15000});
  await page.getByRole('button',{name:'POV: Asha',exact:true}).click();await expect(page.locator('#race-river')).toHaveAttribute('data-camera','pov');await expect(page.locator('#race-river')).toHaveAttribute('data-camera-player',room.actors[0].session.id);await expect(page.locator('#director-title')).toContainText('Asha');
  const canvas=page.locator('#race-river>canvas'),box=await canvas.boundingBox();await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);await page.mouse.down();await page.mouse.move(box!.x+box!.width/2+80,box!.y+box!.height/2,{steps:5});await page.mouse.up();await expect(page.locator('#race-river')).not.toHaveAttribute('data-look-yaw','0');
  await page.getByRole('button',{name:'Side camera preview',exact:true}).click();await expect(page.locator('#race-river')).toHaveAttribute('data-camera','side');await expect(page.locator('[data-shot=side]')).toHaveAttribute('aria-pressed','true');
  await page.locator('#pov-rower').selectOption(room.actors[1].session.id);await expect(page.locator('#director-title')).toContainText('Manu');await page.getByRole('button',{name:'Auto',exact:true}).click();await expect(page.locator('#pov-rower')).toHaveValue('');
  await page.locator('[data-action=start]').click();await expect(page.locator('#app')).toHaveClass(/broadcast-fullscreen/);expect(await page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
  const fills=await canvas.evaluate(el=>{const rect=el.getBoundingClientRect();return Math.abs(rect.height-innerHeight)<2&&Math.abs(rect.width-innerWidth)<2;});expect(fills).toBe(true);
  await expect(page.locator('#phase-label')).toHaveText('RACE IS ON',{timeout:12000});
  const actor=room.actors[0];actor.client.event.emit(`race_v4-${room.code}/stroke/${actor.session.id}`,{seq:1,round:1,mode:'swipe',at:Date.now()});await expect(page.locator(`.rower-label[data-player="${actor.session.id}"]`)).toHaveAttribute('data-strokes','1');
  await page.locator('#pov-rower').selectOption(actor.session.id);await expect(page.locator('#race-river')).toHaveAttribute('data-camera-player',actor.session.id);await page.screenshot({path:'artifacts/director-pov.png'});
  await page.locator('[data-action=director-pause]').click();await expect(page.locator('#phase-label')).toHaveText('RACE PAUSED');await page.locator('[data-action=director-pause]').click();await expect(page.locator('#phase-label')).toHaveText('RACE IS ON',{timeout:10000});
  await page.getByRole('button',{name:'Overview camera preview',exact:true}).click();await page.locator('#graphics').selectOption('uhd');await expect.poll(async()=>Number(await page.locator('#race-river').getAttribute('data-pixel-ratio'))).toBeGreaterThan(1);await page.waitForTimeout(1500);await page.screenshot({path:'artifacts/director-overview.png'});
  await page.locator('[data-action=director-exit]').click();await expect(page.locator('#app')).not.toHaveClass(/broadcast-fullscreen/);expect(await page.evaluate(()=>!!document.fullscreenElement)).toBe(false);
  await page.getByRole('button',{name:'Fullscreen',exact:true}).last().click();await expect(page.locator('#app')).toHaveClass(/broadcast-fullscreen/);await page.keyboard.press('Escape');await expect(page.locator('#app')).not.toHaveClass(/broadcast-fullscreen/);await page.reload();await expect(page.locator('#app')).toHaveClass(/broadcast-fullscreen/);await page.locator('[data-action=director-exit]').click();await expect(page.locator('#app')).not.toHaveClass(/broadcast-fullscreen/);expect(errors).toEqual([]);
 }finally{room.close();}
});
test('director fullscreen fallback can be exited when native fullscreen is refused',async({page})=>{
 await page.addInitScript(()=>{Element.prototype.requestFullscreen=async()=>{throw Error('Not allowed');};});const room=await setup(page);
 try{await page.locator('[data-action=start]').click();await expect(page.locator('#app')).toHaveClass(/broadcast-fullscreen/);await expect(page.locator('[data-action=director-exit]')).toBeVisible();await page.locator('[data-action=director-exit]').click();await expect(page.locator('#app')).not.toHaveClass(/broadcast-fullscreen/);}finally{room.close();}
});

test('clicking a character mesh selects its POV and private feedback cannot be forged or read by another player',async({page})=>{
 const room=await setup(page);
 try{
  await page.getByRole('button',{name:'Fullscreen',exact:true}).last().click();
  await page.getByRole('button',{name:'Side camera preview',exact:true}).click();await page.waitForTimeout(1200);await page.screenshot({path:'artifacts/chundan-side.png'});
  const name=page.getByRole('button',{name:'POV: Riya',exact:true}),box=await name.boundingBox();expect(box).toBeTruthy();await page.mouse.click(box!.x+box!.width/2,box!.y+box!.height+12);await expect(page.locator('#race-river')).toHaveAttribute('data-camera-player',room.actors[2].session.id);
  await expect(page.getByRole('button',{name:'Back to broadcast',exact:true})).toBeVisible();await page.getByRole('button',{name:'Back to broadcast',exact:true}).click();await expect(page.locator('#pov-rower')).toHaveValue('');
  for(const shot of ['chase','bow','overview']){
   await page.locator('#camera-shot').selectOption(shot);await page.waitForTimeout(1500);if(shot==='chase')await page.screenshot({path:'artifacts/chundan-stern.png'});
   const label=page.getByRole('button',{name:'POV: Riya',exact:true}),position=await label.boundingBox();expect(position).toBeTruthy();let hit=false;
   for(let offset=2;offset<=20;offset+=2){await page.mouse.move(position!.x+position!.width/2,position!.y+position!.height+offset);if(await label.getAttribute('data-hovered')==='true'){await page.mouse.click(position!.x+position!.width/2,position!.y+position!.height+offset);hit=true;break;}}
   expect(hit,`Riya is clickable from ${shot}`).toBe(true);await expect(page.locator('#race-river')).toHaveAttribute('data-camera-player',room.actors[2].session.id);await page.getByRole('button',{name:'Back to broadcast',exact:true}).click();
  }
  const {client,session}=room.actors[0],other=room.actors[1].session,errors:string[]=[];client.on('error',(e:any)=>errors.push(String(e)));client.event.subscribe(`race_v4-${room.code}/rowing`,()=>{});client.event.subscribe(`race_v4-${room.code}/feedback/${other.id}`,()=>{});client.event.emit(`race_v4-${room.code}/feedback/${session.id}`,{kind:'stroke',id:session.id,round:1,strokes:999,at:Date.now()});await expect.poll(()=>errors.length).toBeGreaterThanOrEqual(3);
 }finally{room.close();}
});

test('Chundan seats a full 25-person crew and keeps the last rower POV usable',async({page})=>{
 const room=await setup(page);
 try{
  for(let i=3;i<=25;i++){
   const session=await api('join',{code:room.code,name:`Crew ${i}`,team:'boat-1'}),client=new DeepstreamClient(base.replace(/^http/,'ws')+'/deepstream');client.on('error',()=>{});await client.login({username:`race_v4-${room.code}/${session.id}`,token:session.token});room.actors.push({session,client});
  }
  for(const {session}of room.actors){await api('command',{action:'controller',mode:'swipe'},session);await api('command',{action:'ready',ready:true},session);}
  await page.locator('[data-action=start]').click();await expect(page.locator('#phase-label')).toHaveText('RACE IS ON',{timeout:12000});await expect(page.locator('#renderer-notice')).toBeHidden({timeout:30000});await expect(page.locator('.rower-label')).toHaveCount(26);await expect.poll(async()=>Number(await page.locator('#race-river').getAttribute('data-distant-instances'))).toBeGreaterThan(0);
  await page.locator('#follow-camera').selectOption('boat-1');await page.locator('#camera-shot').selectOption('side');await page.waitForTimeout(1500);await page.screenshot({path:'artifacts/chundan-full-crew.png'});
  const last=room.actors.at(-1).session;await page.locator('#pov-rower').selectOption(last.id);await expect(page.locator('#race-river')).toHaveAttribute('data-camera-player',last.id);await expect(page.locator('#director-title')).toContainText('Crew 25');await page.screenshot({path:'artifacts/chundan-last-seat.png'});
  await page.getByRole('button',{name:'Back to broadcast',exact:true}).click();await expect(page.locator('#pov-rower')).toHaveValue('');
 }finally{room.close();}
});

test('broadcast crew calls follow accepted strokes, coalesce teammates, mute, and expose the 90 FPS target',async({page})=>{
 const room=await setup(page);
 try{
  const sound=page.locator('[data-action=director-sound]');await sound.click();await expect(sound).toHaveAttribute('data-ready','true');
  await page.locator('#follow-camera').selectOption('boat-1');await page.locator('#frame-rate').selectOption('90');await expect(page.locator('#race-river')).toHaveAttribute('data-target-fps','90');
  await page.locator('[data-action=start]').click();await expect(page.locator('#phase-label')).toHaveText('RACE IS ON',{timeout:12000});
  const stroke=(actor:any,seq:number)=>actor.client.event.emit(`race_v4-${room.code}/stroke/${actor.session.id}`,{seq,round:1,mode:'swipe',at:Date.now()});
  stroke(room.actors[0],1);stroke(room.actors[1],1);await expect(sound).toHaveAttribute('data-calls','1');
  stroke(room.actors[0],1);await page.waitForTimeout(350);await expect(sound).toHaveAttribute('data-calls','1');
  await page.locator('#pov-rower').selectOption(room.actors[0].session.id);await page.waitForTimeout(400);await page.screenshot({path:'artifacts/realism-pov-ready.png'});
  stroke(room.actors[0],2);await expect(sound).toHaveAttribute('data-calls','2');await page.screenshot({path:'artifacts/realism-pov-row.png'});
  await sound.click();await expect(sound).toHaveAttribute('aria-label','Unmute rowing sound');await expect(sound).toHaveAttribute('data-voices','0');await page.waitForTimeout(750);stroke(room.actors[0],3);await page.waitForTimeout(400);await expect(sound).toHaveAttribute('data-calls','2');
  await page.getByRole('button',{name:'Side camera preview',exact:true}).click();await page.waitForTimeout(1200);await page.screenshot({path:'artifacts/realism-river.png'});
 }finally{room.close();}
});
