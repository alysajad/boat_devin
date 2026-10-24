import {test,expect} from '@playwright/test';
import {DeepstreamClient} from '@deepstream/client';
const url=process.env.RACE_URL||'http://127.0.0.1:8080';
async function api(path:string,body?:any,s?:any){const r=await fetch(url+'/api/race/'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(s?{authorization:'Bearer '+s.token}:{})},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw Error(data.error);return data;}
async function host(browser:any){const context=await browser.newContext();const page=await context.newPage();await page.goto('/');await page.locator('[data-action=create]').click();await expect(page.locator('.room-code-display')).toBeVisible();return{context,page,code:await page.locator('.room-code-display').innerText()};}
async function join(browser:any,code:string,team:string,name:string){const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await context.newPage();await page.goto((process.env.PHONE_URL||'')+'/?room='+code);await page.locator('#nickname').fill(name);await page.locator('#join-team').selectOption(team);await page.getByRole('button',{name:'Join the crew'}).click();await page.getByRole('button',{name:'Use swipe rowing'}).click();await page.locator('[data-action=ready]').click();await expect(page.locator('#controller-panel')).toContainText('Waiting for the host');return{context,page};}
test('solo phones row, pause, release disconnected seats, rematch; broadcast manual cameras and fullscreen',async({browser})=>{
 const h=await host(browser),a=await join(browser,h.code,'boat-1','Solo A'),b=await join(browser,h.code,'boat-2','Solo B');const errors:string[]=[];for(const p of[h.page,a.page,b.page])p.on('pageerror',e=>errors.push(e.message));
 try{
 await h.page.locator('[data-action=start]').click();await expect(a.page.locator('#phase-label')).toHaveText('RACE IS ON',{timeout:12000});await expect(a.page.locator('.paddle-button')).toHaveCount(1);await expect(a.page.locator('#race-river')).toHaveCount(0);
 for(let i=0;i<3;i++){const box=await a.page.locator('.paddle-button').boundingBox();await a.page.mouse.move(box.x+box.width/2,box.y+50);await a.page.mouse.down();await a.page.mouse.move(box.x+box.width/2,box.y+120,{steps:5});await a.page.mouse.up();await a.page.waitForTimeout(760);}
 await expect(a.page.locator('#race-distance')).not.toHaveText('0 m');await expect(h.page.locator('#race-river')).toHaveAttribute('data-crew-asset','anatomical-rig');
 await h.page.locator('#camera-shot').selectOption('bow');await expect(h.page.locator('#race-river')).toHaveAttribute('data-camera','bow');await h.page.locator('#follow-camera').selectOption('boat-2');await expect(h.page.locator('#race-river')).toHaveAttribute('data-camera-boat','boat-2');await h.page.getByRole('button',{name:'Auto',exact:true}).click();await expect(h.page.locator('#follow-camera')).toHaveValue('');
 await h.page.getByRole('button',{name:'Fullscreen',exact:true}).last().click();await expect(h.page.locator('#app')).toHaveClass(/broadcast-fullscreen/);await expect(h.page.locator('#leaderboard')).toBeVisible();await h.page.screenshot({path:'artifacts/motion-broadcast.png'});await h.page.getByRole('button',{name:'Fullscreen',exact:true}).last().click();
 await h.page.locator('[data-action=pause]').click();await expect(a.page.locator('#phase-label')).toHaveText('RACE PAUSED');await h.page.locator('[data-action=resume]').click();await expect(a.page.locator('#phase-label')).toHaveText('RACE IS ON',{timeout:10000});
 await b.context.setOffline(true);await expect(b.page.locator('#connection-banner')).toBeVisible({timeout:10000});await expect.poll(async()=>(await api('room/'+h.code)).players.length,{timeout:10000}).toBe(1);await b.context.setOffline(false);await b.page.reload();await expect(b.page.locator('#nickname')).toBeVisible();await b.page.getByRole('button',{name:'Join the crew'}).click();await expect(b.page.locator('#controller-panel')).toContainText('Your crew joins next round');
 await a.page.screenshot({path:'artifacts/motion-phone-race.png'});await h.page.reload();await expect(h.page.locator('#phase-label')).toHaveText('RACE IS ON');await h.page.locator('[data-action=pause]').click();await h.page.locator('[data-action=reset]').click();await expect(a.page.locator('#phase-label')).toHaveText('IN THE LOBBY');expect(errors).toEqual([]);
 }finally{await Promise.all([h.context.close(),a.context.close(),b.context.close()]);}
});
test('admin settings, automatic crew growth, move and remove',async({browser})=>{
 const h=await host(browser);let a:any,b:any;
 try{await h.page.locator('[name=forceMultiplier]').fill('2.2');await h.page.locator('[name=motionSensitivity]').fill('1.8');await h.page.locator('[name=format]').selectOption('timed');await h.page.locator('[name=duration]').fill('30');await h.page.getByRole('button',{name:'Save race setup'}).click();await expect(h.page.locator('#clock')).toHaveText('00:30');
 a=await join(browser,h.code,'boat-1','Move me');b=await join(browser,h.code,'boat-1','Grow crew');await expect(h.page.locator('[data-move]')).toHaveCount(2);await h.page.locator('[data-move]').first().selectOption('boat-2');await expect(a.page.locator('#seat-badge')).toContainText('Golden crew');await h.page.locator('.remove-player').first().click();await expect(h.page.locator('[data-move]')).toHaveCount(1);await expect(b.page.locator('#controller-panel')).toContainText('Your seat was removed');
 }finally{await a?.context.close();await b?.context.close();await h.context.close();}
});
test('capabilities reject cross-room reads, detailed player feeds, state writes and forged events',async()=>{
 const admin=await api('create',{}),other=await api('create',{}),s=await api('join',{code:admin.code,name:'Security',team:'boat-1'});const c=new DeepstreamClient(url.replace(/^http/,'ws')+'/deepstream'),errors:string[]=[];c.on('error',e=>errors.push(String(e)));await c.login({username:`race_v3-${s.code}/${s.id}`,token:s.token});
 try{
 await expect(api('command',{action:'start'},s)).rejects.toThrow(/admin/);
 const record=c.record.getRecord(`race_v3-${s.code}/race`);record.on('error',e=>errors.push(String(e)));await record.whenReady();record.set('remaining',999);c.event.emit(`race_v3-${s.code}/stroke/not-me`,{seq:1,round:1,mode:'swipe',at:Date.now()});const cross=c.record.getRecord(`race_v3-${other.code}/race`);cross.on('error',e=>errors.push(String(e)));const detailed=c.record.getRecord(`race_v3-${s.code}/snapshot`);detailed.on('error',e=>errors.push(String(e)));await new Promise(r=>setTimeout(r,500));expect(errors.length).toBeGreaterThanOrEqual(4);expect(cross.isReady).toBe(false);expect(detailed.isReady).toBe(false);
 }finally{c.close();}
});
test('broadcast WebGL refusal keeps the room usable',async({browser})=>{
 const context=await browser.newContext();try{await context.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type:any,...args:any[]){if(type==='webgl2'||type==='webgl')return null;return get.call(this,type,...args);} as any;});const page=await context.newPage();await page.goto('/');await page.locator('[data-action=create]').click();await expect(page.locator('#race-river')).toHaveAttribute('data-renderer','2d');await expect(page.locator('#renderer-notice')).toBeVisible();await expect(page.locator('#config-form')).toBeVisible();}finally{await context.close();}
});
test('a changed server boot ID ends the old session explicitly',async({browser})=>{const h=await host(browser);try{await h.page.route('**/api/race/preflight',route=>route.fulfill({json:{bootId:'new-server',serverTime:Date.now()}}));await expect(h.page.getByRole('heading',{name:'Race server restarted'})).toBeVisible({timeout:10000});}finally{await h.context.close();}});

test('swipe practice gives feedback, Ready waits for host, refresh removes the old rower',async({browser})=>{
 const h=await host(browser);let a:any;
 try{
  a=await join(browser,h.code,'boat-1','Fresh rower');const before=(await api('room/'+h.code)).players[0].id;
  const button=a.page.locator('.paddle-button');await button.scrollIntoViewIfNeeded();const box=await button.boundingBox();await a.page.mouse.move(box.x+30,box.y+60);await a.page.mouse.down();await a.page.mouse.move(box.x+110,box.y+60,{steps:6});await a.page.mouse.up();
  await expect(a.page.locator('#input-feedback')).toContainText('Practice strokes: 1');await expect(a.page.locator('#race-distance')).toHaveText('0 m');await expect(h.page.locator('[data-action=start]')).toBeDisabled();
  await a.page.reload();await expect(a.page.locator('#nickname')).toBeVisible();await expect.poll(async()=>(await api('room/'+h.code)).players.length).toBe(0);await expect(h.page.locator('[data-move]')).toHaveCount(0);
  await a.page.getByRole('button',{name:'Join the crew'}).click();await expect(a.page.locator('[data-action=ready]')).toBeDisabled();await expect.poll(async()=>(await api('room/'+h.code)).players.length).toBe(1);expect((await api('room/'+h.code)).players[0].id).not.toBe(before);
 }finally{await a?.context.close();await h.context.close();}
});

test('calibrated sideways motion practices in the lobby and propels a racing boat',async({browser})=>{
 const h=await host(browser);let a:any,b:any;
 const feed=async(page:any,rest:boolean)=>page.evaluate(async(rest:boolean)=>{
  const start=performance.now();await new Promise<void>(resolve=>{const timer=setInterval(()=>{const t=(performance.now()-start)/1000;if(t>(rest?3.2:4.5)){clearInterval(timer);resolve();return;}const event=new Event('devicemotion');Object.assign(event,{acceleration:{x:rest?0:.4*Math.sin(t*2*Math.PI/1.1),y:0,z:0},rotationRate:{alpha:0,beta:0,gamma:0}});window.dispatchEvent(event);},20);});
 },rest);
 try{
  a=await join(browser,h.code,'boat-1','Sideways rower');b=await join(browser,h.code,'boat-2','Swipe rower');
  await a.page.evaluate(()=>Object.defineProperty(DeviceMotionEvent,'requestPermission',{value:async()=>'granted',configurable:true}));await a.page.getByRole('button',{name:'Enable motion'}).click();await feed(a.page,true);await feed(a.page,false);await expect(a.page.locator('.motion-instructions')).toContainText('sideways sweep');
  await feed(a.page,false);await expect(a.page.locator('#input-feedback')).not.toContainText('Practice strokes: 0');await a.page.locator('[data-action=ready]').click();await h.page.locator('[data-action=start]').click();await expect(a.page.locator('#phase-label')).toHaveText('RACE IS ON',{timeout:12000});
  await feed(a.page,false);await expect(a.page.locator('#input-feedback')).not.toContainText('Server accepted: 0');await expect(a.page.locator('#race-distance')).not.toHaveText('0 m');
 }finally{await a?.context.close();await b?.context.close();await h.context.close();}
});
