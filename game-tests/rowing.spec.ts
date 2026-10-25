import {test,expect} from '@playwright/test';
import {DeepstreamClient} from '@deepstream/client';
const base=process.env.RACE_URL||'http://127.0.0.1:8080';
async function api(path:string,body:any,s?:any){const r=await fetch(base+'/api/race/'+path,{method:'POST',headers:{'content-type':'application/json',...(s?{authorization:'Bearer '+s.token}:{})},body:JSON.stringify(body)});if(!r.ok)throw Error(await r.text());return r.json();}
test('assigned sides, solo transition, isolated protocol and no 3D phone downloads',async({browser})=>{
 const admin=await api('create',{}),clients:DeepstreamClient[]=[],sessions:any[]=[];
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage(),downloads:string[]=[];
 page.on('request',r=>downloads.push(r.url()));
 let heartbeat:any;
 try{
  await page.goto('/?room='+admin.code);await page.locator('#nickname').fill('Left phone');await page.locator('#join-team').selectOption('boat-1');await page.getByRole('button',{name:'Join the crew'}).click();await page.getByRole('button',{name:'Use swipe rowing'}).click();
  for(const team of ['boat-1','boat-2']){const s=await api('join',{code:admin.code,name:'Partner',team}),c=new DeepstreamClient(base.replace(/^http/,'ws')+'/deepstream');c.on('error',()=>{});await c.login({username:`race_v4-${admin.code}/${s.id}`,token:s.token});clients.push(c);sessions.push(s);}
  heartbeat=setInterval(()=>sessions.forEach((s,i)=>clients[i].event.emit(`race_v4-${admin.code}/heartbeat/${s.id}`,{})),1000);
  await expect(page.locator('#seat-badge')).toContainText('LEFT');await page.locator('[data-action=ready]').click();for(const s of sessions){await api('command',{action:'controller',mode:'swipe'},s);await api('command',{action:'ready',ready:true},s);}await api('command',{action:'start'},admin);await expect(page.locator('#phase-label')).toHaveText('RACE IS ON',{timeout:12000});
  const errors:string[]=[];clients[0].on('error',e=>errors.push(String(e)));const old=clients[0].record.getRecord(`race_v3-${admin.code}/race`);old.on('error',e=>errors.push(String(e)));await expect.poll(()=>errors.length).toBeGreaterThan(0);expect(old.isReady).toBe(false);
  await page.locator('.paddle-button').focus();await page.keyboard.press('Space');await expect(page.locator('#input-feedback')).toContainText('Server accepted: 1');await expect(page.locator('#rowing-balance')).toContainText('LEFT STRONG');
  clients[0].close();await expect(page.locator('#seat-badge')).toContainText('SOLO ASSIST');await expect(page.locator('#rowing-balance')).toContainText('Automatic balance');
  expect(downloads.filter(u=>/\.(glb|ktx2|wasm|jpg|mp3)(\?|$)|\/chunks\/(scene|crew|river)-/.test(u))).toEqual([]);
 }finally{clearInterval(heartbeat);clients.forEach(c=>c.close());await context.close();}
});
test('left and right POV grips remain clear at 16:9 and 16:10 with reduced-motion roll disabled',async({page})=>{
 const admin=await api('create',{}),clients:DeepstreamClient[]=[],sessions:any[]=[];
 let heartbeat:any;
 try{
  for(const [i,team]of ['boat-1','boat-1','boat-2'].entries()){const s=await api('join',{code:admin.code,name:i===0?'Left':i===1?'Right':'Solo',team}),c=new DeepstreamClient(base.replace(/^http/,'ws')+'/deepstream');c.on('error',()=>{});await c.login({username:`race_v4-${admin.code}/${s.id}`,token:s.token});clients.push(c);sessions.push(s);}
  heartbeat=setInterval(()=>sessions.forEach((s,i)=>clients[i].event.emit(`race_v4-${admin.code}/heartbeat/${s.id}`,{})),1000);
  await page.addInitScript(()=>{Element.prototype.requestFullscreen=async()=>{throw Error('Use viewport director for aspect-ratio checks');};});
  await page.addInitScript(s=>sessionStorage.setItem(`race-v4:${s.code}:admin`,JSON.stringify(s)),admin);await page.goto('/?room='+admin.code+'&host=1');await expect(page.locator('#race-river')).toHaveAttribute('data-crew-asset','anatomical-rig');
  for(const s of sessions){await api('command',{action:'controller',mode:'swipe'},s);await api('command',{action:'ready',ready:true},s);}await page.locator('[data-action=start]').click();await expect(page.locator('#phase-label')).toHaveText('RACE IS ON',{timeout:12000});
  for(const height of [720,800]){await page.setViewportSize({width:1280,height});for(const [i,side]of ['left','right'].entries()){
   await page.locator('#pov-rower').selectOption(sessions[i].id);await expect(page.locator('#race-river')).toHaveAttribute('data-camera-player',sessions[i].id);await page.waitForTimeout(500);await page.screenshot({path:`artifacts/rowing-v4-pov-${side}-${height}-ready.png`});
   clients[i].event.emit(`race_v4-${admin.code}/stroke/${sessions[i].id}`,{seq:height,round:1,mode:'swipe',at:Date.now()});await expect(page.locator('#race-river')).toHaveAttribute('data-stroke-phase','drive');await page.screenshot({path:`artifacts/rowing-v4-pov-${side}-${height}-drive.png`});
  }}
  await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await expect(page.locator('#race-river')).toHaveAttribute('data-crew-asset','anatomical-rig');await page.locator('#pov-rower').selectOption(sessions[0].id);await expect(page.locator('#race-river')).toHaveAttribute('data-pov-roll','0.0000');
 }finally{clearInterval(heartbeat);clients.forEach(c=>c.close());}
});
