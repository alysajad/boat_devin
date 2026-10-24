import { test, expect, type Browser, type Page, type BrowserContext } from '@playwright/test';
const sessions: BrowserContext[] = [];
async function pageFor(browser: Browser, mobile = false) {
  const context = await browser.newContext({ viewport: mobile ? {width:390,height:844} : {width:1440,height:1000}, hasTouch: mobile, isMobile: mobile });
  // Fullscreen and lock APIs have their own tests; keep the native window resizable here.
  await context.addInitScript(() => { Element.prototype.requestFullscreen = async () => { throw new Error('Fullscreen unavailable in rotation harness'); }; });
  sessions.push(context); return context.newPage();
}
async function hostRace(browser: Browser) {
  const host = await pageFor(browser); await host.goto('/'); await host.getByRole('button',{name:'Host a race'}).click();
  await expect(host.locator('.room-code-display')).toBeVisible();
  return { host, code: (await host.locator('.room-code-display').innerText()).trim() };
}
async function join(browser: Browser, code: string, name: string, team: string, mobile=true) {
  const page = await pageFor(browser,mobile); await page.goto(`/?room=${code}`); await page.getByLabel('What should your crew call you?').fill(name); await page.locator(`input[value="${team}"]`).check(); await page.getByRole('button',{name:'Join the crew'}).click();
  await expect(page.getByRole('button',{name:'I’m ready'})).toBeEnabled();
  await page.getByRole('button',{name:'I’m ready'}).click(); return page;
}
async function swipe(page: Page) {
  const box = await page.locator('.paddle-button').boundingBox();
  if (!box) throw new Error('Paddle is not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + 25);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 90, { steps: 4 });
  await page.mouse.up();
}
test.afterEach(async()=>{await Promise.all(sessions.splice(0).map(c=>c.close()));});
test('host broadcast, phone and laptop controls, reconnect, finish and rematch', async({browser})=>{
  const {host,code}=await hostRace(browser); const errors:string[]=[];host.on('pageerror',e=>errors.push(e.message));
  await expect(host.getByRole('button',{name:'Start the race'})).toBeDisabled();
  const players=[] as Page[];
  for(const [i,team] of ['coral','gold','coral','gold'].entries()) players.push(await join(browser,code,`Paddler ${i+1}`,team,i!==3));
  await expect(host.locator('.crew-member')).toHaveCount(4);
  await expect(host.getByRole('button',{name:'Start the race'})).toBeEnabled();
  const watcher=await pageFor(browser);await watcher.goto(`/?room=${code}`);await watcher.getByRole('button',{name:'Just watch the race'}).click();await expect(watcher.locator('.watching-note')).toBeVisible();await expect(watcher.getByRole('button',{name:'Start the race'})).toHaveCount(0);
  await host.screenshot({path:'test-results/lobby-desktop.png',fullPage:true});await players[0].screenshot({path:'test-results/controller-lobby.png',fullPage:true});
  await host.getByRole('button',{name:'Start the race'}).click();
  await expect(host.locator('#phase-label')).toHaveText('RACE IS ON',{timeout:10000});
  for(let k=0;k<8;k++){await Promise.all(players.map(p=>swipe(p)));await host.waitForTimeout(230);}
  await expect.poll(async()=>parseInt(await host.locator('#coral-distance').innerText())).toBeGreaterThan(0);
  await expect(players[3].getByRole('button',{name:'Paddle right',exact:true})).toBeEnabled();await players[3].keyboard.press('Space');
  await expect(host.locator('#race-river')).toHaveAttribute('data-renderer','3d');
  await expect(players[0].locator('#race-river')).toHaveAttribute('data-view','player');
  await players[0].setViewportSize({width:844,height:390});
  await expect(players[0].locator('#app')).toHaveClass(/immersive/);
  await expect(players[0].getByRole('button',{name:'Recenter view'})).toBeVisible();
  expect(await players[0].evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await players[0].getByRole('button',{name:'Switch to tap controls'}).click();
  await players[0].locator('.paddle-button').click();
  await players[0].getByRole('button',{name:'Switch to swipe controls'}).click();
  await players[0].getByRole('button',{name:'Unmute sound'}).click();
  await players[0].getByRole('button',{name:'Mute sound',exact:true}).click();
  await players[0].screenshot({path:'test-results/controller-racing.png',fullPage:true});await host.screenshot({path:'test-results/racing-desktop.png',fullPage:true});
  await players[0].context().setOffline(true);await expect(host.locator('#phase-label')).toHaveText('RACE PAUSED',{timeout:15000});
  const pausedClock=await host.locator('#clock').innerText();await host.waitForTimeout(1100);await expect(host.locator('#clock')).toHaveText(pausedClock);
  await players[0].context().setOffline(false);
  await expect(players[0].getByRole('button',{name:'Ready to resume',exact:true})).toBeEnabled({timeout:20000});
  for(const p of players) await p.getByRole('button',{name:'Ready to resume',exact:true}).click();
  await expect(host.getByRole('button',{name:'Resume race'})).toBeEnabled({timeout:10000});await host.getByRole('button',{name:'Resume race'}).click();await expect(host.locator('#phase-label')).toHaveText('RACE IS ON',{timeout:8000});
  await expect(host.locator('#phase-label')).toHaveText('FINISH LINE',{timeout:65000});await expect(watcher.locator('#phase-label')).toHaveText('FINISH LINE');
  await host.screenshot({path:'test-results/results-desktop.png',fullPage:true});
  const rematchButton = await host.getByRole('button',{name:'Race again'}).elementHandle();
  await host.waitForTimeout(500); expect(await rematchButton!.evaluate(el=>el.isConnected)).toBe(true);
  await host.getByRole('button',{name:'Race again'}).click();await expect(host.locator('#phase-label')).toHaveText('IN THE LOBBY');await expect(players[0].locator('#seat-badge')).toContainText('RIGHT PADDLE');await expect(players[0].locator('#race-river')).toHaveAttribute('data-side','right');await expect(host.getByRole('button',{name:'Start the race'})).toBeDisabled();
  expect(errors).toEqual([]);
});
test('rooms are isolated, host stays on laptop, and late arrivals wait',async({browser})=>{
  const {host,code}=await hostRace(browser);const other=await hostRace(browser);
  const players=[] as Page[];for(const [i,t] of ['coral','coral','gold','gold'].entries())players.push(await join(browser,code,`Crew ${i}`,t));
  await expect(other.host.locator('.crew-member')).toHaveCount(0);
  await host.getByRole('button',{name:'Start the race'}).click();await expect(host.locator('#phase-label')).toHaveText('RACE IS ON',{timeout:10000});
  const late=await pageFor(browser,true);await late.goto(`/?room=${code}`);await late.getByLabel('What should your crew call you?').fill('Late paddler');await late.getByRole('button',{name:'Join the crew'}).click();await expect(late.getByText('Join the next round when the host opens the lobby.')).toBeVisible();await expect(late.locator('.paddle-button')).toHaveCount(0);
  await host.reload();await expect(host.locator('#phase-label')).toHaveText('RACE INTERRUPTED');await expect(host.getByRole('button',{name:'Return to lobby'})).toBeEnabled();await expect(players[0].getByRole('button',{name:'Return to lobby'})).toHaveCount(0);
  await host.getByRole('button',{name:'Return to lobby'}).click();await expect(host.locator('.crew-member')).toHaveCount(5);await expect(host.getByRole('button',{name:'Start the race'})).toBeDisabled();
});
test('twelve-player capacity, room errors, responsive layout and local assets',async({browser})=>{
  const {host,code}=await hostRace(browser);
  const players=await Promise.all(Array.from({length:12},(_,i)=>join(browser,code,`Rower ${i+1}`,i%2?'gold':'coral')));
  await expect(host.locator('.crew-member')).toHaveCount(12);await expect(host.getByRole('button',{name:'Start the race'})).toBeEnabled();
  const overflow=await pageFor(browser,true);await overflow.goto(`/?room=${code}`);await overflow.getByLabel('What should your crew call you?').fill('Extra');await overflow.getByRole('button',{name:'Join the crew'}).click();await expect(overflow.getByText('This crew may be full. Try the other boat.')).toBeVisible();await expect(overflow.getByRole('button',{name:'I’m ready'})).toBeDisabled();
  await host.getByRole('button',{name:'Start the race'}).click();await expect(host.locator('#phase-label')).toHaveText('RACE IS ON',{timeout:10000});await Promise.all(players.map(p=>swipe(p)));
  const invalid=await pageFor(browser,true);await invalid.goto('/?room=ZZZZZZ');await invalid.getByRole('button',{name:'Just watch the race'}).click();await expect(invalid.getByRole('alert')).toContainText('Room not found');
  const mobile=await pageFor(browser,true);const external:string[]=[];mobile.on('request',r=>{if(!new URL(r.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/))external.push(r.url());});await mobile.emulateMedia({reducedMotion:'reduce'});await mobile.goto('/');await expect(mobile.getByRole('heading',{name:'TWO CREWS. ONE RIVER.'})).toBeVisible();expect(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await mobile.screenshot({path:'test-results/home-mobile.png',fullPage:true});expect(external).toEqual([]);
});
