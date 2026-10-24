import {test,expect} from '@playwright/test';
for(const permission of ['granted','denied','missing'])test(`portrait controller: motion ${permission}, swipe fallback, no 3D downloads`,async({browser,request})=>{
 const admin=await(await request.post('/api/race/create',{data:{}})).json();
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 try{
 await context.addInitScript(permission=>{
  const w=window as any;w.permissionCalls=[];w.wakeCalls=0;w.wakeReleases=0;w.fullscreenCalls=0;let hidden=false;Object.defineProperty(document,'hidden',{get:()=>hidden});w.setHidden=(value:boolean)=>{hidden=value;document.dispatchEvent(new Event('visibilitychange'));};
  Element.prototype.requestFullscreen=async()=>{w.fullscreenCalls++;};
  Object.defineProperty(navigator,'wakeLock',{value:{request:async()=>{w.wakeCalls++;let released=()=>{};return{release:async()=>{w.wakeReleases++;released();},addEventListener(_name:string,callback:()=>void){released=callback;}};}}});
  if(permission==='missing')Object.defineProperty(window,'DeviceMotionEvent',{value:undefined});
  else Object.defineProperty(DeviceMotionEvent,'requestPermission',{value:async()=>{w.permissionCalls.push(navigator.userActivation.isActive);return permission;}});
 },permission);
 const page=await context.newPage(),requests:string[]=[],errors:string[]=[];
 page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`/?room=${admin.code}`);await page.locator('#nickname').fill('Motion crew');await page.getByRole('button',{name:'Join the crew'}).click();
 await expect(page.getByRole('button',{name:'Ready',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Enable motion'}).click();
 if(permission==='granted'){
  await expect(page.locator('.motion-instructions')).toContainText('Keep still');
  await page.evaluate(async()=>{const send=(y:number,rotation=0)=>{const e=new Event('devicemotion');Object.assign(e,{acceleration:{x:y,y:0,z:0},rotationRate:{alpha:rotation,beta:0,gamma:0}});window.dispatchEvent(e);};const start=performance.now();await new Promise<void>(resolve=>{const timer=setInterval(()=>{const t=(performance.now()-start)/1000;if(t>8){clearInterval(timer);resolve();return;}const p=(t-3.4)%1.4;send(t<3.4?0:p<.3?0:p<.65?-1:p<1?1:0);},20);});});
  await expect(page.locator('.motion-instructions')).toContainText('Calibrated');
  await expect(page.getByRole('button',{name:'Ready',exact:true})).toBeEnabled();
  expect(await page.evaluate(()=>(window as any).permissionCalls)).toEqual([true]);
  await page.getByRole('button',{name:'Recalibrate'}).click();
  await expect(page.getByRole('button',{name:'Ready',exact:true})).toBeDisabled();
 }else await expect(page.locator('.motion-instructions')).toContainText(permission==='missing'?'unavailable':'declined');
 if(permission==='denied')await page.route('**/api/race/command',async route=>{if(route.request().postDataJSON()?.action==='controller')await new Promise(resolve=>setTimeout(resolve,600));await route.continue();});
 await page.getByRole('button',{name:'Use swipe rowing'}).click();if(permission==='denied')await expect(page.getByRole('button',{name:'Ready',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Ready',exact:true}).click();await expect(page.getByRole('button',{name:'Ready to row!'})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).fullscreenCalls)).toBe(0);expect(await page.evaluate(()=>(window as any).wakeCalls)).toBeGreaterThan(0);
 await page.evaluate(()=>(window as any).setHidden(true));expect(await page.evaluate(()=>(window as any).wakeReleases)).toBeGreaterThan(0);await page.evaluate(()=>(window as any).setHidden(false));expect(await page.evaluate(()=>(window as any).wakeCalls)).toBeGreaterThan(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(requests.filter(x=>/scene-|river-|\.glb|\.ktx2|\.jpg|\.wasm|\.mp4/.test(x))).toEqual([]);expect(errors).toEqual([]);
 await page.screenshot({path:`artifacts/controller-${permission}.png`});
 }finally{await context.close();}
});
